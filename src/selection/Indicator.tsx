// 選択中の対象の表示（FR-015 AC-018・FR-110 AC-135）。ヘッダーに常設し、どのペルソナ・レイアウトでも、いま選んでいる項目の名称を示す。
// 選択はすべてのビューで共通のストア（FR-024）を読むだけで、ここでは変えない。
import { Badge, makeStyles, tokens } from '@fluentui/react-components';
import { useSelection } from './hooks';

const useStyles = makeStyles({
  root: { display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalXS, maxWidth: '320px', overflow: 'hidden' },
  name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
});

export function SelectionIndicator() {
  const s = useStyles();
  const { graph, selectedIds } = useSelection();
  if (selectedIds.length === 0) return null;
  const names = selectedIds.map((id) => graph?.node(id)?.label ?? id);
  return (
    <span className={s.root} data-testid="selection-indicator" aria-label={`選択中: ${names.join('、')}`}>
      <Badge appearance="tint" color="brand" shape="rounded" className={s.name}>選択中: {names.join('、')}</Badge>
    </span>
  );
}
