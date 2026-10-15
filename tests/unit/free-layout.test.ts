// FR-184 AC-390（押し出し・再配置の純粋なモデル）、FR-173 AC-348（作業領域の外へ出ない）。
import { describe, expect, it } from 'vitest';
import { clampInto, hasOverlap, packGrid, placeNew, resolveOverlaps, type PxMap } from '../../src/workspace/freeLayout';

const B = { w: 1000, h: 800 };
/** 2 x 2 の格子（作業領域を隙間なく埋める既定の配置） */
const grid = (): PxMap => ({
  a: { x: 0, y: 0, w: 500, h: 400 }, b: { x: 500, y: 0, w: 500, h: 400 },
  c: { x: 0, y: 400, w: 500, h: 400 }, d: { x: 500, y: 400, w: 500, h: 400 },
});

describe('FR-184 AC-390 押し出し', () => {
  // FR-184 AC-390
  it('FR-184 AC-390 a を b の中央へ置くと、すべてのコンポーネントが重ならない（b は動く）', () => {
    const before = grid();
    const r = resolveOverlaps({ ...before, a: { x: 350, y: 100, w: 500, h: 400 } }, 'a', B);
    expect(hasOverlap(r)).toBe(false);
    expect(r.a).toEqual({ x: 350, y: 100, w: 500, h: 400 });
    expect(r.b!.x !== before.b!.x || r.b!.y !== before.b!.y || r.b!.w !== before.b!.w).toBe(true);
  });

  // FR-184 AC-390
  it('FR-184 AC-390 どの位置へ置いても（連続して置いても）重なりが残らず、作業領域の外へ出ない', () => {
    let cur = grid();
    const keys = Object.keys(cur);
    for (let i = 0; i < 40; i++) {
      const k = keys[i % keys.length]!;
      const t = { x: (i * 137) % 700, y: (i * 91) % 500, w: cur[k]!.w, h: cur[k]!.h };
      cur = resolveOverlaps({ ...cur, [k]: t }, k, B);
      // 置いたものは、置いた位置（領域内に収めたもの）から動かない
      expect(cur[k], `${i} 回目に置いた位置`).toEqual(clampInto(t, B));
      expect(hasOverlap(cur), `${i} 回目`).toBe(false);
      for (const r of Object.values(cur)) {
        expect(r.x).toBeGreaterThanOrEqual(-0.5);
        expect(r.y).toBeGreaterThanOrEqual(-0.5);
        expect(r.x + r.w).toBeLessThanOrEqual(B.w + 0.5);
        expect(r.y + r.h).toBeLessThanOrEqual(B.h + 0.5);
      }
    }
  });

  // FR-184 AC-390
  it('FR-184 AC-390 重なりがなければ、ほかは動かない。入力は変えない', () => {
    const before = grid();
    const copy = JSON.parse(JSON.stringify(before));
    const r = resolveOverlaps(before, 'a', B);
    expect(r).toEqual(before);
    expect(before).toEqual(copy);
  });

  // FR-184 AC-390
  it('FR-184 AC-390 空きがあれば、押し出されたものは平行移動だけで動き、大きさは変わらない', () => {
    const r = resolveOverlaps({ a: { x: 100, y: 100, w: 300, h: 300 }, b: { x: 200, y: 150, w: 300, h: 300 } }, 'a', B);
    expect(hasOverlap(r)).toBe(false);
    expect(r.b!.w).toBe(300);
    expect(r.b!.h).toBe(300);
  });

  // FR-184 AC-390
  it('FR-184 AC-390 解けない詰まり方でも、格子に並べ直して重なりを残さない', () => {
    const r = packGrid({ a: { x: 0, y: 0, w: 900, h: 700 }, b: { x: 10, y: 10, w: 900, h: 700 }, c: { x: 20, y: 20, w: 900, h: 700 } }, B);
    expect(hasOverlap(r)).toBe(false);
    expect(Object.keys(r).sort()).toEqual(['a', 'b', 'c']);
  });

  // FR-184 AC-390
  it('FR-184 AC-390 新しく現れたコンポーネントは空きへ置かれ、ほかと重ならない', () => {
    const r = placeNew({ a: { x: 0, y: 0, w: 500, h: 800 } }, 'n', { w: 300, h: 300 }, B);
    expect(hasOverlap(r)).toBe(false);
    expect(r.n!.x).toBeGreaterThanOrEqual(500);
  });
});

describe('FR-173 AC-348 作業領域の内側', () => {
  // FR-173 AC-348
  it('FR-173 AC-348 領域の外へ置こうとしても、内側に収まる', () => {
    expect(clampInto({ x: 900, y: 700, w: 300, h: 300 }, B)).toEqual({ x: 700, y: 500, w: 300, h: 300 });
    expect(clampInto({ x: -50, y: -50, w: 100, h: 100 }, B)).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
});
