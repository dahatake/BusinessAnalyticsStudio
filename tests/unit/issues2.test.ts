// FR-006・FR-007・FR-008・FR-009・FR-038 の単体・結合テスト（生成 AI の価値、Feature ごとの工程、サンプルの明示、出典と確度、課題-解決策分析ビュー）
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildFlow, buildMatrix, causesOf, effectsOf, filterSolutions, genAiValueItems, relatedFlowNodes, solutionIssueIds,
  solutionsOfIssue, sourceKindLabel, type Issue, type Product, type Solution,
} from '../../src/analysis/model';
import { hasSampleData } from '../../src/data/sample';
import { buildGantt, formatPeriod, parseDay, type Feature, type Task } from '../../src/plan/model';
import { disableInvalidItems, validatePack, type PackData, type PackFiles } from '../../src/schema';

const EXAMPLES = path.resolve(__dirname, '../../examples');
const readPack = (kind: 'mono' | 'koto'): PackFiles => {
  const root = path.join(EXAMPLES, kind, 'public');
  const out: Record<string, unknown> = {};
  for (const f of fs.readdirSync(path.join(root, 'data'))) {
    if (f.endsWith('.json')) out[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
  }
  out.brandProfile = JSON.parse(fs.readFileSync(path.join(root, 'brand/brand-profile.json'), 'utf8'));
  return out as PackFiles;
};

const issue = (id: string, parentId: string | null, extra: Record<string, unknown> = {}): Issue =>
  ({ id, createdBy: 'sample', parentId, title: `課題 ${id}`, audience: 'internal', ...extra }) as Issue;
const solution = (id: string, issueId: string, extra: Record<string, unknown> = {}): Solution =>
  ({ id, createdBy: 'sample', issueId, title: `解決策 ${id}`, ...extra }) as Solution;
const product = (id: string): Product => ({ id, createdBy: 'sample', name: `製品 ${id}` }) as Product;

describe('FR-006 AC-006 生成 AI の価値', () => {
  it('指定した価値だけを、ラベルと説明文つきで、定義順に返す', () => {
    const items = genAiValueItems(solution('s', 'i', { genAiValues: ['workflow', 'parameter'] }));
    expect(items.map((x) => x.key)).toEqual(['parameter', 'workflow']);
    for (const it of items) {
      expect(it.label.length).toBeGreaterThan(0);
      expect(it.description.length).toBeGreaterThan(5);
    }
  });

  it('4 種類のラベルは互いの語を含まず、すべての種類を指定すると 4 件になる', () => {
    const all = genAiValueItems(solution('s', 'i', { genAiValues: ['parameter', 'fusion', 'chatRag', 'workflow'] }));
    expect(all).toHaveLength(4);
    expect(all.find((x) => x.key === 'chatRag')?.label).toMatch(/RAG/);
    expect(all.find((x) => x.key === 'workflow')?.label).toMatch(/業務フロー/);
    expect(all.filter((x) => /RAG/.test(x.label + x.description))).toHaveLength(1);
    expect(all.filter((x) => /業務フロー/.test(x.label + x.description))).toHaveLength(1);
    expect(all.filter((x) => /融合/.test(x.label + x.description))).toHaveLength(1);
    expect(all.filter((x) => /パラメーター/.test(x.label + x.description))).toHaveLength(1);
  });

  it('異常系: 指定がない（生成 AI を使わない）解決策は空。パックの未知の値はスキーマで弾く', () => {
    expect(genAiValueItems(solution('s', 'i'))).toEqual([]);
    const files = readPack('mono');
    (files.issues as { solutions: Array<Record<string, unknown>> }).solutions[0]!.genAiValues = ['magic'];
    expect(validatePack(files).errors.some((e) => e.code === 'schema' && e.path.includes('genAiValues'))).toBe(true);
  });
});

describe('FR-007 AC-007 Feature ごとの工程', () => {
  const features = [{ id: 'f1', title: 'F1' }, { id: 'f2', title: 'F2' }] as Feature[];
  const tasks = [
    { id: 't1', title: 'T1', featureId: 'f1', start: '2026-11-02', end: '2026-11-13', owner: '現場', work: '整理' },
    { id: 't2', title: 'T2', featureId: 'f1', start: '2026-11-16', end: '2026-12-11' },
    { id: 't3', title: 'T3', featureId: 'f2', start: '2026-12-01', end: '2026-12-31' },
    { id: 't4', title: 'T4', featureId: 'f2' },
    { id: 't5', title: 'T5', featureId: 'nothing', start: '2026-11-02', end: '2026-11-02' },
  ] as Task[];

  it('Feature ごとに工程をまとめ、開始日順に並べる。存在しない Feature の工程は orphans', () => {
    const m = buildGantt(features, tasks);
    expect(m.groups.map((g) => g.tasks.map((t) => t.task.id))).toEqual([['t1', 't2'], ['t3', 't4']]);
    expect(m.orphans.map((t) => t.task.id)).toEqual(['t5']);
  });

  it('期間全体に対する位置と幅（%）を日付から求める。日付のない工程はバーなし', () => {
    const m = buildGantt(features, tasks);
    const t1 = m.groups[0]!.tasks[0]!;
    expect(t1.leftPct).toBe(0);
    expect(t1.widthPct).toBeGreaterThan(0);
    const t3 = m.groups[1]!.tasks[0]!;
    expect(t3.leftPct + t3.widthPct).toBeCloseTo(100, 5);
    const t4 = m.groups[1]!.tasks[1]!;
    expect(t4.startDay).toBeUndefined();
    expect(formatPeriod(t4.task)).toBe('日付なし');
    expect(formatPeriod(t1.task)).toBe('2026-11-02 〜 2026-11-13');
    expect(m.months.map((x) => x.label)).toEqual(['2026年11月', '2026年12月']);
  });

  it('異常系: 存在しない日付・形式の誤りは日数にしない（バーを描かない）', () => {
    expect(parseDay('2026-02-30')).toBeUndefined();
    expect(parseDay('2026/11/02')).toBeUndefined();
    expect(parseDay(undefined)).toBeUndefined();
    expect(parseDay('2026-11-02')).toBe(parseDay('2026-11-01')! + 1);
  });

  it('お手本パックの工程は、担当・作業内容つきで検証を通る', () => {
    for (const kind of ['mono', 'koto'] as const) {
      const files = readPack(kind);
      expect(validatePack(files).errors).toEqual([]);
      const plan = files.plan as { tasks: Array<{ owner?: string; work?: string }> };
      for (const t of plan.tasks) {
        expect(t.owner).toBeTruthy();
        expect(t.work).toBeTruthy();
      }
    }
  });
});

describe('FR-008 AC-008 サンプルの明示', () => {
  const data = (createdBy: string) => ({
    customer: { createdBy }, entities: { entities: [] }, issues: { issues: [], solutions: [] }, products: { products: [] },
    plan: { features: [], tasks: [] }, architecture: { nodes: [], edges: [] }, mocks: { mocks: [] }, show: { chapters: [] }, sources: { sources: [] },
  }) as unknown as PackData;

  it('作成者の種別が sample の項目があればサンプルとみなす', () => {
    expect(hasSampleData(data('sample'))).toBe(true);
  });

  it('異常系: sample の項目がない（実データだけの）パックにはサンプル表示を出さない', () => {
    expect(hasSampleData(data('human'))).toBe(false);
  });

  it('お手本パックはサンプルである', () => {
    const files = readPack('mono') as unknown as PackData;
    expect(hasSampleData(files)).toBe(true);
  });
});

describe('FR-009 AC-009 出典と確度', () => {
  it('出典の種別を WorkIQ・Web・推定に分けて表示する', () => {
    expect(sourceKindLabel('workiq')).toBe('WorkIQ');
    expect(sourceKindLabel('web')).toBe('Web');
    for (const k of ['document', 'interview', 'sample'] as const) expect(sourceKindLabel(k)).toMatch(/^推定/);
  });

  it('お手本パックの出典には、取得日と確度（高・中・低・推定）がある', () => {
    const sources = (readPack('mono').sources as { sources: Array<{ retrievedAt: string; confidence: string }> }).sources;
    for (const s of sources) {
      expect(s.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['高', '中', '低', '推定']).toContain(s.confidence);
    }
  });
});

describe('FR-038 AC-046 課題-解決策分析ビュー', () => {
  const issues = [
    issue('i1', null, { causes: [{ id: 'c1', title: '原因1' }, { id: 'c2', title: '原因2' }] }),
    issue('i2', 'i1'),
    issue('i3', null, { causes: [{ id: 'c3', title: '原因3' }] }),
  ];
  const products = [product('p1'), product('p2'), product('p3')];
  const solutions = [
    solution('s1', 'i1', { issueIds: ['i1', 'i3'], effects: [{ id: 'e1', title: '効果1' }], productIds: ['p1', 'p2'], sourceIds: ['src'] }),
    solution('s2', 'i2', { productIds: ['p2'] }),
    solution('s3', 'i3'),
  ];

  it('解決策は、効く課題のどれでも対応づけられる（issueIds は issueId に加えて参照する）', () => {
    expect(solutionIssueIds(solutions[0]!)).toEqual(['i1', 'i3']);
    expect(solutionsOfIssue('i3', solutions).map((s) => s.id)).toEqual(['s1', 's3']);
    expect(filterSolutions(solutions, [issues[2]!]).map((s) => s.id)).toEqual(['s1', 's3']);
    expect(causesOf(issues[0]!).map((c) => c.title)).toEqual(['原因1', '原因2']);
    expect(effectsOf(solutions[0]!).map((e) => e.title)).toEqual(['効果1']);
    expect(causesOf(issues[1]!)).toEqual([]);
  });

  it('サンキー図: 課題→原因→解決策→効果→製品の節点と流れを作り、原因のない課題は解決策へ直接つなぐ', () => {
    const f = buildFlow(issues, solutions, products);
    const kinds = (k: string) => f.nodes.filter((n) => n.kind === k).map((n) => n.id);
    expect(kinds('issue')).toEqual(['i1', 'i2', 'i3']);
    expect(kinds('cause')).toEqual(['c1', 'c2', 'c3']);
    expect(kinds('solution')).toEqual(['s1', 's2', 's3']);
    expect(kinds('effect')).toEqual(['e1']);
    expect(kinds('product')).toEqual(['p1', 'p2']);
    const has = (from: string, to: string) => f.links.some((l) => l.from === from && l.to === to);
    expect(has('i1', 'c1') && has('c1', 's1') && has('c2', 's1')).toBe(true);
    expect(has('c3', 's1') && has('c3', 's3')).toBe(true);
    expect(has('i2', 's2')).toBe(true); // 原因のない課題は直接つなぐ
    expect(has('s1', 'e1') && has('s1', 'p1') && has('s2', 'p2')).toBe(true);
    expect(f.nodes.filter((n) => n.kind === 'solution').map((n) => n.row)).toEqual([0, 1, 2]);
    expect(f.rows).toBe(3);
  });

  it('選んだ節点に関係する節点（上流と下流）をたどる', () => {
    const f = buildFlow(issues, solutions, products);
    const r = relatedFlowNodes(f, 'i1');
    for (const id of ['c1', 'c2', 's1', 'e1', 'p1', 'p2']) expect(r.has(id)).toBe(true);
    expect(r.has('i1')).toBe(false);
    const up = relatedFlowNodes(f, 's2');
    expect(up.has('i2')).toBe(true);
    expect(up.has('p2')).toBe(true);
    expect(up.has('e1')).toBe(false);
  });

  it('マトリクス: 課題（行）× 製品（列）。製品のない解決策は「製品なし」の列に入る', () => {
    const m = buildMatrix(issues, solutions, products);
    expect(m.columns.map((p) => p?.id)).toEqual(['p1', 'p2', undefined]);
    const row = (id: string) => m.rows.find((r) => r.issue.id === id)!;
    expect(row('i1').cells.map((c) => c.solutions.map((s) => s.id))).toEqual([['s1'], ['s1'], []]);
    expect(row('i2').cells.map((c) => c.solutions.map((s) => s.id))).toEqual([[], ['s2'], []]);
    expect(row('i3').cells.map((c) => c.solutions.map((s) => s.id))).toEqual([['s1'], ['s1'], ['s3']]);
    expect(row('i1').causes).toHaveLength(2);
  });

  it('異常系: 課題が 0 件でも落ちない（空の流れと空のマトリクス）', () => {
    const f = buildFlow([], [], products);
    expect(f.nodes).toEqual([]);
    expect(f.rows).toBe(1);
    expect(buildMatrix([], [], products).rows).toEqual([]);
  });

  it('お手本パックは、原因・効果・生成 AI の価値つきで検証を通り、課題に解決策が対応づく', () => {
    for (const kind of ['mono', 'koto'] as const) {
      const files = readPack(kind);
      expect(validatePack(files).errors).toEqual([]);
      const { issues: isu, solutions: sol } = (files.issues as { issues: Issue[]; solutions: Solution[] });
      expect(isu.some((i) => causesOf(i).length > 0)).toBe(true);
      expect(sol.some((s) => effectsOf(s).length > 0)).toBe(true);
      expect(sol.some((s) => (s.genAiValues ?? []).length > 0)).toBe(true);
      expect(isu.some((i) => solutionsOfIssue(i.id, sol).length > 0)).toBe(true);
    }
  });

  it('異常系: 存在しない課題を指す issueIds・重複した原因 ID はパックの検証エラー', () => {
    const files = readPack('mono');
    const j = files.issues as { issues: Array<Record<string, unknown>>; solutions: Array<Record<string, unknown>> };
    j.solutions[0]!.issueIds = ['issue-none'];
    expect(validatePack(files).errors.some((e) => e.code === 'dangling-reference')).toBe(true);
    const files2 = readPack('mono');
    const j2 = files2.issues as { issues: Array<{ causes?: Array<{ id: string; title: string }> }> };
    const first = j2.issues[0]!.causes![0]!;
    j2.issues[1]!.causes = [{ id: first.id, title: '重複' }];
    expect(validatePack(files2).errors.some((e) => e.code === 'duplicate-id')).toBe(true);
    // 問題のある項目だけを無効にして続行できる
    expect(() => disableInvalidItems(files2)).not.toThrow();
  });
});
