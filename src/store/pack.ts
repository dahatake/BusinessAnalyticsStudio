import { create } from 'zustand';
import { loadPack, loadRuntimeConfig, PackLoadError, type LoadedPack, type RuntimeConfig } from '../data/loader';
import { formatPackError, type PackData } from '../schema';

export type PackState =
  | { status: 'loading' }
  | { status: 'error'; messages: string[] }
  | { status: 'ready'; pack: LoadedPack; warnings: string[] };

interface PackStore {
  state: PackState;
  runtime: RuntimeConfig;
  load: () => Promise<void>;
  /** 読み込んだデータを書き換える（ナレッジグラフ・アーキテクチャ図の編集など）。新しいデータ・グラフになり、すべてのビューに反映される。 */
  updateData: (fn: (data: PackData) => PackData) => void;
}

export const usePackStore = create<PackStore>((set, get) => ({
  state: { status: 'loading' },
  runtime: {},
  updateData: (fn) => {
    const st = get().state;
    if (st.status !== 'ready') return;
    set({ state: { ...st, pack: { ...st.pack, data: fn(st.pack.data) } } });
  },
  load: async () => {
    set({ state: { status: 'loading' } });
    const fetchFn = (url: string) => fetch(url, { cache: 'no-store' });
    const runtime = await loadRuntimeConfig(fetchFn);
    try {
      const pack = await loadPack(fetchFn);
      set({ runtime, state: { status: 'ready', pack, warnings: pack.issues.map(formatPackError) } });
    } catch (e) {
      const messages = e instanceof PackLoadError ? e.errors.map(formatPackError) : [String(e)];
      set({ runtime, state: { status: 'error', messages } });
    }
  },
}));
