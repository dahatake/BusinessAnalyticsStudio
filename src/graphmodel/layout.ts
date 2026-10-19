// ビジネス関係グラフの配置・集約・束ね・ラベルの出し分け（FR-236）。純粋な関数だけ。同じ入力は同じ結果（乱数・時刻を使わない）。
import type { BizEdge, BizNode } from './relations';

/** PARAM-077: 同時に描くノード数の上限（超える分は塊に集約） */
export const MAX_NODES = 200;
/** PARAM-078: 同時に表示するラベルの最大数 */
export const MAX_LABELS = 60;
/** PARAM-079: 同じ二つの塊の間のエッジをまとめる最小本数 */
export const BUNDLE_MIN = 8;

/** ノードの外枠の大きさ（配置のときに重ならない最小の間隔） */
export const NODE_W = 112;
export const NODE_H = 60;
const GAP_X = 36;
const GAP_Y = 44;

export interface Pt { x: number; y: number }
export interface LayoutNode { id: string; cluster: string }
export interface LayoutEdge { from: string; to: string }

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
/** 文字列から 0〜1 の決まった値 */
const unit = (s: string): number => hash(s) / 4294967296;

/** 辺の交差数（端点を共有する辺の組は数えない） */
export function countCrossings(pos: ReadonlyMap<string, Pt>, edges: readonly LayoutEdge[]): number {
  const seg = edges.map((e) => [pos.get(e.from), pos.get(e.to), e.from, e.to] as const).filter((s) => s[0] && s[1]);
  const orient = (a: Pt, b: Pt, c: Pt): number => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  let n = 0;
  for (let i = 0; i < seg.length; i++) {
    for (let j = i + 1; j < seg.length; j++) {
      const [a, b, a0, b0] = seg[i]!; const [c, d, c0, d0] = seg[j]!;
      if (a0 === c0 || a0 === d0 || b0 === c0 || b0 === d0) continue;
      if (orient(a!, b!, c!) !== orient(a!, b!, d!) && orient(c!, d!, a!) !== orient(c!, d!, b!)) n++;
    }
  }
  return n;
}

/** 円周に並べた配置（比較の基準） */
export function circleLayout(nodes: readonly LayoutNode[], radius = 300): Map<string, Pt> {
  const out = new Map<string, Pt>();
  [...nodes].sort((a, b) => (a.id < b.id ? -1 : 1)).forEach((n, i, all) => {
    const t = (2 * Math.PI * i) / Math.max(1, all.length);
    out.set(n.id, { x: radius * Math.cos(t), y: radius * Math.sin(t) });
  });
  return out;
}

function separate(ids: readonly string[], p: Map<string, Pt>, passes: number): void {
  const w = NODE_W + GAP_X; const h = NODE_H + GAP_Y;
  for (let k = 0; k < passes; k++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = p.get(ids[i]!)!; const b = p.get(ids[j]!)!;
        let dx = b.x - a.x; let dy = b.y - a.y;
        const ox = w - Math.abs(dx); const oy = h - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (dx === 0 && dy === 0) { dx = unit(ids[j]!) - 0.5 || 0.1; dy = unit(ids[i]!) - 0.5 || 0.1; }
        // 重なりの小さい軸の向きに押し分ける
        if (ox / w < oy / h) { const s = (dx < 0 ? -1 : 1) * (ox / 2 + 0.5); a.x -= s; b.x += s; }
        else { const s = (dy < 0 ? -1 : 1) * (oy / 2 + 0.5); a.y -= s; b.y += s; }
      }
    }
    if (!moved) break;
  }
}

