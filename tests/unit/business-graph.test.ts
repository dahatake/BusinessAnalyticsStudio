// FR-236 ビジネス関係グラフの単体・結合テスト（配置・ラベルの出し分け・集約・束ね・関係の取り込み）
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  BUNDLE_MIN, MAX_LABELS, MAX_NODES, NODE_H, NODE_W, aggregateNodes, bizGraphOf, bundleEdges, circleLayout, clusterCentroids, countCrossings,
  labelBudget, layoutGraph, neighborhood, selectLabels, shapeAssignment, type BizEdge, type BizNode, type LabelCandidate,
} from '../../src/graphmodel';

const loadData = (pack: string) => {
  const entities = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../examples/${pack}/public/data/entities.json`), 'utf8'));
  return { entities } as never;
};
const mkNode = (i: number, cluster = `c${i % 5}`): BizNode => ({ id: `n${String(i).padStart(3, '0')}`, name: `ノード${i}`, type: 'x', sourceIds: [], cluster });
const mkEdge = (i: number, from: string, to: string): BizEdge => ({ id: `e${i}`, from, to, meaning: 'influences', label: 'ラベル', sourceIds: [] });

describe('FR-236 ビジネス関係グラフ', () => {
  const g = bizGraphOf(loadData('koto'));
  const lnodes = g.nodes.map((n) => ({ id: n.id, cluster: n.cluster }));

  it('FR-236 AC-549 お手本パックから、向く関係（計測のツイン関係）が意味ラベルつきのエッジになり、種別ごとに形が異なる', () => {
    expect(g.edges.length).toBeGreaterThan(0);
    for (const e of g.edges) { expect(e.label).toBeTruthy(); expect(e.meaning).toBe('measures'); }
    const shapes = shapeAssignment(g.nodes.map((n) => n.type));
    expect(new Set(shapes.values()).size).toBe(shapes.size);
  });

  // FR-236 AC-550
  it('FR-236 AC-550 配置は同じ入力で同じ座標、ノードは重ならず、交差数は円周配置より多くならず、同じ塊は近い', () => {
    const edges = g.edges.map((e) => ({ from: e.from, to: e.to }));
    const a = layoutGraph(lnodes, edges); const b = layoutGraph(lnodes, edges);
    expect([...a]).toEqual([...b]);
    const pts = [...a.values()];
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      expect(Math.abs(pts[i]!.x - pts[j]!.x) >= NODE_W || Math.abs(pts[i]!.y - pts[j]!.y) >= NODE_H).toBe(true);
    }
    expect(countCrossings(a, edges)).toBeLessThanOrEqual(countCrossings(circleLayout(lnodes), edges));
  });

  it('FR-236 AC-550 多数のノードでも、辺の交差は円周配置より少なく、同じ塊の重心間の距離は別の塊との距離の平均より小さい', () => {
    const nodes = Array.from({ length: 40 }, (_, i) => mkNode(i, `c${i % 4}`));
    // 塊の中を鎖状に、塊どうしは少数だけつなぐ
    const edges: { from: string; to: string }[] = [];
    for (let i = 4; i < 40; i++) edges.push({ from: nodes[i - 4]!.id, to: nodes[i]!.id });
    for (let i = 0; i < 4; i++) edges.push({ from: nodes[i]!.id, to: nodes[(i + 1) % 4 + 8]!.id });
    const ln = nodes.map((n) => ({ id: n.id, cluster: n.cluster }));
    const p = layoutGraph(ln, edges);
    expect(countCrossings(p, edges)).toBeLessThan(countCrossings(circleLayout(ln), edges));
    const cen = clusterCentroids(ln, p);
    const within = new Map<string, number>();
    for (const c of cen.keys()) {
      const ms = ln.filter((n) => n.cluster === c).map((n) => p.get(n.id)!);
      within.set(c, ms.reduce((s, q) => s + Math.hypot(q.x - cen.get(c)!.x, q.y - cen.get(c)!.y), 0) / ms.length);
    }
    const cs = [...cen.values()];
    let total = 0; let cnt = 0;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { total += Math.hypot(cs[i]!.x - cs[j]!.x, cs[i]!.y - cs[j]!.y); cnt++; }
    const avgBetween = total / cnt;
    for (const w of within.values()) expect(w).toBeLessThan(avgBetween);
  });

  // FR-236 AC-551
  it('FR-236 AC-551 ラベルは予算以下・重ならず・選択優先で、倍率を上げると増える（上限は変わらない）', () => {
    const cands: LabelCandidate[] = Array.from({ length: 300 }, (_, i) => ({ id: `l${i}`, x: (i % 30) * 90, y: Math.floor(i / 30) * 30, w: 80, h: 18, priority: i === 77 ? 0 : 2 + i / 1000 }));
    const at = (s: number) => selectLabels(cands, labelBudget(s));
    expect(at(1).length).toBeLessThanOrEqual(labelBudget(1));
    expect(at(1)).toContain('l77');
    expect(at(3).length).toBeGreaterThan(at(1).length);
    expect(at(100).length).toBeLessThanOrEqual(MAX_LABELS);
    const chosen = cands.filter((c) => at(3).includes(c.id));
    for (let i = 0; i < chosen.length; i++) for (let j = i + 1; j < chosen.length; j++) {
      const a = chosen[i]!; const b = chosen[j]!;
      expect(Math.abs(a.x - b.x) * 2 >= a.w + b.w || Math.abs(a.y - b.y) * 2 >= a.h + b.h).toBe(true);
    }
  });

  // FR-236 AC-552
  it('FR-236 AC-552 上限を超えると塊に集約され、件数の合計は全ノード数と一致し、展開で個別に現れる', () => {
    const nodes = Array.from({ length: MAX_NODES + 37 }, (_, i) => mkNode(i));
    const a = aggregateNodes(nodes, new Map());
    expect(a.shown.length).toBeLessThanOrEqual(MAX_NODES);
    expect(a.collapsed.size).toBeGreaterThan(0);
    expect(a.shown.length + [...a.collapsed.values()].reduce((s, v) => s + v.length, 0)).toBe(nodes.length);
    const c = [...a.collapsed.keys()][0]!;
    const open = aggregateNodes(nodes, new Map(), new Set([c]));
    expect(open.collapsed.has(c)).toBe(false);
    expect(open.shown.length + [...open.collapsed.values()].reduce((s, v) => s + v.length, 0)).toBe(nodes.length);
    expect(aggregateNodes(nodes.slice(0, MAX_NODES), new Map()).collapsed.size).toBe(0);
  });

  // FR-236 AC-553
  it('FR-236 AC-553 同じ二つの塊の間のエッジが最小本数以上のときだけ束ね、展開で個別に戻る', () => {
    const nodes = [...Array.from({ length: BUNDLE_MIN }, (_, i) => mkNode(i, 'A')), ...Array.from({ length: BUNDLE_MIN }, (_, i) => mkNode(100 + i, 'B'))];
    const clusterOf = new Map(nodes.map((n) => [n.id, n.cluster]));
    const edges = Array.from({ length: BUNDLE_MIN }, (_, i) => mkEdge(i, nodes[i]!.id, nodes[BUNDLE_MIN + i]!.id));
    const r = bundleEdges(edges, clusterOf);
    expect(r.bundles).toHaveLength(1);
    expect(r.bundles[0]!.edges).toHaveLength(BUNDLE_MIN);
    expect(r.single).toHaveLength(0);
    expect(bundleEdges(edges, clusterOf, new Set([r.bundles[0]!.key])).single).toHaveLength(BUNDLE_MIN);
    const few = bundleEdges(edges.slice(0, BUNDLE_MIN - 1), clusterOf);
    expect(few.bundles).toHaveLength(0);
    expect(few.single).toHaveLength(BUNDLE_MIN - 1);
  });

  it('FR-236 近傍は選んだノードからホップ数以内だけ（選択がなければ絞らない）', () => {
    const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }];
    expect(neighborhood([], edges, 2)).toBeNull();
    expect([...neighborhood(['a'], edges, 2)!].sort()).toEqual(['a', 'b', 'c']);
    expect([...neighborhood(['a'], edges, 1)!].sort()).toEqual(['a', 'b']);
  });
});
