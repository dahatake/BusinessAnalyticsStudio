import { create } from 'zustand';
import { loadPack, loadRuntimeConfig, PackLoadError, type LoadedPack, type RuntimeConfig } from '../data/loader';
import { formatPackError, type PackData } from '../schema';
import { useProjects } from './projects';
import { readProjectPack, saveProjectPack } from './projectPacks';

export type PackState =
  | { status: 'loading' }
  | { status: 'error'; messages: string[] }
  | { status: 'ready'; pack: LoadedPack; warnings: string[] };

interface PackStore {
  state: PackState;
  runtime: RuntimeConfig;
  /** 読み込んだときの顧客パックのデータ（「サンプルに戻す」の戻し先: FR-046）。読み込み前は null */
  original: PackData | null;
  load: () => Promise<void>;
  /**
   * 編集したデータに置き換える（FR-045）。すべてのビューはこのストアの `state.pack.data` を購読しているので、置き換えると即座に反映される。
   * 画面から直接呼ばず、`src/store/edit.ts` の編集操作（`commit` など）を通す（編集モード・元に戻す・変更履歴のため）。
   */
  setData: (data: PackData) => void;
}

export const usePackStore = create<PackStore>((set, get) => ({
  state: { status: 'loading' },
  runtime: {},
  original: null,
  setData: (data) => {
    if (get().state.status !== 'ready') return;
    saveProjectPack(useProjects.getState().openId, data);
    set((s) => (s.state.status === 'ready' ? { state: { ...s.state, pack: { ...s.state.pack, data } } } : s));
  },
  load: async () => {
    set({ state: { status: 'loading' } });
    const fetchFn = (url: string) => fetch(url, { cache: 'no-store' });
    const runtime = await loadRuntimeConfig(fetchFn);
    try {
      const pack = await loadPack(fetchFn);
      const data = readProjectPack(useProjects.getState().openId, pack.brand) ?? pack.data;
      set({ runtime, original: pack.data, state: { status: 'ready', pack: { ...pack, data }, warnings: pack.issues.map(formatPackError) } });
    } catch (e) {
      const messages = e instanceof PackLoadError ? e.errors.map(formatPackError) : [String(e)];
      set({ runtime, state: { status: 'error', messages } });
    }
  },
}));

// FR-043 AC-054: 同じProjectを開き直しても配信元へ置き換えない。
// 別Project・デモへ移った場合だけ、その作業先の保存内容（なければ配信元）へ切り替える。
useProjects.subscribe((next, previous) => {
  if (next.openId === previous.openId) return;
  const current = usePackStore.getState();
  if (current.state.status !== 'ready' || !current.original) return;
  const state = current.state;
  const data = readProjectPack(next.openId, state.pack.brand) ?? current.original;
  usePackStore.setState({ state: { ...state, pack: { ...state.pack, data } } });
});
