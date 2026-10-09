// 3D のキャンバスの位置と大きさ（FR-020）。可視判定の投影（twinProbe）と、ホームの縦横比（cameraRig）が読む。
// キャンバスが非表示（大きさが 0）のときは、最後に測れた大きさを使う（次に開いたときに同じ画角になる）。
export interface ViewportRect { left: number; top: number; width: number; height: number }

let canvasEl: Pick<HTMLElement, 'getBoundingClientRect'> | null = null;
let lastRect: ViewportRect = { left: 0, top: 0, width: 960, height: 540 };

/** 3D のキャンバスを登録する（解除は null） */
export function registerSceneCanvas(el: Pick<HTMLElement, 'getBoundingClientRect'> | null): void {
  canvasEl = el;
}

export function viewportRect(): ViewportRect {
  if (canvasEl) {
    const r = canvasEl.getBoundingClientRect();
    if (r.width > 8 && r.height > 8) lastRect = { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  return lastRect;
}

/** キャンバスの縦横比（幅/高さ） */
export function viewportAspect(): number {
  const r = viewportRect();
  return r.width / r.height;
}
