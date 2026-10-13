// 「KPI/OKR」コンポーネント（FR-153・FR-154）。Objective ごとに Key Result と KPI の現在値・目標値・達成度を、数値と文字で示す。
// 状態は色だけで示さず、アイコンと文字（達成・進行中・未着手・算出できない）を併記する。未定義の Project は「未設定」と定義への案内を出す。
// 定義は編集モード（FR-047）のときだけ「OKR を定義」から行う。
import { useState } from 'react';
import {
  Badge, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, MessageBar, MessageBarBody, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import { Add24Regular, CheckmarkCircle20Regular, CircleHalfFill20Regular, Circle20Regular, QuestionCircle20Regular } from '@fluentui/react-icons';
import { Panel } from '../components/Panel';
import { LoadingView } from '../components/StateViews';
import { achievementState, achievementText, emptyKeyResult, toDraft, type AchievementState, type KeyResultDraft, type OkrDraft } from '../okr/model';
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
  if (!iso) return '未更新';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function DefineDialog({ target, onClose }: { target: string; onClose: () => void }) {
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
      <DialogSurface aria-label="OKR の定義">
        <DialogBody>
          <DialogTitle>OKR の定義</DialogTitle>
          <DialogContent className={s.form}>
            <Field label="Objective" required>
              <Input value={draft.objective} onChange={(_, d) => setDraft((x) => ({ ...x, objective: d.value }))} />
            </Field>
            {draft.keyResults.map((r, i) => (
              <div key={i} className={s.krForm} data-testid="key-result" role="group" aria-label={`Key Result ${i + 1}`}>
                <Field label="Key Result 名" required><Input value={r.name} onChange={(_, d) => setKr(i, { name: d.value })} /></Field>
                <Field label="KPI 名" required><Input value={r.kpiName} onChange={(_, d) => setKr(i, { kpiName: d.value })} /></Field>
                <Field label="単位" required><Input value={r.unit} onChange={(_, d) => setKr(i, { unit: d.value })} /></Field>
                <Field label="基準値" required><Input type="number" value={r.baseline} onChange={(_, d) => setKr(i, { baseline: d.value })} /></Field>
                <Field label="目標値" required><Input type="number" value={r.target} onChange={(_, d) => setKr(i, { target: d.value })} /></Field>
                <Field label="現在値" required><Input type="number" value={r.current} onChange={(_, d) => setKr(i, { current: d.value })} /></Field>
              </div>
            ))}
            <div>
              <Button icon={<Add24Regular />} onClick={() => setDraft((d) => ({ ...d, keyResults: [...d.keyResults, emptyKeyResult()] }))}>Key Result を追加</Button>
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
            <Button appearance="primary" onClick={save}>保存</Button>
            <Button onClick={onClose}>キャンセル</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function KpiOkrScreen() {
  const s = useStyles();
  const ready = usePackStore((st) => st.state.status === 'ready');
  const editMode = useEditStore((st) => st.editMode);
  const { target, okr } = useCurrentOkr();
  const open = useOkrDialog((d) => d.open);
  if (!ready) return <LoadingView label="KPI/OKR を読み込み中" />;
  return (
    <Panel testId="component-kpi-okr" title="KPI/OKR" description="議論の目的と成果を、Objective・Key Result・KPI の数値で共有します。">
      <div className={s.actions}>
        <Button appearance="primary" disabled={!editMode} onClick={() => useOkrDialog.getState().show(toDraft(okr?.objectives[0]))}>OKR を定義</Button>
        {!editMode ? <Text size={200}>定義と現在値の更新は、編集モードを ON にして行います。</Text> : null}
        <Text size={200} data-testid="okr-updated">最終更新日時: {okr ? formatUpdated(okr.updatedAt) : '未更新'}</Text>
      </div>
      {!okr ? (
        <div data-testid="okr-unset" role="status">
          <Text weight="semibold" block>未設定</Text>
          <Text block>この作業先には KPI と OKR がありません。編集モードを ON にして「OKR を定義」から、Objective・Key Result・KPI を設定してください。</Text>
        </div>
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
                    <div><Text size={200} block>現在値</Text><Text className={s.value}>{num(r.kpi.current)} {r.kpi.unit}</Text></div>
                    <div><Text size={200} block>目標値</Text><Text className={s.value}>{num(r.kpi.target)} {r.kpi.unit}</Text></div>
                    <div>
                      <Text size={200} block>達成度</Text>
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
