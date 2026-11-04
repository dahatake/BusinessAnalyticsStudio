// 顧客パックの取り込み画面（FR-302）を開いているか。「はじめての方へ」の入口（FR-268 AC-856）とメイン画面が共有する。保存しない。
import { create } from 'zustand';

export const usePackUploadUi = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
