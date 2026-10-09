// カードの名前の編集の依頼（FR-098）。描画面（BoardSurface）のダブルクリックと、カードのキー操作（Enter）から、
// 編集の欄を持つ ItemOverlay へ伝える。
import { create } from 'zustand';

interface CardEditState {
  itemId: string | null;
  seq: number;
  request: (itemId: string) => void;
  clear: () => void;
}

export const useCardEdit = create<CardEditState>((set) => ({
  itemId: null,
  seq: 0,
  request: (itemId) => set((s) => ({ itemId, seq: s.seq + 1 })),
  clear: () => set({ itemId: null }),
}));
