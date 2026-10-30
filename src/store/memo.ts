// 画面「メモ」のデータ（FR-280）。利用者が書いた自由な文章を、この端末の localStorage だけに保存し、再読み込みで復元する。
// 「Copilot の案」の「反映」（FR-280）は、この store の text を案の内容で更新する。作成者の種別は、反映した値を「AI 提案を採用」として区別する（[ASSUMPTION] A-71）。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const MEMO_STORAGE_KEY = 'eabk.memo.v1';

export type MemoAuthor = 'user' | 'ai-adopted';

interface MemoState {
  text: string;
  /** 最後に書いた主体。利用者の入力は user、案の反映は ai-adopted */
  author: MemoAuthor;
  setText: (text: string, author?: MemoAuthor) => void;
}

export const useMemoStore = create<MemoState>()(
  persist(
    (set) => ({
      text: '',
      author: 'user',
      setText: (text, author = 'user') => set({ text, author }),
    }),
    {
      name: MEMO_STORAGE_KEY,
      version: 1,
      partialize: (s) => ({ text: s.text, author: s.author }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { text?: unknown; author?: unknown };
        return {
          ...current,
          text: typeof p.text === 'string' ? p.text : current.text,
          author: p.author === 'ai-adopted' ? 'ai-adopted' : 'user',
        };
      },
    },
  ),
);
