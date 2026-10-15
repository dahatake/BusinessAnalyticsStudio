// FR-198（要求定義書との結線）。期待値は受入基準だけから決める。
// 実行: node --test tests/system/integration-catalog/wiring.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { baseline, cleanup, edit, expectNew, expectNoNew, lines, makeSandbox, mentionsRow, newFindings, rowName, runCheck, setCell } from './support.mjs';

const T = { timeout: 300_000 };

// FR-198 AC-423
test('FR-198 AC-423 要求定義書に存在しない要求 ID を「関連する要求 ID」に持つ行があると検査は失敗する', T, () => {
  expectNew(assert, { mutate: (sb) => setCell(sb, 0, 'reqs', ['FR', '9999'].join('-')), rowIdx: 0, pattern: /FR-\x39999/ });
});
test('FR-198 AC-423 存在する要求 ID だけなら、この指摘は増えない', T, () => {
  expectNoNew(assert, { mutate: (sb) => setCell(sb, 0, 'reqs', 'FR-188'), rowIdx: 0 });
});

// FR-198 AC-424（§8 にあってカタログにない）
test('FR-198 AC-424 §8 の連携先がカタログにないと検査は失敗し、不足している側（カタログ）を示す', T, () => {
  const sb = makeSandbox();
  try {
    const name = rowName(sb, 0);
    edit(sb, (c) => { c.rows.splice(0, 1); });
    const nf = newFindings(baseline(), runCheck(sb), 'ERROR');
    assert.ok(nf.some((f) => f.raw.includes(name)), `カタログから消した連携先「${name}」を示す指摘がない: ${lines(nf)}`);
  } finally { cleanup(sb); }
});
// FR-198 AC-424（カタログにあって §8 にない）
test('FR-198 AC-424 カタログにあって §8 にない連携先（状態が「廃止」以外）があると検査は失敗し、不足している側（§8）を示す', T, () => {
  const sb = makeSandbox();
  try {
    edit(sb, (c) => { const r = [...c.rows[0]]; r[0] = '架空の連携先（テスト用）'; c.rows.push(r); });
    const nf = newFindings(baseline(), runCheck(sb), 'ERROR');
    assert.ok(nf.some((f) => mentionsRow(f, sb, '架空の連携先（テスト用）')), `§8 にない連携先を示す指摘がない: ${lines(nf)}`);
  } finally { cleanup(sb); }
});
// FR-198 AC-424（廃止は対象外）
test('FR-198 AC-424 カタログにあって §8 にない連携先でも、状態が「廃止」なら指摘が増えない', T, () => {
  const sb = makeSandbox();
  try {
    edit(sb, (c) => { const r = [...c.rows[0]]; r[0] = '廃止済みの架空の連携先'; r[c.header.indexOf('状態')] = '廃止'; c.rows.push(r); });
    const nf = newFindings(baseline(), runCheck(sb), 'ERROR').filter((f) => mentionsRow(f, sb, '廃止済みの架空の連携先'));
    assert.equal(nf.length, 0, lines(nf));
  } finally { cleanup(sb); }
});

// FR-198 AC-425（関連する要求 ID が空）
test('FR-198 AC-425 「関連する要求 ID」が空の行があると検査は失敗する', T, () => {
  expectNew(assert, { mutate: (sb) => setCell(sb, 0, 'reqs', ''), rowIdx: 0, keys: ['reqs'] });
});
// FR-198 AC-425（要求が参照する連携名がカタログにない）
test('FR-198 AC-425 要求の「関連する既存資産」の 外部連携「連携名」 がカタログにないと検査は失敗し、要求 ID と連携名を示す', T, () => {
  const sb = makeSandbox();
  try {
    const f = path.join(sb.root, 'docs', 'requirements', 'integration.md');
    const src = fs.readFileSync(f, 'utf8');
    const m = src.match(/^- 関連する既存資産: .*$/m);
    assert.ok(m, '関連する既存資産の行が見つからない');
    fs.writeFileSync(f, src.replace(m[0], `${m[0]}、外部連携「存在しない連携ＸＹＺ」`));
    const nf = newFindings(baseline(), runCheck(sb), 'ERROR');
    assert.ok(nf.some((x) => /存在しない連携ＸＹＺ/.test(x.raw) && /FR-\d+/.test(x.raw)), `要求 ID と連携名を示す指摘がない: ${lines(nf)}`);
  } finally { cleanup(sb); }
});
test('FR-198 AC-425 参照した連携名がカタログにあれば、この指摘は増えない', T, () => {
  const sb = makeSandbox();
  try {
    const name = rowName(sb, 0);
    const f = path.join(sb.root, 'docs', 'requirements', 'integration.md');
    const src = fs.readFileSync(f, 'utf8');
    const m = src.match(/^- 関連する既存資産: .*$/m);
    fs.writeFileSync(f, src.replace(m[0], `${m[0]}、外部連携「${name}」`));
    const nf = newFindings(baseline(), runCheck(sb), 'ERROR');
    assert.equal(nf.length, 0, lines(nf));
  } finally { cleanup(sb); }
});
