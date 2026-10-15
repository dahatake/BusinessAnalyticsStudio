// FR-188〜FR-189（外部連携カタログの管理データ・基本情報）。期待値は受入基準だけから決める。
// 実行: node --test tests/system/integration-catalog/basic.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { COL, baseline, cleanup, edit, expectNew, expectNoNew, lines, makeSandbox, newFindings, readCatalog, repoRoot, runCheck, setCell, setCells } from './support.mjs';

const T = { timeout: 300_000 };

// FR-188 AC-403
test('FR-188 AC-403 外部連携カタログがあり、連携ごとに 1 行・必要な欄（連携名〜最終確認日）で確認できる', () => {
  const p = path.join(repoRoot, 'docs', 'integration-catalog.md');
  assert.ok(fs.existsSync(p), 'docs/integration-catalog.md がない');
  const sb = { root: repoRoot, cat: p };
  const cat = readCatalog(sb);
  for (const k of Object.values(COL)) assert.ok(cat.header.includes(k), `欄「${k}」がない`);
  assert.ok(cat.rows.length >= 1, '連携の行がない');
  for (const r of cat.rows) assert.equal(r.length, cat.header.length, `行の欄数が見出しと違う: ${r[0]}`);
  const names = cat.rows.map((r) => r[0]);
  assert.equal(new Set(names).size, names.length, '連携名が重複している');
});

// FR-188 AC-404（異常系: 連携名の重複）
test('FR-188 AC-404 同じ連携名の行が 2 行あると検査は失敗し、該当の行を示す', T, () => {
  expectNew(assert, { mutate: (sb) => edit(sb, (c) => { c.rows.push([...c.rows[0]]); }), rowIdx: 0 });
});

// FR-188 AC-404（異常系: 連携名が空）
test('FR-188 AC-404 連携名が空の行があると検査は失敗し、該当の行を示す', T, () => {
  const s = makeSandbox();
  try {
    edit(s, (c) => { const r = [...c.rows[0]]; r[0] = ''; c.rows.push(r); });
    const cat = readCatalog(s);
    const lineNo = cat.hi + 2 + cat.rows.length; // 追加した行（1 始まりの行番号）
    const nf = newFindings(baseline(), runCheck(s), 'ERROR');
    assert.ok(nf.some((f) => new RegExp(`integration-catalog\\.md:${lineNo}(?!\\d)`).test(f.raw) || /連携名/.test(f.raw)), `連携名が空の行の指摘がない: ${lines(nf)}`);
  } finally { cleanup(s); }
});

// FR-189 AC-405（異常系: 必須の欄が空。欄ごと）
for (const [k, label] of [['dest', '相手先（連携先）'], ['dir', '方向'], ['kind', '種別'], ['state', '状態'], ['truth', '正本と識別子']]) {
  test(`FR-189 AC-405 ${label} が空の行があると検査は失敗し、空の欄を示す`, T, () => {
    expectNew(assert, { mutate: (sb) => setCell(sb, 0, k, ''), rowIdx: 0, keys: [k] });
  });
}

// FR-189 AC-405（「なし（理由）」「TBD（Q-xxx）」は空とみなさない）
test('FR-189 AC-405 「なし（理由）」と「TBD（Q-xxx）」の欄は空とみなされず、指摘が増えない', T, () => {
  expectNoNew(assert, { mutate: (sb) => setCells(sb, 0, { truth: 'なし（理由: 自システムで採番しない）' }), rowIdx: 0 });
  expectNoNew(assert, { mutate: (sb) => setCells(sb, 0, { truth: 'TBD（Q-027）' }), rowIdx: 0 });
});

// FR-189 AC-406（異常系: 列挙値）
for (const [k, v, label] of [['dir', '上り', '方向'], ['kind', 'FTP 連携', '種別'], ['kind', 'その他', '種別（その他に内容がない）'], ['state', '運用中', '状態']]) {
  test(`FR-189 AC-406 ${label} が定義外（${v}）の行があると検査は失敗する`, T, () => {
    expectNew(assert, { mutate: (sb) => setCell(sb, 0, k, v), rowIdx: 0, keys: [k] });
  });
}

// FR-189 AC-406（正常系: その他は内容があればよい）
test('FR-189 AC-406 種別「その他（内容）」は指摘が増えない', T, () => {
  expectNoNew(assert, { mutate: (sb) => setCell(sb, 0, 'kind', 'その他（手渡しの USB メモリ）'), rowIdx: 0 });
});
