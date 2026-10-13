// 3D のキャンバスの位置と大きさ（FR-020）。可視判定の投影（twinProbe）と、ホームの縦横比（cameraRig）が読む。
// キャンバスが非表示（大きさが 0）のときは、最後に測れた大きさを使う（次に開いたときに同じ画角になる）。
export interface ViewportRect { left: number; top: number; width: number; height: number }

type CanvasLike = Pick<HTMLElement, 'getBoundingClientRect'> & Partial<Pick<HTMLElement, 'scrollIntoView'>>;
let canvasEl: CanvasLike | null = null;
let areaEl: CanvasLike | null = null;
let lastRect: ViewportRect = { left: 0, top: 0, width: 960, height: 540 };

/** 3D のキャンバスを登録する（解除は null） */
export function registerSceneCanvas(el: CanvasLike | null): void {
  canvasEl = el;
}

/**
 * 3D の表示領域（キャンバスを収める枠）を登録する（解除は null）。キャンバスは描画の初期化まで作られないので、
 * それまで（画面を開いた直後・大きさを変えて作り直された直後）は、この枠の位置と大きさを使う（FR-146）。
 */
export function registerSceneArea(el: CanvasLike | null): void {
  areaEl = el;
}

function usable(el: CanvasLike | null): el is CanvasLike {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 8 && r.height > 8;
}
function target(): CanvasLike | null {
  return usable(canvasEl) ? canvasEl : usable(areaEl) ? areaEl : null;
}

/**
 * キャンバスが画面（ウィンドウ）の外にあるとき、見える位置までスクロールする（FR-146 AC-244）。
 * ウィンドウの大きさを変えた直後に配置が変わり、キャンバスが画面の下に出ることがある。クリックできる点を返すために使う。
 */
export function ensureCanvasInView(win: { width: number; height: number } = { width: window.innerWidth, height: window.innerHeight }): boolean {
  const el = target();
  if (!el?.scrollIntoView) return false;
  const r = el.getBoundingClientRect();
  const inView = r.left >= 0 && r.top >= 0 && r.right <= win.width && r.bottom <= win.height;
  if (inView) return false;
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  return true;
}

export function viewportRect(): ViewportRect {
  const el = target();
  if (el) {
    const r = el.getBoundingClientRect();
    lastRect = { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  return lastRect;
}

/** 描画面（R3F の内部の大きさ・カメラの縦横比）を、今の表示領域に合わせる処理を登録する（解除は null） */
let resizer: (() => void) | null = null;
export function registerSceneResizer(fn: () => void): () => void {
  resizer = fn;
  return () => { if (resizer === fn) resizer = null; };
}
/** 座標を返す前などに、描画面の大きさを今の表示領域へ即座に合わせる（FR-146） */
export function flushSceneSize(): void {
  resizer?.();
}

/**
 * 表示領域の大きさに合わせて描画面を更新する必要があるか（FR-146 AC-243）。
 * 表示領域が 0（非表示）のときは更新しない。差が許容差（PARAM-036。既定 1 CSS px）を超えたら更新する。
 */
export function needsResize(current: { width: number; height: number }, area: { width: number; height: number }, tol = 1): boolean {
  if (!(area.width > 0 && area.height > 0)) return false;
  return Math.abs(current.width - area.width) > tol || Math.abs(current.height - area.height) > tol;
}

/** キャンバスの縦横比（幅/高さ） */
export function viewportAspect(): number {
  const r = viewportRect();
  return r.width / r.height;
}

/** 描画面の中身の大きさの変更をまとめる時間（ミリ秒） */
export const RESIZE_SETTLE_MS = 50; // PARAM-037（1 秒）に、重い描画で塞がれても収まる短さ（60ms 以下）

/**
 * R3F 自身の大きさの測定への通知。最初の 1 回だけ通す（描画面と中身をすぐ作る）。
 * 以降の大きさの追従は SizeSync が担う。R3F 側でも setSize すると、ソフトウェア GL では重い描画が二重になり、
 * 画面が塞がって追従が遅れるため（FR-146 AC-243、PARAM-037）。
 */
export class SettlingResizeObserver {
  private readonly ro: ResizeObserver;
  private first = true;
  constructor(cb: ResizeObserverCallback) {
    this.ro = new ResizeObserver((entries) => {
      if (!this.first) return;
      this.first = false;
      cb(entries, this as unknown as ResizeObserver);
    });
  }
  observe(target: Element, options?: ResizeObserverOptions): void { this.ro.observe(target, options); }
  unobserve(target: Element): void { this.ro.unobserve(target); }
  disconnect(): void { this.ro.disconnect(); }
}
