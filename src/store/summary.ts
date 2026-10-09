// エグゼクティブサマリーの編集・固定のストア（FR-041）。顧客パック（顧客名 / Project 名）ごとに、画面（scope）ごとに保存する。
// 利用者が編集した文は「編集版」。固定していなければ、データが変わって AI 版の内容が変わったときに AI 版へ戻る。固定した文は上書きしない。
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SummaryScope, SummaryText } from '../analysis/summary';

export interface StoredSummary {
  text: SummaryText;
  pinned: boolean;
  /** 利用者が文を編集したか（false は AI 版の文をそのまま固定したもの） */
  human: boolean;
  /** 編集したときの AI 版の指紋 */
  fp: string;
}

const memoryStore = new Map<string, string>();
const safeStorage = {
  getItem: (k: string) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : (memoryStore.get(k) ?? null)),
  setItem: (k: string, v: string) => { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); else memoryStore.set(k, v); },
  removeItem: (k: string) => { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); else memoryStore.delete(k); },
};

interface SummaryState {
  byPack: Record<string, Partial<Record<SummaryScope, StoredSummary>>>;
  /** 編集した文を保存する（固定するかどうかも指定） */
  save: (key: string, scope: SummaryScope, text: SummaryText, pinned: boolean, fp: string, human: boolean) => void;
  setPinned: (key: string, scope: SummaryScope, pinned: boolean) => void;
  /** 編集版を捨てて AI 版に戻す */
  discard: (key: string, scope: SummaryScope) => void;
}

export const useSummaryStore = create<SummaryState>()(
  persist(
    (set) => ({
      byPack: {},
      save: (key, scope, text, pinned, fp, human) =>
        set((s) => ({ byPack: { ...s.byPack, [key]: { ...(s.byPack[key] ?? {}), [scope]: { text, pinned, fp, human } } } })),
      setPinned: (key, scope, pinned) =>
        set((s) => {
          const cur = s.byPack[key]?.[scope];
          return cur ? { byPack: { ...s.byPack, [key]: { ...s.byPack[key], [scope]: { ...cur, pinned } } } } : s;
        }),
      discard: (key, scope) =>
        set((s) => {
          const { [scope]: _gone, ...rest } = s.byPack[key] ?? {};
          return { byPack: { ...s.byPack, [key]: rest } };
        }),
    }),
    { name: 'edb.summary', version: 1, storage: createJSONStorage(() => safeStorage), partialize: (s) => ({ byPack: s.byPack }) },
  ),
);

/** 表示する編集版。固定していなくて AI 版の指紋が変わっていれば undefined（AI 版に戻す） */
export function activeEdited(stored: StoredSummary | undefined, currentFp: string): StoredSummary | undefined {
  if (!stored) return undefined;
  return stored.pinned || stored.fp === currentFp ? stored : undefined;
}
