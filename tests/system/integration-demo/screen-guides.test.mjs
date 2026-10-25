// FR-287 AC-748 / AC-751（デモの顧客パックの screenGuides と架空性・スキーマ）。期待値は受入基準だけから決める。
// 実行: node --test tests/system/integration-demo/screen-guides.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MAX = 120; // PARAM-124

/** 要求定義書 FR-287 に列挙された23画面。旧 mock-app は任意の互換キー。 */
const SCREEN_KEYS = [
  'issue-solution', 'priority', 'summary', 'matrix', 'ranking', 'knowledge-graph', 'business-graph',
  'architecture', 'discussion-tree', 'table', 'gantt', 'map', 'kpi-okr', 'twin-view',
  'sources', 'usecase', 'data-catalog', 'spatial-view', 'whiteboard', 'themes', 'settings',
  'genai-scenario', 'chat',
];

const customer = (kind) => JSON.parse(fs.readFileSync(path.join(root, 'examples', kind, 'public', 'data', 'customer.json'), 'utf8'));

test('FR-287 AC-748 前提: 登録簿のキーが23件で、要求の一覧と一致し mock-app がない', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'screens', 'registry.ts'), 'utf8');
  const keys = [...src.matchAll(/\{\s*key:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.equal(keys.length, 23);
  assert.deepEqual([...keys].sort(), [...SCREEN_KEYS].sort());
});

for (const kind of ['mono', 'koto']) {
  // FR-287 AC-748
  test(`FR-287 AC-748 ${kind}: screenGuides は23件すべてのキーを持ち、各説明が空でなく ${MAX} 文字以内`, () => {
    const g = customer(kind).screenGuides;
    assert.ok(g && typeof g === 'object' && !Array.isArray(g), 'screenGuides（キー→説明文のオブジェクト）がない');
    const missing = SCREEN_KEYS.filter((k) => !(k in g));
    assert.deepEqual(missing, [], `欠落したキー: ${missing.join(', ')}`);
    for (const k of SCREEN_KEYS) {
      assert.equal(typeof g[k], 'string', `${k}: 文字列でない`);
      const t = g[k].trim();
      assert.ok(t.length > 0, `${k}: 空`);
      assert.ok([...t].length <= MAX, `${k}: ${[...t].length} 文字（上限 ${MAX}）`);
    }
  });

  // FR-287 AC-748（旧キーの有無の互換性。内容の理解はAC-753で人が判定する）
  test(`FR-287 AC-748 ${kind}: 旧 mock-app 説明キーの有無の両方を受け入れ、保存した値を消去しない`, { timeout: 300_000 }, () => {
    const tmp = fs.mkdtempSync(path.join(root, 'work', 'st-guides-compat-'));
    try {
      const dst = path.join(tmp, kind);
      fs.cpSync(path.join(root, 'examples', kind), dst, { recursive: true });
      const file = path.join(dst, 'public', 'data', 'customer.json');
      const c = customer(kind);
      for (const legacy of [false, true]) {
        if (legacy) c.screenGuides['mock-app'] = '互換データ: 保存済みの試作画面の説明。';
        else delete c.screenGuides['mock-app'];
        const saved = JSON.stringify(c, null, 2);
        fs.writeFileSync(file, saved);
        const r = spawnSync(process.execPath, [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'scripts/check-pack.ts', dst], { cwd: root, encoding: 'utf8' });
        assert.equal(r.status, 0, `旧キー${legacy ? 'あり' : 'なし'}を拒否: ${(r.stdout ?? '') + (r.stderr ?? '')}`);
        assert.equal(fs.readFileSync(file, 'utf8'), saved, '互換データが書き換えられた');
      }
      // AC-748: 旧キーの互換性が、現役23キーの欠落や文字数超過の許容にならない。
      for (const bad of ['missing', 'too-long']) {
        const invalid = structuredClone(c);
        if (bad === 'missing') delete invalid.screenGuides.chat;
        else invalid.screenGuides.chat = 'あ'.repeat(MAX + 1);
        fs.writeFileSync(file, JSON.stringify(invalid, null, 2));
        const r = spawnSync(process.execPath, [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'scripts/check-pack.ts', dst], { cwd: root, encoding: 'utf8' });
        assert.notEqual(r.status, 0, `${bad} のパックを受け入れた`);
        assert.match((r.stdout ?? '') + (r.stderr ?? ''), /screenGuides/, '説明以外の失敗を誤検出していないか確認');
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // FR-287 AC-751
  test(`FR-287 AC-751 ${kind}: 架空であることの注記（fictionalNote）があり、screenGuides に実在の URL を含まない`, () => {
    const c = customer(kind);
    assert.ok(typeof c.fictionalNote === 'string' && /架空/.test(c.fictionalNote), 'fictionalNote に「架空」がない');
    assert.ok(!/https?:\/\//i.test(JSON.stringify(c.screenGuides ?? {})), 'screenGuides に URL が含まれる');
  });
}

// FR-287 AC-751（スキーマ検証。npm run verify:pack 相当）
test('FR-287 AC-751 デモの顧客パック（screenGuides を含む）がスキーマ検証に通る', { timeout: 300_000 }, () => {
  const r = spawnSync('npm', ['run', 'check:pack'], { cwd: root, encoding: 'utf8', shell: true });
  assert.equal(r.status, 0, `check:pack が失敗: ${(r.stdout ?? '') + (r.stderr ?? '')}`.slice(0, 2000));
});

// FR-287 AC-751（異常系: 上限超過・キー欠落はスキーマ検証で拒否される）
test('FR-287 AC-751 異常系: screenGuides の説明が上限超過・キー欠落のパックは検証で失敗する', { timeout: 300_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(root, 'work', 'st-guides-'));
  try {
    const dst = path.join(tmp, 'mono');
    fs.cpSync(path.join(root, 'examples', 'mono'), dst, { recursive: true });
    const f = path.join(dst, 'public', 'data', 'customer.json');
    const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    c.screenGuides = { ...(c.screenGuides ?? {}), table: 'あ'.repeat(MAX + 1) };
    delete c.screenGuides.chat;
    fs.writeFileSync(f, JSON.stringify(c, null, 2));
    const r = spawnSync('npx', ['tsx', 'scripts/check-pack.ts', dst], { cwd: root, encoding: 'utf8', shell: true });
    assert.notEqual(r.status, 0, '上限超過・キー欠落のパックが検証を通ってしまった');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
