// ペルソナ別ストーリーの状態（FR-177）。保存しない（再読込で通常に戻る）。
// picking: ペルソナの選択ダイアログを出している。persona: ストーリーを再生中のペルソナ（null は再生していない）。
import { create } from 'zustand';
import type { StoryPersona } from '../story/model';

interface StoryState {
  picking: boolean;
  persona: StoryPersona | null;
  /** ストーリーを閉じても保つ現在のシーンの位置（Esc でフルスクリーンを抜けても位置は保たれる。FR-178 AC-360） */
  index: number;
  openPicker: () => void;
  closePicker: () => void;
  play: (persona: StoryPersona) => void;
  setIndex: (index: number) => void;
  /** ストーリーとダイアログを閉じる */
  reset: () => void;
}

export const useStoryStore = create<StoryState>((set) => ({
  picking: false,
  persona: null,
  index: 0,
  openPicker: () => set({ picking: true }),
  closePicker: () => set({ picking: false }),
  play: (persona) => set({ picking: false, persona, index: 0 }),
  setIndex: (index) => set({ index }),
  reset: () => set({ picking: false, persona: null, index: 0 }),
}));
