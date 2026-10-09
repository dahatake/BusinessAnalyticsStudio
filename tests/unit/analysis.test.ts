// 分析ビューの単体・結合テスト。
// FR-037 AC-044 AC-045 / FR-039 AC-047 AC-048 / FR-040 AC-049 AC-050 / FR-041 AC-051 / FR-042 AC-052 AC-053
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  archToJson, archVariants, diffArchitecture, modelFor, parseArchitectureJson, sectionsOf, toMermaid, toSvg, validateArchitectureChange,
} from '../../src/analysis/architecture';
import { addEdge, addNode, findRecord, removeEdge, removeNode } from '../../src/analysis/graphEdit';
import { HOP_MAX, HOP_MIN, KIND_STYLE, clampHop, hopDistances, layoutGraph, visibleNodeIds } from '../../src/analysis/graphView';
import {
  AI_WEIGHTS, CRITERIA, CRITERION_KEYS, buildMatrixPoints, buildPriorityRows, parseWeight, sensitivity, weightedScore, type Weights,
} from '../../src/analysis/priority';
import { buildSummary, contentText, fingerprint, sentenceCount } from '../../src/analysis/summary';
import {
  addChild, buildMockTree, buildPackTree, descendantIds, flattenTree, moveNode, moveTargets, parseAiTree, redecompose, removeTreeNode, renameNode,
  treeToJson, treeToMermaid, treeToSvg, type ThemeLike, type TreeDoc,
} from '../../src/analysis/tree';
import { DATA_SCHEMAS, disableInvalidItems, validatePack, type PackData, type PackFiles } from '../../src/schema';
import { buildEntityGraph, NODE_KINDS } from '../../src/selection/graph';
import { activeEdited } from '../../src/store/summary';

function loadFiles(kind: 'mono' | 'koto'): PackFiles {
  const dir = path.resolve(__dirname, '../../examples', kind, 'public', 'data');
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(DATA_SCHEMAS)) out[name] = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
  out.brandProfile = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../examples', kind, 'public', 'brand', 'brand-profile.json'), 'utf8'));
  return out as PackFiles;
}
function loadPack(kind: 'mono' | 'koto'): PackData {
  const files = loadFiles(kind);
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(DATA_SCHEMAS)) out[name] = schema.parse(files[name as keyof PackFiles]);
  return out as PackData;
}
const clone = <T,>(v: T): T => structuredClone(v);

