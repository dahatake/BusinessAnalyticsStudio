// ランキング表（FR-039）。重み付きスコア Σ（重み × 評価値）の高い順。重みを変えると順位がすぐ変わる。
// 評価値は AI の提案値か顧客の決定値のどちらかを採用し、決定値のセルには「顧客決定」と表示して区別する（色だけに頼らない）。
import { Badge, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { CRITERIA } from '../analysis/priority';
import { usePriority } from '../analysis/usePriority';
import { KpiValue } from '../components/Brand';
import { useHighlightClass } from '../components/highlight';
import { isSelectedHighlight } from '../components/roving';
import { NumericValue } from '../components/NumericValue';
import { Panel } from '../components/Panel';
import { EmptyView, LoadingView } from '../components/StateViews';
import { onEntityKey, useEntityBinding } from '../selection/hooks';

const ORIGIN = 'ranking';

const useStyles = makeStyles({
  scroll: { overflowX: 'auto' },
  table: { minWidth: '600px' },
  row: {
    cursor: 'pointer',
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
  num: { textAlign: 'end', fontVariantNumeric: 'tabular-nums' },
  note: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXXS },
});

function RankingScreen() {
  const s = useStyles();
  const hl = useHighlightClass();
  const bind = useEntityBinding(ORIGIN);
  const { ready, rows } = usePriority();
  if (!ready) return <LoadingView label="ランキングを読み込み中" />;

  const decidedNotes = rows.flatMap((r) => CRITERIA
    .filter((c) => r.values[c.key].decided !== undefined)
    .map((c) => `「${r.title}」の${c.label}: AI 提案 ${r.values[c.key].ai} → 顧客決定 ${r.values[c.key].decided}`));

  return (
    <Panel testId="component-ranking" title="ランキング表" description="重み付きスコア（Σ 重み × 評価値）の高い順です。評価値は 1〜5。重みは「優先順位分析」で変えます。" maxWidth="1200px">
      {rows.length === 0 ? (
        <EmptyView message="ランキングする課題がありません。" />
      ) : (
        <div className={s.scroll}>
          <Table aria-label="優先順位のランキング" size="small" className={s.table}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>順位</TableHeaderCell>
                <TableHeaderCell>課題</TableHeaderCell>
                {CRITERIA.map((c) => <TableHeaderCell key={c.key}>{c.label}</TableHeaderCell>)}
                <TableHeaderCell>重み付きスコア</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const props = bind(r.id);
                return (
                  <TableRow
                    key={r.id} {...props} tabIndex={0}
                    aria-selected={isSelectedHighlight(props['data-highlight'])}
                    className={mergeClasses(s.row, hl(props['data-highlight']))}
                    onKeyDown={(e) => { onEntityKey(e, r.id, ORIGIN); }}
                  >
                    <TableCell className={s.num}>{r.rank}</TableCell>
                    <TableCell>{r.title}</TableCell>
                    {CRITERIA.map((c) => {
                      const v = r.values[c.key];
                      return (
                        <TableCell key={c.key} className={s.num} title={v.decided !== undefined ? `AI 提案 ${v.ai} / 顧客決定 ${v.decided}` : 'AI 提案'}>
                          <NumericValue sourceIds={v.sourceIds}>{v.value}</NumericValue>
                          {v.origin === 'customer' ? <Badge size="medium" appearance="outline" color="brand" style={{ marginInlineStart: tokens.spacingHorizontalXS }}>顧客決定</Badge> : null}
                        </TableCell>
                      );
                    })}
                    <TableCell className={s.num}><KpiValue>{r.score.toFixed(1)}</KpiValue></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {decidedNotes.length > 0 ? (
        <div className={s.note} aria-label="AI 提案と顧客決定の違い">
          <Text weight="semibold" size={200}>AI 提案と顧客決定の違い（評価値は顧客決定を採用）</Text>
          {decidedNotes.map((t) => <Text key={t} size={200}>{t}</Text>)}
        </div>
      ) : (
        <Text size={200}>評価値はすべて AI の提案値です。顧客が決めた値があると「顧客決定」と表示します。</Text>
      )}
    </Panel>
  );
}

export { RankingScreen };
