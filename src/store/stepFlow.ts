// ステップのクリックでの再配置の要求（FR-228）。レイアウトの保存は store/layout.ts が行う。
// 元の配置へは「既定のレイアウトに戻す」（FR-014・FR-110）で戻す。専用の undo は持たない（AC-530）。
import { create } from 'zustand';

interface StepFlowState {
  /** 再配置の要求の通し番号（Workspace が見て、測ってから並べる） */
  seq: number;
  step: number;
  request: (step: number) => void;
}

export const useStepFlow = create<StepFlowState>((set) => ({
  seq: 0,
  step: 0,
  request: (step) => set((s) => ({ seq: s.seq + 1, step })),
}));
