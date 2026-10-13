// 操作中のコンポーネントを大きくする自動のサイズ調整（FR-143）と、最小の幅の確保（PARAM-034、AC-227）。
// React に依存しない純粋な計算。保存するレイアウト（木）は変えず、描くときだけ大きさを組み替える。
import { clone, keysOf, normalizeSizes, type Layout, type LayoutNode, type SplitNode, type TabsNode } from './layoutModel';

/** PARAM-033: 操作中のコンポーネントの面積を基準の何倍にするか */
export const FOCUS_SCALE = 1.5;
/** PARAM-034: コンポーネントの最小の幅（CSS px）。これ未満になるものはタブにまとめる */
export const MIN_COMPONENT_WIDTH = 240;
/** 分割の境界の太さ（CSS px。Workspace の境界と同じ） */
export const SEPARATOR_PX = 8;
/** 重要度が高いコンポーネント（ペルソナの既定の情報表現）は、操作中の標準のコンポーネントより少し大きく保つ */
const PRIMARY_MARGIN = 1.1;
/** 操作中のコンポーネントが、使える面積に占める割合の上限（ほかが潰れないように） */
const FOCUS_CAP = 0.8;
/** ほかのコンポーネントが基準の面積に対して残す割合の下限 */
const OTHERS_FLOOR = 0.2;

export interface AutoSizeInput {
  enabled: boolean;
  /** 操作中（フォーカスのある）コンポーネントのキー */
  focus: string | null;
  /** ペルソナの既定の情報表現のキー（重要度: 高） */
  primary: string | null;
  /** 利用者が手で大きさを変えたコンポーネントのキー（自動の調整で変えない） */
  manual: ReadonlySet<string>;
  /** ワークスペースの幅（CSS px）。分かれば、最小の幅を割らないように調整する */
  width?: number;
}

const isTabs = (n: LayoutNode): n is TabsNode => n.kind === 'tabs';

/** 葉（タブのまとまり）ごとの、全体に対する面積の割合。 */
export function leafShares(layout: Layout): Array<{ node: TabsNode; share: number }> {
  const out: Array<{ node: TabsNode; share: number }> = [];
  const walk = (n: LayoutNode, share: number): void => {
    if (isTabs(n)) out.push({ node: n, share });
    else n.children.forEach((c, i) => walk(c, share * (n.sizes[i] ?? 0)));
  };
  if (layout) walk(layout, 1);
  return out;
}

/** 葉ごとの面積の割合 → 分割の比率（子の面積の和の比）。葉の面積は、そのまま重みになる。 */
function rebuild(node: LayoutNode, weight: Map<TabsNode, number>): LayoutNode {
  if (isTabs(node)) return node;
  const children = node.children.map((c) => rebuild(c, weight));
  const sum = (n: LayoutNode): number => (isTabs(n) ? weight.get(n) ?? 0 : n.children.reduce((a, c) => a + sum(c), 0));
  // 元の木の葉の重みで合計する（children は元の葉をそのまま持つので、weight の参照が使える）
  return { kind: 'split', dir: node.dir, children, sizes: normalizeSizes(children.map(sum), children.length) } as SplitNode;
}

/**
 * 自動のサイズ調整を適用した木を返す（FR-143 AC-226）。
 * - 操作中のコンポーネントの面積を、基準（保存したレイアウトのとき）の FOCUS_SCALE 倍にする。
 * - 重要度が高いコンポーネントは、操作中の標準のコンポーネントより小さくしない。
 * - 手で大きさを変えたコンポーネントの面積は変えない（AC-228）。
 * 調整しない場合（無効・操作中なし・操作中が手動）は、同じ木を返す。
 */
export function applyAutoSize(layout: Layout, input: AutoSizeInput): Layout {
  if (!layout || !input.enabled || !input.focus) return layout;
  const root = clone(layout);
  const leaves = leafShares(root);
  const has = (n: TabsNode, k: string | null): boolean => k !== null && n.tabs.includes(k);
  const x = leaves.find((l) => has(l.node, input.focus));
  if (!x || x.node.tabs.some((k) => input.manual.has(k))) return layout;
  const fixed = leaves.filter((l) => l !== x && l.node.tabs.some((k) => input.manual.has(k)));
  const p = leaves.find((l) => l !== x && has(l.node, input.primary) && !fixed.includes(l));
  const rest = leaves.filter((l) => l !== x && l !== p && !fixed.includes(l));
  const budget = 1 - fixed.reduce((a, l) => a + l.share, 0);
  const restSum = rest.reduce((a, l) => a + l.share, 0);
  if (budget <= 0 || restSum + (p?.share ?? 0) <= 1e-9) return layout;

  let t = Math.min(FOCUS_SCALE * x.share, FOCUS_CAP * budget);
  let scale = 1; // ほかのコンポーネントへの縮小率
  let pArea = p?.share ?? 0;
  for (let i = 0; i < 30; i++) {
    if (p) {
      scale = (budget - t) / (restSum + p.share);
      pArea = p.share * scale;
      if (pArea < PRIMARY_MARGIN * t) {
        pArea = PRIMARY_MARGIN * t;
        scale = restSum > 1e-9 ? (budget - t - pArea) / restSum : 1;
      }
    } else {
      scale = (budget - t) / restSum;
    }
    if (scale >= OTHERS_FLOOR) break;
    t *= 0.9;
  }
  if (!(scale > 0)) return layout;

  const weight = new Map<TabsNode, number>();
  weight.set(x.node, t);
  if (p) weight.set(p.node, pArea);
  for (const l of fixed) weight.set(l.node, l.share);
  for (const l of rest) weight.set(l.node, l.share * scale);
  let out = rebuild(root, weight);
  // 最小の幅（PARAM-034）を割る列は、操作中のコンポーネントの面積を保ったまま、縦の比率で補う
  if (input.width && input.width > 0) {
    for (let i = 0; i < 3; i++) {
      out = floorWidths(out, input.width);
      const now = leafShares(out).find((l) => l.node === x.node)?.share ?? t;
      const k = t / now;
      if (Math.abs(k - 1) < 0.01 || !scaleColumn(out, x.node, k)) break;
    }
  }
  return out;
}

