// 数値の項目（FR-009）。カーソルを合わせる・キーボードでフォーカスすると、出典の種別・取得日・確度を表示する。
// 出典は顧客パックの sources から ID で引く。数値を表示する画面は、これで包んで使う。
import { Text, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { sourceKindLabel } from '../analysis/model';
import { usePackStore } from '../store/pack';

const useStyles = makeStyles({
  value: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textUnderlineOffset: '3px',
    cursor: 'help',
    // 数値は途中で折り返さない（文字を 200% にしても数値の表示が割れて周りと重ならない。NFR-A11Y-009 AC-483）
    whiteSpace: 'nowrap',
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, borderRadius: tokens.borderRadiusSmall },
  },
  tip: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS },
});

export interface NumericValueProps {
  /** 表示する値（単位を含む文字列でもよい） */
  children: string | number;
  /** 値の出典の ID（顧客パックの sources.json） */
  sourceIds: readonly string[];
}

export function NumericValue({ children, sourceIds }: NumericValueProps) {
  const s = useStyles();
  const state = usePackStore((st) => st.state);
  const sources = state.status === 'ready' ? state.pack.data.sources.sources : [];
  const found = sourceIds.map((id) => sources.find((x) => x.id === id)).filter((x): x is (typeof sources)[number] => x !== undefined);

  const content = (
    <div className={s.tip}>
      {found.length === 0 ? <Text size={200}>出典の情報がありません</Text> : found.map((src) => (
        <div key={src.id}>
          <Text size={200} block weight="semibold">出典の種別: {sourceKindLabel(src.kind)}</Text>
          <Text size={200} block>{src.title}</Text>
          <Text size={200} block>取得日: {src.retrievedAt}</Text>
          <Text size={200} block>確度: {src.confidence}</Text>
        </div>
      ))}
    </div>
  );
  return (
    <Tooltip content={content} relationship="description" withArrow>
      <span className={s.value} tabIndex={0} data-testid="numeric-value">{children}</span>
    </Tooltip>
  );
}
