import { create } from 'zustand';
import { loadPack, loadRuntimeConfig, PackLoadError, type LoadedPack, type RuntimeConfig } from '../data/loader';
import { formatPackError } from '../schema';

export type PackState =
  | { status: 'loading' }
  | { status: 'error'; messages: string[] }
  | { status: 'ready'; pack: LoadedPack };

interface PackStore {
  state: PackState;
  runtime: RuntimeConfig;
  load: () => Promise<void>;
}

export const usePackStore = create<PackStore>((set) => ({
  state: { status: 'loading' },
  runtime: {},
  load: async () => {
    set({ state: { status: 'loading' } });
    const fetchFn = (url: string) => fetch(url, { cache: 'no-store' });
    const runtime = await loadRuntimeConfig(fetchFn);
    try {
      const pack = await loadPack(fetchFn);
      set({ runtime, state: { status: 'ready', pack } });
    } catch (e) {
      const messages = e instanceof PackLoadError ? e.errors.map(formatPackError) : [String(e)];
      set({ runtime, state: { status: 'error', messages } });
    }
  },
}));
