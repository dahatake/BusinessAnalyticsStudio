// FR-146 AC-243 3D の描画面を表示領域の大きさへ追従させる判定（needsResize）の単体テスト。
// 画面での確認（開いた直後・大きさの変更直後の一致、クリックの当たり）は System Test（E2E-128・223・224）が行う。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESIZE_SETTLE_MS, SettlingResizeObserver, ensureCanvasInView, needsResize, registerSceneCanvas } from '../../src/three/sceneViewport';

// FR-146 AC-243 表示領域の大きさの通知は、最初の 1 回はすぐ、以降は止まってから 1 回にまとめる（150ms）
describe('FR-146 AC-243 SettlingResizeObserver', () => {
  let fire: (entries: unknown[]) => void = () => {};
  let disconnected = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    disconnected = 0;
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: (e: unknown[]) => void) { fire = cb; }
      observe() {}
      unobserve() {}
      disconnect() { disconnected += 1; }
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('最初の通知だけ通し、続く通知は通さない（追従は SizeSync が行う）', () => {
    const cb = vi.fn();
    new SettlingResizeObserver(cb as never);
    fire([1]);
    expect(cb).toHaveBeenCalledTimes(1);
    fire([2]); fire([3]);
    vi.advanceTimersByTime(RESIZE_SETTLE_MS * 4);
    expect(cb).toHaveBeenCalledTimes(1);
  });
  it('まとめる時間は 60ms 以下（PARAM-037 の 1 秒に確実に収める）', () => {
    expect(RESIZE_SETTLE_MS).toBeLessThanOrEqual(60);
  });
  it('解除すると、元の監視も解除される', () => {
    const cb = vi.fn();
    const o = new SettlingResizeObserver(cb as never);
    fire([1]); fire([2]);
    o.disconnect();
    vi.advanceTimersByTime(RESIZE_SETTLE_MS * 2);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(disconnected).toBe(1);
  });
});

// FR-146 AC-244 ウィンドウの大きさを変えた直後に、キャンバスが画面の外にあるときは見える位置までスクロールする
describe('FR-146 AC-244 ensureCanvasInView', () => {
  const fake = (rect: { left: number; top: number; width: number; height: number }) => {
    let scrolled = 0;
    return {
      el: {
        getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }) as DOMRect,
        scrollIntoView: () => { scrolled += 1; },
      },
      count: () => scrolled,
    };
  };
  it('画面の中にあるときはスクロールしない', () => {
    const f = fake({ left: 100, top: 100, width: 600, height: 320 });
    registerSceneCanvas(f.el);
    expect(ensureCanvasInView({ width: 1000, height: 650 })).toBe(false);
    expect(f.count()).toBe(0);
    registerSceneCanvas(null);
  });
  it('画面の下に出ているときは、見える位置までスクロールする', () => {
    const f = fake({ left: 236, top: 2632, width: 748, height: 320 });
    registerSceneCanvas(f.el);
    expect(ensureCanvasInView({ width: 1000, height: 650 })).toBe(true);
    expect(f.count()).toBe(1);
    registerSceneCanvas(null);
  });
  it('非表示（大きさが 0）のときは何もしない', () => {
    const f = fake({ left: 0, top: 5000, width: 0, height: 0 });
    registerSceneCanvas(f.el);
    expect(ensureCanvasInView({ width: 1000, height: 650 })).toBe(false);
    registerSceneCanvas(null);
  });
});

describe('FR-146 AC-243 needsResize', () => {
  it('既定の 300×150 のままで、表示領域が大きければ更新が要る', () => {
    expect(needsResize({ width: 300, height: 150 }, { width: 960, height: 540 })).toBe(true);
  });
  it('許容差（1 CSS px）以内なら更新しない', () => {
    expect(needsResize({ width: 960.5, height: 540 }, { width: 960, height: 540.4 })).toBe(false);
  });
  it('許容差を超えたら、小さくなったときも大きくなったときも更新する', () => {
    expect(needsResize({ width: 960, height: 540 }, { width: 900, height: 600 })).toBe(true);
    expect(needsResize({ width: 900, height: 600 }, { width: 1400, height: 900 })).toBe(true);
  });
  it('表示領域が 0（非表示）のときは更新しない', () => {
    expect(needsResize({ width: 300, height: 150 }, { width: 0, height: 0 })).toBe(false);
    expect(needsResize({ width: 300, height: 150 }, { width: 800, height: 0 })).toBe(false);
  });
});
