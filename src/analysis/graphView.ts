// ナレッジグラフの表示のモデル（FR-037）。画面・ストアを参照しない純粋なモジュール。
// ホップ数の絞り込み、種別フィルター、節の見た目（色・形・アイコン）、辺の見た目（線種・太さ・粒子）、配置を決める。
import type { EdgeKind, EntityGraph, GraphEdge, GraphNode, NodeKind } from '../selection/graph';
import { NODE_KINDS } from '../selection/graph';

/** PARAM-014: ホップ数の範囲 */
export const HOP_MIN = 1;
export const HOP_MAX = 3;
export const HOP_DEFAULT = 2;

export const clampHop = (n: number): number => Math.min(HOP_MAX, Math.max(HOP_MIN, Math.round(n)));

export type NodeShape = 'circle' | 'square' | 'diamond' | 'hexagon' | 'triangle' | 'pentagon' | 'octagon' | 'stadium' | 'parallelogram' | 'cross' | 'star';
export type IconName =
  | 'building' | 'issue' | 'lightbulb' | 'box' | 'puzzle' | 'tasks' | 'server' | 'window' | 'book' | 'comment' | 'document';

export interface KindStyle {
  shape: NodeShape;
  icon: IconName;
  /** 2D 用の色（Fluent のデザイントークンの CSS 変数） */
  color: string;
  /** 3D・出力用の色（#rrggbb） */
  hex: string;
  /** 3D の形 */
  geometry: 'sphere' | 'box' | 'octahedron' | 'cone' | 'cylinder' | 'torus' | 'dodecahedron' | 'icosahedron' | 'tetrahedron';
}

/** 種別ごとの見た目。色だけに頼らず、形とアイコンでも区別する（AC-044）。形・アイコンは種別ごとにすべて異なる。 */
export const KIND_STYLE: Record<NodeKind, KindStyle> = {
  entity: { shape: 'circle', icon: 'building', color: 'var(--colorPaletteBlueForeground2)', hex: '#0f6cbd', geometry: 'sphere' },
  issue: { shape: 'square', icon: 'issue', color: 'var(--colorPaletteRedForeground1)', hex: '#c50f1f', geometry: 'box' },
  solution: { shape: 'diamond', icon: 'lightbulb', color: 'var(--colorPaletteGreenForeground1)', hex: '#107c10', geometry: 'octahedron' },
  product: { shape: 'hexagon', icon: 'box', color: 'var(--colorPalettePurpleForeground2)', hex: '#8764b8', geometry: 'dodecahedron' },
  feature: { shape: 'triangle', icon: 'puzzle', color: 'var(--colorPaletteDarkOrangeForeground1)', hex: '#da3b01', geometry: 'cone' },
  task: { shape: 'pentagon', icon: 'tasks', color: 'var(--colorPaletteYellowForeground2)', hex: '#986f0b', geometry: 'cylinder' },
  architecture: { shape: 'octagon', icon: 'server', color: 'var(--colorPaletteTealForeground2)', hex: '#038387', geometry: 'icosahedron' },
  mock: { shape: 'stadium', icon: 'window', color: 'var(--colorPaletteMagentaForeground2)', hex: '#c239b3', geometry: 'tetrahedron' },
  chapter: { shape: 'parallelogram', icon: 'book', color: 'var(--colorPaletteCranberryForeground2)', hex: '#a4262c', geometry: 'torus' },
  topic: { shape: 'cross', icon: 'comment', color: 'var(--colorPaletteLavenderForeground2)', hex: '#6b69d6', geometry: 'sphere' },
  source: { shape: 'star', icon: 'document', color: 'var(--colorNeutralForeground2)', hex: '#616161', geometry: 'box' },
};

/** チェックボックスの名前。種別の ID も添える（支援技術・テストで種別を特定できるように） */
export const KIND_FILTER_LABEL: Record<NodeKind, string> = {
  entity: 'エンティティ (entity)',
  issue: '課題 (issue)',
  solution: '解決策 (solution)',
  product: '製品 (product)',
  feature: '機能 (feature)',
  task: 'タスク (task)',
  architecture: 'アーキテクチャ (architecture)',
  mock: 'モック (mock)',
  chapter: '章 (chapter)',
  topic: '議題 (topic)',
  source: '出典 (source)',
};

