// ワークスペースのレイアウトの純粋なモデル（FR-013/FR-014/FR-109/FR-110）。
// React に依存しない。レイアウトは「分割（横/縦）」と「タブのまとまり」の木で、木にないコンポーネントは非表示（ドックに出る）。
export type Dir = 'row' | 'col';
export type Move = 'up' | 'down' | 'left' | 'right';

export interface SplitNode { kind: 'split'; dir: Dir; sizes: number[]; children: LayoutNode[] }
export interface TabsNode { kind: 'tabs'; tabs: string[]; active: string }
export type LayoutNode = SplitNode | TabsNode;
/** 木が空（全部非表示）のときは null */
export type Layout = LayoutNode | null;
export type Path = number[];

export const MIN_SIZE = 0.1;

export const leaf = (key: string): TabsNode => ({ kind: 'tabs', tabs: [key], active: key });

export function normalizeSizes(sizes: number[], n: number): number[] {
  const base = sizes.length === n && sizes.every((s) => Number.isFinite(s) && s > 0) ? sizes : Array.from({ length: n }, () => 1);
  const sum = base.reduce((a, b) => a + b, 0);
  return base.map((s) => s / sum);
}

export const split = (dir: Dir, children: LayoutNode[], sizes?: number[]): SplitNode => ({
  kind: 'split', dir, children, sizes: normalizeSizes(sizes ?? children.map(() => 1), children.length),
});

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function keysOf(node: Layout): string[] {
  if (!node) return [];
  if (node.kind === 'tabs') return [...node.tabs];
  return node.children.flatMap((c) => keysOf(c));
}

/** 使えるコンポーネントだけに絞り、空の枝と 1 つだけの分割を畳む。重複キーは先のものだけ残す。 */
export function prune(node: Layout, available: ReadonlySet<string>): Layout {
  const seen = new Set<string>();
  const walk = (n: LayoutNode): LayoutNode | null => {
    if (n.kind === 'tabs') {
      const tabs = n.tabs.filter((k) => available.has(k) && !seen.has(k));
      tabs.forEach((k) => seen.add(k));
      if (tabs.length === 0) return null;
      return { kind: 'tabs', tabs, active: tabs.includes(n.active) ? n.active : tabs[0]! };
    }
    const kept: Array<{ n: LayoutNode; s: number }> = [];
    n.children.forEach((c, i) => {
      const r = walk(c);
      if (r) kept.push({ n: r, s: n.sizes[i] ?? 1 });
    });
    if (kept.length === 0) return null;
    if (kept.length === 1) return kept[0]!.n;
    return { kind: 'split', dir: n.dir, children: kept.map((k) => k.n), sizes: normalizeSizes(kept.map((k) => k.s), kept.length) };
  };
  return node ? walk(node) : null;
}

/** 木の検証（localStorage の壊れた値を捨てるため）。 */
export function isLayout(v: unknown): v is Layout {
  if (v === null) return true;
  const ok = (n: any): boolean => {
    if (!n || typeof n !== 'object') return false;
    if (n.kind === 'tabs') return Array.isArray(n.tabs) && n.tabs.length > 0 && n.tabs.every((t: unknown) => typeof t === 'string') && typeof n.active === 'string';
    if (n.kind === 'split') {
      return (n.dir === 'row' || n.dir === 'col') && Array.isArray(n.children) && n.children.length > 0
        && Array.isArray(n.sizes) && n.sizes.length === n.children.length && n.sizes.every((s: unknown) => typeof s === 'number') && n.children.every(ok);
    }
    return false;
  };
  return ok(v);
}

function findTabs(node: LayoutNode, key: string, path: Path = []): { path: Path; node: TabsNode } | null {
  if (node.kind === 'tabs') return node.tabs.includes(key) ? { path, node } : null;
  for (let i = 0; i < node.children.length; i++) {
    const r = findTabs(node.children[i]!, key, [...path, i]);
    if (r) return r;
  }
  return null;
}

export function getAt(root: LayoutNode, path: Path): LayoutNode {
  return path.reduce<LayoutNode>((n, i) => (n as SplitNode).children[i]!, root);
}

