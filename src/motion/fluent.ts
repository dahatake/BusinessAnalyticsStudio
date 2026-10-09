// Fluent 2 のモーション（FR-070）。時間とイージングは Fluent 2 のモーション原則の値を使い、独自の値を作らない。
// 純粋な関数だけで構成する。アニメーション停止中は、動きを出さずに最終値を即座に返す（FR-071）。

/** Fluent 2 の時間のトークン（ms） */
export const DURATION = {
  ultraFast: 50,
  faster: 100,
  fast: 150,
  normal: 200,
  gentle: 250,
  slow: 300,
  slower: 400,
  ultraSlow: 500,
} as const;

/** Fluent 2 のイージング（cubic-bezier）。入る動きは Decelerate、出る動きは Accelerate、画面内の移動は Easy ease */
export const EASING = {
  decelerateMid: 'cubic-bezier(0, 0, 0, 1)',
  accelerateMid: 'cubic-bezier(1, 0, 1, 1)',
  easyEase: 'cubic-bezier(0.33, 0, 0.67, 1)',
} as const;

/** 時間をテンポで伸縮する。停止中は 0（動かさない） */
export function scaledDuration(ms: number, tempo: number, playing: boolean): number {
  if (!playing) return 0;
  return Math.max(0, Math.round(ms * tempo));
}

/** 数値のカウントアップの途中の値。t は 0〜1（decelerate に近い ease-out）。t>=1 は最終値 */
export function countUpValue(from: number, to: number, t: number): number {
  if (!(t < 1)) return to;
  if (t <= 0) return from;
  const eased = 1 - Math.pow(1 - t, 3);
  return from + (to - from) * eased;
}

/** チャートの描画の進み（0〜1）。停止中、または時間が 0 のときは完成した状態（1） */
export function drawProgress(elapsedMs: number, durationMs: number, playing: boolean): number {
  if (!playing || durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs / durationMs));
}

/** 画面遷移の View Transitions API が使えるか */
export function canViewTransition(doc: Document = document): boolean {
  return typeof (doc as Document & { startViewTransition?: unknown }).startViewTransition === 'function';
}

/**
 * 画面遷移を View Transitions API で動かす。使えないとき、または停止中は、そのまま更新する。
 * update は同期的に DOM を更新する関数（React では flushSync で包む）。
 */
export function runTransition(update: () => void, playing: boolean, doc: Document = document): void {
  if (!playing || !canViewTransition(doc)) {
    update();
    return;
  }
  (doc as Document & { startViewTransition: (cb: () => void) => unknown }).startViewTransition(update);
}
