// FR-184 AC-390（押し出し・再配置の純粋なモデル）、FR-173 AC-348（作業領域の外へ出ない）。
import { describe, expect, it } from 'vitest';
import { clampInto, hasOverlap, packGrid, placeNew, resolveAround, resolveOverlaps, type PxMap } from '../../src/workspace/freeLayout';
import { MIN_COMPONENT_WIDTH } from '../../src/workspace/autosize';

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

describe('FR-237 AC-557 格子への並べ直しでも見出しの操作が隠れない幅', () => {
  // FR-237 AC-557（FR-150 AC-259）: 低く横長の作業領域に多くのコンポーネントを並べ直しても、列の幅は最小の幅（PARAM-034）を下回らない
  it('FR-237 AC-557 低い作業領域で 12 個を格子に並べ直しても、どの幅も最小の幅以上で重ならない', () => {
    const b = { w: 1380, h: 300 };
    const rects: PxMap = {};
    for (let i = 0; i < 12; i++) rects[`k${i}`] = { x: (i % 6) * 200, y: Math.floor(i / 6) * 100, w: 300, h: 200 };
    const r = packGrid(rects, b);
    expect(Object.keys(r)).toHaveLength(12);
    expect(hasOverlap(r)).toBe(false);
    for (const [k, v] of Object.entries(r)) {
      expect(v.w, `${k} の幅`).toBeGreaterThanOrEqual(MIN_COMPONENT_WIDTH);
      expect(v.x + v.w).toBeLessThanOrEqual(b.w + 0.5);
      expect(v.y + v.h).toBeLessThanOrEqual(b.h + 0.5);
    }
  });
});

describe('FR-228 AC-529 手で変えた大きさは押し出しで上書きしない', () => {
  // FR-228 AC-529（FR-224）: ほかのコンポーネントを動かして押し出しても、手で大きさを変えたもの（keep）は大きさを保ったまま動く
  it('FR-228 AC-529 ピン止めを避けてほかを動かしても、手で大きさを変えたものの幅と高さは変わらない', () => {
    const b = { w: 1380, h: 300 };
    const start: PxMap = {
      priority: { x: 0, y: 0, w: 690, h: 146.34 },
      ranking: { x: 698, y: 0, w: 414, h: 146.34 },
      matrix: { x: 0, y: 153.6, w: 384, h: 120 },
      canvas: { x: 422, y: 153.6, w: 240, h: 109.75 },
      summary: { x: 670, y: 153.6, w: 240, h: 109.75 },
      kpi: { x: 918, y: 153.6, w: 240, h: 109.75 },
    };
    const r = resolveAround({ ...start, ranking: { x: 778, y: 60, w: 414, h: 146.34 } }, 'ranking', b, new Set(['priority']), new Set(['matrix']));
    expect(r).not.toBeNull();
    expect(hasOverlap(r!)).toBe(false);
    expect(r!.priority).toEqual(start.priority);
    expect(r!.matrix!.w).toBe(384);
    expect(r!.matrix!.h).toBe(120);
  });

  // FR-228 AC-529: 大きさを保てる場所がまったくないときだけ、従来どおり縮めて重なりを残さない
  it('FR-228 AC-529 大きさを保てる空きがなければ、縮めてでも重なりを残さない', () => {
    const b = { w: 600, h: 300 };
    const r = resolveOverlaps({ a: { x: 0, y: 0, w: 600, h: 200 }, m: { x: 0, y: 100, w: 600, h: 200 } }, 'a', b, new Set(['m']));
    expect(hasOverlap(r)).toBe(false);
    expect(Object.keys(r).sort()).toEqual(['a', 'm']);
  });
});
