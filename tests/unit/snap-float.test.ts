// 自由配置（作業領域に対する絶対配置）でのスナップ・最大化・共有境界のリサイズの単体・結合テスト。
// FR-152 AC-265 AC-266 AC-794 AC-795 / FR-184 AC-390（重ならない配置に限る。自由な移動は FR-173 で重なりを許す）
import { describe, expect, it, vi } from 'vitest';
import { overlapArea, type PxMap, type PxRect } from '../../src/workspace/freeLayout';
import { minBorderSize, moveBorder, planSnap, remainingRegion, sharedBorders } from '../../src/workspace/snapFloat';
import { snapKindsFor, snapRect } from '../../src/workspace/snap';
import { paneCommands } from '../../src/workspace/paneCommands';
import type { PaneInfo } from '../../src/workspace/PaneContext';

const B = { w: 1200, h: 800 };
/** 初期配置: 左に 2 段（a・c）、右に 2 つ（b・d）。重ならない */
const INIT: PxMap = {
  a: { x: 0, y: 0, w: 600, h: 400 },
  c: { x: 0, y: 400, w: 600, h: 400 },
  b: { x: 600, y: 0, w: 600, h: 400 },
  d: { x: 600, y: 400, w: 600, h: 400 },
};
const half = (kind: 'left' | 'right' | 'top' | 'bottom', opts = {}): PxRect => {
  const r = snapRect({ left: 0, top: 0, width: B.w, height: B.h }, kind, opts);
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};
const pairs = (m: PxMap): Array<[string, string]> => {
  const ks = Object.keys(m);
  const out: Array<[string, string]> = [];
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) out.push([ks[i]!, ks[j]!]);
  return out;
};
const expectNoOverlap = (m: PxMap): void => {
  for (const [p, q] of pairs(m)) expect(overlapArea(m[p]!, m[q]!), `${p} と ${q} が重なる`).toBeLessThanOrEqual(1);
};

describe('FR-152 AC-265 スナップの配置は重ならない（自由配置）', () => {
  // FR-152 AC-265
  it.each(['left', 'right', 'top', 'bottom'] as const)('FR-152 AC-265 %s へスナップすると、置いたものはその領域いっぱいで、ほかと重ならず、落ちない', (kind) => {
    const t = half(kind);
    const out = planSnap(INIT, 'a', t, B)!;
    expect(out).not.toBeNull();
    expect(out.a).toEqual(t);
    expect(Object.keys(out).sort()).toEqual(['a', 'b', 'c', 'd']);
    expectNoOverlap(out);
    for (const r of Object.values(out)) {
      expect(r.x).toBeGreaterThanOrEqual(-0.01);
      expect(r.y).toBeGreaterThanOrEqual(-0.01);
      expect(r.x + r.w).toBeLessThanOrEqual(B.w + 0.01);
      expect(r.y + r.h).toBeLessThanOrEqual(B.h + 0.01);
    }
  });

  // FR-152 AC-265
  it('FR-152 AC-265 入力は変えない（ドラッグを取りやめても配置は変わらない）', () => {
    const before = JSON.stringify(INIT);
    planSnap(INIT, 'b', half('left'), B);
    expect(JSON.stringify(INIT)).toBe(before);
  });

  // FR-152 AC-265
  it('FR-152 AC-265 左半分と右半分に続けて置いても、すべてが重ならず、1 つも非表示にならない', () => {
    const first = planSnap(INIT, 'a', half('left'), B, { anchors: new Set() })!;
    const second = planSnap(first, 'b', half('right'), B, { anchors: new Set(['a']) })!;
    expect(second).not.toBeNull();
    expect(Object.keys(second).sort()).toEqual(['a', 'b', 'c', 'd']);
    expectNoOverlap(second);
    // a と b は隣り合う（共有する境界がある）
    const borders = sharedBorders(Object.fromEntries(Object.entries(second).map(([k, r]) => [k, { x: r.x / B.w, y: r.y / B.h, w: r.w / B.w, h: r.h / B.h }])));
    expect(borders.some((bd) => bd.dir === 'v' && bd.before.includes('a') && bd.after.includes('b'))).toBe(true);
  });

  // FR-184 AC-390（A-75）
  it('FR-184 AC-390 スナップに関係しない重なりは維持され、置いた領域とそれ以外は重ならない', () => {
    const input: PxMap = {
      a: { x: 0, y: 0, w: 200, h: 200 },
      c: { x: 0, y: 500, w: 300, h: 200 },
      e: { x: 50, y: 550, w: 300, h: 200 }, // c と e は重なっている（自由配置）
      d: { x: 700, y: 300, w: 300, h: 200 },
      b: { x: 900, y: 0, w: 250, h: 250 },
    };
    const out = planSnap(input, 'b', half('right'), B)!;
    expect(out.b).toEqual(half('right'));
    for (const k of ['a', 'c', 'd', 'e']) expect(overlapArea(out.b!, out[k]!), `${k}`).toBeLessThanOrEqual(1);
    expect(overlapArea(out.c!, out.e!)).toBeGreaterThan(1000);
  });

  // FR-216（ピン止め）
  it('FR-152 AC-265 ピン止めしたものがある領域には置けず（null）、ピン止めしたものは動かない', () => {
    expect(planSnap(INIT, 'a', half('right'), B, { fixed: new Set(['b']) })).toBeNull();
    const out = planSnap(INIT, 'a', half('left'), B, { fixed: new Set(['d']) })!;
    expect(out.d).toEqual(INIT.d);
  });
});

