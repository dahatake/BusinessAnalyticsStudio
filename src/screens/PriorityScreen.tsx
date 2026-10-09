// 優先順位分析（FR-039）。重みのスライダー（キーボード・数値入力でも操作可）、重み付きスコアの KPI、感度分析、AI 提案と顧客決定の区別。
// ランキング表（component-ranking）と 2×2 マトリクス（component-matrix）は別のコンポーネントで、同じ重みから再計算される。
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Input, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ArrowReset24Regular } from '@fluentui/react-icons';
import {
  AI_WEIGHTS, CRITERIA, WEIGHT_MAX, WEIGHT_MIN, parseWeight, sensitivity, type CriterionKey,
} from '../analysis/priority';
import { usePriority } from '../analysis/usePriority';
import { KpiValue } from '../components/Brand';
import { ExecutiveSummary } from '../components/ExecutiveSummary';
import { NumericValue } from '../components/NumericValue';
import { Panel } from '../components/Panel';
import { RelatedMini } from '../components/RelatedMini';
import { LoadingView } from '../components/StateViews';
import { usePriorityStore } from '../store/priority';

const useStyles = makeStyles({
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalM },
  kpi: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXXS,
    padding: tokens.spacingHorizontalM,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  weights: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, margin: 0, padding: 0, border: 'none', minWidth: 0 },
  weightRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(7em, 10em) minmax(120px, 1fr) 96px auto',
    columnGap: tokens.spacingHorizontalM,
    alignItems: 'center',
    '@media (max-width: 560px)': { gridTemplateColumns: '1fr 96px' },
  },
  range: { width: '100%', height: '24px', minWidth: 0, accentColor: tokens.colorBrandBackground, cursor: 'pointer' },
  error: { color: tokens.colorPaletteRedForeground1, gridColumn: '1 / -1' },
  scroll: { overflowX: 'auto' },
});

function WeightRow({ criterion, label }: { criterion: CriterionKey; label: string }) {
  const s = useStyles();
  const weight = usePriorityStore((st) => st.weights[criterion]);
  const [draft, setDraft] = useState(String(weight));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(String(weight)); }, [weight]);

  const commit = (text: string, reportError: boolean): void => {
    const r = parseWeight(text);
    if (r.ok) { usePriorityStore.getState().setWeight(criterion, r.value); setError(null); }
    else if (reportError) setError(r.reason);
  };
  const name = `${label}の重み`;
  const decided = weight !== AI_WEIGHTS[criterion];
  return (
    <div className={s.weightRow}>
      <Text weight="semibold">{label}</Text>
      <input
        type="range" className={s.range} aria-label={name}
        min={WEIGHT_MIN} max={WEIGHT_MAX} step={1} value={weight}
        aria-valuemin={WEIGHT_MIN} aria-valuemax={WEIGHT_MAX} aria-valuenow={weight} aria-valuetext={`${weight}`}
        onChange={(e) => { usePriorityStore.getState().setWeight(criterion, Number(e.target.value)); setError(null); }}
      />
      <Input
        type="number" aria-label={name} value={draft} min={WEIGHT_MIN} max={WEIGHT_MAX} step={1}
        aria-invalid={error ? true : undefined}
        onChange={(_, d) => setDraft(d.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(draft, true); }
          if (e.key === 'Escape') { e.preventDefault(); setDraft(String(weight)); setError(null); }
        }}
        onBlur={() => commit(draft, false)}
      />
      <Badge appearance={decided ? 'filled' : 'tint'} color={decided ? 'brand' : 'informative'}>
        {decided ? `顧客決定（AI 提案は ${AI_WEIGHTS[criterion]}）` : 'AI 提案'}
      </Badge>
      {error ? <Text role="alert" size={200} className={s.error}>{error}</Text> : null}
    </div>
  );
}