/** 木を複製して `fn` で書き換える（元は変えない）。 */
function edit(layout: Layout, fn: (root: LayoutNode) => Layout): Layout {
  return layout ? fn(clone(layout)) : null;
}

export function isVisible(layout: Layout, key: string): boolean {
  return keysOf(layout).includes(key);
}

/** 非表示にする（FR-013）。 */
export function hide(layout: Layout, key: string): Layout {
  return prune(layout, new Set(keysOf(layout).filter((k) => k !== key)));
}

/** 前面にするタブを選ぶ。 */
export function activate(layout: Layout, key: string): Layout {
  return edit(layout, (root) => {
    const f = findTabs(root, key);
    if (f) f.node.active = key;
    return root;
  });
}

/** 再表示する（FR-014）。横の分割の末尾に足す。すでに表示中ならそのタブを前面にする。 */
/** 画面を新しく表示するときに、全体に対して取る幅の割合。載せていない画面は既定（横に並ぶ分割へ足すとき 0.25、そうでなければ 0.3）。描く面のように広さがほしい画面は大きくする。 */
export const SHOW_SHARE: Readonly<Record<string, number>> = { whiteboard: 0.5 };
/** 横一列の列数がこれを超えたら、各列に平均の COLUMN_FLOOR 倍の幅を最低限残す */
const MANY_COLUMNS = 6;
const COLUMN_FLOOR = 0.8;

export function show(layout: Layout, key: string): Layout {
  if (!layout) return leaf(key);
  if (isVisible(layout, key)) return activate(layout, key);
  const share = SHOW_SHARE[key];
  if (layout.kind === 'split' && layout.dir === 'row') {
    const n = layout.children.length;
    const s = share ?? 0.25;
    // 列が増えても、先にあった列が見えない幅まで縮まないよう、1 列あたりの下限を設ける（NFR-LEGAL-002 AC-180: 多くの画面を開いたあとでも各画面を操作できる）
    const floor = n + 1 > MANY_COLUMNS ? COLUMN_FLOOR / (n + 1) : 0;
    return {
      kind: 'split', dir: 'row', children: [...clone(layout.children), leaf(key)],
      sizes: normalizeSizes([...layout.sizes.map((x) => Math.max(x * (1 - s), floor)), s], n + 1),
    };
  }
  const s = share ?? 0.3;
  return split('row', [clone(layout), leaf(key)], [1 - s, s]);
}

function removeNode(root: LayoutNode, target: LayoutNode): Layout {
  const walk = (n: LayoutNode): LayoutNode | null => {
    if (n === target) return null;
    if (n.kind === 'tabs') return n;
    const kids: LayoutNode[] = [];
    const sizes: number[] = [];
    n.children.forEach((c, i) => { const r = walk(c); if (r) { kids.push(r); sizes.push(n.sizes[i] ?? 1); } });
    if (kids.length === 0) return null;
    if (kids.length === 1) return kids[0]!;
    return { kind: 'split', dir: n.dir, children: kids, sizes: normalizeSizes(sizes, kids.length) };
  };
  return walk(root);
}

/** 位置の移動（FR-109）。同じ向きの分割の中で隣と入れ替える。動かせないときは、その向きの外側の端へ置き直す。 */
export function move(layout: Layout, key: string, dir: Move): Layout {
  return edit(layout, (root) => {
    const f = findTabs(root, key);
    if (!f) return root;
    const axis: Dir = dir === 'up' || dir === 'down' ? 'col' : 'row';
    const delta = dir === 'up' || dir === 'left' ? -1 : 1;
    for (let depth = f.path.length - 1; depth >= 0; depth--) {
      const parent = getAt(root, f.path.slice(0, depth)) as SplitNode;
      const idx = f.path[depth]!;
      const to = idx + delta;
      if (parent.dir !== axis || to < 0 || to >= parent.children.length) continue;
      [parent.children[idx], parent.children[to]] = [parent.children[to]!, parent.children[idx]!];
      [parent.sizes[idx], parent.sizes[to]] = [parent.sizes[to]!, parent.sizes[idx]!];
      return root;
    }
    if (root === f.node) return root;
    const moved: TabsNode = { kind: 'tabs', tabs: [...f.node.tabs], active: f.node.active };
    const rest = removeNode(root, f.node);
    if (!rest) return root;
    return split(axis, delta < 0 ? [moved, rest] : [rest, moved], delta < 0 ? [0.3, 0.7] : [0.7, 0.3]);
  });
}

