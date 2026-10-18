// FR-218（A-57）: 世界区分の項目を持たない顧客パックのデータ（課題・原因・解決策など）は、すべての画面で §3.7 の分類表の世界区分で
// 表示・非表示を決める。「区分なし」は、世界区分の項目を持つエンティティ（entities.json）で world が書かれていないものだけ。
// 単体: 分類表（TABLE_WORLDS）と要求定義書 §3.7 の一致、グラフの節の既定の世界区分、画面の登録の宣言が同じ表から引かれること。
// 結合: お手本パックのグラフを一覧表・ナレッジグラフと同じ規則（filterByWorld・isShownInWorld）で絞ったときの件数。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_SCHEMAS, TABLE_WORLDS, tableWorldOf, tableWorldOfAll, type PackData } from '../../src/schema';
import { NODE_KINDS, NODE_KIND_TABLE_ROW, buildEntityGraph, defaultWorldOfNodeKind } from '../../src/selection/graph';
import { filterByWorld, isShownInWorld, tableWorldDecl } from '../../src/view/viewModel';
import { REPO_ROOT, readPackFiles } from '../../scripts/lib/pack-fs';

function loadPack(kind: 'mono' | 'koto'): PackData {
  const files = readPackFiles(path.join(REPO_ROOT, 'examples', kind)) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(DATA_SCHEMAS)) out[name] = schema.parse(files[name]);
  return out as unknown as PackData;
}

describe('FR-218 A-57 §3.7 の既定の世界区分（単体）', () => {
  // FR-218 AC-504
  it('FR-218 AC-504 世界区分を当てる表（TABLE_WORLDS）の全行が、要求定義書 §3.7 のエンティティの分類表の世界区分と一致する', () => {
    const rd = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'requirements-definition.md'), 'utf8');
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const [name, w] of Object.entries(TABLE_WORLDS)) {
      const m = rd.match(new RegExp(`^\\| ${esc(name)} \\| (現実世界|デジタル世界) \\|`, 'm'));
      expect(m?.[1], `§3.7 に ${name} の行がない`).toBeTruthy();
      expect(w, `${name} の世界区分が §3.7 と合わない`).toBe(m![1] === '現実世界' ? 'real' : 'digital');
    }
    expect(tableWorldOf('課題')).toBe('real');
    expect(tableWorldOf('存在しない行')).toBeUndefined();
    expect(tableWorldOf('toString')).toBeUndefined();
  });

  // FR-218 AC-504
  it('FR-218 AC-504 複数の行の世界区分は、すべて同じときだけ 1 つに決まり、表にない行・異なる世界区分の組は宣言の誤りとして例外になる', () => {
    expect(tableWorldOfAll(['課題', '原因', '解決策', '効果'])).toBe('real');
    expect(tableWorldOfAll(['KPI', 'OKR'])).toBe('digital');
    expect(() => tableWorldOfAll(['課題', '出典'])).toThrow(/1 つに決まりません/);
    expect(() => tableWorldOfAll(['未知'])).toThrow(/世界区分がありません/);
    expect(tableWorldDecl(['課題', '解決策'])).toEqual({ world: 'real', basis: '課題・解決策' });
    expect(tableWorldDecl(['付箋', 'ストローク'], 'ボードの付箋・ストローク')).toEqual({ world: 'digital', basis: 'ボードの付箋・ストローク' });
  });

  // FR-218 AC-504
  it('FR-218 AC-504 節の種類の既定の世界区分: 課題・解決策・議題・工程（task）＝現実世界、製品・機能・アーキテクチャ・モック・章・出典＝デジタル世界。エンティティだけは当てない', () => {
    const want: Record<string, 'real' | 'digital' | undefined> = {
      entity: undefined, issue: 'real', solution: 'real', product: 'digital', feature: 'digital', task: 'real',
      architecture: 'digital', mock: 'digital', chapter: 'digital', topic: 'real', source: 'digital',
    };
    for (const k of NODE_KINDS) expect(defaultWorldOfNodeKind(k), k).toBe(want[k]);
    // 表に載る行だけを使う（推測で行を作らない）
    for (const row of Object.values(NODE_KIND_TABLE_ROW)) if (row) expect(TABLE_WORLDS[row], row).toBeDefined();
  });

  // FR-218 AC-504
  it('FR-218 AC-504 グラフの節: 世界区分のないエンティティだけが区分なしで、world のない課題・解決策・工程は現実世界、モックはデジタル世界になり、ツイン関係はエンティティどうしだけ', () => {
    const data = loadPack('mono');
    const plain = structuredClone(data) as PackData;
    for (const e of plain.entities.entities as Array<Record<string, unknown>>) delete e.world;
    const g = buildEntityGraph(plain);
    const ents = g.nodes.filter((n) => n.kind === 'entity');
    expect(ents.length).toBeGreaterThan(0);
    for (const n of ents) expect(n.world, n.id).toBeUndefined();
    const issues = g.nodes.filter((n) => n.kind === 'issue' || n.kind === 'solution');
    expect(issues.length).toBeGreaterThan(0);
    for (const n of issues) expect(n.world, n.id).toBe('real');
    for (const n of g.nodes.filter((x) => x.kind === 'task')) expect(n.world, n.id).toBe('real');
    for (const n of g.nodes.filter((x) => x.kind === 'mock')) expect(n.world, n.id).toBe('digital');
    expect(g.edges.filter((e) => e.kind === 'twin')).toEqual([]);
  });
});

