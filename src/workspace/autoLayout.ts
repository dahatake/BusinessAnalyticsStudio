// 情報の階層に基づく自動配置（FR-243）。React に依存しない純粋な関数。
// 読む順序（左上から右下、主役が先）で、主役を最大の領域に、補助を主役の右に、詳細を下に置く。同じ階層で同じグループのものは隣り合わせに置く（FR-244）。
// 同じ入力からは、いつも同じ配置になる（決まった順序だけを使い、乱数・時刻は使わない）。
import { MAX_DETAIL, tierTree, type Layout, type LayoutNode } from './layoutModel';
import { orderByGroup, type Tier, type TierInfo } from './tiers';
import type { Bounds, PxMap } from './freeLayout';

export { MAX_DETAIL };

/**
 * 階層ごとに配置の木を作る。`keys` は読む順序の元になる並び（ペルソナの既定の並び）、`info` は classify の結果。
 * 空なら null。主役がなければ、補助・詳細の先頭を先に置く。
 */
export function autoTree(keys: readonly string[], info: Readonly<Record<string, Pick<TierInfo, 'tier'>>>): Layout {
  if (keys.length === 0) return null;
  const of = (t: Tier) => orderByGroup(keys.filter((k) => info[k]?.tier === t));
  const primary = of('primary');
  const supporting = of('supporting');
  const detail = of('detail');
  const head = primary[0] ?? supporting.shift() ?? detail.shift();
  if (!head) return null;
  return tierTree(head, [...primary.slice(1), ...supporting], detail);
}

/** 木を、領域（px。左上が原点）に当てはめたときの、各コンポーネントの位置と大きさ。タブのまとまりは同じ場所に重ねる。 */
export function treeRects(layout: Layout, b: Bounds): PxMap {
  const out: PxMap = {};
  const walk = (n: LayoutNode, x: number, y: number, w: number, h: number): void => {
    if (n.kind === 'tabs') { for (const k of n.tabs) out[k] = { x, y, w, h }; return; }
    let at = n.dir === 'row' ? x : y;
    n.children.forEach((c, i) => {
      const s = n.sizes[i] ?? 0;
      if (n.dir === 'row') { walk(c, at, y, w * s, h); at += w * s; } else { walk(c, x, at, w, h * s); at += h * s; }
    });
  };
  if (layout) walk(layout, 0, 0, b.w, b.h);
  return out;
}