export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'tabs';

/** `a` と `b` を含む子が初めて分かれる分割の位置と、その手前の子の番号（境界を動かす対象）。 */
export function splitBetween(layout: Layout, a: string, b: string): { path: Path; index: number } | null {
  if (!layout) return null;
  let node: LayoutNode = layout;
  const path: Path = [];
  for (;;) {
    if (node.kind !== 'split') return null;
    const ia = node.children.findIndex((c) => keysOf(c).includes(a));
    const ib = node.children.findIndex((c) => keysOf(c).includes(b));
    if (ia < 0 || ib < 0) return null;
    if (ia === ib) { path.push(ia); node = node.children[ia]!; continue; }
    return { path: [...path], index: Math.min(ia, ib) };
  }
}

/**
 * ドラッグでの移動（FR-142）。`key` を `target` の上下左右に置く。`tabs` なら `target` のタブにまとめる。
 * どのコンポーネントも、どこへでも動かせる。移動できない組み合わせ（自分自身・存在しない）は、木を変えない。
 */
export function dropAt(layout: Layout, key: string, target: string, zone: DropZone): Layout {
  if (!layout || key === target) return layout;
  if (zone === 'tabs') return mergeIntoTabs(layout, key, target);
  if (!isVisible(layout, key) || !isVisible(layout, target)) return layout;
  const root = clone(layout);
  const src = findTabs(root, key)!;
  let rest: Layout;
  if (src.node.tabs.length > 1) {
    src.node.tabs = src.node.tabs.filter((k) => k !== key);
    if (!src.node.tabs.includes(src.node.active)) src.node.active = src.node.tabs[0]!;
    rest = root;
  } else {
    rest = removeNode(root, src.node);
  }
  if (!rest) return layout;
  const dst = findTabs(rest, target);
  if (!dst) return layout;
  const dir: Dir = zone === 'left' || zone === 'right' ? 'row' : 'col';
  const before = zone === 'left' || zone === 'top';
  const moved = leaf(key);
  if (dst.path.length > 0) {
    const parent = getAt(rest, dst.path.slice(0, -1)) as SplitNode;
    if (parent.dir === dir) {
      // 同じ向きの分割には、並べて足す（入れ子を増やさない）
      const i = dst.path[dst.path.length - 1]!;
      const s = parent.sizes[i]!;
      parent.children.splice(before ? i : i + 1, 0, moved);
      parent.sizes.splice(i, 1, s / 2, s / 2);
      parent.sizes = normalizeSizes(parent.sizes, parent.children.length);
      return rest;
    }
    const pair = split(dir, before ? [moved, dst.node] : [dst.node, moved], [0.5, 0.5]);
    parent.children[dst.path[dst.path.length - 1]!] = pair;
    return rest;
  }
  return split(dir, before ? [moved, rest] : [rest, moved], before ? [0.4, 0.6] : [0.6, 0.4]);
}

/** 並べる方向（横/縦）を、そのコンポーネントを含む分割で入れ替える（FR-109）。 */
export function toggleDirection(layout: Layout, key: string): Layout {
  return edit(layout, (root) => {
    const f = findTabs(root, key);
    if (!f || f.path.length === 0) return root;
    const parent = getAt(root, f.path.slice(0, -1)) as SplitNode;
    parent.dir = parent.dir === 'row' ? 'col' : 'row';
    return root;
  });
}

/** `key` を `target` のタブにまとめる（FR-109）。 */
export function mergeIntoTabs(layout: Layout, key: string, target: string): Layout {
  if (key === target) return layout;
  return edit(layout, (root) => {
    const src = findTabs(root, key);
    const dst = findTabs(root, target);
    if (!src || !dst || src.node === dst.node) return root;
    src.node.tabs = src.node.tabs.filter((k) => k !== key);
    if (src.node.tabs.length > 0 && !src.node.tabs.includes(src.node.active)) src.node.active = src.node.tabs[0]!;
    dst.node.tabs.push(key);
    dst.node.active = key;
    return prune(root, new Set(keysOf(root))) ?? root;
  });
}

