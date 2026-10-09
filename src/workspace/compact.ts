// 狭い画面・高い拡大率での縮退（NFR-UX-002、NFR-UX-005）。React に依存しない純粋な計算。
// ワークスペースの幅がこれより狭いとき、分割（横並び）は縦積みにして、各コンポーネントに読める幅を残す。
// 保存するレイアウト（木）は変えず、描くときだけ組み替える。タブのまとまりはそのまま残す。
import type { Layout, LayoutNode } from './layoutModel';

/** ワークスペースの幅（CSS px）がこれ未満なら縦積みにする。1600px の画面の拡大率 200%（= 800px）や、タブレットの縦持ちが入る。 */
export const COMPACT_MAX_PX = 900;

export const isCompactWidth = (width: number): boolean => Number.isFinite(width) && width > 0 && width < COMPACT_MAX_PX;

/** 縦積みで 1 つの表示単位の高さ（短い画面では 80vh、長い画面でも 640px まで）。 */
export const COMPACT_CELL_HEIGHT = 'clamp(320px, 80vh, 640px)';

/** 縦積みにしたときの表示単位（タブのまとまり）を、画面の上から下の順に並べる。分割の入れ子は平らにする。 */
export function stackedLeaves(layout: Layout): Array<Extract<LayoutNode, { kind: 'tabs' }>> {
  const out: Array<Extract<LayoutNode, { kind: 'tabs' }>> = [];
  const walk = (n: LayoutNode): void => {
    if (n.kind === 'tabs') out.push(n);
    else n.children.forEach(walk);
  };
  if (layout) walk(layout);
  return out;
}