describe('FR-152 AC-794 スナップ直後に、残った領域を埋める候補', () => {
  // FR-152 AC-794
  it.each([
    ['left', { x: 0.5, y: 0, w: 0.5, h: 1 }],
    ['right', { x: 0, y: 0, w: 0.5, h: 1 }],
    ['top', { x: 0, y: 0.5, w: 1, h: 0.5 }],
    ['bottom', { x: 0, y: 0, w: 1, h: 0.5 }],
  ] as const)('FR-152 AC-794 %s にスナップしたあとの残りの領域', (kind, rect) => {
    expect(remainingRegion(kind)).toEqual(rect);
  });

  // FR-152 AC-794
  it('FR-152 AC-794 最大化・タブ化には残りの領域がない（候補を出さない）', () => {
    expect(remainingRegion('maximize')).toBeNull();
    expect(remainingRegion('tabs')).toBeNull();
  });

  // FR-152 AC-794
  it('FR-152 AC-794 残りの領域へ 1 つ選ぶと、その領域いっぱいに配置され、先にスナップしたものは動かない', () => {
    const two: PxMap = { a: { x: 0, y: 0, w: 400, h: 300 }, b: { x: 700, y: 400, w: 400, h: 300 } };
    const snapped = planSnap(two, 'a', half('left'), B)!;
    const r = remainingRegion('left')!;
    const target: PxRect = { x: r.x * B.w, y: r.y * B.h, w: r.w * B.w, h: r.h * B.h };
    const filled = planSnap(snapped, 'b', target, B, { anchors: new Set(['a']) })!;
    expect(filled.b).toEqual(target);
    expect(filled.a).toEqual(snapped.a);
    expectNoOverlap(filled);
  });

  // FR-152 AC-794（選ばずに閉じる: 配置を変える操作を呼ばなければ、入力はそのまま）
  it('FR-152 AC-794 選ばずに閉じても配置は変わらない（計算は入力を変えない）', () => {
    const snapped = planSnap(INIT, 'a', half('left'), B)!;
    const copy = JSON.parse(JSON.stringify(snapped));
    remainingRegion('left');
    expect(snapped).toEqual(copy);
  });
});

describe('FR-152 AC-795 最大化・スナップの引き離しと復元', () => {
  class MemoryStorage {
    private m = new Map<string, string>();
    get length() { return this.m.size; }
    key(i: number) { return [...this.m.keys()][i] ?? null; }
    getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
    setItem(k: string, v: string) { this.m.set(k, String(v)); }
    removeItem(k: string) { this.m.delete(k); }
    clear() { this.m.clear(); }
  }

  // FR-152 AC-795
  it('FR-152 AC-795 最大化して解除しても、ほかのコンポーネントの配置（自由配置）は元のまま', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.resetModules();
    const { useLayout } = await import('../../src/store/layout');
    const st = useLayout.getState();
    const floats = { a: { x: 0, y: 0, w: 0.5, h: 0.5 }, b: { x: 0.5, y: 0, w: 0.5, h: 0.5 }, c: { x: 0, y: 0.5, w: 1, h: 0.5 } };
    st.setFloats(floats);
    const before = JSON.stringify(useLayout.getState().floats[useLayout.getState().persona]);
    st.setMaximized('a');
    expect(useLayout.getState().maximized).toBe('a');
    expect(JSON.stringify(useLayout.getState().floats[useLayout.getState().persona])).toBe(before);
    st.setMaximized(null);
    expect(useLayout.getState().maximized).toBeNull();
    expect(JSON.stringify(useLayout.getState().floats[useLayout.getState().persona])).toBe(before);
    vi.unstubAllGlobals();
  });
});

