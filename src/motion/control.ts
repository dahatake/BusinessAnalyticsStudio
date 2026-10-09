// アニメーション停止の反映（FR-071）。停止中は CSS のアニメーションとトランジション・動画を止める。3D の描画ループは store/animation.ts を直接読む。
import { useAnimation } from '../store/animation';

/** html 要素に付ける印。motion.css が、この印があるときに CSS の動きを止める */
export const PAUSED_ATTRIBUTE = 'data-animation';

/** 停止中に、動いているアニメーション（Web Animations）を止め、動画を一時停止する */
export function applyAnimationState(playing: boolean, doc: Document = document): void {
  doc.documentElement.setAttribute(PAUSED_ATTRIBUTE, playing ? 'playing' : 'paused');
  if (playing) return;
  for (const a of doc.getAnimations?.() ?? []) {
    try {
      if (a.playState === 'running') a.finish();
    } catch {
      try { a.pause(); } catch { /* 止められないアニメーションは対象外 */ }
    }
  }
  for (const v of Array.from(doc.querySelectorAll('video'))) {
    if (!v.paused) v.pause();
  }
}

/** 文字を入力しない INPUT（スライダー・チェックボックスなど）。この上にフォーカスがあっても、1 文字のショートカットは受ける */
const NON_TEXT_INPUT_TYPES = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'color']);

/** キー入力が、P などの 1 文字のショートカットを受けてよい状態か（文字を入力する欄の中、修飾キー付きは受けない） */
export function isShortcutTarget(e: Pick<KeyboardEvent, 'target' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const t = e.target as (HTMLElement & { type?: string }) | null;
  if (!t) return true;
  if (t.isContentEditable) return false;
  if (t.tagName === 'INPUT') return NON_TEXT_INPUT_TYPES.has((t.type ?? '').toLowerCase());
  return !/^(TEXTAREA|SELECT)$/.test(t.tagName);
}

/**
 * 反映を始める（ストアの変化・P キー・停止中に始まる動画）。戻り値で解除する。
 * アプリで 1 回だけ使う（AnimationController）。
 */
export function installAnimationControl(doc: Document = document): () => void {
  const apply = () => applyAnimationState(useAnimation.getState().playing, doc);
  apply();
  const unsub = useAnimation.subscribe((s, prev) => {
    if (s.playing !== prev.playing) applyAnimationState(s.playing, doc);
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || !(e.key === 'p' || e.key === 'P') || !isShortcutTarget(e)) return;
    useAnimation.getState().toggle();
  };
  // 停止中に始まった動画はすぐ止める（play は伝播しないのでキャプチャで受ける）
  const onPlay = (e: Event) => {
    if (!useAnimation.getState().playing && e.target instanceof HTMLMediaElement) e.target.pause();
  };
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('play', onPlay, true);
  return () => {
    unsub();
    doc.removeEventListener('keydown', onKey);
    doc.removeEventListener('play', onPlay, true);
  };
}
