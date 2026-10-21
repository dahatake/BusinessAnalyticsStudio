// Graph の描画面の「見え方」の状態（FR-245〜248）。面（origin）ごとに、パン・倍率・階層・全画面・表の行からのハイライトを持つ。
// 面は階層の切替で作り直されることがある（空間ビューなど）ので、状態は部品の外（ここ）に置き、作り直しても保たれるようにする。
import { create } from 'zustand';

/** PARAM-087: 図の倍率の範囲（全体表示を 1 とする） */
export const GRAPH_SCALE_MIN = 0.25;
export const GRAPH_SCALE_MAX = 4;
/** PARAM-057: ボタン・キーの 1 操作の倍率（縮小は逆数） */
export const GRAPH_SCALE_STEP = 1.25;
/** PARAM-088: Shift＋矢印キー・移動ボタン 1 操作の移動量（CSS px） */
export const GRAPH_PAN_STEP = 40;
/** PARAM-089: 表の行クリック後のノードのハイライトの時間（ms） */
export const GRAPH_ROW_HIGHLIGHT_MS = 2000;
/** PARAM-105: 詳細カードに示す主要な関係の件数の上限 */
export const GRAPH_CARD_RELATIONS_MAX = 5;

export interface GraphViewState {
  /** パン（CSS px。図が右・下へ動くほど大きい） */
  x: number;
  y: number;
  /** 倍率（全体表示を 1） */
  s: number;
  /** 階層（0=全体・1=要素・2=詳細。自分でズームのボタンを持つ面だけが使う） */
  depth: number;
  full: boolean;
  /** 表の行から移動したノードの ID（PARAM-089 の間だけ） */
  hl: string | null;
}

export const GRAPH_VIEW_INIT: GraphViewState = { x: 0, y: 0, s: 1, depth: 1, full: false, hl: null };

export const clampScale = (s: number): number => Math.min(GRAPH_SCALE_MAX, Math.max(GRAPH_SCALE_MIN, s));

interface Store {
  views: Record<string, GraphViewState>;
  patch: (origin: string, p: Partial<GraphViewState> | ((v: GraphViewState) => Partial<GraphViewState>)) => void;
}

export const useGraphViewStore = create<Store>((set) => ({
  views: {},
  patch: (origin, p) => set((st) => {
    const cur = st.views[origin] ?? GRAPH_VIEW_INIT;
    return { views: { ...st.views, [origin]: { ...cur, ...(typeof p === 'function' ? p(cur) : p) } } };
  }),
}));

export const useGraphView = (origin: string): GraphViewState => useGraphViewStore((st) => st.views[origin] ?? GRAPH_VIEW_INIT);

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** 表の行から移動したノードを PARAM-089 の間だけハイライトする */
export function highlightRowItem(origin: string, id: string): void {
  useGraphViewStore.getState().patch(origin, { hl: id });
  const old = timers.get(origin);
  if (old) clearTimeout(old);
  timers.set(origin, setTimeout(() => { timers.delete(origin); useGraphViewStore.getState().patch(origin, { hl: null }); }, GRAPH_ROW_HIGHLIGHT_MS));
}

// 表の行から図の項目へ移る依頼（FR-248）。表（GraphAlt）が出し、面（GraphViewport）が受ける。
type FocusFn = (id: string) => void;
const listeners = new Map<string, Set<FocusFn>>();
export function onGraphFocus(origin: string, fn: FocusFn): () => void {
  if (!listeners.has(origin)) listeners.set(origin, new Set());
  listeners.get(origin)!.add(fn);
  return () => { listeners.get(origin)?.delete(fn); };
}
export function requestGraphFocus(origin: string, id: string): void {
  for (const fn of listeners.get(origin) ?? []) fn(id);
}
