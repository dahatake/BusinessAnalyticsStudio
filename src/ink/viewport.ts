// 無限キャンバスの視点（パン/ズーム/全体表示）の純粋な計算。FR-086
// 視点は「画面の左上に来るワールド座標 (x, y)」と倍率 zoom。画面の座標 = (ワールド − (x, y)) × zoom。
import type { Bounds, ViewState } from './model';

export const INK_MIN_ZOOM = 0.01;
export const INK_MAX_ZOOM = 10;

export const clampInkZoom = (z: number): number => Math.min(INK_MAX_ZOOM, Math.max(INK_MIN_ZOOM, z));

export const screenToWorld = (v: ViewState, sx: number, sy: number): { x: number; y: number } => ({ x: sx / v.zoom + v.x, y: sy / v.zoom + v.y });
export const worldToScreen = (v: ViewState, wx: number, wy: number): { x: number; y: number } => ({ x: (wx - v.x) * v.zoom, y: (wy - v.y) * v.zoom });

/** 画面の移動量（ピクセル）だけ、視点をパンする。 */
export const panView = (v: ViewState, dxScreen: number, dyScreen: number): ViewState => ({ ...v, x: v.x - dxScreen / v.zoom, y: v.y - dyScreen / v.zoom });

/** 画面上の点 (sx, sy) を動かさずに倍率を変える。 */
export function zoomView(v: ViewState, factor: number, sx: number, sy: number): ViewState {
  const zoom = clampInkZoom(v.zoom * factor);
  const w = screenToWorld(v, sx, sy);
  return { zoom, x: w.x - sx / zoom, y: w.y - sy / zoom };
}

/** 表示領域 (w × h) に見えているワールドの範囲。 */
export const visibleBounds = (v: ViewState, w: number, h: number): Bounds => ({ x: v.x, y: v.y, w: w / v.zoom, h: h / v.zoom });

/** 全体表示: 範囲 b が余白 pad（ピクセル）を残して表示領域に収まる視点。範囲がなければ原点・100%。 */
export function fitView(b: Bounds | null, w: number, h: number, pad = 48): ViewState {
  if (!b || w <= 0 || h <= 0) return { x: 0, y: 0, zoom: 1 };
  const availW = Math.max(1, w - pad * 2), availH = Math.max(1, h - pad * 2);
  const zx = b.w > 0 ? availW / b.w : Infinity;
  const zy = b.h > 0 ? availH / b.h : Infinity;
  // 1 点や 1 本の直線のような小さな範囲を、極端に拡大しない
  const zoom = clampInkZoom(Math.min(zx, zy, 2));
  return { zoom, x: b.x + b.w / 2 - w / zoom / 2, y: b.y + b.h / 2 - h / zoom / 2 };
}

/** ワールドの点 (wx, wy) が表示領域の中央に来る視点。 */
export const centerOn = (v: ViewState, wx: number, wy: number, w: number, h: number): ViewState => ({
  ...v, x: wx - w / v.zoom / 2, y: wy - h / v.zoom / 2,
});