describe('FR-037 ナレッジグラフ', () => {
  const pack = loadPack('mono');
  const graph = buildEntityGraph(pack);
  const center = pack.issues.issues[0]!.id;

  // FR-037 AC-044
  it('FR-037 AC-044 ホップ数以内のノードだけが表示され、範囲外のホップ数は 1〜3 に収まる', () => {
    expect(HOP_MIN).toBe(1);
    expect(HOP_MAX).toBe(3);
    expect([clampHop(0), clampHop(9), clampHop(2.4)]).toEqual([1, 3, 2]);
    const dist = hopDistances(graph.edges, [center]);
    for (const hop of [1, 2, 3]) {
      const vis = visibleNodeIds(graph, { centers: [center], hop, hiddenKinds: new Set() });
      const expected = [...dist.entries()].filter(([, d]) => d <= hop).map(([id]) => id).sort();
      expect([...vis].sort()).toEqual(expected);
    }
    // 起点がなければ絞り込まない
    expect(visibleNodeIds(graph, { centers: [], hop: 1, hiddenKinds: new Set() }).size).toBe(graph.nodes.length);
  });

  // FR-037 AC-044
  it('FR-037 AC-044 種別フィルターで外した種別のノードが消える（起点は残る）', () => {
    const hiddenKinds = new Set(['solution', 'source'] as const);
    const vis = visibleNodeIds(graph, { centers: [center], hop: 3, hiddenKinds });
    expect(vis.size).toBeGreaterThan(1);
    for (const id of vis) expect((hiddenKinds as ReadonlySet<string>).has(graph.node(id)!.kind), id).toBe(false);
    const hiddenCenter = visibleNodeIds(graph, { centers: [center], hop: 3, hiddenKinds: new Set(['issue']) });
    expect(hiddenCenter.has(center)).toBe(true);
  });

  // FR-037 AC-044
  it('FR-037 AC-044 ノードの種別は形とアイコンで区別され（色以外でも）、すべての種別が互いに異なる', () => {
    const shapes = NODE_KINDS.map((k) => KIND_STYLE[k].shape);
    const icons = NODE_KINDS.map((k) => KIND_STYLE[k].icon);
    expect(new Set(shapes).size).toBe(NODE_KINDS.length);
    expect(new Set(icons).size).toBe(NODE_KINDS.length);
  });

  // FR-037 AC-044
  it('FR-037 AC-044 配置は同じ入力なら同じで、起点があれば起点が中心になる', () => {
    const a = layoutGraph(graph.nodes, graph.edges, [center]);
    const b = layoutGraph(graph.nodes, graph.edges, [center]);
    expect([...a.positions]).toEqual([...b.positions]);
    expect(a.positions.get(center)).toEqual({ x: a.width / 2, y: a.height / 2 });
  });

  // FR-037 AC-045
  it('FR-037 AC-045 ノードの追加・削除が、他のビューが読むデータ（課題・グラフ）に反映される', () => {
    const added = addNode(pack, 'issue', 'ST追加の課題');
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.data.issues.issues.some((i) => i.title === 'ST追加の課題' && i.createdBy === 'human')).toBe(true);
    expect(pack.issues.issues.some((i) => i.title === 'ST追加の課題')).toBe(false); // 元は変えない
    const g = buildEntityGraph(added.data);
    expect(g.has(added.id as string)).toBe(true);
    const removed = removeNode(added.data, added.id as string);
    expect(removed.ok).toBe(true);
    if (removed.ok) expect(buildEntityGraph(removed.data).has(added.id as string)).toBe(false);
  });

  // FR-037 AC-045
  it('FR-037 AC-045 エッジの追加・削除は隣接（関連を見る）に反映される', () => {
    const issue = addNode(pack, 'issue', '課題 X');
    if (!issue.ok) throw new Error('add');
    const sol = pack.issues.solutions[0]!.id;
    const edge = addEdge(issue.data, issue.id as string, sol);
    expect(edge.ok).toBe(true);
    if (!edge.ok) return;
    const g = buildEntityGraph(edge.data);
    expect(g.neighbors(issue.id as string).has(sol)).toBe(true);
    const e = g.edges.find((x) => x.from === issue.id && x.to === sol)!;
    const gone = removeEdge(edge.data, e);
    expect(gone.ok).toBe(true);
    if (gone.ok) expect(buildEntityGraph(gone.data).neighbors(issue.id as string).has(sol)).toBe(false);
  });

  // FR-037 AC-045
  it('FR-037 AC-045 異常系: 名前なし・同一ノード・重複エッジ・必須の参照の削除は理由つきで拒否する', () => {
    expect(addNode(pack, 'issue', '  ')).toMatchObject({ ok: false });
    const a = pack.issues.issues[0]!.id;
    expect(addEdge(pack, a, a)).toMatchObject({ ok: false });
    expect(addEdge(pack, '', a)).toMatchObject({ ok: false });
    const sol = pack.issues.solutions[0]!;
    // 解決策の issueId（必須）を消すエッジは削除できず、課題は解決策が残る間は削除できない
    const g = buildEntityGraph(pack);
    const req = g.edges.find((x) => x.from === sol.id && x.to === sol.issueId && x.label === 'issueId')!;
    expect(removeEdge(pack, req)).toMatchObject({ ok: false });
    expect(removeNode(pack, sol.issueId)).toMatchObject({ ok: false });
    const first = addEdge(pack, a, sol.id);
    if (first.ok) expect(addEdge(first.data, a, sol.id)).toMatchObject({ ok: false });
  });

  // FR-037 AC-045
  it('FR-037 AC-045 製品を削除すると、参照していた要素の参照も外れてグラフが壊れない', () => {
    const product = pack.products.products[0]!.id;
    const r = removeNode(pack, product);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(findRecord(r.data, product)).toBeUndefined();
    expect(JSON.stringify(r.data)).not.toContain(`"${product}"`);
  });
});

