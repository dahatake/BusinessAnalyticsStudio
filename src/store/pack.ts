import { create } from 'zustand';
import { loadPack, loadRuntimeConfig, PackLoadError, type LoadedPack, type RuntimeConfig } from '../data/loader';
import { formatPackError, type BrandProfile, type PackData } from '../schema';
import { useProjects } from './projects';
import { readProjectBrand, readProjectPack, saveProjectPack } from './projectPacks';

export type PackState =
  | { status: 'loading' }
  | { status: 'error'; messages: string[] }
  | { status: 'ready'; pack: LoadedPack; warnings: string[] };

interface PackStore {
  state: PackState;
  runtime: RuntimeConfig;
  /** 読み込んだときの顧客パックのデータ（「サンプルに戻す」の戻し先: FR-046）。読み込み前は null */
  original: PackData | null;
  /** 配信元のブランド（保存のない Project・デモで使う: AC-858）。読み込み前は null */
  servedBrand: BrandProfile | null;
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
  servedBrand: null,
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
      const openId = useProjects.getState().openId;
      const brand = readProjectBrand(openId) ?? pack.brand; // AC-858: 開いている Project のブランド
      const data = readProjectPack(openId, brand) ?? pack.data;
      set({ runtime, original: pack.data, servedBrand: pack.brand, state: { status: 'ready', pack: { ...pack, data, brand }, warnings: pack.issues.map(formatPackError) } });
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
  // AC-858: Project ごとのブランドに切り替える。保存がない Project・デモは配信元のブランド
  const brand = readProjectBrand(next.openId) ?? current.servedBrand ?? state.pack.brand;
  const data = readProjectPack(next.openId, brand) ?? current.original;
  usePackStore.setState({ state: { ...state, pack: { ...state.pack, data, brand } } });
});