describe('FR-152 AC-796 共有する境界のリサイズ（モデル）', () => {
  const R = { a: { x: 0, y: 0, w: 0.5, h: 1 }, b: { x: 0.5, y: 0, w: 0.5, h: 1 } };

  // FR-152 AC-796
  it('FR-152 AC-796 左右に隣り合う 2 つの共有する境界が 1 つ見つかる', () => {
    const bs = sharedBorders(R);
    expect(bs).toHaveLength(1);
    expect(bs[0]).toMatchObject({ dir: 'v', before: ['a'], after: ['b'] });
    expect(bs[0]!.pos).toBeCloseTo(0.5);
  });

  // FR-152 AC-796
  it('FR-152 AC-796 境界を動かすと両側が同時に変わり、隙間も重なりも生じない', () => {
    const out = moveBorder(R, sharedBorders(R)[0]!, 0.1, 0.1);
    expect(out.a!.w).toBeCloseTo(0.6);
    expect(out.b!.x).toBeCloseTo(0.6);
    expect(out.b!.w).toBeCloseTo(0.4);
    expect(out.a!.x + out.a!.w).toBeCloseTo(out.b!.x);
  });

  // FR-152 AC-796
  it('FR-152 AC-796 大きく動かしても、最小の大きさを下回らず、隙間も重なりも生じない', () => {
    const min = minBorderSize('v', { w: 1000, h: 800 });
    const out = moveBorder(R, sharedBorders(R)[0]!, 5, min);
    expect(out.b!.w).toBeCloseTo(min);
    expect(out.a!.x + out.a!.w).toBeCloseTo(out.b!.x);
    expect(out.b!.x + out.b!.w).toBeCloseTo(1);
    const back = moveBorder(R, sharedBorders(R)[0]!, -5, min);
    expect(back.a!.w).toBeCloseTo(min);
    expect(back.a!.x + back.a!.w).toBeCloseTo(back.b!.x);
  });

  // FR-152 AC-796
  it('FR-152 AC-796 片側に複数のコンポーネントが接するときは、すべてが同時に動く', () => {
    const rects = { a: { x: 0, y: 0, w: 0.5, h: 1 }, b: { x: 0.5, y: 0, w: 0.5, h: 0.5 }, c: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } };
    const bd = sharedBorders(rects).find((x) => x.dir === 'v')!;
    expect(bd.after.sort()).toEqual(['b', 'c']);
    const out = moveBorder(rects, bd, 0.1, 0.1);
    expect(out.b!.x).toBeCloseTo(0.6);
    expect(out.c!.x).toBeCloseTo(0.6);
    expect(out.a!.w).toBeCloseTo(0.6);
  });

  // FR-152 AC-796
  it('FR-152 AC-796 離れているもの（隙間がある）は共有する境界にならない', () => {
    expect(sharedBorders({ a: { x: 0, y: 0, w: 0.4, h: 1 }, b: { x: 0.5, y: 0, w: 0.5, h: 1 } })).toHaveLength(0);
  });
});

describe('FR-152 AC-266 ドラッグなしの手段（メニュー・キーボード・コマンド）の候補に最大化がある', () => {
  // FR-152 AC-266
  it('FR-152 AC-266 候補の一覧に「最大化」があり、コマンドで選べる', () => {
    expect(snapKindsFor(false)).toContain('maximize');
    const snapTo = vi.fn();
    const pane = { pinned: false, snapKinds: snapKindsFor(false), snapTo } as unknown as PaneInfo;
    const cmds = paneCommands(() => pane, () => undefined);
    const c = cmds.find((x) => x.id === 'pane.snap.maximize');
    expect(c, '最大化のコマンドがない').toBeTruthy();
    c!.run();
    expect(snapTo).toHaveBeenCalledWith('maximize');
  });
});