function oneLayout(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[], salt: number): Map<string, Pt> {
  const ids = nodes.map((n) => n.id);
  const clusters = [...new Set(nodes.map((n) => n.cluster))].sort();
  const R = Math.max(160, nodes.length * 14);
  const anchor = new Map(clusters.map((c, i) => {
    const t = (2 * Math.PI * (i + unit(`${salt}:${c}`) * 0.3)) / clusters.length;
    return [c, { x: R * Math.cos(t), y: R * Math.sin(t) }] as const;
  }));
  const clusterOf = new Map(nodes.map((n) => [n.id, n.cluster]));
  const p = new Map<string, Pt>();
  for (const n of nodes) {
    const a = anchor.get(n.cluster)!;
    p.set(n.id, { x: a.x + (unit(`${salt}x${n.id}`) - 0.5) * 120, y: a.y + (unit(`${salt}y${n.id}`) - 0.5) * 120 });
  }
  const idx = new Map(ids.map((id, i) => [id, i]));
  const k = Math.sqrt((NODE_W + GAP_X) * (NODE_H + GAP_Y)) * 1.1;
  for (let it = 0; it < 120; it++) {
    const temp = 1 - it / 120;
    const f = ids.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = p.get(ids[i]!)!; const b = p.get(ids[j]!)!;
        const dx = a.x - b.x; const dy = a.y - b.y;
        const d2 = Math.max(dx * dx + dy * dy, 25);
        const rep = (k * k) / d2;
        f[i]!.x += dx * rep; f[i]!.y += dy * rep; f[j]!.x -= dx * rep; f[j]!.y -= dy * rep;
      }
    }
    for (const e of edges) {
      const i = idx.get(e.from); const j = idx.get(e.to);
      if (i === undefined || j === undefined) continue;
      const a = p.get(e.from)!; const b = p.get(e.to)!;
      const dx = b.x - a.x; const dy = b.y - a.y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const att = (d - k) / d * 0.08;
      f[i]!.x += dx * att; f[i]!.y += dy * att; f[j]!.x -= dx * att; f[j]!.y -= dy * att;
    }
    // 同じ塊は、塊の重心へ引く
    const cen = new Map<string, { x: number; y: number; n: number }>();
    for (const id of ids) { const c = clusterOf.get(id)!; const q = p.get(id)!; const s = cen.get(c) ?? { x: 0, y: 0, n: 0 }; s.x += q.x; s.y += q.y; s.n++; cen.set(c, s); }
    ids.forEach((id, i) => { const s = cen.get(clusterOf.get(id)!)!; const q = p.get(id)!; f[i]!.x += (s.x / s.n - q.x) * 0.06; f[i]!.y += (s.y / s.n - q.y) * 0.06; });
    ids.forEach((id, i) => {
      const q = p.get(id)!; const m = Math.hypot(f[i]!.x, f[i]!.y);
      const step = Math.min(m, 40 * temp + 2);
      if (m > 0) { q.x += (f[i]!.x / m) * step; q.y += (f[i]!.y / m) * step; }
    });
  }
  separate(ids, p, 200);
  return p;
}

/**
 * 力学モデルによる配置（FR-236 AC-550）。同じ塊は近くにまとまり、同じ入力は同じ座標を返し、ノードの外枠は重ならない。
 * 初期配置の違う候補を決まった数だけ作り、辺の交差が最も少ないものを選ぶ。座標は左上が (margin, margin) になるよう動かす。
 */
export function layoutGraph(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[], margin = 80): Map<string, Pt> {
  const sorted = [...nodes].sort((a, b) => (a.id < b.id ? -1 : 1));
  if (sorted.length === 0) return new Map();
  const tries = sorted.length > 120 ? 1 : 6;
  let best: Map<string, Pt> | undefined; let bestScore = Infinity;
  for (let s = 0; s < tries; s++) {
    const p = oneLayout(sorted, edges, s);
    const score = countCrossings(p, edges);
    if (score < bestScore) { best = p; bestScore = score; }
  }
  const out = new Map<string, Pt>();
  let minX = Infinity; let minY = Infinity;
  for (const q of best!.values()) { minX = Math.min(minX, q.x); minY = Math.min(minY, q.y); }
  for (const n of sorted) { const q = best!.get(n.id)!; out.set(n.id, { x: Math.round(q.x - minX + margin), y: Math.round(q.y - minY + margin) }); }
  return out;
}

/** 塊の重心（塊の名前 → 座標） */
export function clusterCentroids(nodes: readonly LayoutNode[], pos: ReadonlyMap<string, Pt>): Map<string, Pt> {
  const acc = new Map<string, { x: number; y: number; n: number }>();
  for (const n of nodes) { const q = pos.get(n.id); if (!q) continue; const s = acc.get(n.cluster) ?? { x: 0, y: 0, n: 0 }; s.x += q.x; s.y += q.y; s.n++; acc.set(n.cluster, s); }
  return new Map([...acc].map(([c, s]) => [c, { x: s.x / s.n, y: s.y / s.n }]));
}

