// ペン・タッチ・マウスの統一入力（FR-087）。Pointer Events の pointerType で振り分ける純粋なロジック。
// 「ペンは描画・指はパン/ズーム」、ペンの接触中（と直後の猶予）のタッチは手のひらとして無視する（パームリジェクション）。

export type PointerAction = 'draw' | 'erase' | 'pan' | 'ignore';

export interface PointerDownLike {
  pointerType: string;
  button: number;
  buttons: number;
  /** 接触面の大きさ（CSS ピクセル）。手のひらの判定に使う。対応しない端末は 0 か undefined */
  width?: number;
  height?: number;
  timeStamp: number;
}

export interface RouterOptions {
  /** ペンを離した後もタッチを無視する時間（ミリ秒） */
  palmGraceMs?: number;
  /** この大きさ（CSS ピクセル）以上の接触面は手のひらとして無視する */
  palmSize?: number;
}

const ERASER_BUTTON_BIT = 32;
const ERASER_BUTTON = 5;

export class PointerRouter {
  private readonly graceMs: number;
  private readonly palmSize: number;
  private penDown = new Set<number>();
  private lastPenUp = -Infinity;
  private penCount = 0;

  constructor(opts: RouterOptions = {}) {
    this.graceMs = opts.palmGraceMs ?? 300;
    this.palmSize = opts.palmSize ?? 40;
  }

  /** ペンが接触中、または離した直後か。 */
  penBusy(now: number): boolean {
    return this.penCount > 0 || now - this.lastPenUp < this.graceMs;
  }

  down(e: PointerDownLike, pointerId = 0): PointerAction {
    switch (e.pointerType) {
      case 'pen':
        if (!this.penDown.has(pointerId)) { this.penDown.add(pointerId); this.penCount = this.penDown.size; }
        return (e.buttons & ERASER_BUTTON_BIT) !== 0 || e.button === ERASER_BUTTON ? 'erase' : 'draw';
      case 'touch':
        if (this.penBusy(e.timeStamp)) return 'ignore';
        if (Math.max(e.width ?? 0, e.height ?? 0) >= this.palmSize) return 'ignore';
        return 'pan';
      default:
        // マウス: 左ボタンは選んだ道具、中ボタンはパン、右ボタンは何もしない
        if (e.button === 1) return 'pan';
        return e.button === 0 ? 'draw' : 'ignore';
    }
  }

  up(e: { pointerType: string; timeStamp: number }, pointerId = 0): void {
    if (e.pointerType !== 'pen') return;
    this.penDown.delete(pointerId);
    this.penCount = this.penDown.size;
    this.lastPenUp = e.timeStamp;
  }
}

/** ペンの筆圧と傾きを、ストロークの 1 つの値 p（0〜1）にまとめる。マウスは 0.5 固定、傾きが大きいほど太くなる。 */
export function effectivePressure(e: { pointerType: string; pressure: number; tiltX?: number; tiltY?: number }): number {
  if (e.pointerType === 'mouse') return 0.5;
  // 筆圧に対応しない指・ペン（pressure が 0 または 0.5 固定）は、中間の値にする
  const base = e.pressure > 0 ? e.pressure : 0.5;
  const tilt = Math.min(1, Math.hypot(e.tiltX ?? 0, e.tiltY ?? 0) / 90);
  return Math.min(1, base * (1 + 0.5 * tilt));
}

/** 筆圧 p（0〜1）に対する線の太さ。p = 0.5（マウス）で size と同じ。 */
export const widthAt = (size: number, p: number): number => size * (0.4 + 1.2 * Math.max(0, Math.min(1, p)));

/** 2 本指の操作（ピンチ）から、倍率の変化と中心の移動を求める。 */
export function pinchDelta(
  prev: ReadonlyArray<{ x: number; y: number }>,
  next: ReadonlyArray<{ x: number; y: number }>,
): { factor: number; cx: number; cy: number; dx: number; dy: number } | null {
  if (prev.length < 2 || next.length < 2) return null;
  const d0 = Math.hypot(prev[0]!.x - prev[1]!.x, prev[0]!.y - prev[1]!.y);
  const d1 = Math.hypot(next[0]!.x - next[1]!.x, next[0]!.y - next[1]!.y);
  const c0 = { x: (prev[0]!.x + prev[1]!.x) / 2, y: (prev[0]!.y + prev[1]!.y) / 2 };
  const c1 = { x: (next[0]!.x + next[1]!.x) / 2, y: (next[0]!.y + next[1]!.y) / 2 };
  return { factor: d0 > 0 ? d1 / d0 : 1, cx: c1.x, cy: c1.y, dx: c1.x - c0.x, dy: c1.y - c0.y };
}