/** タブから出して、隣に並べる。 */
export function splitFromTabs(layout: Layout, key: string): Layout {
  return edit(layout, (root) => {
    const f = findTabs(root, key);
    if (!f || f.node.tabs.length < 2) return root;
    f.node.tabs = f.node.tabs.filter((k) => k !== key);
    if (!f.node.tabs.includes(f.node.active)) f.node.active = f.node.tabs[0]!;
    const rest: TabsNode = { kind: 'tabs', tabs: [...f.node.tabs], active: f.node.active };
    const pair = split('row', [rest, leaf(key)], [0.5, 0.5]);
    if (f.path.length === 0) return pair;
    const parent = getAt(root, f.path.slice(0, -1)) as SplitNode;
    parent.children[f.path[f.path.length - 1]!] = pair;
    return root;
  });
}

/** 分割の境界を動かす（FR-109）。`path` は分割ノードの位置、`index` は境界の手前の子の番号、`delta` は比率。 */
export function resize(layout: Layout, path: Path, index: number, delta: number): Layout {
  return edit(layout, (root) => {
    const node = getAt(root, path);
    if (node.kind !== 'split' || index < 0 || index >= node.children.length - 1) return root;
    const a = node.sizes[index]!;
    const b = node.sizes[index + 1]!;
    const total = a + b;
    const na = Math.min(total - MIN_SIZE, Math.max(MIN_SIZE, a + delta));
    node.sizes[index] = na;
    node.sizes[index + 1] = total - na;
    return root;
  });
}

export const PERSONAS = ['経営層', '事業部門', 'IT', '現場'] as const;
export type Persona = (typeof PERSONAS)[number];
export const DEFAULT_PERSONA: Persona = '経営層';

/** ペルソナ別の既定のレイアウト（要求定義書 §7）。 */
export function defaultLayout(persona: Persona): Layout {
  switch (persona) {
    case '経営層': // 上段にサマリー、主領域に 2×2 マトリクス、横にランキング表。キャンバスは背景の全体図として小さく残す（§7 の表）
      return split('col', [split('row', [leaf('summary'), leaf('kpi-okr')], [0.6, 0.4]), split('row', [leaf('matrix'), leaf('ranking'), leaf('canvas')], [0.45, 0.2, 0.35])], [0.25, 0.75]);
    case '事業部門': // 主領域に課題-解決策分析、横に議論ツリー、下にガントと一覧表（FR-110 AC-135: リセット後も絞り込みの入力欄が残る）
      return split('col', [split('row', [leaf('issue-solution'), leaf('discussion-tree')], [0.65, 0.35]), split('row', [leaf('gantt'), leaf('table'), leaf('kpi-okr')], [0.4, 0.3, 0.3])], [0.7, 0.3]);
    case 'IT': // 主領域にアーキテクチャ図、横にナレッジグラフ、下に製品の一覧
      return split('col', [split('row', [leaf('architecture'), leaf('knowledge-graph')], [0.65, 0.35]), split('row', [leaf('products'), leaf('kpi-okr')], [0.55, 0.45])], [0.7, 0.3]);
    case '現場': // 主領域に 3D/地図、横にミニ・モックアプリ、下にガント
      return split('col', [split('row', [leaf('view3d'), leaf('mock-app')], [0.65, 0.35]), split('row', [leaf('gantt'), leaf('kpi-okr')], [0.55, 0.45])], [0.7, 0.3]);
  }
}

/**
 * 既定のレイアウトに登録済みの画面が 1 つも残らないときの退避（後続の画面が揃うまでの暫定）。
 * 登録済みのキーを 1 つのタブのまとまりに並べ、先頭を前面にする（登録が増えて §7 の既定が残れば、そちらが優先される）。
 * 全部を同時に分割して見せると、3D など常時動く画面が他の画面の表示を書き換え続けるため、タブにする。
 */
export function arrangeAll(keys: readonly string[]): Layout {
  const uniq = [...new Set(keys)];
  if (uniq.length === 0) return null;
  return { kind: 'tabs', tabs: uniq, active: uniq[0]! };
}
