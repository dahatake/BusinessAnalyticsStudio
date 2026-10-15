// メイン画面（FR-186）を表示中か。アプリの起動直後は表示中（FR-144 AC-398）。保存しない（再読込のたびにメイン画面から始まる）。
import { create } from 'zustand';

interface MainScreenState {
  shown: boolean;
  /** メイン画面へ戻る（FR-187） */
  show: () => void;
  /** メイン画面から作業先の分析画面へ移る */
  hide: () => void;
}

export const useMainScreen = create<MainScreenState>((set) => ({
  shown: true,
  show: () => set({ shown: true }),
  hide: () => set({ shown: false }),
}));
