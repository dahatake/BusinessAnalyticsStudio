// 全コンポーネントへの関連ハイライトと減光（FR-227）。
// 選択があるとき、画面にある data-entity-id の要素すべてに data-highlight（selected／related／hover／dimmed）を付ける。
// useEntityBinding を使わない部品（ガント・キャンバス・分析など）も対象にするため、DOM に直接反映する。
// 見た目は relationHighlight.css.ts の大域スタイル（色以外の手がかりと、4.5:1 以上の文字色）が受け持つ。
import { useSelectionStore } from '../store/selection';
import { getEntityGraph } from './hooks';
import { highlightTokens, relatedSet, type HighlightContext } from './model';

/** この関数が data-highlight を付けた要素 */
const owned = new WeakSet<Element>();

/** 画面全体（root 内）の項目へ、現在の選択に応じた data-highlight を反映する。変更した要素の数を返す。 */
export function applyRelationHighlight(root: ParentNode = document): number {
  const st = useSelectionStore.getState();
  const graph = getEntityGraph();
  const related = graph ? relatedSet(graph, st.selectedIds, st.mode) : null;
  const ctx: HighlightContext = { selected: new Set(st.selectedIds), related, hoverId: st.hoverId, unrelated: 'dim' };
  let changed = 0;
  for (const el of root.querySelectorAll<HTMLElement>('[data-entity-id]')) {
    const id = el.getAttribute('data-entity-id');
    if (!id) continue;
    const want = highlightTokens(id, ctx, true);
    const cur = el.getAttribute('data-highlight') ?? undefined;
    if (want === cur) continue;
    // 画面の部品が自分の状態で付けた data-highlight（例: ガントの Feature 選択による related）は、
    // この関数が付けたものでなければ消さない（選択がないときに部品側の強調を壊さない。FR-007 AC-007）
    if (want === undefined && !owned.has(el)) continue;
    if (want === undefined) { el.removeAttribute('data-highlight'); owned.delete(el); }
    else { el.setAttribute('data-highlight', want); owned.add(el); }
    changed++;
  }
  return changed;
}

/** 選択・ホバー・画面の変化に合わせて反映を続ける。戻り値で解除（アプリで 1 回だけ呼ぶ）。 */
export function installRelationHighlight(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  let queued = false;
  const run = () => { queued = false; applyRelationHighlight(); };
  const schedule = () => {
    if (queued) return;
    queued = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 0);
  };
  const off = useSelectionStore.subscribe(schedule);
  const mo = new MutationObserver(schedule);
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-entity-id', 'data-highlight'] });
  schedule();
  return () => { off(); mo.disconnect(); };
}
