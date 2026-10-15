// FR-199（検査・一覧・影響確認の組み込み）と NFR-OPS-001（最終確認日の鮮度）。期待値は受入基準だけから決める。
// 実行: node --test tests/system/integration-catalog/tooling.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { COL, baseline, cleanup, expectNew, freshBaseline, freshenAll, lines, makeSandbox, mentionsRow, newFindings, readCatalog, rowName, runCheck, runRdfix, runTrace, runVerify, setCell, today } from './support.mjs';

const T = { timeout: 300_000 };

// FR-199 AC-426（正しいカタログ → exit 0）
test('FR-199 AC-426 正しいカタログのとき verify --docs-only は exit 0', T, () => {
  const sb = makeSandbox();
  try {
    const r = runVerify(sb);
    assert.equal(r.status, 0, r.output.slice(-2000));
  } finally { cleanup(sb); }
});
// FR-199 AC-426（異常系: 違反の行 → 非 0、行と欄を示す）
for (const k of ['auth', 'terms', 'stub']) {
  test(`FR-199 AC-426 確認項目（${COL[k]}）に違反する行があると verify --docs-only は非 0 で、違反の行と欄を示す`, T, () => {
    const sb = makeSandbox();
    try {
      const name = rowName(sb, 0);
      setCell(sb, 0, k, '');
      const r = runVerify(sb);
      assert.notEqual(r.status, 0, '違反があるのに exit 0');
      const hit = r.findings.filter((f) => f.level === 'ERROR' && mentionsRow(f, sb, name));
      assert.ok(hit.length > 0, `違反の行を示さない: ${r.output.slice(-2000)}`);
      assert.ok(hit.some((f) => f.raw.includes(COL[k])), `違反の欄「${COL[k]}」を示さない: ${lines(hit)}`);
    } finally { cleanup(sb); }
  });
}

// FR-199 AC-427（カタログがない状態で rdfix → 雛形。意味の欄は自動で埋めない）
test('FR-199 AC-427 カタログがない状態で rdfix を実行すると雛形（表の見出しと記入の規則）が作られ、意味に関わる欄には値を入れない', T, () => {
  const sb = makeSandbox();
  try {
    const expectedHeader = readCatalog(sb).header;
    fs.rmSync(sb.cat);
    const r = runRdfix(sb);
    assert.ok(fs.existsSync(sb.cat), `雛形が作られない: ${r.output.slice(-1500)}`);
    const text = fs.readFileSync(sb.cat, 'utf8');
    for (const h of expectedHeader) assert.ok(text.includes(h), `見出し「${h}」がない`);
    assert.match(text, /\|\s*-{3,}/, '表の区切り行がない');
    assert.match(text, /TBD/, '記入の規則（TBD（Q-xxx））が書かれていない');
    assert.match(text, /なし（/, '記入の規則（なし（理由））が書かれていない');
    const cat = readCatalog(sb);
    for (const row of cat.rows) {
      const filled = row.slice(1).filter((v) => v !== '');
      assert.equal(filled.length, 0, `意味に関わる欄に自動で値が入っている: ${row[0]} → ${filled.join(' / ')}`);
    }
  } finally { cleanup(sb); }
});

// FR-199 AC-428
test('FR-199 AC-428 rdcheck trace <連携名> が、関連する要求 ID・受入基準・カタログの行を示す', T, () => {
  const sb = makeSandbox();
  try {
    const cat = readCatalog(sb);
    const row = cat.rows[0];
    const reqs = row[cat.header.indexOf(COL.reqs)].match(/FR-\d+|NFR-[A-Z]+-\d+/g) || [];
    assert.ok(reqs.length > 0, 'テストの前提: 先頭の連携に関連する要求 ID がある');
    const r = runTrace(sb, row[0]);
    assert.equal(r.status, 0, r.output.slice(-1500));
    for (const id of reqs) assert.ok(r.output.includes(id), `関連する要求 ID ${id} を示さない`);
    assert.match(r.output, /AC-\d+/, '受入基準を示さない');
    assert.ok(r.output.includes('integration-catalog'), 'カタログの行（ファイルと位置）を示さない');
  } finally { cleanup(sb); }
});
test('FR-199 AC-428 存在しない連携名では、行を示さずに見つからない旨を返す', T, () => {
  const sb = makeSandbox();
  try {
    const r = runTrace(sb, '存在しない連携ＸＹＺ');
    assert.ok(!r.output.includes('integration-catalog.md:'), r.output);
  } finally { cleanup(sb); }
});

