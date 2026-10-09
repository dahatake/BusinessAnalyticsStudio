// 編集モード（FR-047）。OFF のときはデータを変更できない。ON/OFF の切替の部品は編集の項目（I15）が受け持つ。
// 画面は、追加・削除・編集のボタンの有効/無効をこの状態で決める。
import { create } from 'zustand';

interface EditModeState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useEditMode = create<EditModeState>((set) => ({
  enabled: false,
  setEnabled: (enabled) => set({ enabled }),
}));
