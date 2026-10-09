// 選択の変化をスクリーンリーダーに知らせる aria-live の領域（FR-029）。アプリで 1 回だけ置く。
// 「<項目名> を選択しました。関連する項目 N 件」の形で、選択した項目名と関連件数を通知する。画面には出さない（視覚的に隠す）。
import { useMemo, useRef } from 'react';
import { makeStyles } from '@fluentui/react-components';
import { useSelection } from './hooks';
import { selectionAnnouncement } from './announce';

const useStyles = makeStyles({
  hidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: 0,
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

export function SelectionAnnouncer() {
  const s = useStyles();
  const { graph, selectedIds, related } = useSelection();
  const everSelected = useRef(false);
  if (selectedIds.length > 0) everSelected.current = true;
  const text = useMemo(() => {
    if (selectedIds.length === 0 && !everSelected.current) return '';
    const names = selectedIds.map((id) => graph?.node(id)?.label ?? id);
    const count = related ? [...related].filter((id) => !selectedIds.includes(id)).length : 0;
    return selectionAnnouncement(names, count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, selectedIds, related]);
  return (
    <div className={s.hidden} data-testid="selection-announcer" aria-live="polite" aria-atomic="true" role="status">
      {text}
    </div>
  );
}
