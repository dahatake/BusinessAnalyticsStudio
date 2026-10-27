// 「KPI/OKR」コンポーネント（FR-153・FR-154）。Objective ごとに Key Result と KPI の現在値・目標値・達成度を、数値と文字で示す。
// 状態は色だけで示さず、アイコンと文字（達成・進行中・未着手・算出できない）を併記する。未定義の Project は「未設定」と定義への案内を出す。
// 定義は編集モード（FR-047）のときだけ「OKR を定義」から行う。
import { useMemo, useState } from 'react';
import { tr, useT } from '../i18n';
import {
  Badge, Button, DialogActions, DialogBody, DialogContent, DialogTitle, Field, Input, MessageBar, MessageBarBody, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { ViewAsTableButton } from '../components/ViewTable';
import { Items3DSurface } from '../three/Items3DSurface';
import { GraphSurface, type GraphEdgeIn, type GraphNodeIn } from '../components/GraphSurface';
import { GraphAlt } from '../components/GraphAlt';
import { spread, type Item3D, type Link3D } from '../view/items3d';
import { useComponentView, usePublishViewItems } from '../view/useView';
import { Add24Regular, CheckmarkCircle20Regular, CircleHalfFill20Regular, Circle20Regular, QuestionCircle20Regular } from '@fluentui/react-icons';
import { Panel } from '../components/Panel';
import { LoadingView } from '../components/StateViews';
import { achievement, achievementState, achievementText, emptyKeyResult, toDraft, type AchievementState, type KeyResultDraft, type OkrDraft } from '../okr/model';
import { useEditStore } from '../store/edit';
import { useCurrentOkr, useOkr, useOkrDialog } from '../store/okr';
import { usePackStore } from '../store/pack';

const useStyles = makeStyles({
  actions: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS },
  objective: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
  kr: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalM,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  // 無効のボタンは Fluent が forced-color-adjust: none を付ける。強制カラー（ハイコントラスト）では OS の色で描かせる（FR-058 AC-071）
  define: { forcedColorAdjust: 'auto', ':disabled': { forcedColorAdjust: 'auto' }, ':disabled:hover': { forcedColorAdjust: 'auto' }, ':disabled:hover:active': { forcedColorAdjust: 'auto' } },
  value: { fontVariantNumeric: 'tabular-nums' },
  state: { display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalXS, fontVariantNumeric: 'tabular-nums' },
  form: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM },
  errors: { margin: 0, paddingLeft: tokens.spacingHorizontalXL },
  krForm: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalM,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
});

const STATE_ICON: Record<AchievementState, JSX.Element> = {
  達成: <CheckmarkCircle20Regular />,
  進行中: <CircleHalfFill20Regular />,
  未着手: <Circle20Regular />,
  算出できない: <QuestionCircle20Regular />,
};
const STATE_COLOR: Record<AchievementState, 'success' | 'informative' | 'subtle' | 'warning'> = {
  達成: 'success', 進行中: 'informative', 未着手: 'subtle', 算出できない: 'warning',
};

const num = (n: number) => n.toLocaleString('ja-JP');

