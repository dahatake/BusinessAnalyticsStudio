// ストーリーボードの再生・編集の開閉と再生位置（FR-163・FR-164）。保存しない。
// 全画面への切替などでレイアウトが組み替わり、画面のコンポーネントが作り直されても、再生が途切れないよう、外に持つ（NFR-UX-010 と同じ考え方）。
import { create } from 'zustand';

export type StoryPlayState = 'playing' | 'paused' | 'ended';

interface StoryboardUi {
  /** 再生中のユースケース ID（再生していなければ null） */
  playId: string | null;
  /** 編集中のユースケース ID */
  editId: string | null;
  index: number;
  state: StoryPlayState;
  play: (id: string) => void;
  edit: (id: string | null) => void;
  close: () => void;
  setIndex: (i: number | ((prev: number) => number)) => void;
  setState: (s: StoryPlayState) => void;
}

export const useStoryboardUi = create<StoryboardUi>((set) => ({
  playId: null,
  editId: null,
  index: 0,
  state: 'playing',
  play: (playId) => set({ playId, index: 0, state: 'playing' }),
  edit: (editId) => set({ editId }),
  close: () => set({ playId: null, index: 0, state: 'playing' }),
  setIndex: (i) => set((s) => ({ index: typeof i === 'function' ? i(s.index) : i })),
  setState: (state) => set({ state }),
}));
