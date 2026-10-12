// 業務改善ステッパーの現在のステップ（FR-136）。Project ごとに位置を持つ（FR-138 AC-209）。保存は store/persist.ts（FR-137 AC-207）。
import { create } from 'zustand';
import { INITIAL_STEP, STEPS, stepIndexForScreen } from '../stepper/model';

interface StepperState {
  current: number;
  /** Project ごとのステップの位置 */
  byProject: Record<string, number>;
  /** 位置を記録している Project（開いている Project） */
  projectId: string | null;
  setCurrent: (index: number) => void;
  /** 画面へ移ったとき。対応するステップがあれば現在にする */
  followScreen: (screenKey: string) => void;
  /** 開く Project を切り替える。その Project の位置（なければ先頭）を現在にする */
  switchTo: (projectId: string | null) => void;
  reset: () => void;
}

const commit = (s: StepperState, index: number): Partial<StepperState> => ({
  current: index,
  byProject: s.projectId ? { ...s.byProject, [s.projectId]: index } : s.byProject,
});

export const useStepper = create<StepperState>((set) => ({
  current: INITIAL_STEP,
  byProject: {},
  projectId: null,
  setCurrent: (index) => set((s) => commit(s, Math.max(0, Math.min(STEPS.length - 1, index)))),
  followScreen: (screenKey) => {
    const i = stepIndexForScreen(screenKey);
    if (i !== undefined) set((s) => commit(s, i));
  },
  switchTo: (projectId) => set((s) => ({ projectId, current: (projectId ? s.byProject[projectId] : undefined) ?? INITIAL_STEP })),
  reset: () => set({ current: INITIAL_STEP, byProject: {}, projectId: null }),
}));
