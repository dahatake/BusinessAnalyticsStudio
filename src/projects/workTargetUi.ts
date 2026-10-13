// 作業先の画面状態（FR-144）。デモを作業先にしているか。設定画面の「デモへ切り替える」（AC-241）と ProjectsPanel が共有する。
import { create } from 'zustand';

export const useWorkTargetUi = create<{
  demoOnly: boolean;
  setDemoOnly: (v: boolean) => void;
  /** 設定からのデモへの切替要求の回数。ProjectsPanel が受けて、未保存の入力の確認（AC-231）を経由して切り替える */
  demoRequest: number;
  requestDemo: () => void;
}>((set) => ({
  demoOnly: false,
  setDemoOnly: (demoOnly) => set({ demoOnly }),
  demoRequest: 0,
  requestDemo: () => set((s) => ({ demoRequest: s.demoRequest + 1 })),
}));

/** 設定からデモへ切り替える（選択画面でデモを非表示にしていても行える。AC-241）。確認は ProjectsPanel が行う */
export function switchToDemo(): void {
  useWorkTargetUi.getState().requestDemo();
}
