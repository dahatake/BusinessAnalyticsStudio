// 画面の切替・ダイアログの出入りの動き（NFR-UX-017）。所要時間とイージングは Fluent 2 のモーションのトークン（design.css・Fluent UI）。
// アニメーションが停止中（FR-071）か OS の「視差効果を減らす」が有効（FR-072）なら、動きを付けずに最終の状態を示す。
import { useSyncExternalStore } from 'react';
import { prefersReducedMotion, useAnimation } from '../store/animation';
import { motionAllowed } from './useFoldMotion';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReduced(on: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener('change', on);
  return () => mq.removeEventListener('change', on);
}

/** OS の「視差効果を減らす」（変わると再描画する） */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, prefersReducedMotion, () => false);
}

/** いま動きを付けてよいか（再生中で、視差効果を減らすが無効） */
export function useMotionAllowed(): boolean {
  const playing = useAnimation((s) => s.playing);
  return motionAllowed(playing, useReducedMotion());
}

/** 画面の切替のフェードを付ける属性（design.css の [data-screen-fade]） */
export const SCREEN_FADE_ATTR = 'data-screen-fade';

/** 覆いの印を外すまでの時間（ms）。動きの所要時間の上限 {PARAM-074} より十分に長くし、終わった動きは最終の状態（透明）のまま残す */
const FADE_CLEANUP_MS = 2000;
const cleanupTimers = new WeakMap<HTMLElement, number>();

/**
 * 開いた画面（コンポーネントの面）をフェードで現す。動きを付けない設定のときは何もしない（最終の状態のまま）。
 * 覆いは終わると透明（最終の状態）のまま残り、しばらくして印を外す。描画が遅い環境でも、動きの記録（Web Animations）が途中で消えない。
 */
export function fadeInScreen(el: HTMLElement | null, allowed: boolean): void {
  if (!el || !allowed) return;
  el.removeAttribute(SCREEN_FADE_ATTR);
  // 同じ画面を続けて選んだときも、動きを始めからやり直す
  void el.offsetWidth;
  el.setAttribute(SCREEN_FADE_ATTR, '');
  const prev = cleanupTimers.get(el);
  if (prev !== undefined) window.clearTimeout(prev);
  cleanupTimers.set(el, window.setTimeout(() => {
    el.removeAttribute(SCREEN_FADE_ATTR);
    cleanupTimers.delete(el);
  }, FADE_CLEANUP_MS));
}

/** 画面の切替で、いま動きを付けてよいか（イベントの処理の中から呼ぶ） */
export function screenMotionAllowed(): boolean {
  return motionAllowed(useAnimation.getState().playing, prefersReducedMotion());
}
