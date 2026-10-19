// 選択状態とエンティティ関係グラフを、画面から使うための React のフック（FR-024〜FR-027）。
// 画面は「選択を自分で持たず」、ここのフックだけで読み書きする。
//
//   const bind = useEntityBinding('gantt');          // 画面の名前（選択を起こしたビューとして記録される）
//   <div {...bind(task.id)} />                       // data-entity-id・data-highlight・ホバー・クリックでの選択
//   <tr {...bind(row.id, { filterable: true })} />   // 表・リスト・カード: 減光のときに dimmed も付く
//
//   const { visible, related, count } = useSelectionFilter(items, (x) => x.id);   // 選択に応じた自動の絞り込み（FR-026）
import { useMemo, type KeyboardEvent, type MouseEvent } from 'react';
import { usePackStore } from '../store/pack';
import { useSelectionStore } from '../store/selection';
import { buildEntityGraph, type EntityGraph } from './graph';
import { highlightTokens, isVisibleInFilter, relatedSet, type HighlightContext } from './model';

const graphCache = new WeakMap<object, EntityGraph>();

/** 顧客パックのエンティティ関係グラフ。パックが読み込まれる前は null。同じパックなら同じ（参照が等しい）グラフを返す。 */
export function getEntityGraph(): EntityGraph | null {
  const st = usePackStore.getState().state;
  if (st.status !== 'ready') return null;
  const data = st.pack.data;
  let g = graphCache.get(data);
  if (!g) { g = buildEntityGraph(data); graphCache.set(data, g); }
  return g;
}

export function useEntityGraph(): EntityGraph | null {
  const state = usePackStore((s) => s.state);
  return useMemo(() => {
    if (state.status !== 'ready') return null;
    const data = state.pack.data;
    let g = graphCache.get(data);
    if (!g) { g = buildEntityGraph(data); graphCache.set(data, g); }
    return g;
  }, [state]);
}

/** 選択状態（読み取り）と操作。ストアの値をそのまま返し、関連の集合を足す。 */
export function useSelection() {
  const graph = useEntityGraph();
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const hoverId = useSelectionStore((s) => s.hoverId);
  const mode = useSelectionStore((s) => s.mode);
  const unrelated = useSelectionStore((s) => s.unrelated);
  const origin = useSelectionStore((s) => s.origin);
  const seq = useSelectionStore((s) => s.seq);
  const related = useMemo(() => (graph ? relatedSet(graph, selectedIds, mode) : null), [graph, selectedIds, mode]);
  const actions = useSelectionStore.getState();
  return {
    graph,
    selectedIds,
    /** 最後に選んだ ID（詳細の表示などの「主」の選択）。なければ undefined */
    primaryId: selectedIds[selectedIds.length - 1] as string | undefined,
    hoverId,
    mode,
    unrelated,
    /** 選択に関連する ID の集合（自分を含む）。選択がなければ null（絞り込まない） */
    related,
    /** 最後の選択変更を起こしたビューと通し番号。選択に反応して動くビュー（3D のカメラなど）が使う */
    origin,
    seq,
    select: actions.select,
    setSelection: actions.setSelection,
    clear: actions.clear,
    setHover: actions.setHover,
    setMode: actions.setMode,
    setUnrelated: actions.setUnrelated,
  };
}

export interface BindOptions {
  /** 表・リスト・カード（絞り込む部品）のとき true。減光の指定で、関連しない項目に dimmed が付く */
  filterable?: boolean;
  /** false ならクリック・ホバーでの操作は付けず、属性だけを返す（既定 true） */
  interactive?: boolean;
}

export interface EntityBindProps {
  'data-entity-id': string;
  'data-highlight'?: string;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/**
 * 項目に付ける属性の束を作る関数を返す。`origin` は画面の名前（選択を起こしたビューとして記録）。
 * data-highlight は selected／related／hover／dimmed の語の空白区切り（tests/system/CONTRACT.md §4）。
 * クリックは選択（Ctrl/⌘/Shift を押していれば追加・解除）、マウスのホバーは一時的なハイライト。
 * キー操作（Enter/Space）は項目の要素に合わせて画面側で `onEntityKey` を使う。
 */
export function useEntityBinding(origin: string) {
  const { selectedIds, related, hoverId, unrelated, select, setHover } = useSelection();
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const ctx: HighlightContext = useMemo(() => ({ selected, related, hoverId, unrelated }), [selected, related, hoverId, unrelated]);
  return useMemo(() => (id: string, opts: BindOptions = {}): EntityBindProps => {
    const props: EntityBindProps = { 'data-entity-id': id, 'data-highlight': highlightTokens(id, ctx, opts.filterable) };
    if (opts.interactive === false) return props;
    props.onClick = (e) => {
      const additive = e.ctrlKey || e.metaKey || e.shiftKey;
      const cur = useSelectionStore.getState().selectedIds;
      // FR-227: 選択中の項目（だけ）をもう一度クリックすると解除する
      if (!additive && cur.length === 1 && cur[0] === id) useSelectionStore.getState().clear({ origin });
      else select(id, { origin, additive });
    };
    props.onMouseEnter = () => setHover(id);
    props.onMouseLeave = () => setHover(null);
    return props;
  }, [ctx, origin, select, setHover]);
}

/** Enter／Space で項目を選ぶキーハンドラー（Ctrl/⌘/Shift で追加・解除）。選んだら true */
export function onEntityKey(e: KeyboardEvent<HTMLElement>, id: string, origin: string): boolean {
  if (e.target !== e.currentTarget) return false;
  if (e.key !== 'Enter' && e.key !== ' ') return false;
  e.preventDefault();
  useSelectionStore.getState().select(id, { origin, additive: e.ctrlKey || e.metaKey || e.shiftKey });
  return true;
}

/**
 * 表・リスト・カードの自動の絞り込み（FR-026）。選択がなければ全件。
 * 非表示のときは関連する項目だけ、減光のときは全件を返し、`dimmed(id)` で関連しない項目を判定する。
 * `count` は選択に関連する項目の件数（減光のときも変わらない。選択がなければ全件）。
 */
export function useSelectionFilter<T>(items: readonly T[], idOf: (item: T) => string) {
  const { related, unrelated } = useSelection();
  return useMemo(() => {
    const visible = items.filter((x) => isVisibleInFilter(idOf(x), related, unrelated));
    const count = related ? items.filter((x) => related.has(idOf(x))).length : items.length;
    return { visible, count, related, unrelated, filtered: related !== null };
  }, [items, idOf, related, unrelated]);
}
