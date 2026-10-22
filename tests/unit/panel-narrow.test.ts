// FR-150 AC-259（狭いコンポーネントは見出しの操作を「…」に畳む）と FR-217 AC-499（全画面での 2D⇄3D の往復）の単体テスト。
// 配置の計算が最小の幅（PARAM-034）ちょうどに置いた列で、描画の丸めにより「ビュー」ボタンが隠れないことを確かめる。
import { describe, expect, it } from 'vitest';
import { isNarrowPane } from '../../src/components/Panel';
import { MIN_COMPONENT_WIDTH, SEPARATOR_PX, fitMinWidth, leafShares } from '../../src/workspace/autosize';
import type { Layout } from '../../src/workspace/layoutModel';

describe('FR-150 AC-259 / FR-217 AC-499 狭いコンポーネントの判定', () => {
  // FR-150 AC-259
  it('FR-150 AC-259 最小の幅より明らかに狭いコンポーネントは狭いと判定する', () => {
    expect(isNarrowPane(200)).toBe(true);
    expect(isNarrowPane(MIN_COMPONENT_WIDTH - 2)).toBe(true);
    expect(isNarrowPane(MIN_COMPONENT_WIDTH + 60)).toBe(false);
  });

  // FR-217 AC-499
  it('FR-217 AC-499 最小の幅ちょうど（描画の丸めで 239.99px など）の列は狭くない（見出しの「ビュー」が出る）', () => {
    expect(isNarrowPane(MIN_COMPONENT_WIDTH)).toBe(false);
    expect(isNarrowPane(MIN_COMPONENT_WIDTH - 0.01)).toBe(false);
    expect(isNarrowPane(MIN_COMPONENT_WIDTH - 0.5)).toBe(false);
  });

  // FR-217 AC-499
  it('FR-217 AC-499 多くの列を開いて最小の幅で並べた配置でも、各列の幅は「狭い」と判定されない', () => {
    const keys = ['a', 'b', 'c', 'd', 'e'];
    const width = keys.length * MIN_COMPONENT_WIDTH + SEPARATOR_PX * (keys.length - 1) + 3;
    const layout: Layout = {
      kind: 'split', dir: 'row', sizes: [0.6, 0.1, 0.1, 0.1, 0.1],
      children: keys.map((k) => ({ kind: 'tabs' as const, tabs: [k], active: k })),
    };
    const fitted = fitMinWidth(layout, width);
    const usable = width - SEPARATOR_PX * (keys.length - 1);
    const leaves = leafShares(fitted);
    expect(leaves).toHaveLength(keys.length);
    for (const l of leaves) expect(isNarrowPane(l.share * usable), l.node.tabs.join()).toBe(false);
  });
});