describe('FR-218 A-57 一覧表・ナレッジグラフの規則での件数（結合）', () => {
  for (const k of ['mono', 'koto'] as const) {
    // FR-218 AC-503 AC-504
    it(`FR-218 AC-503 AC-504 お手本パック（${k}）: 「現実世界」に課題・解決策がすべて入り、「デジタル世界」には入らない。区分なしは「両方」だけ`, () => {
      const g = buildEntityGraph(loadPack(k));
      const ids = (w: 'real' | 'digital' | 'both') => filterByWorld(g.nodes, (n) => n.world, w).map((n) => n.id);
      const real = new Set(ids('real'));
      const digital = new Set(ids('digital'));
      const issueIds = g.nodes.filter((n) => n.kind === 'issue' || n.kind === 'solution').map((n) => n.id);
      expect(issueIds.length).toBeGreaterThan(0);
      for (const id of issueIds) {
        expect(real.has(id), `${id} が「現実世界」に出ない`).toBe(true);
        expect(digital.has(id), `${id} が「デジタル世界」に出る`).toBe(false);
      }
      for (const n of g.nodes.filter((x) => x.kind === 'source' || x.kind === 'architecture')) {
        expect(digital.has(n.id), `${n.id} が「デジタル世界」に出ない`).toBe(true);
      }
      // 「両方」は全件。区分なし（world のない節）は「両方」でだけ表示される
      expect(ids('both').length).toBe(g.nodes.length);
      for (const n of g.nodes.filter((x) => x.world === undefined)) {
        expect(isShownInWorld(n.world, 'real') || isShownInWorld(n.world, 'digital'), n.id).toBe(false);
        expect(n.kind).toBe('entity');
      }
    });
  }

  // FR-218 AC-503 AC-504（A-57）: 工程（data.plan.tasks）の世界区分は、グラフの節（一覧表・ナレッジグラフ）とガントチャートの宣言で一致する
  it('FR-218 AC-503 AC-504 工程の節は一覧表・ナレッジグラフで「現実世界」に入り、ガントチャートの宣言（工程）と一致する', () => {
    // ガントチャートの登録（registry.ts）は、節の種類 task を表示し、世界区分を §3.7 の「工程」の行から宣言している
    const reg = fs.readFileSync(path.join(REPO_ROOT, 'src', 'screens', 'registry.ts'), 'utf8');
    const line = reg.split('\n').find((l) => l.includes("key: 'gantt'"));
    expect(line).toBeDefined();
    expect(line).toContain("tableWorldDecl(['工程'])");
    expect(line).toContain("kinds: ['task']");
    const decl = tableWorldDecl(['工程']);
    expect(decl.world).toBe('real');
    expect(defaultWorldOfNodeKind('task')).toBe(decl.world);
    for (const k of ['mono', 'koto'] as const) {
      const g = buildEntityGraph(loadPack(k));
      const tasks = g.nodes.filter((n) => n.kind === 'task');
      expect(tasks.length, k).toBeGreaterThan(0);
      const real = new Set(filterByWorld(g.nodes, (n) => n.world, 'real').map((n) => n.id));
      const digital = new Set(filterByWorld(g.nodes, (n) => n.world, 'digital').map((n) => n.id));
      for (const n of tasks) {
        expect(n.world, n.id).toBe(decl.world);
        expect(real.has(n.id), `${n.id} が「現実世界」に出ない`).toBe(true);
        expect(digital.has(n.id), `${n.id} が「デジタル世界」に出る`).toBe(false);
        expect(isShownInWorld(n.world, 'real'), n.id).toBe(true);
      }
      for (const n of g.nodes.filter((x) => x.kind === 'mock')) {
        expect(digital.has(n.id), `${n.id} が「デジタル世界」に出ない`).toBe(true);
        expect(real.has(n.id), `${n.id} が「現実世界」に出る`).toBe(false);
      }
    }
  });
});