export interface EdgeStyle {
  /** SVG の stroke-dasharray。空文字は実線 */
  dash: string;
  width: number;
  /** 粒子を流すか（関係の線） */
  particles: boolean;
  label: string;
}

/** 関係の種別ごとの見た目（線種・太さ・粒子）。 */
export const EDGE_STYLE: Record<EdgeKind, EdgeStyle> = {
  ref: { dash: '', width: 1.5, particles: false, label: '参照（実線）' },
  relation: { dash: '6 4', width: 2.5, particles: true, label: '接続（破線・粒子）' },
  contain: { dash: '2 4', width: 1, particles: false, label: '包含（点線）' },
  twin: { dash: '8 3 2 3', width: 2, particles: false, label: 'ツイン関係（一点鎖線）' },
};

/** 無向の隣接。辺の集合から作る。 */
export function adjacencyOf(edges: readonly Pick<GraphEdge, 'from' | 'to'>[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  const add = (a: string, b: string) => { const l = adj.get(a); if (l) l.push(b); else adj.set(a, [b]); };
  for (const e of edges) { add(e.from, e.to); add(e.to, e.from); }
  return adj;
}

/** 起点（複数可）からの最短のホップ数。起点自身は 0。到達できない節は含まない。 */
export function hopDistances(edges: readonly Pick<GraphEdge, 'from' | 'to'>[], starts: readonly string[], maxHop = Infinity): Map<string, number> {
  const adj = adjacencyOf(edges);
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const s of starts) if (!dist.has(s)) { dist.set(s, 0); queue.push(s); }
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i] as string;
    const d = dist.get(cur) as number;
    if (d >= maxHop) continue;
    for (const nb of adj.get(cur) ?? []) if (!dist.has(nb)) { dist.set(nb, d + 1); queue.push(nb); }
  }
  return dist;
}

export interface VisibleOptions {
  /** 起点（選択中の節）。なければ絞り込まない */
  centers: readonly string[];
  hop: number;
  /** 非表示にする種別 */
  hiddenKinds: ReadonlySet<NodeKind>;
}

/** 表示する節の ID。起点のホップ数以内で、非表示の種別を除く（起点自身は種別に関わらず表示する）。 */
export function visibleNodeIds(graph: EntityGraph, opt: VisibleOptions): Set<string> {
  const centers = opt.centers.filter((c) => graph.has(c));
  const within = centers.length > 0 ? hopDistances(graph.edges, centers, clampHop(opt.hop)) : null;
  const out = new Set<string>();
  for (const n of graph.nodes) {
    if (within && !within.has(n.id)) continue;
    if (opt.hiddenKinds.has(n.kind) && !centers.includes(n.id)) continue;
    out.add(n.id);
  }
  return out;
}

export interface Placed { id: string; x: number; y: number }

export const VIEW_W = 1000;
const MIN_H = 640;

export interface Layout2D { width: number; height: number; positions: Map<string, { x: number; y: number }> }

const CELL_W = 96;
const CELL_H = 64;

/**
 * 節の配置（決定的）。起点があれば、起点を中心にホップ数ごとの楕円の輪に置く。なければ種別ごとの列に並べる。
 */
