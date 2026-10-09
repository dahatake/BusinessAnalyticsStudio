// 画面の一時的な状態（入力中の内容・絞り込み・視点など）を、画面の表示/非表示・ペルソナの切替をまたいで保つ（NFR-UX-001）。
// 画面が消えて作り直されても（ペルソナの切替で別のレイアウトになった、非表示にして再表示した）、利用者が見ていた状態に戻る。
// 保存はしない（再読込で消える）。再読込をまたぐ保存は layout ストアなど、それぞれの正本の役目。
// キーは `<画面のキー>.<名前>` の形で付ける。顧客パックごとに分けたい状態は、キーにパックの識別子を含める。
import { useCallback, useSyncExternalStore } from 'react';
import { create } from 'zustand';

interface RetainedState {
  values: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
  remove: (key: string) => void;
  clear: () => void;
}

export const useRetainedStore = create<RetainedState>((set) => ({
  values: {},
  set: (key, value) => set((s) => (Object.is(s.values[key], value) ? s : { values: { ...s.values, [key]: value } })),
  remove: (key) => set((s) => {
    if (!(key in s.values)) return s;
    const { [key]: _removed, ...rest } = s.values;
    return { values: rest };
  }),
  clear: () => set({ values: {} }),
}));

const MISSING = Symbol('missing');

/** `useState` と同じ形で、値を画面の外（ストア）に持つ。初めて使うときだけ initial になる。 */
export function useRetainedState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const read = (): unknown => {
    const v = useRetainedStore.getState().values;
    return key in v ? v[key] : MISSING;
  };
  const stored = useSyncExternalStore(useRetainedStore.subscribe, read, read);
  const value = stored === MISSING ? initial : (stored as T);
  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    const st = useRetainedStore.getState();
    const prev = key in st.values ? (st.values[key] as T) : initial;
    st.set(key, typeof next === 'function' ? (next as (p: T) => T)(prev) : next);
    // initial は初回の値としてだけ使う（毎回新しいオブジェクトでも setter を変えない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, setValue];
}