/** 近傍: 中心のノードから hop ホップ以内（向きは問わない）のノード。中心がなければ null（絞り込まない） */
export function neighborhood(centers: readonly string[], edges: readonly LayoutEdge[], hop: number): Set<string> | null {
  if (centers.length === 0) return null;
  const adj = new Map<string, string[]>();
  for (const e of edges) { (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to); (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from); }
  const seen = new Set(centers);
  let frontier = [...centers];
  for (let h = 0; h < hop; h++) {
    const next: string[] = [];
    for (const id of frontier) for (const m of adj.get(id) ?? []) if (!seen.has(m)) { seen.add(m); next.push(m); }
    frontier = next;
  }
  return seen;
}

export interface Aggregation {
  /** 個別に描くノードの ID */
  shown: string[];
  /** 塊に集約したノード（塊の名前 → ノードの ID） */
  collapsed: Map<string, string[]>;
}

/**
 * ノード数が上限を超えるとき、つながりの多いノードから個別に描き、残りは塊ごとに集約する（FR-236 AC-552）。
 * 展開した塊のノードは個別に描く。shown と collapsed の件数の合計は、常に全ノード数に等しい。
 */
export function aggregateNodes(
  nodes: readonly BizNode[], degree: ReadonlyMap<string, number>, expanded: ReadonlySet<string> = new Set(), limit = MAX_NODES,
): Aggregation {
  if (nodes.length <= limit) return { shown: nodes.map((n) => n.id), collapsed: new Map() };
  const forced = nodes.filter((n) => expanded.has(n.cluster));
  const rest = nodes.filter((n) => !expanded.has(n.cluster))
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || (a.id < b.id ? -1 : 1));
  const room = Math.max(0, limit - forced.length);
  const shown = [...forced.map((n) => n.id), ...rest.slice(0, room).map((n) => n.id)];
  const collapsed = new Map<string, string[]>();
  for (const n of rest.slice(room)) (collapsed.get(n.cluster) ?? collapsed.set(n.cluster, []).get(n.cluster)!).push(n.id);
  return { shown, collapsed };
}

export interface Bundle { key: string; fromCluster: string; toCluster: string; edges: BizEdge[] }

/**
 * 同じ二つの塊の間のエッジを束ねる（FR-236 AC-553）。BUNDLE_MIN 本以上のときだけ 1 本の束ね線にし、展開した束は個別に戻す。
 * 同じ塊の中のエッジは束ねない。
 */
export function bundleEdges(
  edges: readonly BizEdge[], clusterOf: ReadonlyMap<string, string>, expanded: ReadonlySet<string> = new Set(), min = BUNDLE_MIN,
): { single: BizEdge[]; bundles: Bundle[] } {
  const groups = new Map<string, Bundle>();
  for (const e of edges) {
    const a = clusterOf.get(e.from); const b = clusterOf.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const key = `${lo}\u0000${hi}`;
    (groups.get(key) ?? groups.set(key, { key, fromCluster: lo, toCluster: hi, edges: [] }).get(key)!).edges.push(e);
  }
  const bundleKeys = new Set([...groups.values()].filter((g) => g.edges.length >= min && !expanded.has(g.key)).map((g) => g.key));
  const single: BizEdge[] = []; const bundles: Bundle[] = [];
  for (const e of edges) {
    const a = clusterOf.get(e.from); const b = clusterOf.get(e.to);
    const key = a !== undefined && b !== undefined && a !== b ? (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`) : undefined;
    if (!key || !bundleKeys.has(key)) single.push(e);
  }
  for (const k of bundleKeys) bundles.push(groups.get(k)!);
  return { single, bundles };
}

export interface LabelCandidate { id: string; x: number; y: number; w: number; h: number; priority: number }

/** 倍率に応じたラベルの数（倍率が上がると増える。上限は変わらない） */
export const labelBudget = (scale: number, cap = MAX_LABELS, base = 12): number =>
  Math.min(cap, Math.max(1, Math.floor(base * (Number.isFinite(scale) ? Math.max(scale, 0.1) : 1))));

const overlaps = (a: LabelCandidate, b: LabelCandidate): boolean =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;

/** 表示するラベルを選ぶ（FR-236 AC-551）。優先度の高い順（選択中・近傍が先）に、枠が重ならないものを予算まで。 */
export function selectLabels(cands: readonly LabelCandidate[], budget: number, avoid: readonly LabelCandidate[] = []): string[] {
  const sorted = [...cands].sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : 1));
  const taken: LabelCandidate[] = [];
  for (const c of sorted) {
    if (taken.length >= budget) break;
    if (taken.some((t) => overlaps(t, c)) || avoid.some((t) => overlaps(t, c))) continue;
    taken.push(c);
  }
  return taken.map((t) => t.id);
}
