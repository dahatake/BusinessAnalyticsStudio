// 選択状態の常駐の配線（アプリで 1 回だけ置く）。URL との同期（戻る/進む）、Esc での解除、存在しない ID の除去。
import { useEffect } from 'react';
import { useSelectionStore, installUrlSync } from '../store/selection';
import { useEntityGraph } from './hooks';
import { installEscapeClear } from './keys';
import { installRelationHighlight } from './relationHighlight';
import { installRelationHighlightStyle } from './relationHighlightStyle';

export function SelectionController() {
  const graph = useEntityGraph();

  useEffect(() => {
    const offUrl = installUrlSync();
    const offEsc = installEscapeClear();
    const offHl = installRelationHighlight();
    const offStyle = installRelationHighlightStyle();
    return () => { offUrl(); offEsc(); offHl(); offStyle(); };
  }, []);

  useEffect(() => {
    useSelectionStore.getState().setKnownIds(graph ? new Set(graph.nodes.map((n) => n.id)) : null);
  }, [graph]);

  return null;
}
