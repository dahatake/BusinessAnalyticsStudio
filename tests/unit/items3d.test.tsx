// @vitest-environment jsdom
// FR-217 AC-501: 3D の表現を新しく作る 6 画面の、共通の 3D の面に渡す項目の配置の規則と、画面の登録の宣言、t.view.state の items3d。
import { describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { SCREENS } from '../../src/screens/registry';
import { modeOptions, NO_3D_ENV_REASON } from '../../src/view/viewModel';
import { groupGrid, idsOf, norm, spread, toSpace, treeLayout3D, SPACE } from '../../src/view/items3d';
import { usePublishItems3D, usePublishViewItems, viewTestState } from '../../src/view/useView';

const NEW_3D = ['table', 'matrix', 'ranking', 'issue-solution', 'discussion-tree', 'kpi-okr'];

describe('FR-217 AC-501 画面の登録は、6 画面が 3D の表現を持つと宣言する', () => {
  it('FR-217 AC-501 6 画面は 2D と 3D の両方を持ち、3D を描画できない環境では 3D が無効で理由を示す（AC-500）', () => {
    for (const key of NEW_3D) {
      const decl = SCREENS.find((s) => s.key === key)?.view;
      expect(decl, key).toBeDefined();
      expect(decl?.has2D, key).toBe(true);
      expect(decl?.has3D, key).toBe(true);
      expect(decl?.fixed, key).toBeFalsy();
      const opts = modeOptions(decl!, false);
      const two = opts[0];
      const three = opts[1];
      expect(two?.enabled).toBe(true);
      expect(three?.enabled, `${key}: 描画できない環境で 3D が選べる`).toBe(false);
      expect(three?.reason).toBe(NO_3D_ENV_REASON);
      expect(modeOptions(decl!, true)[1]?.enabled).toBe(true);
    }
  });
});

describe('FR-217 AC-501 項目の配置（位置・大きさ・つながり）', () => {
  it('FR-217 AC-501 一覧表: グループごとの列に、すべての項目が一度ずつ 0〜1 の中に置かれる', () => {
    const rows = [{ id: 'a', n: 'A', k: 'x' }, { id: 'b', n: 'B', k: 'y' }, { id: 'c', n: 'C', k: 'x' }, { id: 'd', n: 'D', k: 'x' }];
    const items = groupGrid(rows, (r) => r.id, (r) => r.n, (r) => r.k);
    expect(idsOf(items).sort()).toEqual(['a', 'b', 'c', 'd']);
    for (const i of items) for (const v of [i.x, i.y, i.z, i.size]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    // 同じグループは同じ横の位置、別のグループは別の横の位置
    const xOf = (id: string) => items.find((i) => i.id === id)!.x;
    expect(xOf('a')).toBe(xOf('c'));
    expect(xOf('a')).not.toBe(xOf('b'));
  });

  it('FR-217 AC-501 議論ツリー: 深さが高さになり（根が上）、親→子のつながりが項目の数−根の数だけできる。循環・孤立でも全項目を置く', () => {
    const nodes = [
      { id: 'r', p: null }, { id: 'c1', p: 'r' }, { id: 'c2', p: 'r' }, { id: 'g1', p: 'c1' }, { id: 'x', p: 'missing' },
    ];
    const { items, links } = treeLayout3D(nodes, (n) => n.id, (n) => n.id, (n) => n.p);
    expect(idsOf(items).sort()).toEqual(['c1', 'c2', 'g1', 'r', 'x']);
    const y = (id: string) => items.find((i) => i.id === id)!.y;
    expect(y('r')).toBeGreaterThan(y('c1'));
    expect(y('c1')).toBeGreaterThan(y('g1'));
    expect(links).toEqual(expect.arrayContaining([{ from: 'r', to: 'c1' }, { from: 'r', to: 'c2' }, { from: 'c1', to: 'g1' }]));
    expect(links).toHaveLength(3);
    const cyc = treeLayout3D([{ id: 'a', p: 'b' }, { id: 'b', p: 'a' }], (n) => n.id, (n) => n.id, (n) => n.p);
    expect(idsOf(cyc.items).sort()).toEqual(['a', 'b']);
  });

  it('FR-217 AC-501 正規化: norm・spread・toSpace の境界（空・1 件・同値・範囲外）', () => {
    expect(norm(3, 1, 5)).toBe(0.5);
    expect(norm(9, 1, 5)).toBe(1);
    expect(norm(0, 1, 5)).toBe(0);
    expect(norm(2, 2, 2)).toBe(0.5);
    expect(spread(0, 1)).toBe(0.5);
    expect(spread(2, 3)).toBe(1);
    expect(toSpace(0.5)).toBe(0);
    expect(toSpace(1)).toBe(SPACE / 2);
    expect(toSpace(Number.NaN)).toBe(-SPACE / 2);
    expect(groupGrid([], () => '', () => '', () => '')).toEqual([]);
  });
});

describe('FR-217 AC-501 t.view.state の items3d', () => {
  it('FR-217 AC-501 3D の面が描いている項目の ID だけを items3d に知らせ、面が消えると空に戻る', () => {
    function Probe({ on }: { on: boolean }) {
      usePublishViewItems('matrix', ['a', 'b']);
      return on ? createElement(Surface) : null;
    }
    function Surface() { usePublishItems3D('matrix', ['a', 'b']); return null; }
    const r = render(createElement(Probe, { on: false }));
    expect(viewTestState('matrix').items3d).toEqual([]);
    act(() => { r.rerender(createElement(Probe, { on: true })); });
    expect(viewTestState('matrix').items3d).toEqual(['a', 'b']);
    expect(viewTestState('matrix').itemIds).toEqual(['a', 'b']);
    act(() => { r.rerender(createElement(Probe, { on: false })); });
    expect(viewTestState('matrix').items3d).toEqual([]);
    cleanup();
  });
});
