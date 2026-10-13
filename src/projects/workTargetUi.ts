// 作業先の画面状態（FR-144）。デモを作業先にしているか。設定画面の「デモへ切り替える」（AC-241）と ProjectsPanel が共有する。
import { create } from 'zustand';
import { useProjects } from '../store/projects';

export const useWorkTargetUi = create<{ demoOnly: boolean; setDemoOnly: (v: boolean) => void }>((set) => ({
  demoOnly: false,
  setDemoOnly: (demoOnly) => set({ demoOnly }),
}));

/** 設定からデモへ切り替える（選択画面でデモを非表示にしていても行える。AC-241） */
export function switchToDemo(): void {
  useProjects.getState().open(null);
  useWorkTargetUi.getState().setDemoOnly(true);
}