function formatUpdated(iso: string): string {
  if (!iso) return tr('未更新');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function DefineDialog({ target, onClose }: { target: string; onClose: () => void }) {
  const t = useT();
  const s = useStyles();
  const draft = useOkrDialog((d) => d.draft) ?? { objective: '', keyResults: [] };
  const setDraft = (fn: (d: OkrDraft) => OkrDraft) => useOkrDialog.getState().set(fn(useOkrDialog.getState().draft ?? { objective: '', keyResults: [] }));
  const [errors, setErrors] = useState<string[]>([]);
  const setKr = (i: number, patch: Partial<KeyResultDraft>) =>
    setDraft((d) => ({ ...d, keyResults: d.keyResults.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const save = () => {
    const r = useOkr.getState().save(target, draft);
    if (r.ok) { setErrors([]); onClose(); } else setErrors(r.errors);
  };
  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface aria-label={t('OKR の定義')}>
        <DialogBody>
          <DialogTitle>{t('OKR の定義')}</DialogTitle>
          <DialogContent className={s.form}>
            <Field label="Objective" required>
              <Input value={draft.objective} onChange={(_, d) => setDraft((x) => ({ ...x, objective: d.value }))} />
            </Field>
            {draft.keyResults.map((r, i) => (
              <div key={i} className={s.krForm} data-testid="key-result" role="group" aria-label={`Key Result ${i + 1}`}>
                <Field label={t('Key Result 名')} required><Input value={r.name} onChange={(_, d) => setKr(i, { name: d.value })} /></Field>
                <Field label={t('KPI 名')} required><Input value={r.kpiName} onChange={(_, d) => setKr(i, { kpiName: d.value })} /></Field>
                <Field label={t('単位')} required><Input value={r.unit} onChange={(_, d) => setKr(i, { unit: d.value })} /></Field>
                <Field label={t('基準値')} required><Input type="number" value={r.baseline} onChange={(_, d) => setKr(i, { baseline: d.value })} /></Field>
                <Field label={t('目標値')} required><Input type="number" value={r.target} onChange={(_, d) => setKr(i, { target: d.value })} /></Field>
                <Field label={t('現在値')} required><Input type="number" value={r.current} onChange={(_, d) => setKr(i, { current: d.value })} /></Field>
              </div>
            ))}
            <div>
              <Button icon={<Add24Regular />} onClick={() => setDraft((d) => ({ ...d, keyResults: [...d.keyResults, emptyKeyResult()] }))}>{t('Key Result を追加')}</Button>
            </div>
            {errors.length > 0 ? (
              <MessageBar intent="error" layout="multiline" role="alert">
                <MessageBarBody>
                  <ul className={s.errors}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </MessageBarBody>
              </MessageBar>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={save}>{t('保存')}</Button>
            <Button onClick={onClose}>{t('キャンセル')}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function KpiOkrScreen() {
  const t = useT();
  const s = useStyles();
  const ready = usePackStore((st) => st.state.status === 'ready');
  const editMode = useEditStore((st) => st.editMode);
  const { target, okr } = useCurrentOkr();
  const open = useOkrDialog((d) => d.open);
  // 3D（FR-217 AC-501）: Key Result を、Objective（横）×並び（奥行き）×達成度（高さ・大きさ）に置く。同じ項目（Key Result）の ID は 2D・3D で同じ
  const { mode } = useComponentView('kpi-okr');
  const [asTable, setAsTable] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const krs = useMemo(() => (okr?.objectives ?? []).flatMap((o, oi) => o.keyResults.map((r, ri) => ({ id: `okr-${oi + 1}-${ri + 1}`, oi, ri, n: o.keyResults.length, objective: o.objective, r }))), [okr]);
  usePublishViewItems('kpi-okr', useMemo(() => krs.map((k) => k.id), [krs]));
  const objCount = okr?.objectives.length ?? 0;
  const items3d = useMemo<Item3D[]>(() => krs.map((k) => {
    const a = achievement(k.r.kpi);
    const v = a === null ? 0 : Math.min(1, Math.max(0, a));
    return { id: k.id, label: `${k.r.name}（${achievementText(k.r.kpi)}）`, group: k.objective, x: spread(k.oi, objCount), z: spread(k.ri, k.n), y: v, size: v };
  }), [krs, objCount]);
  const links3d = useMemo<Link3D[]>(() => krs.filter((k) => k.ri > 0).map((k) => ({ from: `okr-${k.oi + 1}-${k.ri}`, to: k.id })), [krs]);
  // Graph（FR-238）: Objective と Key Result をノードに、Key Result → Objective を「達成する」の向き付きのエッジにする（Key Result は 2D・3D と同じ項目・同じ件数）
  const graphNodes = useMemo<GraphNodeIn[]>(() => [
    ...(okr?.objectives ?? []).map((o, oi) => ({ id: `okr-obj-${oi + 1}`, name: o.objective, kind: 'Objective' })),
    ...krs.map((k) => ({ id: k.id, name: k.r.name, kind: 'Key Result', note: `${k.r.kpi.name} ${achievementText(k.r.kpi)}` })),
  ], [okr, krs]);
  const graphEdges = useMemo<GraphEdgeIn[]>(() => krs.map((k) => ({ id: `${k.id}>obj`, from: k.id, to: `okr-obj-${k.oi + 1}`, label: t('達成する'), meaning: 'achieves' })), [krs]);
  if (!ready) return <LoadingView label={t('KPI/OKR を読み込み中')} />;
  return (
    <Panel testId="component-kpi-okr" title="KPI/OKR" description={t('議論の目的と成果を、Objective・Key Result・KPI の数値で共有します。')}>
      <div className={s.actions}>
        <Button appearance="primary" className={s.define} disabled={!editMode} onClick={() => useOkrDialog.getState().show(toDraft(okr?.objectives[0]))}>{t('OKR を定義')}</Button>
        {!editMode ? <Text size={200}>{t('定義と現在値の更新は、編集モードを ON にして行います。')}</Text> : null}
        <Text size={200} data-testid="okr-updated">最終更新日時: {okr ? formatUpdated(okr.updatedAt) : t('未更新')}</Text>
      </div>
      {!okr ? (
        <div data-testid="okr-unset" role="status">
          <Text weight="semibold" block>{t('未設定')}</Text>
          <Text block>{t('この作業先には KPI と OKR がありません。編集モードを ON にして「OKR を定義」から、Objective・Key Result・KPI を設定してください。')}</Text>
        </div>
      ) : mode === 'graph' ? (
        <>
          <GraphSurface origin="kpi-okr" label="KPI/OKR" nodes={graphNodes} edges={graphEdges} />
          <GraphAlt
            origin="kpi-okr" label="KPI/OKR" nodes={graphNodes.map((n) => ({ id: n.id, name: n.name, kind: n.kind, values: [n.note ?? '—'] }))} columns={[t('KPI と達成度')]}
            relations={graphEdges.map((e) => ({ ...e }))}
          />
        </>
      ) : mode === '3d' ? (
        <>
          <div><ViewAsTableButton asTable={asTable} onToggle={() => setAsTable((v) => !v)} /></div>
          {asTable ? (
            <Table aria-label={t('KPI/OKR の値')} size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Objective</TableHeaderCell><TableHeaderCell>Key Result</TableHeaderCell><TableHeaderCell>KPI</TableHeaderCell>
                  <TableHeaderCell>{t('現在値')}</TableHeaderCell><TableHeaderCell>{t('目標値')}</TableHeaderCell><TableHeaderCell>{t('達成度')}</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {krs.map((k) => (
                  <TableRow key={k.id} data-kr-id={k.id}>
                    <TableCell>{k.objective}</TableCell><TableCell>{k.r.name}</TableCell><TableCell>{k.r.kpi.name}</TableCell>
                    <TableCell>{num(k.r.kpi.current)} {k.r.kpi.unit}</TableCell><TableCell>{num(k.r.kpi.target)} {k.r.kpi.unit}</TableCell>
                    <TableCell>{achievementText(k.r.kpi)}（{achievementState(k.r.kpi)}）</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Items3DSurface
              viewKey="kpi-okr" origin="kpi-okr" label={t('KPI/OKR の Key Result')} items={items3d} links={links3d} axes={{ x: 'Objective', y: t('達成度'), z: 'Key Result' }}
              selected={picked}
              onSelect={(id, additive) => setPicked((p) => (additive ? new Set([...p, id]) : new Set([id])))}
            />
          )}
        </>
      ) : (
        okr.objectives.map((o, oi) => (
          <section key={oi} className={s.objective} aria-label={`Objective ${o.objective}`}>
            <Text as="h3" weight="semibold" size={400}>Objective: {o.objective}</Text>
            <ul className={s.list}>
              {o.keyResults.map((r, ri) => {
                const st = achievementState(r.kpi);
                return (
                  <li key={ri} className={s.kr} data-testid="key-result-view">
                    <div><Text size={200} block>Key Result</Text><Text weight="semibold">{r.name}</Text></div>
                    <div><Text size={200} block>KPI</Text><Text>{r.kpi.name}</Text></div>
                    <div><Text size={200} block>{t('現在値')}</Text><Text className={s.value}>{num(r.kpi.current)} {r.kpi.unit}</Text></div>
                    <div><Text size={200} block>{t('目標値')}</Text><Text className={s.value}>{num(r.kpi.target)} {r.kpi.unit}</Text></div>
                    <div>
                      <Text size={200} block>{t('達成度')}</Text>
                      <span className={s.state}>
                        {STATE_ICON[st]}
                        <Text weight="semibold" className={s.value} data-testid="kpi-achievement">{achievementText(r.kpi)}</Text>
                        <Badge appearance="tint" color={STATE_COLOR[st]} data-testid="kpi-state">{st}</Badge>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      {open ? <DefineDialog target={target} onClose={() => useOkrDialog.getState().close()} /> : null}
    </Panel>
  );
}

export { KpiOkrScreen };
