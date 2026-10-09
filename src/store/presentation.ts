// プレゼンテーションモードの状態（FR-016）。保存しない（再読込で通常に戻る）。
// 議題の一覧は開始時に受け取って持つ。進行（次/前）は番号だけを動かし、表示は各画面がこの状態を読む。
import { create } from 'zustand';
import { stepIndex, type PresentationTopic } from '../presentation/model';

interface PresentationState {
  active: boolean;
  topics: PresentationTopic[];
  index: number;
  /** 議題が 1 つ以上あれば開始する。なければ何もしない（false を返す） */
  start: (topics: readonly PresentationTopic[]) => boolean;
  end: () => void;
  next: () => void;
  prev: () => void;
}

export const usePresentationStore = create<PresentationState>((set, get) => ({
  active: false,
  topics: [],
  index: 0,
  start: (topics) => {
    if (topics.length === 0) return false;
    set({ active: true, topics: [...topics], index: 0 });
    return true;
  },
  end: () => set({ active: false, topics: [], index: 0 }),
  next: () => { const s = get(); if (s.active) set({ index: stepIndex(s.index, 1, s.topics.length) }); },
  prev: () => { const s = get(); if (s.active) set({ index: stepIndex(s.index, -1, s.topics.length) }); },
}));

/** 現在の議題（プレゼンテーション中でなければ null）。 */
export function currentTopic(s: Pick<PresentationState, 'active' | 'topics' | 'index'>): PresentationTopic | null {
  return s.active ? s.topics[s.index] ?? null : null;
}
