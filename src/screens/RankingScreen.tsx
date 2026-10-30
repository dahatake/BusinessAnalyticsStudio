// ランキング表（FR-039）。重み付きスコア Σ（重み × 評価値）の高い順。重みを変えると順位がすぐ変わる。
// 評価値は AI の提案値か顧客の決定値のどちらかを採用し、決定値のセルには「顧客決定」と表示して区別する（色だけに頼らない）。
import { useMemo, useState } from 'react';
import { Badge, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { CRITERIA } from '../analysis/priority';
import { usePriority } from '../analysis/usePriority';
import { KpiValue } from '../components/Brand';
import { useHighlightClass } from '../components/highlight';
import { isSelectedHighlight } from '../components/roving';
import { NumericValue } from '../components/NumericValue';
import { Panel } from '../components/Panel';
import { EmptyView, LoadingView } from '../components/StateViews';
import { ViewAsTableButton } from '../components/ViewTable';
import { onEntityKey, useEntityBinding } from '../selection/hooks';
import { Items3DSurface } from '../three/Items3DSurface';
import { norm, spread, type Item3D } from '../view/items3d';
import { useComponentView, usePublishViewItems } from '../view/useView';
import { useT } from '../i18n';
import { lifeOpacity, usePresenceItems } from '../motion';

const ORIGIN = 'ranking';

const useStyles = makeStyles({
  // 表の領域は縮めない（文字を拡大しても下の注記と重ならない。NFR-A11Y-009 AC-483）
  scroll: { overflowX: 'auto', flexShrink: 0 },
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
  const t = useT();
  const hl = useHighlightClass();
  const bind = useEntityBinding(ORIGIN);
  const { ready, rows } = usePriority();
  const { mode } = useComponentView(ORIGIN);
  // 「表で見る」で 3D の面と表（元のランキング表）を入れ替える（NFR-A11Y-003）。2D のときは常に表
  const [asTable, setAsTable] = useState(false);
  // 2D と 3D で同じ項目（FR-217 AC-501）。位置=順位（横）×スコア（高さ）、大きさ=スコア
  const items3d = useMemo<Item3D[]>(() => {
    const max = Math.max(0, ...rows.map((r) => r.score));
    const min = Math.min(max, ...rows.map((r) => r.score));
    return rows.map((r, i) => ({ id: r.id, label: `${r.rank}. ${r.title}`, x: spread(i, rows.length), y: norm(r.score, Math.min(0, min), max), z: 0.5, size: max > 0 ? r.score / max : 0 }));
  }, [rows]);
  usePublishViewItems(ORIGIN, useMemo(() => rows.map((r) => r.id), [rows]));
  // 出入り・遷移（FR-070 AC-086）: 行は同じ ID のまま、追加は現れ、削除は薄れて消え、スコアは中間値を経て最新へ収束する（最新値は data-score-latest と詳細で参照できる）
  const rowPresence = usePresenceItems(rows, (r) => r.id, (r) => [r.score]);
  if (!ready) return <LoadingView label={t('ランキングを読み込み中')} />;

  const decidedNotes = rows.flatMap((r) => CRITERIA
    .filter((c) => r.values[c.key].decided !== undefined)
    .map((c) => t('「{title}」の{label}: AI 提案 {ai} → 顧客決定 {decided}', { title: r.title, label: t(c.label), ai: r.values[c.key].ai, decided: r.values[c.key].decided ?? '' })));

  return (
    <Panel testId="component-ranking" title={t('ランキング表')} description={t('重み付きスコア（Σ 重み × 評価値）の高い順です。評価値は 1〜5。重みは「優先順位分析」で変えます。')} maxWidth="1200px">
      {mode === '3d' && rows.length > 0 ? <div><ViewAsTableButton asTable={asTable} onToggle={() => setAsTable((v) => !v)} /></div> : null}
      {rows.length === 0 ? (
        <EmptyView message={t('ランキングする課題がありません。')} />
      ) : mode === '3d' && !asTable ? (
        <Items3DSurface viewKey={ORIGIN} origin={ORIGIN} label={t('課題のランキング')} items={items3d} axes={{ x: t('順位'), y: t('重み付きスコア') }} />
      ) : (
        <div className={s.scroll}>
          <Table aria-label={t('優先順位のランキング')} size="small" className={s.table}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{t('順位')}</TableHeaderCell>
                <TableHeaderCell>{t('課題')}</TableHeaderCell>
                {CRITERIA.map((c) => <TableHeaderCell key={c.key}>{t(c.label)}</TableHeaderCell>)}
                <TableHeaderCell>{t('重み付きスコア')}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowPresence.map(({ item: r, vec, life, exiting }) => {
                if (exiting) {
                  return (
                    <TableRow key={r.id} aria-hidden className={s.row} style={{ opacity: lifeOpacity(life), pointerEvents: 'none' }}>
                      <TableCell className={s.num}>{r.rank}</TableCell>
                      <TableCell>{r.title}</TableCell>
                      {CRITERIA.map((c) => <TableCell key={c.key} className={s.num}>{r.values[c.key].value}</TableCell>)}
                      <TableCell className={s.num}>{(vec[0] ?? r.score).toFixed(1)}</TableCell>
                    </TableRow>
                  );
                }
                const props = bind(r.id);
                return (
                  <TableRow
                    key={r.id} {...props} tabIndex={0} style={{ opacity: lifeOpacity(life) }} data-score-latest={r.score.toFixed(1)}
                    aria-selected={isSelectedHighlight(props['data-highlight'])}
                    className={mergeClasses(s.row, hl(props['data-highlight']))}
                    onKeyDown={(e) => { onEntityKey(e, r.id, ORIGIN); }}
                  >
                    <TableCell className={s.num}>{r.rank}</TableCell>
                    <TableCell>{r.title}</TableCell>
                    {CRITERIA.map((c) => {
                      const v = r.values[c.key];
                      return (
                        <TableCell key={c.key} className={s.num} title={v.decided !== undefined ? t('AI 提案 {ai} / 顧客決定 {decided}', { ai: v.ai, decided: v.decided }) : t('AI 提案')}>
                          <NumericValue sourceIds={v.sourceIds}>{v.value}</NumericValue>
                          {v.origin === 'customer' ? <Badge size="medium" appearance="outline" color="brand" style={{ marginInlineStart: tokens.spacingHorizontalXS }}>{t('顧客決定')}</Badge> : null}
                        </TableCell>
                      );
                    })}
                    <TableCell className={s.num}><KpiValue>{(vec[0] ?? r.score).toFixed(1)}</KpiValue></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {decidedNotes.length > 0 ? (
        <div className={s.note} aria-label={t('AI 提案と顧客決定の違い')}>
          <Text weight="semibold" size={200}>{t('AI 提案と顧客決定の違い（評価値は顧客決定を採用）')}</Text>
          {decidedNotes.map((n) => <Text key={n} size={200}>{n}</Text>)}
        </div>
      ) : (
        <Text size={200}>{t('評価値はすべて AI の提案値です。顧客が決めた値があると「顧客決定」と表示します。')}</Text>
      )}
    </Panel>
  );
}

export { RankingScreen };
