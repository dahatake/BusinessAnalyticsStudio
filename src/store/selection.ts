// 共通の選択状態ストア（FR-024 の唯一の情報源。FR-025〜FR-028 の状態）。Zustand。
// すべてのビューは、このストアの選択・ホバー・絞り込みの設定だけを読み書きする。ビューごとに選択を持たない。
// 使い方（画面側）は src/selection/hooks.ts の useSelection / useEntityBinding を使う。
//
// - 選択の変更は URL ハッシュに反映する（FR-028）。選択の確定は履歴に積み（戻る/進むで復元）、
//   AND/OR・減光の切替は履歴に積まずに置き換える。
// - グラフにない ID（存在しない ID の URL など）は、グラフを登録した時点（setKnownIds）で捨てる。
// - `origin` と `seq` は「最後の選択変更を、どのビューが起こしたか」。3D のカメラ移動など、
//   選択の変更に反応するビューは seq の変化を見て、origin が自分なら動かない、という使い方をする（FR-025）。
import { create } from 'zustand';
import {
  DEFAULT_COMBINE, DEFAULT_UNRELATED, formatSelectionHash, parseSelectionHash,
  type CombineMode, type UnrelatedMode,
} from '../selection/model';

/** URL との読み書き。ブラウザー以外（単体テスト）では差し替える。 */
export interface UrlAdapter {
  hash(): string;
  push(hash: string): void;
  replace(hash: string): void;
}

const browserAdapter: UrlAdapter = {
  hash: () => (typeof window === 'undefined' ? '' : window.location?.hash ?? ''),
  push: (hash) => {
    if (typeof window === 'undefined') return;
    window.history.pushState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`);
  },
  replace: (hash) => {
    if (typeof window === 'undefined') return;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`);
  },
};

let adapter: UrlAdapter = browserAdapter;
/** 単体テスト用。引数なしで既定（ブラウザー）に戻す。 */
export function setUrlAdapter(a?: UrlAdapter): void { adapter = a ?? browserAdapter; }

export type HistoryMode = 'push' | 'replace' | 'none';

export interface ChangeOptions {
  /** 変更を起こしたビューの名前（画面の key など） */
  origin?: string;
  /** URL への反映。既定は push（履歴に積む）。URL から復元するときは none */
  history?: HistoryMode;
}

interface SelectionState {
  /** 選択中の ID（選択した順。最後が「主」の選択） */
  selectedIds: string[];
  /** ホバー中の ID（一時的なハイライト。URL には反映しない） */
  hoverId: string | null;
  mode: CombineMode;
  unrelated: UnrelatedMode;
  /** 最後の選択変更を起こしたビューと、その通し番号 */
  origin: string | null;
  seq: number;
  /** 存在する ID の集合（パック読み込み後）。null の間は検証しない */
  knownIds: ReadonlySet<string> | null;

  /** 1 件を選ぶ。additive（Ctrl/⌘ クリック）なら、選択に加える／選択から外す。そうでなければ、その 1 件だけにする */
  select: (id: string, opts?: ChangeOptions & { additive?: boolean }) => void;
  setSelection: (ids: readonly string[], opts?: ChangeOptions) => void;
  /** 選択の解除（Esc・フィルター解除） */
  clear: (opts?: ChangeOptions) => void;
  setHover: (id: string | null) => void;
  setMode: (mode: CombineMode) => void;
  setUnrelated: (unrelated: UnrelatedMode) => void;
  /** 存在する ID を登録し、存在しない選択を捨てる */
  setKnownIds: (ids: ReadonlySet<string> | null) => void;
  /** URL ハッシュから選択状態を読み直す（戻る/進む・URL を開き直したとき） */
  syncFromUrl: () => void;
}

const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

function clean(ids: readonly string[], known: ReadonlySet<string> | null): string[] {
  const out: string[] = [];
  for (const id of ids) if (!out.includes(id) && (!known || known.has(id))) out.push(id);
  return out;
}

