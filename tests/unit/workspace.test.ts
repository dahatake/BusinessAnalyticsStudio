// ワークスペースのレイアウトとキャンバスの視点の単体テスト
import { describe, expect, it } from 'vitest';
import {
  defaultLayout, hide, isLayout, keysOf, leaf, mergeIntoTabs, move, prune, resize, show, split, splitFromTabs, toggleDirection,
  type Layout, type SplitNode,
} from '../../src/workspace/layoutModel';
import { centerOn, clampZoom, isCenteredOn, keyViewport, zoomAt, MAX_ZOOM, MIN_ZOOM } from '../../src/workspace/viewport';

const biz = () => defaultLayout('事業部門');

describe('FR-013 / FR-014 非表示と再表示', () => {
  // FR-013 AC-016
  it('FR-013 AC-016 非表示にするとそのコンポーネントが木から消え、残りが畳まれる', () => {
    const l = hide(hide(biz(), 'gantt'), 'table');
    expect(keysOf(l)).toEqual(['issue-solution', 'discussion-tree']);
    expect((l as SplitNode).dir).toBe('row');
  });

  // FR-014 AC-017
  it('FR-014 AC-017 非表示にしたものを再表示でき、すべて非表示でも再表示できる', () => {
    const l = show(hide(biz(), 'gantt'), 'gantt');
    expect(keysOf(l).sort()).    toEqual(['discussion-tree', 'gantt', 'issue-solution', 'table']);
    let all: Layout = biz();
    for (const k of keysOf(all)) all = hide(all, k);
    expect(all).toBeNull();
    expect(keysOf(show(all, 'gantt'))).toEqual(['gantt']);
  });

  // FR-014 AC-017
  it('FR-014 AC-017 ペルソナごとに既定のレイアウトが違い、保存値の検証で壊れた値を捨てる', () => {
    expect(JSON.stringify(defaultLayout('経営層'))).not.toBe(JSON.stringify(defaultLayout('IT')));
    expect(isLayout(JSON.parse(JSON.stringify(biz())))).toBe(true);
    expect(isLayout({ kind: 'split', dir: 'x', children: [], sizes: [] })).toBe(false);
    expect(isLayout('x')).toBe(false);
  });

  // FR-014 AC-017
  it('FR-014 AC-017 使えないコンポーネントは除かれ、1 つだけになった分割は畳まれる', () => {
    const l = prune(biz(), new Set(['gantt', 'issue-solution']));
    expect(keysOf(l)).toEqual(['issue-solution', 'gantt']);
    expect(prune(biz(), new Set())).toBeNull();
  });
});

describe('FR-109 移動・方向・タブ・大きさ', () => {
  // FR-109 AC-134
  it('FR-109 AC-134 上へ移動すると同じ向きの隣と入れ替わる', () => {
    const l = move(biz(), 'gantt', 'up') as SplitNode;
    expect(keysOf(l)[0]).toBe('gantt');
  });

  // FR-109 AC-134
  it('FR-109 AC-134 動かせない向きでは外側の端へ置き直し、キーは失われない', () => {
    const l = move(biz(), 'gantt', 'left') as SplitNode;
    expect(l.dir).toBe('row');
    expect(keysOf(l)[0]).toBe('gantt');
    expect(keysOf(l).sort()).toEqual(keysOf(biz()).sort());
  });

  // FR-109 AC-134
  it('FR-109 AC-134 並べる方向（横/縦）を切り替えられる', () => {
    const l = toggleDirection(biz(), 'issue-solution') as SplitNode;
    expect((l.children[0] as SplitNode).dir).toBe('col');
  });

  // FR-109 AC-134
  it('FR-109 AC-134 2 つをタブにまとめ、タブから出せる', () => {
    const l = mergeIntoTabs(hide(move(biz(), 'gantt', 'up'), 'table'), 'discussion-tree', 'gantt');
    const first = (l as SplitNode).children[0]!;
    expect(first).toEqual({ kind: 'tabs', tabs: ['gantt', 'discussion-tree'], active: 'discussion-tree' });
    expect(keysOf(l).sort()).toEqual(['discussion-tree', 'gantt', 'issue-solution']);
    const back = splitFromTabs(l, 'discussion-tree');
    expect(keysOf(back).sort()).toEqual(['discussion-tree', 'gantt', 'issue-solution']);
    expect(JSON.stringify(back)).not.toContain('"tabs":["gantt","discussion-tree"]');
  });

  // FR-109 AC-134
  it('FR-109 AC-134 境界を動かすと大きさが変わり、合計は 1 で、最小の大きさを下回らない', () => {
    const l = resize(biz(), [], 0, 0.1) as SplitNode;
    expect(l.sizes[0]).toBeCloseTo(0.8);
    expect(l.sizes.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    const tiny = resize(biz(), [], 0, 5) as SplitNode;
    expect(tiny.sizes[1]).toBeGreaterThanOrEqual(0.1 - 1e-9);
  });

  // FR-109 AC-134
  it('FR-109 AC-134 操作は元のレイアウトを書き換えない', () => {
    const base = split('row', [leaf('a'), leaf('b')]);
    const snap = JSON.stringify(base);
    move(base, 'a', 'right'); hide(base, 'a'); resize(base, [], 0, 0.1); mergeIntoTabs(base, 'a', 'b');
    expect(JSON.stringify(base)).toBe(snap);
  });
});

describe('FR-110 既定のレイアウトへの復元', () => {
  // FR-110 AC-135
  it('FR-110 AC-135 既定のレイアウトは毎回同じ内容で作られる（変更が既定に混ざらない）', () => {
    const a = defaultLayout('事業部門');
    hide(a, 'gantt'); move(a, 'gantt', 'up');
    expect(JSON.stringify(defaultLayout('事業部門'))).toBe(JSON.stringify(a));
  });
});

describe('FR-012 キャンバスのパン/ズーム', () => {
  const v = { x: 0, y: 0, zoom: 1 };

  // FR-012 AC-015
  it('FR-012 AC-015 矢印キーでパンし、+/- でズームする', () => {
    expect(keyViewport(v, 'ArrowRight', 800, 600)!.x).toBeLessThan(0);
    expect(keyViewport(v, 'ArrowDown', 800, 600)!.y).toBeLessThan(0);
    expect(keyViewport(v, '+', 800, 600)!.zoom).toBeGreaterThan(1);
    expect(keyViewport(v, '-', 800, 600)!.zoom).toBeLessThan(1);
    expect(keyViewport(v, 'a', 800, 600)).toBeNull();
  });

  // FR-012 AC-015
  it('FR-012 AC-015 ホイールのズームはカーソルの下の点を動かさず、倍率は範囲に収まる', () => {
    const z = zoomAt({ x: 10, y: 20, zoom: 1 }, 2, 100, 100);
    expect((100 - z.x) / z.zoom).toBeCloseTo((100 - 10) / 1);
    expect((100 - z.y) / z.zoom).toBeCloseTo((100 - 20) / 1);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
  });

  // FR-012 AC-015
  it('FR-012 AC-015 議題の位置へ移動すると、その議題が表示領域の中央に来る', () => {
    const c = centerOn({ x: 0, y: 0, zoom: 1.5 }, 500, 300, 800, 600);
    expect(isCenteredOn(c, 500, 300, 800, 600)).toBe(true);
    expect(isCenteredOn(v, 500, 300, 800, 600)).toBe(false);
  });
});
