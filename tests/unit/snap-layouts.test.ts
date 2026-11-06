// 上端の中央へのドラッグでのレイアウトの雛形（Snap Layouts 相当）の区画の計算の単体テスト。
// FR-305 AC-860 AC-861 AC-867 / FR-152 AC-793（上端の中央の命中範囲）
import { describe, expect, it } from 'vitest';
import {
  LAYOUTS, LAYOUT_DWELL_MS, LAYOUT_EDGE_PX, LAYOUT_HIT_FRACTION,
  availableLayouts, isTopCenterHit, layoutBase, layoutFits, layoutZones, remainingZones, zoneFractions, zoneLabel, zoneNames,
  type LayoutId, type Rect,
} from '../../src/workspace/snapLayouts';
import { MIN_WINDOW_H, MIN_WINDOW_W } from '../../src/workspace/windowLimits';

const IDS: LayoutId[] = [1, 2, 3, 4, 5, 6, 7, 8];
const inter = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const inside = (r: Rect, base: Rect) =>
  r.x >= base.x - 1e-9 && r.y >= base.y - 1e-9 && r.x + r.w <= base.x + base.w + 1e-9 && r.y + r.h <= base.y + base.h + 1e-9;

/** 区画が互いに重ならず、雛形を当てる矩形の内側にあって、面積の和が矩形と一致する */
function expectTiles(zones: Rect[], base: Rect, label: string) {
  for (let i = 0; i < zones.length; i++) {
    expect(inside(zones[i]!, base), `${label}: 区画 ${i + 1} が外にはみ出す`).toBe(true);
    expect(zones[i]!.w, `${label}: 区画 ${i + 1} の幅`).toBeGreaterThan(0);
    expect(zones[i]!.h, `${label}: 区画 ${i + 1} の高さ`).toBeGreaterThan(0);
    for (let j = i + 1; j < zones.length; j++) expect(inter(zones[i]!, zones[j]!), `${label}: 区画 ${i + 1}・${j + 1} が重なる`).toBe(0);
  }
  const sum = zones.reduce((s, z) => s + z.w * z.h, 0);
  expect(Math.abs(sum - base.w * base.h), `${label}: 面積の和が矩形と一致しない（隙間）`).toBeLessThan(1e-6);
}