describe('FR-039 優先順位分析', () => {
  const pack = loadPack('mono');
  const issues = pack.issues.issues;

  // FR-039 AC-047
  it('FR-039 AC-047 重み付きスコアは Σ（重み × 評価値）で、スコアの降順に並ぶ', () => {
    const weights: Weights = { ...AI_WEIGHTS };
    const rows = buildPriorityRows(issues, weights);
    for (const r of rows) {
      let sum = 0;
      for (const k of CRITERION_KEYS) sum += weights[k] * r.values[k].value;
      expect(r.score).toBeCloseTo(sum, 1);
      expect(weightedScore(r.values, weights)).toBeCloseTo(sum, 6);
    }
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.score).toBeGreaterThanOrEqual(rows[i]!.score);
    expect(rows.map((r) => r.rank)).toEqual(rows.map((_, i) => i + 1));
  });

  // FR-039 AC-047
  it('FR-039 AC-047 重みを変えると順位と 2×2 の配置が変わる', () => {
    const a = buildPriorityRows(issues, AI_WEIGHTS);
    const heavy: Weights = { ...AI_WEIGHTS, impact: 0, roi: 0, feasibility: 10, risk: 10, costEff: 0 };
    const b = buildPriorityRows(issues, heavy);
    const pa = buildMatrixPoints(a, AI_WEIGHTS);
    const pb = buildMatrixPoints(b, heavy);
    expect(JSON.stringify(pa.map((p) => [p.id, p.x, p.y]))).not.toBe(JSON.stringify(pb.map((p) => [p.id, p.x, p.y])));
    // インパクトの重みだけを変えても、インパクト軸の配置が変わる
    const c = buildMatrixPoints(buildPriorityRows(issues, { ...AI_WEIGHTS, impact: 8 }), { ...AI_WEIGHTS, impact: 8 });
    expect(c.map((p) => p.y)).not.toEqual(pa.map((p) => p.y));
  });

  // FR-039 AC-047
  it('FR-039 AC-047 異常系: 重みに数値でない値・範囲外・小数を入れると反映されず原因を返す', () => {
    expect(parseWeight('5')).toEqual({ ok: true, value: 5 });
    expect(parseWeight('0')).toEqual({ ok: true, value: 0 });
    for (const bad of ['-5', '11', 'abc', '', '2.5']) {
      const r = parseWeight(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
    }
  });

  // FR-039 AC-048
  it('FR-039 AC-048 感度分析は各重みを ±1 したときの順位の変化を返す', () => {
    const sens = sensitivity(issues, AI_WEIGHTS);
    expect(sens).toHaveLength(CRITERIA.length * 2);
    const base = buildPriorityRows(issues, AI_WEIGHTS);
    for (const s of sens) {
      const next = buildPriorityRows(issues, { ...AI_WEIGHTS, [s.criterion]: s.weight });
      const baseRank = new Map(base.map((r) => [r.id, r.rank]));
      expect(s.changes.map((c) => c.id).sort()).toEqual(next.filter((r) => baseRank.get(r.id) !== r.rank).map((r) => r.id).sort());
      expect(s.topChanged).toBe(base[0]!.id !== next[0]!.id);
    }
    // 範囲の端では、動かせない方向は変化なし
    const edge = sensitivity(issues, { ...AI_WEIGHTS, impact: 10 }).find((s) => s.criterion === 'impact' && s.delta === 1)!;
    expect(edge.changes).toEqual([]);
  });

  // FR-039 AC-048
  it('FR-039 AC-048 AI 提案値と顧客決定値が別の値として保持され、採用するのは決定値', () => {
    const decided = issues.find((i) => i.evaluation?.scores?.impact?.decided !== undefined)!;
    expect(decided).toBeTruthy();
    const row = buildPriorityRows(issues, AI_WEIGHTS).find((r) => r.id === decided.id)!;
    const v = row.values.impact;
    expect(v.ai).toBe(decided.evaluation!.scores!.impact!.ai);
    expect(v.decided).toBe(decided.evaluation!.scores!.impact!.decided);
    expect(v.value).toBe(v.decided);
    expect(v.origin).toBe('customer');
    expect(v.ai).not.toBe(v.decided);
    // 決定値がないものは AI の提案値
    const other = buildPriorityRows(issues, AI_WEIGHTS).find((r) => r.id !== decided.id)!;
    expect(other.values.roi.origin).toBe('ai');
    expect(other.values.roi.decided).toBeUndefined();
  });
});