export function layoutGraph(nodes: readonly GraphNode[], edges: readonly GraphEdge[], centers: readonly string[]): Layout2D {
  const ids = new Set(nodes.map((n) => n.id));
  const starts = centers.filter((c) => ids.has(c));
  const positions = new Map<string, { x: number; y: number }>();
  if (starts.length > 0) {
    const visibleEdges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    const dist = hopDistances(visibleEdges, starts);
    const rings = new Map<number, GraphNode[]>();
    const loose: GraphNode[] = [];
    for (const n of nodes) {
      const d = dist.get(n.id);
      if (d === undefined) { loose.push(n); continue; }
      const l = rings.get(d);
      if (l) l.push(n); else rings.set(d, [n]);
    }
    const cx = VIEW_W / 2;
    const cy = MIN_H / 2;
    for (const [d, list] of rings) {
      if (d === 0) {
        list.forEach((n, i) => positions.set(n.id, { x: cx + (i - (list.length - 1) / 2) * CELL_W, y: cy }));
        continue;
      }
      const rx = 160 * d;
      const ry = 95 * d;
      list.forEach((n, i) => {
        const a = ((2 * Math.PI) / list.length) * i - Math.PI / 2 + (d % 2 ? 0 : Math.PI / list.length);
        positions.set(n.id, { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
      });
    }
    loose.forEach((n, i) => positions.set(n.id, { x: 60 + (i % 10) * CELL_W, y: MIN_H - 30 }));
    return { width: VIEW_W, height: MIN_H, positions };
  }
  // 種別ごとの列（件数が多い種別は 2 列に分ける）
  const byKind = new Map<NodeKind, GraphNode[]>();
  for (const k of NODE_KINDS) byKind.set(k, []);
  for (const n of nodes) byKind.get(n.kind)?.push(n);
  const cols: GraphNode[][] = [];
  const PER_COL = 9;
  for (const k of NODE_KINDS) {
    const l = byKind.get(k) ?? [];
    for (let i = 0; i < l.length; i += PER_COL) cols.push(l.slice(i, i + PER_COL));
  }
  const width = Math.max(VIEW_W, cols.length * CELL_W + 40);
  const rows = Math.max(1, ...cols.map((c) => c.length));
  const height = Math.max(MIN_H, rows * CELL_H + 40);
  cols.forEach((col, ci) => {
    col.forEach((n, ri) => positions.set(n.id, { x: 20 + CELL_W / 2 + ci * CELL_W, y: 20 + CELL_H / 2 + ri * CELL_H }));
  });
  return { width, height, positions };
}

/** 2D 用の形（原点が中心。半径 r）の SVG の path。 */
export function shapePath(shape: NodeShape, r = 18): string {
  const poly = (n: number, rot = -Math.PI / 2, rr = r): string =>
    Array.from({ length: n }, (_, i) => {
      const a = rot + (2 * Math.PI * i) / n;
      return `${i === 0 ? 'M' : 'L'}${(rr * Math.cos(a)).toFixed(1)},${(rr * Math.sin(a)).toFixed(1)}`;
    }).join(' ') + ' Z';
  switch (shape) {
    case 'circle': return `M${-r},0 A${r},${r} 0 1,0 ${r},0 A${r},${r} 0 1,0 ${-r},0 Z`;
    case 'square': return `M${-r * 0.85},${-r * 0.85} H${r * 0.85} V${r * 0.85} H${-r * 0.85} Z`;
    case 'diamond': return poly(4);
    case 'hexagon': return poly(6, 0);
    case 'triangle': return poly(3, -Math.PI / 2, r * 1.1);
    case 'pentagon': return poly(5);
    case 'octagon': return poly(8, Math.PI / 8);
    case 'stadium': { const w = r * 1.3; const h = r * 0.7; return `M${-w + h},${-h} H${w - h} A${h},${h} 0 0,1 ${w - h},${h} H${-w + h} A${h},${h} 0 0,1 ${-w + h},${-h} Z`; }
    case 'parallelogram': return `M${-r * 0.6},${-r * 0.8} H${r * 1.1} L${r * 0.6},${r * 0.8} H${-r * 1.1} Z`;
    case 'cross': { const a = r * 0.35; return `M${-a},${-r} H${a} V${-a} H${r} V${a} H${a} V${r} H${-a} V${a} H${-r} V${-a} H${-a} Z`; }
    case 'star': return Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + (Math.PI * i) / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      return `${i === 0 ? 'M' : 'L'}${(rr * Math.cos(a)).toFixed(1)},${(rr * Math.sin(a)).toFixed(1)}`;
    }).join(' ') + ' Z';
  }
}

/** 2D の配置を 3D の座標にする。種別ごとに高さを変え、重なりを避ける。 */
export function to3D(pos: { x: number; y: number }, kind: NodeKind, size: { width: number; height: number }): [number, number, number] {
  const k = NODE_KINDS.indexOf(kind);
  return [(pos.x - size.width / 2) / 70, 0.4 + k * 0.28, (pos.y - size.height / 2) / 70];
}
