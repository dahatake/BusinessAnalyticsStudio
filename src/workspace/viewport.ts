// キャンバスの視点（パン/ズーム）の純粋な計算（FR-012）。
export interface Viewport { x: number; y: number; zoom: number }

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;
export const PAN_STEP = 80;
export const ZOOM_STEP = 1.2;

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** 画面上の点 (px, py) を動かさずに倍率を変える。 */
export function zoomAt(v: Viewport, factor: number, px: number, py: number): Viewport {
  const zoom = clampZoom(v.zoom * factor);
  const k = zoom / v.zoom;
  return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
}

export const panBy = (v: Viewport, dx: number, dy: number): Viewport => ({ ...v, x: v.x + dx, y: v.y + dy });

/** ワールド座標の点 (wx, wy) が、表示領域 (w × h) の中央に来る視点。 */
export function centerOn(v: Viewport, wx: number, wy: number, w: number, h: number): Viewport {
  return { zoom: v.zoom, x: w / 2 - wx * v.zoom, y: h / 2 - wy * v.zoom };
}

/** ワールド座標の点が、表示領域の中央から許容内にあるか。 */
export function isCenteredOn(v: Viewport, wx: number, wy: number, w: number, h: number, tol = 4): boolean {
  return Math.abs(v.x + wx * v.zoom - w / 2) <= tol && Math.abs(v.y + wy * v.zoom - h / 2) <= tol;
}

/** キーボード操作 → 新しい視点（対応しないキーは null）。 */
export function keyViewport(v: Viewport, key: string, w: number, h: number): Viewport | null {
  switch (key) {
    case 'ArrowLeft': return panBy(v, PAN_STEP, 0);
    case 'ArrowRight': return panBy(v, -PAN_STEP, 0);
    case 'ArrowUp': return panBy(v, 0, PAN_STEP);
    case 'ArrowDown': return panBy(v, 0, -PAN_STEP);
    case '+': case '=': return zoomAt(v, ZOOM_STEP, w / 2, h / 2);
    case '-': case '_': return zoomAt(v, 1 / ZOOM_STEP, w / 2, h / 2);
    default: return null;
  }
}

/** 議題カードの配置（章を行、議題を列とする格子）。 */
export const CARD_W = 260;
export const CARD_H = 120;
export const GAP_X = 60;
export const GAP_Y = 60;

export function cardOrigin(chapterIndex: number, topicIndex: number): { x: number; y: number } {
  return { x: topicIndex * (CARD_W + GAP_X), y: chapterIndex * (CARD_H + GAP_Y) };
}
