// 手書きから反映した項目（決定事項・次のアクション）の一覧（FR-090）。反映した項目には必ず「AI 生成（認識結果）」のラベルが付き、
// 元の手書き（ストローク）はボードに残る（このストアは元を消さない）。localStorage に保存して再読込で復元する。
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { newId } from './model';
import { RECOGNIZED_LABEL } from './handwriting';

export type RecognizedKind = 'decision' | 'action';

export interface RecognizedItem {
  id: string;
  kind: RecognizedKind;
  text: string;
  /** 反映元のボードとストロークの ID（元の手書きはボードに残っている） */
  boardId: string;
  strokeIds: string[];
  /** 常に 'ai'（人が手で直したら別の項目として扱う） */
  author: 'ai';
  /** モックの認識結果か */
  mock: boolean;
  label: typeof RECOGNIZED_LABEL;
}

interface RecognizedState {
  items: RecognizedItem[];
  add: (item: Omit<RecognizedItem, 'id' | 'author' | 'label'>) => RecognizedItem;
  remove: (id: string) => void;
  clear: () => void;
}

const memory = new Map<string, string>();
const storage = createJSONStorage(() => ({
  getItem: (k) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : (memory.get(k) ?? null)),
  setItem: (k, v) => { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); else memory.set(k, v); },
  removeItem: (k) => { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); else memory.delete(k); },
}));

export const useRecognized = create<RecognizedState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) => {
        const full: RecognizedItem = { ...item, id: newId('rec'), author: 'ai', label: RECOGNIZED_LABEL };
        set((s) => ({ items: [...s.items, full] }));
        return full;
      },
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'edb.recognized', version: 1, storage },
  ),
);

export const KIND_LABEL: Record<RecognizedKind, string> = { decision: '決定事項', action: '次のアクション' };
