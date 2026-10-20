// 設定のモーダルの開閉の状態（FR-223）。保存しない（再読込では閉じる）。レイアウトの状態とは別で、「既定のレイアウトに戻す」の対象にならない。
import { create } from 'zustand';

interface SettingsModalState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useSettingsModal = create<SettingsModalState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
