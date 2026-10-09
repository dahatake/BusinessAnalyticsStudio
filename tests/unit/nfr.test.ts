// I32-nfr: 非機能要求の単体・結合テスト（NFR-PERF-001 AC-160、NFR-L10N-001 AC-168 の静的な部分）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main as cliMain } from '../../scripts/pipeline/cli';
import { COMMAND_STAGES, defaultPaths, workDir } from '../../scripts/pipeline/common';
import { mockSmoke } from '../../scripts/pipeline/verify';
import { keysOf, leaf, show, split } from '../../src/workspace/layoutModel';

const ROOT = path.resolve(__dirname, '..', '..');
/** PARAM-001: 顧客パックの生成から起動までの上限（調査済み）6 分 */
const PARAM_001_MS = 6 * 60 * 1000;

let tmp: string;
let template: string;
let workspace: string;

/** ビルド済みの雛形の代わりになる小さなフォルダー（node_modules と dist を持つ） */
function makeTemplate(root: string): void {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public', 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"tpl"}');
  fs.writeFileSync(path.join(root, 'src', 'main.tsx'), 'export {};');
  fs.writeFileSync(path.join(root, 'public', 'data', 'README.txt'), 'x');
  fs.mkdirSync(path.join(root, 'node_modules', 'pkg-a'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'pkg-a', 'index.js'), 'module.exports = 1;');
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<!doctype html><title>app</title>');
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-nfr-'));
  template = path.join(tmp, 'template');
  workspace = path.join(tmp, 'ws');
  makeTemplate(template);
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('NFR-PERF-001 顧客パックの生成から起動までの時間', () => {
  // NFR-PERF-001 AC-160
  it('AC-160 モックの生成器で build を実行すると、logs/timing.json の合計が PARAM-001（6 分）以内で、工程の和と一致し、起動まで含む', async () => {
    const logs: string[] = [];
    // 生成はモック（LLM の時間を含まない）、起動は実際の 127.0.0.1 の配信、⑥ verify のブラウザー検査は差し替え部品（モック）
    const code = await cliMain(['build', '--customer', '計測商事', '--no-keep', '--workspace', workspace, '--template', template],
      { smoke: mockSmoke, log: (l) => { logs.push(l); } });
    expect(code, logs.join('\n')).toBe(0);
    const p = defaultPaths({ workspace, template });
    const file = path.join(workDir(p, '計測商事'), 'logs', 'timing.json');
    const t = JSON.parse(fs.readFileSync(file, 'utf8')) as { totalMs: number; startedAt: string; finishedAt: string; stages: Array<{ id: string; durationMs: number; startedAt: string; finishedAt: string; ok: boolean }> };
    expect(t.stages.map((s) => s.id)).toEqual(COMMAND_STAGES.build);
    expect(t.stages.every((s) => s.ok)).toBe(true);
    expect(t.stages.every((s) => /[+-]\d{2}:\d{2}$|Z$/.test(s.startedAt) && /[+-]\d{2}:\d{2}$|Z$/.test(s.finishedAt))).toBe(true);
    const sum = t.stages.reduce((a, s) => a + s.durationMs, 0);
    expect(Math.abs(t.totalMs - sum)).toBeLessThan(1);
    expect(t.totalMs, `合計 ${t.totalMs}ms`).toBeLessThanOrEqual(PARAM_001_MS);
    expect(logs.join('\n')).toMatch(/合計/);
  });
});

describe('NFR-LEGAL-002 多くの画面を開いても各画面が操作できる幅を保つ', () => {
  // NFR-LEGAL-002 AC-180（表示の明示を確かめる前に、全画面を開いても各列が潰れない）
  it('AC-180 画面を次々に表示しても、先にあった列が見えない幅まで縮まない', () => {
    let l = split('row', [leaf('a'), leaf('b'), leaf('c')]);
    const keys = Array.from({ length: 17 }, (_, i) => `k${i}`);
    for (const k of keys) l = show(l, k) as typeof l;
    expect(keysOf(l).length).toBe(20);
    const sizes = (l as { sizes: number[] }).sizes;
    expect(sizes.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(Math.min(...sizes), '最小の列の割合').toBeGreaterThanOrEqual(0.5 / 20);
  });
});

describe('NFR-L10N-001 日本語の UI', () => {
  // NFR-L10N-001 AC-168
  it('AC-168 index.html の言語属性が ja で、タイトルが日本語（画面の文言は System Test が確かめる）', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(html).toMatch(/<html[^>]*\blang="ja"/);
    expect(html).toMatch(/<title>[^<]*[\u3040-\u30ff\u4e00-\u9fff][^<]*<\/title>/);
  });
});
