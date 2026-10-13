// 画面（作業領域）の端へのスナップ（FR-152）。純粋なモデル。React に依存しない。
// 置ける配置は重ならない配置（分割・タブ）に限る。ドラッグなしでも、同じ候補（SnapKind）から配置先を選べる（NFR-A11Y-004）。
import { hide, keysOf, leaf, mergeIntoTabs, split, type Dir, type Layout, type LayoutNode, type TabsNode } from './layoutModel';

export type SnapKind = 'left' | 'right' | 'top' | 'bottom' | 'quad' | 'third' | 'tabs';
export type Edge = 'left' | 'right' | 'top' | 'bottom';
export type Corner = 'tl' | 'tr' | 'bl' | 'br';

export interface SnapOpts {
  /** 近づけた端（3 分割で、置く側を決める） */
  edge?: Edge;
  /** 4 分割で、置く角 */
  corner?: Corner;
  /** タブ化の相手 */
  tabTarget?: string;
}

/** 候補の表示名（ボタン・メニューの名前） */
export const SNAP_LABEL: Record<SnapKind, string> = {
  left: '左半分', right: '右半分', top: '上半分', bottom: '下半分', quad: '4 分割', third: '3 分割', tabs: 'タブ化',
};

const ALL_KINDS: readonly SnapKind[] = ['left', 'right', 'top', 'bottom', 'quad', 'third', 'tabs'];
/** 狭い画面（縦積み）で成り立つ候補（FR-152 AC-267） */
const COMPACT_KINDS: readonly SnapKind[] = ['top', 'bottom', 'tabs'];

export function snapKindsFor(compact: boolean): readonly SnapKind[] {
  return compact ? COMPACT_KINDS : ALL_KINDS;
}

/** 近づけた端（1 つ、または角の 2 つ）から、ドロップ前に見せる既定の候補を決める。 */
export function defaultSnapKind(edges: readonly Edge[], compact: boolean): SnapKind {
  const h = edges.find((e) => e === 'left' || e === 'right');
  const v = edges.find((e) => e === 'top' || e === 'bottom');
  if (compact) return v === 'bottom' ? 'bottom' : v === 'top' ? 'top' : 'tabs';
  if (h && v) return 'quad';
  return (h ?? v ?? 'left') as SnapKind;
}

/** ポインターの位置（作業領域の中の割合 0〜1）から、いちばん近い角。 */
export function nearestCorner(fx: number, fy: number): Corner {
  return `${fy < 0.5 ? 't' : 'b'}${fx < 0.5 ? 'l' : 'r'}` as Corner;
}

function tabsOf(keys: string[]): TabsNode {
  return { kind: 'tabs', tabs: keys, active: keys[0]! };
}

/** 残りのコンポーネントを `n` 個のまとまりに分ける（最後のまとまりに余りをタブでまとめる）。 */
function groups(keys: string[], n: number): LayoutNode[] {
  const cells = Math.min(keys.length, n);
  return Array.from({ length: cells }, (_, i) => tabsOf(i < cells - 1 ? [keys[i]!] : keys.slice(i)));
}

/**
 * `key` を候補の配置にする。重ならない配置（分割・タブ）だけを作り、ほかのコンポーネントは落とさない。
 * 置けない（残りがない、相手がない）ときは、木を変えない。
 */
export function snapLayout(layout: Layout, key: string, kind: SnapKind, opts: SnapOpts = {}): Layout {
  if (!layout) return layout;
  const rest = hide(layout, key);
  if (!rest) return layout; // 1 つだけのときは、すでに全体を使っている
  const moved = leaf(key);
  const others = keysOf(rest);
  switch (kind) {
    case 'left': return split('row', [moved, rest], [0.5, 0.5]);
    case 'right': return split('row', [rest, moved], [0.5, 0.5]);
    case 'top': return split('col', [moved, rest], [0.5, 0.5]);
    case 'bottom': return split('col', [rest, moved], [0.5, 0.5]);
    case 'third': {
      const dir: Dir = opts.edge === 'top' || opts.edge === 'bottom' ? 'col' : 'row';
      const last = opts.edge === 'right' || opts.edge === 'bottom';
      const cells = groups(others, 2);
      return split(dir, last ? [...cells, moved] : [moved, ...cells]);
    }
    case 'quad': {
      const corner = opts.corner ?? 'tl';
      const cells = groups(others, 3);
      const total = cells.length + 1;
      const right = corner === 'tr' || corner === 'br';
      const bottom = corner === 'bl' || corner === 'br';
      if (total === 2) return split('row', right ? [cells[0]!, moved] : [moved, cells[0]!]);
      const pair = (a: LayoutNode, b: LayoutNode) => split('row', right ? [b, a] : [a, b]);
      if (total === 3) {
        // 角の行に 2 つ（置く角と隣）、反対の行は全幅 1 つ
        const row = pair(moved, cells[0]!);
        return split('col', bottom ? [cells[1]!, row] : [row, cells[1]!]);
      }
      const row1 = split('row', [moved, cells[0]!]);
      const row2 = split('row', [cells[1]!, cells[2]!]);
      // 置く角を、置く位置の行・列に合わせる
      const top = bottom ? row2 : row1;
      const btm = bottom ? row1 : row2;
      const flip = (r: LayoutNode) => (right && r.kind === 'split' ? split('row', [...r.children].reverse()) : r);
      return split('col', [flip(top), flip(btm)]);
    }
    case 'tabs': {
      const target = opts.tabTarget && others.includes(opts.tabTarget) ? opts.tabTarget : others[0];
      return target ? mergeIntoTabs(layout, key, target) : layout;
    }
  }
}

export interface RectLike { left: number; top: number; width: number; height: number }

/** 配置後の領域の見た目（作業領域の矩形から）。タブ化は相手の矩形。 */
export function snapRect(area: RectLike, kind: SnapKind, opts: SnapOpts = {}, tabRect?: RectLike | null): RectLike {
  const { left, top, width: w, height: h } = area;
  switch (kind) {
    case 'left': return { left, top, width: w / 2, height: h };
    case 'right': return { left: left + w / 2, top, width: w / 2, height: h };
    case 'top': return { left, top, width: w, height: h / 2 };
    case 'bottom': return { left, top: top + h / 2, width: w, height: h / 2 };
    case 'quad': {
      const c = opts.corner ?? 'tl';
      return { left: c === 'tr' || c === 'br' ? left + w / 2 : left, top: c === 'bl' || c === 'br' ? top + h / 2 : top, width: w / 2, height: h / 2 };
    }
    case 'third': {
      if (opts.edge === 'top') return { left, top, width: w, height: h / 3 };
      if (opts.edge === 'bottom') return { left, top: top + (h * 2) / 3, width: w, height: h / 3 };
      return { left: opts.edge === 'right' ? left + (w * 2) / 3 : left, top, width: w / 3, height: h };
    }
    case 'tabs': return tabRect ?? area;
  }
}