function PriorityScreen() {
  const s = useStyles();
  const { ready, issues, weights, rows } = usePriority();
  const sens = useMemo(() => sensitivity(issues, weights), [issues, weights]);
  const reset = usePriorityStore((st) => st.reset);

  if (!ready) return <LoadingView label="優先順位を読み込み中" />;

  const top = rows[0];
  const costs = issues.map((i) => i.evaluation?.cost).filter((c) => typeof c?.value === 'number');
  const totalCost = costs.reduce((a, c) => a + (c?.value as number), 0);
  const rois = issues.map((i) => i.evaluation?.roi).filter((c) => typeof c?.value === 'number');
  const avgRoi = rois.length ? Math.round(rois.reduce((a, c) => a + (c?.value as number), 0) / rois.length) : undefined;
  const uniq = (l: ReadonlyArray<{ sourceIds: readonly string[] } | undefined>) => [...new Set(l.flatMap((c) => c?.sourceIds ?? []))];
  const label = (k: CriterionKey) => CRITERIA.find((c) => c.key === k)?.label ?? k;

  return (
    <Panel
      testId="component-priority"
      title="優先順位分析"
      description="観点ごとの重みを変えると、ランキング表と 2×2 マトリクスの順位・配置がすぐ変わります。AI の提案値と顧客の決定値は区別して表示します。"
      maxWidth="1200px"
    >
      <ExecutiveSummary scope="priority" />

      <div className={s.kpis}>
        <div className={s.kpi}>
          <Text size={200}>最上位の課題の重み付きスコア</Text>
          <Text size={600} weight="semibold"><KpiValue>{top ? top.score.toFixed(1) : '—'}</KpiValue></Text>
          <Text size={200}>{top?.title ?? '課題がありません'}</Text>
        </div>
        <div className={s.kpi}>
          <Text size={200}>コストの合計</Text>
          <Text size={600} weight="semibold">
            <KpiValue><NumericValue sourceIds={uniq(costs as never)}>{totalCost.toLocaleString('ja-JP')}</NumericValue></KpiValue> 万円
          </Text>
        </div>
        <div className={s.kpi}>
          <Text size={200}>ROI の平均</Text>
          <Text size={600} weight="semibold">
            {avgRoi === undefined ? '—' : <><KpiValue><NumericValue sourceIds={uniq(rois as never)}>{avgRoi}</NumericValue></KpiValue>%</>}
          </Text>
        </div>
      </div>

      <fieldset className={s.weights} aria-label="観点の重み">
        <legend><Text as="h3" size={500} weight="semibold">観点の重み（{WEIGHT_MIN}〜{WEIGHT_MAX}）</Text></legend>
        {CRITERIA.map((c) => <WeightRow key={c.key} criterion={c.key} label={c.label} />)}
        <div>
          <Button icon={<ArrowReset24Regular aria-hidden />} onClick={reset}>AI 提案の重みに戻す</Button>
        </div>
      </fieldset>

      <section aria-label="感度分析">
        <Text as="h3" size={500} weight="semibold" block>感度分析（各重みを ±1 したときの順位の変化）</Text>
        <div className={s.scroll} tabIndex={0} role="region" aria-label="感度分析の表（横にスクロールできます）">
          <Table aria-label="感度分析" size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>観点</TableHeaderCell>
                <TableHeaderCell>重みを 1 減らす</TableHeaderCell>
                <TableHeaderCell>重みを 1 増やす</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CRITERIA.map((c) => (
                <TableRow key={c.key}>
                  <TableCell>{label(c.key)}</TableCell>
                  {([-1, 1] as const).map((d) => {
                    const r = sens.find((x) => x.criterion === c.key && x.delta === d);
                    return (
                      <TableCell key={d}>
                        {!r || r.changes.length === 0 ? '順位の変化なし' : r.changes.map((x) => `${x.title}: ${x.from}位→${x.to}位`).join('、')}
                        {r?.topChanged ? <Badge appearance="filled" color="warning" style={{ marginInlineStart: tokens.spacingHorizontalS }}>1 位が入れ替わる</Badge> : null}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <RelatedMini origin="priority" />
    </Panel>
  );
}

export { PriorityScreen };
