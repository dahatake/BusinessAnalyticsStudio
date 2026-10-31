// OS の操作慣習の設定（FR-299）。「自動／Windows／macOS」を選べる。この端末の localStorage に保存する。
// 判別と表記の純粋な部分は workspace/os.ts にある。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { OS_PREFS, currentEnv, resolveOs, type OsKind, type OsPref } from '../workspace/os';

interface State {
  pref: OsPref;
  setPref: (pref: OsPref) => void;
}

export const useOsPref = create<State>()(
  persist(
    (set) => ({ pref: 'auto', setPref: (pref) => set({ pref }) }),
    {
      name: 'eabk.os-convention.v1',
      version: 1,
      partialize: (s) => ({ pref: s.pref }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { pref?: unknown };
        return { ...current, pref: OS_PREFS.includes(p.pref as OsPref) ? (p.pref as OsPref) : 'auto' };
      },
    },
  ),
);

/** いまの操作慣習（設定の上書き → 環境の判別 → Windows） */
export function getOs(): OsKind {
  return resolveOs(useOsPref.getState().pref, currentEnv());
}

/** 操作慣習（設定が変わると再描画する） */
export function useOs(): OsKind {
  const pref = useOsPref((s) => s.pref);
  return resolveOs(pref, currentEnv());
}
