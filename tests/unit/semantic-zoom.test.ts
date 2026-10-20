// FR-237 AC-556（意味的ズームの階層モデル: D+2 階層、段を飛ばさない、端で止まる、倍率との対応、パンくず）
import { describe, expect, it } from 'vitest';
import {
  breadcrumbs, canZoomIn, canZoomOut, clampDepth, depthOfScale, kindOfDepth, scaleOfDepth, stepDepth, zoomAttrs, zoomDepthCount,
} from '../../src/semanticzoom';

describe('FR-237 AC-556 意味的ズームの階層モデル', () => {
  it('階層の数は D+2（D は 1 以上）', () => {
    expect(zoomDepthCount(1)).toBe(3);
    expect(zoomDepthCount(3)).toBe(5);
    expect(zoomDepthCount(0)).toBe(3);
    expect(zoomDepthCount(Number.NaN)).toBe(3);
  });
  it('0=全体、最後=詳細、中間=要素', () => {
    expect([0, 1, 2, 3, 4].map((k) => kindOfDepth(k, 3))).toEqual(['overview', 'element', 'element', 'element', 'detail']);
    expect(zoomAttrs(9, 1)).toMatchObject({ 'data-zoom-level': 'detail', 'data-depth': 2, 'data-depth-count': 3 });
  });
  it('段は 1 つずつ進み、端では動かない', () => {
    expect(stepDepth(0, -1, 2)).toBe(0);
    expect(stepDepth(0, 1, 2)).toBe(1);
    expect(stepDepth(3, 1, 2)).toBe(3);
    expect(canZoomIn(3, 2)).toBe(false);
    expect(canZoomOut(0)).toBe(false);
    expect(clampDepth(-5, 1)).toBe(0);
  });
  it('倍率の連続的な変化で階層が変わり、境界ではヒステリシスで行き来しない', () => {
    expect(depthOfScale(1, 1)).toBe(0);
    expect(depthOfScale(2, 1)).toBe(1);
    expect(depthOfScale(10, 1)).toBe(2);
    expect(depthOfScale(1.49, 1, 1)).toBe(1); // 要素にいる間は、しきい値の少し下でも戻らない
    expect(depthOfScale(1.2, 1, 1)).toBe(0);
    for (let k = 0; k < 5; k++) expect(depthOfScale(scaleOfDepth(k, 3), 3)).toBe(k);
  });
  it('パンくずは現在地までを示し、現在の項目は 1 つ', () => {
    const c = breadcrumbs(2, 1, ['販売'], '顧客');
    expect(c.map((x) => x.label)).toEqual(['全体', '要素: 販売', '詳細: 顧客']);
    expect(c.filter((x) => x.current).map((x) => x.depth)).toEqual([2]);
  });
});