describe('FR-305 AC-860 雛形 8 種の区画', () => {
  it('FR-305 AC-860 雛形は ①〜⑧ の順で 8 種、区画の数と並び（左の列→右の列、上→下）が要求どおり', () => {
    expect(LAYOUTS.map((l) => l.id)).toEqual(IDS);
    expect(IDS.map((id) => zoneFractions(id).length)).toEqual([2, 2, 2, 3, 3, 4, 3, 3]);
    // ① 左 1/2・右 1/2
    expect(zoneFractions(1)).toEqual([{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }]);
    // ② 左 2/3・右 1/3、③ 左 1/3・右 2/3
    expect(zoneFractions(2)[0]!.w).toBeCloseTo(2 / 3);
    expect(zoneFractions(3)[0]!.w).toBeCloseTo(1 / 3);
    // ④ 左 1/2・右を上下 2 段（区画 2 が右上、3 が右下）
    expect(zoneFractions(4)).toEqual([{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }]);
    // ⑤ 左を上下 2 段・右 1/2
    expect(zoneFractions(5)).toEqual([{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 1 }]);
    // ⑥ 2×2（左上・左下・右上・右下）
    expect(zoneFractions(6)).toEqual([
      { x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ]);
    // ⑦ 3 列等分、⑧ 1/4・1/2・1/4
    expect(zoneFractions(7).map((z) => z.w).reduce((a, b) => a + b)).toBeCloseTo(1);
    expect(zoneFractions(8).map((z) => z.w)).toEqual([0.25, 0.5, 0.25]);
  });

  it('FR-305 AC-860 幅 PARAM-029 相当〜3840 px（端数の幅・高さ）のすべてで、区画は重ならず隙間なく覆い内側にある（端数は最後の区画）', () => {
    const widths = [360, 361, 719, 1079, 1080, 1281, 1439, 1440, 1599, 1919, 2561, 3839, 3840];
    const heights = [240, 479, 480, 481, 899, 1186.25, 1399, 1400, 1401, 2160];
    for (const w of widths) for (const h of heights) {
      const base: Rect = { x: 13, y: 7.5, w, h };
      for (const id of IDS) {
        const zones = layoutZones(id, base);
        expectTiles(zones, base, `雛形 ${id} ${w}×${h}`);
        // 端数の画素は最後の区画が吸収する: 最後以外の区画の境界は整数の画素
        zones.slice(0, -1).forEach((z) => { expect(Number.isInteger(z.w)).toBe(true); });
      }
    }
  });

  it('FR-305 AC-860 ピン止めがあると、作業領域からピン止めを除いた最大の空き矩形（同じ面積なら上、次に左）に当て、どの区画もピン止めと重ならない', () => {
    const area: Rect = { x: 0, y: 0, w: 1600, h: 1000 };
    // ピン止めなし: 作業領域そのもの
    expect(layoutBase(area, [])).toEqual(area);
    // 右の帯をピン止め: 左の残り
    const right: Rect = { x: 1200, y: 0, w: 400, h: 1000 };
    expect(layoutBase(area, [right])).toEqual({ x: 0, y: 0, w: 1200, h: 1000 });
    // 左上の角をピン止め: 右の帯（1200×1000）と下の帯（1600×700）を比べて大きい方
    const tl: Rect = { x: 0, y: 0, w: 400, h: 300 };
    expect(layoutBase(area, [tl])).toEqual({ x: 400, y: 0, w: 1200, h: 1000 });
    const tlWide: Rect = { x: 0, y: 0, w: 800, h: 200 };
    expect(layoutBase(area, [tlWide])).toEqual({ x: 0, y: 200, w: 1600, h: 800 });
    // 同じ面積なら上: 中央の横帯をピン止めすると、上下の帯が同じ面積 → 上
    const band: Rect = { x: 0, y: 450, w: 1600, h: 100 };
    expect(layoutBase(area, [band])).toEqual({ x: 0, y: 0, w: 1600, h: 450 });
    // 同じ面積で同じ高さなら左: 中央の縦帯
    const col: Rect = { x: 750, y: 0, w: 100, h: 1000 };
    expect(layoutBase(area, [col])).toEqual({ x: 0, y: 0, w: 750, h: 1000 });
    // 2 つのピン止め（右上・左下）でも、どの区画もピン止めと重ならない
    const pins: Rect[] = [{ x: 1300, y: 0, w: 300, h: 400 }, { x: 0, y: 800, w: 500, h: 200 }];
    const base = layoutBase(area, pins)!;
    expect(base).not.toBeNull();
    for (const p of pins) expect(inter(base, p)).toBe(0);
    for (const id of IDS) for (const z of layoutZones(id, base)) for (const p of pins) expect(inter(z, p)).toBe(0);
    // 作業領域の外のピン止めは数えない。全面のピン止めなら空きなし
    expect(layoutBase(area, [{ x: 2000, y: 0, w: 100, h: 100 }])).toEqual(area);
    expect(layoutBase(area, [area])).toBeNull();
  });

  it('FR-305 AC-860 区画の名前は「<雛形名> の<区画名>」で、雛形ごとに区画の数だけある', () => {
    for (const id of IDS) expect(zoneNames(id)).toHaveLength(zoneFractions(id).length);
    expect(zoneLabel(1, 1)).toBe('左 1/2・右 1/2 の左');
    expect(zoneLabel(6, 4)).toMatch(/の右下$/);
  });
});

describe('FR-305 AC-861 狭い作業領域で成り立つ雛形だけを示す', () => {
  it('FR-305 AC-861 全区画が PARAM-134×PARAM-135 以上の雛形だけを ①〜⑧ の順で返し、1 つもなければ空', () => {
    expect(MIN_WINDOW_W).toBe(360);
    expect(MIN_WINDOW_H).toBe(240);
    expect(availableLayouts({ w: 1600, h: 1000 })).toEqual(IDS);
    // 幅 1440 未満: ⑧（1/4 が 360 未満）が消える
    expect(availableLayouts({ w: 1439, h: 1000 })).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // 幅 1080 未満: ②・③・⑦（1/3 が 360 未満）も消える
    expect(availableLayouts({ w: 1079, h: 1000 })).toEqual([1, 4, 5, 6]);
    // 高さ 480 未満: 上下 2 段の ④・⑤・⑥ が消える
    expect(availableLayouts({ w: 1600, h: 479 })).toEqual([1, 2, 3, 7, 8]);
    // 幅 720 未満: 1 つも成り立たない（FR-152 の上端の最大化に従う）
    expect(availableLayouts({ w: 719, h: 1000 })).toEqual([]);
    expect(availableLayouts({ w: 1600, h: 239 })).toEqual([]);
    expect(layoutFits(1, { w: 720, h: 240 })).toBe(true);
  });
});

describe('FR-305 AC-867 / FR-152 AC-793 上端の中央の命中範囲', () => {
  const area = { left: 100, top: 50, width: 1000, height: 800 };
  it('FR-305 AC-867 PARAM-042=32px・PARAM-143=40%・PARAM-144=300ms', () => {
    expect(LAYOUT_EDGE_PX).toBe(32);
    expect(LAYOUT_HIT_FRACTION).toBe(0.4);
    expect(LAYOUT_DWELL_MS).toBe(300);
  });
  it('FR-152 AC-793 上端から 32px 以内で中央 40% の幅だけが雛形の命中範囲。その外の上端は最大化のまま', () => {
    expect(isTopCenterHit(600, 66, area)).toBe(true);
    expect(isTopCenterHit(400, 60, area)).toBe(true); // 左の境界（中央 600 − 200）
    expect(isTopCenterHit(800, 60, area)).toBe(true); // 右の境界
    expect(isTopCenterHit(399, 60, area)).toBe(false);
    expect(isTopCenterHit(801, 60, area)).toBe(false);
    expect(isTopCenterHit(250, 52, area)).toBe(false); // 上端の左寄り（最大化）
    expect(isTopCenterHit(600, 83, area)).toBe(false); // 上端から 32px を超える
    expect(isTopCenterHit(600, 40, area)).toBe(false); // 作業領域の外
    expect(isTopCenterHit(600, 60, { ...area, width: 0 })).toBe(false);
  });
  it('FR-305 AC-864 順次の埋めの区画は、置いた区画を除いて左の列→右の列、上→下の順', () => {
    expect(remainingZones(6, 1)).toEqual([2, 3, 4]);
    expect(remainingZones(6, 3)).toEqual([1, 2, 4]);
    expect(remainingZones(1, 2)).toEqual([1]);
  });
});
