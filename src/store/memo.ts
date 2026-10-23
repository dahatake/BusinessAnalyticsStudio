// メモのストア（FR-280）。顧客パック（顧客名 / Project 名）ごとに、端末内（localStorage）に保存する。
// 「Copilot の案」の「反映」（src/review）は、このストアへ案の内容を書く。作成者の種別（A-71）は、案の反映なら 'ai-assisted'、手入力なら 'human'。
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type MemoAuthor = 'human' | 'ai-assisted';
export interface StoredMemo { text: string; author: MemoAuthor }

const memoryStore = new Map<string, string>();
const safeStorage = {
  getItem: (k: string) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : (memoryStore.get(k) ?? null)),
  setItem: (k: string, v: string) => { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); else memoryStore.set(k, v); },
  removeItem: (k: string) => { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); else memoryStore.delete(k); },
};

interface MemoState {
  byPack: Record<string, StoredMemo>;
  save: (key: string, text: string, author: MemoAuthor) => void;
}

export const useMemoStore = create<MemoState>()(
  persist(
    (set) => ({
      byPack: {},
      save: (key, text, author) => set((s) => ({ byPack: { ...s.byPack, [key]: { text, author } } })),
    }),
    { name: 'edb.memo', version: 1, storage: createJSONStorage(() => safeStorage), partialize: (s) => ({ byPack: s.byPack }) },
  ),
);

/** メモが空のときに表示する文（コンポーネントの表示として空にならないようにする） */
export const MEMO_EMPTY_TEXT = 'メモはまだありません。検討の論点・前提・次の行動をここに書きます。';