/** 横の分割の各列を、最小の幅以上にする（収まる場合だけ）。 */
function floorWidths(node: LayoutNode, width: number, min = MIN_COMPONENT_WIDTH): LayoutNode {
  if (isTabs(node)) return node;
  if (node.dir === 'col') return { ...node, children: node.children.map((c) => floorWidths(c, width, min)) };
  const n = node.children.length;
  const usable = Math.max(0, width - SEPARATOR_PX * (n - 1));
  let sizes = node.sizes.slice();
  if (n * min <= usable) {
    const pinned = new Set<number>();
    for (let guard = 0; guard < n; guard++) {
      const floor = min / usable;
      const low = sizes.findIndex((s, i) => !pinned.has(i) && s < floor - 1e-9);
      if (low < 0) break;
      pinned.add(low);
      const free = sizes.reduce((a, s, i) => (pinned.has(i) ? a : a + s), 0);
      const room = 1 - pinned.size * floor;
      sizes = sizes.map((s, i) => (pinned.has(i) ? floor : s * (room / free)));
    }
  }
  return { ...node, sizes, children: node.children.map((c, i) => floorWidths(c, sizes[i]! * usable, min)) };
}

/** `target` を含む縦の分割のうち、いちばん内側のものの比率を k 倍にする（残りは按分）。できたら true。 */
function scaleColumn(root: LayoutNode, target: TabsNode, k: number): boolean {
  const trail: Array<{ node: SplitNode; index: number }> = [];
  const find = (n: LayoutNode): boolean => {
    if (n === target) return true;
    if (isTabs(n)) return false;
    for (let i = 0; i < n.children.length; i++) {
      trail.push({ node: n, index: i });
      if (find(n.children[i]!)) return true;
      trail.pop();
    }
    return false;
  };
  if (!find(root)) return false;
  for (let d = trail.length - 1; d >= 0; d--) {
    const { node, index } = trail[d]!;
    if (node.dir !== 'col') continue;
    const f = node.sizes[index]!;
    const nf = Math.min(0.9, Math.max(0.1, f * k));
    if (Math.abs(nf - f) < 1e-6) return false;
    node.sizes = node.sizes.map((s, i) => (i === index ? nf : s * ((1 - nf) / (1 - f))));
    return true;
  }
  return false;
}

/**
 * 幅が最小の幅（PARAM-034）未満になるコンポーネントを、隣のものとタブにまとめる（AC-227）。
 * `width` は木全体の幅（CSS px）。縦の分割は幅を分けないので、横の分割だけを見る。
 * タブにまとめたあとの前面は、`prefer`（操作中・最後に選んだタブ）があればそれ、なければ元の前面。
 */
export function fitMinWidth(layout: Layout, width: number, prefer: readonly (string | null)[] = [], min = MIN_COMPONENT_WIDTH): Layout {
  if (!layout || !(width > 0)) return layout;
  const flatten = (n: LayoutNode): TabsNode => {
    const keys = keysOf(n);
    const leaves = leafShares(n);
    const active = prefer.find((k): k is string => k !== null && keys.includes(k)) ?? leaves[0]?.node.active ?? keys[0]!;
    return { kind: 'tabs', tabs: keys, active };
  };
  const walk = (n: LayoutNode, w: number): LayoutNode => {
    if (isTabs(n)) return n;
    let children = n.children.slice();
    let sizes = n.sizes.slice();
    if (n.dir === 'row') {
      const widths = () => {
        const usable = Math.max(0, w - SEPARATOR_PX * (children.length - 1));
        return sizes.map((s) => s * usable);
      };
      while (children.length > 1) {
        const ws = widths();
        let i = 0;
        for (let k = 1; k < ws.length; k++) if (ws[k]! < ws[i]!) i = k;
        if (ws[i]! >= min - 0.5) break;
        // いちばん狭いものを、隣（狭い方）にまとめる
        const j = i === 0 ? 1 : i === ws.length - 1 ? i - 1 : (ws[i - 1]! <= ws[i + 1]! ? i - 1 : i + 1);
        const [a, b] = i < j ? [i, j] : [j, i];
        const merged = flatten({ kind: 'split', dir: 'row', sizes: [1, 1], children: [children[a]!, children[b]!] });
        const size = sizes[a]! + sizes[b]!;
        children = [...children.slice(0, a), merged, ...children.slice(b + 1)];
        sizes = [...sizes.slice(0, a), size, ...sizes.slice(b + 1)];
      }
      if (children.length === 1) return walk(children[0]!, w);
      const usable = Math.max(0, w - SEPARATOR_PX * (children.length - 1));
      return { kind: 'split', dir: 'row', sizes: normalizeSizes(sizes, children.length), children: children.map((c, i) => walk(c, sizes[i]! * usable / (sizes.reduce((s, v) => s + v, 0) || 1))) };
    }
    return { kind: 'split', dir: 'col', sizes: n.sizes, children: n.children.map((c) => walk(c, w)) };
  };
  return walk(layout, width);
}

/** 分割の境界を動かしたときに「手で大きさを変えた」ことになるコンポーネント（境界の両側のすべて）。 */
export function resizedKeys(node: LayoutNode | undefined, index: number): string[] {
  if (!node || node.kind !== 'split') return [];
  return [...keysOf(node.children[index] ?? null), ...keysOf(node.children[index + 1] ?? null)];
}