function writeUrl(how: Exclude<HistoryMode, 'none'>, s: Pick<SelectionState, 'selectedIds' | 'mode' | 'unrelated'>): void {
  const cur = adapter.hash();
  const next = formatSelectionHash({ ids: s.selectedIds, mode: s.mode, unrelated: s.unrelated }, cur);
  if (next === (cur === '#' ? '' : cur)) return;
  if (how === 'push') adapter.push(next); else adapter.replace(next);
}

const initial = parseSelectionHash(browserAdapter.hash());

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedIds: initial.ids,
  hoverId: null,
  mode: initial.mode,
  unrelated: initial.unrelated,
  origin: null,
  seq: 0,
  knownIds: null,

  select: (id, opts = {}) => {
    const s = get();
    if (s.knownIds && !s.knownIds.has(id)) return; // 存在しない ID は選べない（現在の選択を変えない）
    const cur = s.selectedIds;
    const next = opts.additive ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id];
    get().setSelection(next, opts);
  },

  setSelection: (ids, opts = {}) => {
    const s = get();
    const next = clean(ids, s.knownIds);
    if (same(next, s.selectedIds)) return;
    set({ selectedIds: next, origin: opts.origin ?? null, seq: s.seq + 1 });
    const how = opts.history ?? 'push';
    if (how !== 'none') writeUrl(how, get());
  },

  clear: (opts = {}) => get().setSelection([], opts),

  setHover: (id) => { if (get().hoverId !== id) set({ hoverId: id }); },

  setMode: (mode) => {
    if (get().mode === mode) return;
    set({ mode });
    writeUrl('replace', get());
  },

  setUnrelated: (unrelated) => {
    if (get().unrelated === unrelated) return;
    set({ unrelated });
    writeUrl('replace', get());
  },

  setKnownIds: (knownIds) => {
    const s = get();
    const next = clean(s.selectedIds, knownIds);
    if (same(next, s.selectedIds)) { set({ knownIds }); return; }
    set({ knownIds, selectedIds: next, origin: 'url', seq: s.seq + 1 });
    writeUrl('replace', get());
  },

  syncFromUrl: () => {
    const s = get();
    const parsed = parseSelectionHash(adapter.hash());
    const ids = clean(parsed.ids, s.knownIds);
    const changed = !same(ids, s.selectedIds);
    set({ selectedIds: ids, mode: parsed.mode, unrelated: parsed.unrelated, ...(changed ? { origin: 'url', seq: s.seq + 1 } : {}) });
    // 存在しない ID を捨てたときは、URL も実際の状態にそろえる（履歴は増やさない）
    if (!same(ids, parsed.ids)) writeUrl('replace', get());
  },
}));

/** 戻る/進む・ハッシュの書き換えで URL から選択を復元する購読を始める。戻り値で解除（アプリで 1 回だけ呼ぶ）。 */
export function installUrlSync(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const on = () => useSelectionStore.getState().syncFromUrl();
  window.addEventListener('popstate', on);
  window.addEventListener('hashchange', on);
  // メイン画面の表示中は分析画面（この購読の置き場）が外れていて、その間の戻る/進む・ハッシュの書き換えを取りこぼす。置き直すときに URL から選択を復元する（FR-028 AC-033）
  if (useSelectionStore.getState().selectedIds.join('|') !== parseSelectionHash(adapter.hash()).ids.join('|')) on();
  return () => {
    window.removeEventListener('popstate', on);
    window.removeEventListener('hashchange', on);
  };
}

/** 選択をすべて空にして既定に戻す（単体テスト用。URL は触らない） */
export function resetSelectionForTest(): void {
  useSelectionStore.setState({
    selectedIds: [], hoverId: null, mode: DEFAULT_COMBINE, unrelated: DEFAULT_UNRELATED, origin: null, seq: 0, knownIds: null,
  });
}
