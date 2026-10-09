// ビジネス⇔IT のレンズの選択（FR-019）。切り替えは再読込でも保つ。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LENS_MODES, type LensMode } from '../lens/model';

interface LensState {
  mode: LensMode;
  setMode: (m: LensMode) => void;
}

export const useLens = create<LensState>()(
  persist(
    (set) => ({ mode: 'business', setMode: (mode) => set({ mode }) }),
    {
      name: 'edb.lens',
      version: 1,
      partialize: (s) => ({ mode: s.mode }),
      merge: (persisted, current) => {
        const m = (persisted as Partial<LensState> | undefined)?.mode;
        return { ...current, mode: LENS_MODES.includes(m as LensMode) ? (m as LensMode) : current.mode };
      },
    },
  ),
);
