// アニメーションの再生／停止（P キー）。3D の連続描画・CSS・動画はこれに従う（FR-071。src/motion/AnimationController.tsx が反映する）。
// 利用者が選んだ値は localStorage に保存して復元する（FR-057）。一度も選んでいないときは、OS の「視差効果を減らす」に従う（FR-072）。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** OS の「視差効果を減らす（prefers-reduced-motion）」が有効か */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 利用者の選択（null は未選択）と OS の設定から、再生中かどうかを決める */
export function resolvePlaying(choice: boolean | null | undefined, reducedMotion: boolean): boolean {
  return typeof choice === 'boolean' ? choice : !reducedMotion;
}

interface AnimationState {
  /** 再生中か（false は停止中） */
  playing: boolean;
  /** 利用者が選んだ値。null は未選択（OS の設定に従う） */
  choice: boolean | null;
  toggle: () => void;
  setPlaying: (playing: boolean) => void;
}

export const useAnimation = create<AnimationState>()(
  persist(
    (set) => ({
      playing: resolvePlaying(null, prefersReducedMotion()),
      choice: null,
      toggle: () => set((s) => ({ playing: !s.playing, choice: !s.playing })),
      setPlaying: (playing) => set({ playing, choice: playing }),
    }),
    {
      name: 'edb.animation',
      version: 1,
      partialize: (s) => ({ choice: s.choice }),
      merge: (persisted, current) => {
        const raw = (persisted as { choice?: unknown } | undefined)?.choice;
        const choice = typeof raw === 'boolean' ? raw : null;
        return { ...current, choice, playing: resolvePlaying(choice, prefersReducedMotion()) };
      },
    },
  ),
);
