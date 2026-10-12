// 業務改善ステッパーの現在のステップ（FR-136）。保存しない（Project を開くたびに初期状態）。
import { create } from 'zustand';
import { INITIAL_STEP, STEPS, stepIndexForScreen } from '../stepper/model';

interface StepperState {
  current: number;
  setCurrent: (index: number) => void;
  /** 画面へ移ったとき。対応するステップがあれば現在にする */
  followScreen: (screenKey: string) => void;
  reset: () => void;
}

export const useStepper = create<StepperState>((set) => ({
  current: INITIAL_STEP,
  setCurrent: (index) => set({ current: Math.max(0, Math.min(STEPS.length - 1, index)) }),
  followScreen: (screenKey) => {
    const i = stepIndexForScreen(screenKey);
    if (i !== undefined) set({ current: i });
  },
  reset: () => set({ current: INITIAL_STEP }),
}));
