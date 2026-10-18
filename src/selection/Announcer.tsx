// 選択の変化をスクリーンリーダーに知らせる aria-live の領域（FR-029）。アプリで 1 回だけ置く。
// 「<項目名> を選択しました。関連する項目 N 件」の形で、選択した項目名と関連件数を通知する。画面には出さない（視覚的に隠す）。
import { useMemo, useRef } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import { useSelection } from './hooks';
import { selectionAnnouncement } from './announce';

const useStyles = makeStyles({
  hidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: 0,
    padding: 0,
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

// FR-015 AC-018: 選択中の対象を示す表示（ペルソナ切替などの画面の切替をまたいで保たれる）。ヘッダーに常に置く。
export function SelectionIndicator() {
  const { graph, selectedIds } = useSelection();
  if (selectedIds.length === 0) return <span data-testid="selection-indicator" hidden />;
  const names = selectedIds.map((id) => graph?.node(id)?.label ?? id);
  const text = names.length > 1 ? `${names[0]} ほか ${names.length - 1} 件` : names[0];
  return (
    <span
      data-testid="selection-indicator"
      title={names.join('、')}
      style={{ maxWidth: '16em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200 }}
    >
      選択中: {text}
    </span>
  );
}

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