// FR-199 AC-429（既存カタログの検査の結果が変わらない）
test('FR-199 AC-429 外部連携カタログを追加しても、docs/catalog.md の検査（CHK-07・CHK-27）の結果が変わらない', T, () => {
  const sb = makeSandbox();
  try {
    const keep = (r) => r.findings.filter((f) => f.chk === 'CHK-07' || f.chk === 'CHK-27').map((f) => f.raw).sort();
    const withCatalog = keep(runCheck(sb));
    fs.rmSync(sb.cat);
    const without = keep(runCheck(sb));
    assert.deepEqual(withCatalog, without);
  } finally { cleanup(sb); }
});

// ---- NFR-OPS-001 鮮度 ----
const FRESH = /最終確認日|鮮度|確認日/;
function freshFindings(sb, level) {
  return newFindings(freshBaseline(), runCheck(sb), level);
}

// AC-431
test('NFR-OPS-001 AC-431 最終確認日が {PARAM-066}=180 日より前の「稼働」の連携は、警告を示し、失敗にはしない', T, () => {
  const sb = makeSandbox();
  try {
    freshenAll(sb);
    const name = rowName(sb, 0);
    setCell(sb, 0, 'date', today(-181));
    const w = freshFindings(sb, 'WARN').filter((f) => mentionsRow(f, sb, name));
    assert.ok(w.length > 0, '鮮度の警告が出ない');
    const e = freshFindings(sb, 'ERROR').filter((f) => mentionsRow(f, sb, name));
    assert.equal(e.length, 0, `失敗にしてはいけない: ${lines(e)}`);
  } finally { cleanup(sb); }
});
test('NFR-OPS-001 AC-431 最終確認日が「TBD（Q-xxx）」の「稼働」の連携は、日付の確認が必要という警告を示し、失敗にはしない', T, () => {
  const sb = makeSandbox();
  try {
    freshenAll(sb);
    const name = rowName(sb, 0);
    setCell(sb, 0, 'date', 'TBD（Q-027）');
    const w = freshFindings(sb, 'WARN').filter((f) => mentionsRow(f, sb, name));
    assert.ok(w.length > 0, '日付の確認が必要という警告が出ない');
    assert.equal(freshFindings(sb, 'ERROR').filter((f) => mentionsRow(f, sb, name)).length, 0);
  } finally { cleanup(sb); }
});
for (const bad of ['昨日', '2026/10/01', '2026-13-45', '']) {
  test(`NFR-OPS-001 AC-431 最終確認日が日付（YYYY-MM-DD）でも TBD でもない値（${bad || '空'}）なら検査は失敗する`, T, () => {
    expectNew(assert, { mutate: (sb) => setCell(sb, 0, 'date', bad), rowIdx: 0, fresh: true, keys: ['date'] });
  });
}

// AC-432
for (const [label, offset] of [['180 日ちょうど', -180], ['10 日前', -10], ['今日', 0]]) {
  test(`NFR-OPS-001 AC-432 最終確認日が ${label} の「稼働」の連携では、鮮度の警告を示さない`, T, () => {
    const sb = makeSandbox();
    try {
      freshenAll(sb);
      const name = rowName(sb, 0);
      setCell(sb, 0, 'date', today(offset));
      const w = freshFindings(sb, 'WARN').filter((f) => mentionsRow(f, sb, name) && FRESH.test(f.raw));
      assert.equal(w.length, 0, lines(w));
    } finally { cleanup(sb); }
  });
}
for (const state of ['計画', '廃止']) {
  test(`NFR-OPS-001 AC-432 状態が「${state}」の連携は、最終確認日が古くても鮮度の警告を示さない`, T, () => {
    const sb = makeSandbox();
    try {
      freshenAll(sb);
      const name = rowName(sb, 0);
      const cat = readCatalog(sb);
      cat.rows[0][cat.header.indexOf(COL.state)] = state;
      cat.rows[0][cat.header.indexOf(COL.date)] = today(-400);
      fs.writeFileSync(sb.cat, [...cat.lines.slice(0, cat.hi + 2), ...cat.rows.map((c) => `| ${c.join(' | ')} |`), ...cat.lines.slice(cat.end)].join('\n'));
      const w = freshFindings(sb, 'WARN').filter((f) => mentionsRow(f, sb, name) && FRESH.test(f.raw));
      assert.equal(w.length, 0, lines(w));
    } finally { cleanup(sb); }
  });
}