describe('FR-040 アーキテクチャ図', () => {
  const pack = loadPack('mono');
  const variants = archVariants(pack.architecture);

  // FR-040 AC-049
  it('FR-040 AC-049 AsIs から ToBe で、追加・削除・変更・変更なしを区別する', () => {
    const d = diffArchitecture(variants.asis, variants.tobe);
    const by = (k: string) => d.elements.filter((e) => e.diff === k).map((e) => e.element.id);
    const asis = variants.asis.elements;
    const tobe = variants.tobe.elements;
    expect(by('added').sort()).toEqual(tobe.filter((e) => !asis.some((a) => a.id === e.id)).map((e) => e.id).sort());
    expect(by('removed').sort()).toEqual(asis.filter((e) => !tobe.some((a) => a.id === e.id)).map((e) => e.id).sort());
    expect(by('changed')).toEqual(['cap-mono-maintenance']);
    expect(by('added').length && by('removed').length && by('changed').length).toBeTruthy();
    // AsIs の表示には差分がない
    expect(modelFor('asis', variants).elements.every((e) => e.diff === 'same')).toBe(true);
  });

  // FR-040 AC-049
  it('FR-040 AC-049 asis・tobe がないパックは nodes・edges を両方に使い、差分は出ない', () => {
    const koto = loadPack('koto');
    const v = archVariants(koto.architecture);
    expect(v.asis.elements.length).toBeGreaterThan(0);
    expect(diffArchitecture(v.asis, v.tobe).elements.every((e) => e.diff === 'same')).toBe(true);
  });

  // FR-040 AC-050
  it('FR-040 AC-050 Mermaid は flowchart で、差分がラベルに入り、すべての要素と接続を含む', () => {
    const model = modelFor('tobe', variants);
    const text = toMermaid(model, 'テスト図');
    expect(text).toContain('flowchart LR');
    for (const e of model.elements) expect(text).toContain(e.element.name.replace(/"/g, '#quot;'));
    expect(text).toContain('（追加）');
    expect(text).toContain('（削除）');
    expect(text).toContain('（変更）');
    expect(text.match(/-->|-\.->/g)?.length).toBe(model.links.length);
  });

  // FR-040 AC-050
  it('FR-040 AC-050 SVG は自己完結で、各要素のラベルを含む', () => {
    const model = modelFor('tobe', variants);
    const { svg, width, height } = toSvg(model, '図');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    for (const e of model.elements) expect(svg).toContain(e.element.name);
    expect(sectionsOf(model).length).toBeGreaterThanOrEqual(3);
  });

  // FR-040 AC-050
  it('FR-040 AC-050 JSON 編集: 要素の追加が読め、壊れた JSON・重複 ID・存在しない接続は理由つきで拒否する', () => {
    const text = archToJson(variants);
    const ok = parseArchitectureJson(text);
    expect(ok.ok).toBe(true);
    const json = JSON.parse(text);
    json.tobe.elements.push({ ...json.tobe.elements[0], id: 'arch-st-050', name: 'ST追加の要素-050' });
    const added = parseArchitectureJson(JSON.stringify(json));
    expect(added.ok).toBe(true);
    if (added.ok) expect(added.value.tobe.elements.some((e) => e.id === 'arch-st-050')).toBe(true);

    expect(parseArchitectureJson('{ "elements": [ ')).toMatchObject({ ok: false });
    const dup = clone(json);
    dup.tobe.elements.push({ ...dup.tobe.elements[0] });
    expect(parseArchitectureJson(JSON.stringify(dup))).toMatchObject({ ok: false });
    const dangling = clone(json);
    dangling.tobe.links.push({ from: 'no-such', to: dangling.tobe.elements[0].id });
    expect(parseArchitectureJson(JSON.stringify(dangling))).toMatchObject({ ok: false });
    expect(parseArchitectureJson('[]')).toMatchObject({ ok: false });
    expect(parseArchitectureJson(JSON.stringify({ asis: { elements: [] } }))).toMatchObject({ ok: false });
  });

  // FR-040 AC-050 FR-114
  it('FR-040 AC-050 FR-114 JSON 編集の適用前検証: 既存の課題などの ID との衝突・存在しない製品や解決策への参照・正しい追加を判定する', () => {
    const json = JSON.parse(archToJson(variants));
    const ok = clone(json);
    ok.tobe.elements.push({ ...ok.tobe.elements[0], id: 'arch-st-050', name: 'ST追加の要素-050', productId: pack.products.products[0]!.id });
    const okParsed = parseArchitectureJson(JSON.stringify(ok));
    expect(okParsed.ok).toBe(true);
    if (okParsed.ok) expect(validateArchitectureChange(pack, okParsed.value)).toEqual([]);

    // 課題の ID と衝突する要素（黙って捨てられる前に拒否する）
    const clash = clone(json);
    clash.tobe.elements.push({ ...clash.tobe.elements[0], id: pack.issues.issues[0]!.id, name: '衝突' });
    const clashParsed = parseArchitectureJson(JSON.stringify(clash));
    expect(clashParsed.ok).toBe(true);
    if (clashParsed.ok) {
      const problems = validateArchitectureChange(pack, clashParsed.value);
      expect(problems.some((p) => p.includes('重複') && p.includes(pack.issues.issues[0]!.id))).toBe(true);
    }

    // 存在しない製品・解決策への参照
    for (const [key, value] of [['productId', 'prod-no-such'], ['solutionIds', ['sol-no-such']]] as const) {
      const dangling = clone(json);
      dangling.tobe.elements.push({ ...dangling.tobe.elements[0], id: 'arch-st-dangling', name: '参照切れ', [key]: value });
      const parsed = parseArchitectureJson(JSON.stringify(dangling));
      expect(parsed.ok, key).toBe(true);
      if (parsed.ok) expect(validateArchitectureChange(pack, parsed.value).some((p) => p.includes('存在しない ID')), key).toBe(true);
    }
  });

  // FR-040 AC-049 FR-102 AC-124 FR-114
  it('FR-040 FR-114 部分的な無効化: 存在しない要素への接続（asis.links・tobe.links）と、無効になった要素につながる接続だけが外れる', () => {
    const files = loadFiles('mono');
    const arch = (files.architecture as { asis: { links: Array<Record<string, unknown>> }; tobe: { links: Array<Record<string, unknown>>; elements: Array<Record<string, unknown>> } });
    const keepAsis = arch.asis.links.length;
    const tobeLinks = arch.tobe.links.length;
    // 1) 存在しない要素への接続
    arch.asis.links.push({ from: 'sys-mono-edge', to: 'no-such-element', label: '参照切れ' });
    const r1 = disableInvalidItems(clone(files));
    expect(r1.fatal).toBe(false);
    expect((r1.files.architecture as typeof arch).asis.links).toHaveLength(keepAsis);
    expect(r1.issues.some((i) => i.code === 'dangling-reference' && i.path.startsWith('asis.links['))).toBe(true);
    // 2) tobe の要素が不正（無効になる）と、その要素への tobe.links も外れる。ほかは残る
    arch.asis.links.pop();
    const broken = arch.tobe.elements.find((e) => e.id === 'sys-mono-tablet')!;
    broken.name = 123;
    const r2 = disableInvalidItems(clone(files));
    expect(r2.fatal).toBe(false);
    expect(r2.disabledIds).toContain('sys-mono-tablet');
    const after = r2.files.architecture as typeof arch;
    expect(after.tobe.elements.some((e) => e.id === 'sys-mono-tablet')).toBe(false);
    expect(after.tobe.links.some((l) => l.from === 'sys-mono-tablet' || l.to === 'sys-mono-tablet')).toBe(false);
    expect(after.tobe.links.length).toBeLessThan(tobeLinks);
    expect(after.tobe.links.length).toBeGreaterThan(0);
    expect(after.asis.links).toHaveLength(keepAsis);
  });

  // FR-040 AC-049
  it('FR-040 AC-049 お手本パックの AsIs・ToBe は同じ ID を両方に置いても検証を通り、同じ版の中の重複は誤りになる', () => {
    const files = loadFiles('mono');
    expect(validatePack(files).errors).toEqual([]);
    const bad = clone(files);
    const arch = bad.architecture as { tobe: { elements: Array<Record<string, unknown>> } };
    arch.tobe.elements.push({ ...arch.tobe.elements[0]! });
    expect(validatePack(bad).errors.some((e) => e.code === 'duplicate-id')).toBe(true);
    // nodes など別の領域との ID の重複も誤り
    const bad2 = clone(files);
    (bad2.architecture as { asis: { elements: Array<Record<string, unknown>> } }).asis.elements[0]!.id = 'arch-mono-edge';
    expect(validatePack(bad2).errors.some((e) => e.code === 'duplicate-id')).toBe(true);
  });
});

describe('FR-041 エグゼクティブサマリー', () => {
  const pack = loadPack('mono');

  // FR-041 AC-051
  it('FR-041 AC-051 どの画面でも、結論・根拠の数値・推奨アクションの 3 要素があり、文は 2〜3 文（PARAM-015）', () => {
    for (const scope of ['overview', 'issue-solution', 'priority', 'gantt', 'architecture', 'knowledge-graph', 'discussion-tree', 'table'] as const) {
      const t = contentText(buildSummary(scope, pack, { weights: AI_WEIGHTS }));
      expect(t.conclusion.length, scope).toBeGreaterThan(0);
      expect(t.evidence, scope).toMatch(/\d/);
      expect(t.action.length, scope).toBeGreaterThan(0);
      const n = sentenceCount(t.conclusion) + sentenceCount(t.evidence) + sentenceCount(t.action);
      expect(n, scope).toBeGreaterThanOrEqual(2);
      expect(n, scope).toBeLessThanOrEqual(3);
    }
  });

  // FR-041 AC-051
  it('FR-041 AC-051 優先順位の根拠に最上位の課題名と出典つきの数値があり、データが変わると変わる', () => {
    const c = buildSummary('priority', pack, { weights: AI_WEIGHTS });
    const top = buildPriorityRows(pack.issues.issues, AI_WEIGHTS)[0]!;
    expect(contentText(c).evidence).toContain(top.title);
    expect(c.evidence.some((p) => typeof p !== 'string' && p.sourceIds.length > 0)).toBe(true);
    const renamed = clone(pack);
    renamed.issues.issues.find((i) => i.id === top.id)!.title = '改名ST';
    expect(contentText(buildSummary('priority', renamed, { weights: AI_WEIGHTS })).evidence).toContain('改名ST');
    expect(fingerprint(buildSummary('priority', renamed, { weights: AI_WEIGHTS }))).not.toBe(fingerprint(c));
  });

  // FR-041 AC-051
  it('FR-041 AC-051 コストの合計は出典つきの数値（単位は評価属性の unit）で、出典がなければ出典なしの文字になる', () => {
    const c = buildSummary('overview', pack, { weights: AI_WEIGHTS });
    const total = pack.issues.issues.reduce((a, i) => a + (typeof i.evaluation?.cost?.value === 'number' ? i.evaluation.cost.value : 0), 0);
    const unit = pack.issues.issues.find((i) => i.evaluation?.cost?.unit)?.evaluation?.cost?.unit ?? '';
    const part = c.evidence.find((p) => typeof p !== 'string');
    expect(part).toMatchObject({ text: `${total.toLocaleString('ja-JP')}${unit}` });
    expect((part as unknown as { sourceIds: string[] }).sourceIds.length).toBeGreaterThan(0);
    expect(contentText(c).evidence).toContain(`${total.toLocaleString('ja-JP')}${unit}`);
    // 単位が違えばその単位が出る（「万円」の直書きではない）
    const usd = clone(pack);
    for (const i of usd.issues.issues) if (i.evaluation?.cost) i.evaluation.cost.unit = 'USD';
    expect(contentText(buildSummary('overview', usd, { weights: AI_WEIGHTS })).evidence).toContain('USD');
    expect(contentText(buildSummary('overview', usd, { weights: AI_WEIGHTS })).evidence).not.toContain('万円');
    // 出典がなければ部分は文字
    const none = clone(pack);
    for (const i of none.issues.issues) if (i.evaluation?.cost) delete (i.evaluation.cost as { sourceIds?: unknown }).sourceIds;
    expect(buildSummary('overview', none, { weights: AI_WEIGHTS }).evidence.every((p) => typeof p === 'string')).toBe(true);
  });

  // FR-041 AC-051
  it('FR-041 AC-051 固定した編集版は指紋が変わっても残り、固定していない編集版は AI 版に戻る', () => {
    const text = { conclusion: 'a', evidence: '1', action: 'c' };
    expect(activeEdited({ text, pinned: true, fp: 'old', human: true }, 'new')?.text).toEqual(text);
    expect(activeEdited({ text, pinned: false, fp: 'old', human: true }, 'new')).toBeUndefined();
    expect(activeEdited({ text, pinned: false, fp: 'same', human: true }, 'same')?.text).toEqual(text);
    expect(activeEdited(undefined, 'x')).toBeUndefined();
  });
});

describe('FR-042 議論ツリー', () => {
  const pack = loadPack('mono');
  const theme: ThemeLike = {
    id: 'theme-st', title: pack.issues.issues[0]!.title, issueId: pack.issues.issues[0]!.id,
    options: '案A: 段階導入／案B: 一括導入', decisions: '案A で進める', actions: [], recommendation: '', openIssues: '', rationale: '',
  };

  // FR-042 AC-052
  it('FR-042 AC-052 生成したツリーは 5 種類の枝を持ち、ルート以外の全ノードが AI 生成で根拠つき', () => {
    const nodes = buildMockTree(theme, pack);
    const kinds = new Set(nodes.map((n) => n.kind));
    for (const k of ['論点', '課題', '解決策', '決定事項', '次のアクション']) expect(kinds.has(k as never), k).toBe(true);
    const root = nodes.filter((n) => n.parentId === null);
    expect(root).toHaveLength(1);
    expect(root[0]!.kind).toBe('議題');
    for (const n of nodes) {
      expect(n.origin).toBe('ai');
      if (n.parentId !== null) expect(n.rationale, n.title).toBeTruthy();
    }
    expect(nodes.filter((n) => n.kind === '論点').map((n) => n.title)).toEqual(['案A: 段階導入', '案B: 一括導入']);
    expect(nodes.find((n) => n.kind === '決定事項')!.title).toBe('案A で進める');
    // 解決策は課題の解決策、実体の ID を持つ（他のビューと連動する）
    expect(nodes.filter((n) => n.kind === '解決策').map((n) => n.entityId)).toContain(pack.issues.solutions[0]!.id);
    // 記録が空でも 5 種類の枝が揃う
    const empty = buildMockTree({ ...theme, options: '', decisions: '', issueId: undefined }, pack);
    for (const k of ['論点', '課題', '解決策', '決定事項', '次のアクション']) expect(empty.some((n) => n.kind === k), k).toBe(true);
  });

  // FR-042 AC-052
  it('FR-042 AC-052 実接続の回答（JSON）を読み、形が違えばモックに戻れるよう null を返す', () => {
    const ok = parseAiTree('{"nodes":[{"kind":"論点","title":"x"},{"kind":"決定事項","title":"y"}]}', theme);
    expect(ok?.length).toBe(3);
    expect(parseAiTree('これは JSON ではありません', theme)).toBeNull();
    expect(parseAiTree('{"nodes":[{"kind":"不明","title":"x"}]}', theme)).toBeNull();
  });

  // FR-042 AC-053
  it('FR-042 AC-053 追加・移動・削除・名前の変更は「人が編集」になり、子孫ごと扱い、ルートは動かせない', () => {
    const nodes = buildMockTree(theme, pack);
    const parent = nodes.find((n) => n.kind === '論点')!;
    const add = addChild(nodes, parent.id, 'ST追加ノード-053');
    expect(add.ok).toBe(true);
    if (!add.ok) return;
    const added = add.nodes.find((n) => n.id === add.id)!;
    expect(added).toMatchObject({ origin: 'human', parentId: parent.id, kind: '課題' });

    const sol = add.nodes.find((n) => n.kind === '解決策')!;
    const targets = moveTargets(add.nodes, sol.id);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.some((t) => t.id === sol.id || t.id === sol.parentId)).toBe(false);
    const mv = moveNode(add.nodes, sol.id, targets[0]!.id);
    expect(mv.ok).toBe(true);
    if (!mv.ok) return;
    expect(mv.nodes.find((n) => n.id === sol.id)).toMatchObject({ parentId: targets[0]!.id, origin: 'human' });
    expect(mv.nodes).toHaveLength(add.nodes.length);

    const rn = renameNode(mv.nodes, added.id, '改名');
    expect(rn.ok && rn.nodes.find((n) => n.id === added.id)).toMatchObject({ title: '改名', origin: 'human' });
    expect(renameNode(mv.nodes, added.id, ' ')).toMatchObject({ ok: false });

    const del = removeTreeNode(mv.nodes, added.id);
    expect(del.ok && del.nodes.some((n) => n.id === added.id)).toBe(false);
    // 子孫ごと削除
    const withKid = addChild(mv.nodes, added.id, '孫');
    if (!withKid.ok) throw new Error('add');
    const delTree = removeTreeNode(withKid.nodes, added.id);
    expect(delTree.ok && delTree.nodes.length).toBe(mv.nodes.length - 1 + 0);

    const root = nodes.find((n) => n.parentId === null)!;
    expect(removeTreeNode(nodes, root.id)).toMatchObject({ ok: false });
    expect(moveNode(nodes, root.id, parent.id)).toMatchObject({ ok: false });
    // 自分の子孫の下へは移動できない
    const kid = nodes.find((n) => n.kind === '原因')!;
    const grand = nodes.find((n) => n.id === kid.parentId)!;
    expect(moveNode(nodes, grand.id, kid.id)).toMatchObject({ ok: false });
    expect(descendantIds(nodes, grand.id).has(kid.id)).toBe(true);
  });

  // FR-042 AC-053
  it('FR-042 AC-053 分解のやり直しは子孫を作り直し、展開/折りたたみは深さ優先の並びから子孫を除く', () => {
    const nodes = buildMockTree(theme, pack);
    const issue = nodes.find((n) => n.kind === '課題')!;
    const re = redecompose(nodes, issue.id);
    expect(re.ok).toBe(true);
    if (!re.ok) return;
    expect(re.nodes.filter((n) => n.parentId === issue.id).every((n) => n.origin === 'ai')).toBe(true);
    const all = flattenTree(nodes, new Set());
    const folded = flattenTree(nodes, new Set([issue.id]));
    expect(all.length - folded.length).toBe(descendantIds(nodes, issue.id).size);
    expect(all[0]!.level).toBe(0);
    expect(folded.find((r) => r.node.id === issue.id)).toMatchObject({ expanded: false, hasChildren: true });
  });

  // FR-042 AC-053
  it('FR-042 AC-053 Mermaid・SVG・JSON に出力でき、Mermaid はすべてのノードと親子を含む', () => {
    const doc: TreeDoc = { themeId: theme.id, themeTitle: theme.title, nodes: buildMockTree(theme, pack), mode: 'mock' };
    const m = treeToMermaid(doc);
    expect(m).toContain('flowchart TD');
    expect(m.match(/ --> /g)?.length).toBe(doc.nodes.length - 1);
    const svg = treeToSvg(doc);
    expect(svg.svg.startsWith('<svg')).toBe(true);
    for (const n of doc.nodes) expect(svg.svg).toContain(n.title.replace(/&/g, '&amp;'));
    expect(JSON.parse(treeToJson(doc))).toMatchObject({ themeId: theme.id, mode: 'mock' });
  });

  // FR-042 AC-053
  it('FR-042 AC-053 生成前の全体像はパックの章・議題から作り、課題・解決策は実体の ID と連動する（読み取り専用）', () => {
    const nodes = buildPackTree(pack);
    expect(nodes[0]).toMatchObject({ kind: '議題', parentId: null, origin: 'pack' });
    expect(nodes.every((n) => n.origin === 'pack')).toBe(true);
    const topic = pack.show.chapters[0]!.topics[0]!;
    for (const id of topic.entityIds ?? []) {
      if (pack.issues.issues.some((i) => i.id === id)) expect(nodes.some((n) => n.entityId === id && n.kind === '課題')).toBe(true);
    }
    expect(nodes.some((n) => n.kind === '決定事項')).toBe(false);
  });
});

beforeEach(() => undefined);
