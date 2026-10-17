// エグゼクティブサマリー（FR-041）。各コンポーネントの上部に、結論・根拠の数値・推奨アクションを置く。
// 接続していないときは「AI 生成（モック）」のテンプレート。利用者が編集・固定でき、「編集版」と表示して AI 版と区別する。
// 編集・固定は編集モード（FR-047）が ON のときだけ。数値は出典つき（NumericValue）で示す。
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Field, Text, Textarea, makeStyles, tokens } from '@fluentui/react-components';
import { Edit16Regular, Pin16Regular, PinOff16Regular } from '@fluentui/react-icons';
import { MOCK_LABEL, REAL_LABEL } from '../ai/client';
import { useAi } from '../ai/useAi';
import {
  buildSummary, contentText, fingerprint, partText, type SummaryContent, type SummaryScope, type SummaryText,
} from '../analysis/summary';
import { packKeyOf } from '../discussion/model';
import { useEditStore } from '../store/edit';
import { usePackStore } from '../store/pack';
import { usePriorityStore } from '../store/priority';
import { activeEdited, useSummaryStore } from '../store/summary';
import { useTreeStore } from '../store/tree';
import { NumericValue } from './NumericValue';
import { elevationStyles } from '../theme/tokens';

const useStyles = makeStyles({
  root: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    // Fluent 2 のカード: ニュートラルの面と、カードの役割の影（段 4。ハイコントラストでは境界線。NFR-UX-015・NFR-UX-016）
    backgroundColor: tokens.colorNeutralBackground1,
    ...elevationStyles('card'),
  },
  head: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXS },
  grow: { flexGrow: 1 },
  row: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXXS },
  label: { color: tokens.colorNeutralForeground2 },
  body: { overflowWrap: 'anywhere', minWidth: 0 },
  actions: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXS },
});

export interface ExecutiveSummaryProps {
  scope: SummaryScope;
}

export function ExecutiveSummary({ scope }: ExecutiveSummaryProps) {
  const s = useStyles();
  const state = usePackStore((st) => st.state);
  const weights = usePriorityStore((st) => st.weights);
  const editEnabled = useEditStore((st) => st.editMode);
  const { mode, ask } = useAi();
  const data = state.status === 'ready' ? state.pack.data : undefined;
  const key = data ? packKeyOf(data.customer.name, data.customer.projectName) : '';
  const tree = useTreeStore((st) => st.docs[key]);
  const stored = useSummaryStore((st) => st.byPack[key]?.[scope]);

  const generated: SummaryContent | undefined = useMemo(
    () => (data ? buildSummary(scope, data, { weights, tree }) : undefined),
    [data, scope, weights, tree],
  );
  const fp = generated ? fingerprint(generated) : '';

  // 実接続のときは、AI に結論の文を更新させる（失敗・未接続はテンプレートのまま）
  const [aiConclusion, setAiConclusion] = useState<{ fp: string; text: string } | null>(null);
  useEffect(() => {
    if (mode !== 'connected' || !generated) return;
    let alive = true;
    void ask('exec-summary', `次の要約の結論を 1 文で更新してください: ${contentText(generated).conclusion} / ${contentText(generated).evidence}`)
      .then((r) => { if (alive && r.mode === 'connected' && r.answer.trim() !== '') setAiConclusion({ fp, text: r.answer.trim().split(/\n/)[0] as string }); })
      .catch(() => undefined);
    return () => { alive = false; };
    // fp が変わったとき（データが変わったとき）だけ更新する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, fp]);

  const edited = activeEdited(stored, fp);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SummaryText>({ conclusion: '', evidence: '', action: '' });

  if (!data || !generated) return null;

  const aiText = contentText(generated);
  const shown: SummaryText = edited ? edited.text : aiConclusion?.fp === fp ? { ...aiText, conclusion: aiConclusion.text } : aiText;
  const label = edited?.human ? '編集版' : mode === 'connected' ? REAL_LABEL : MOCK_LABEL;

  const startEdit = () => { setDraft(shown); setEditing(true); };
  const save = (pinned: boolean) => {
    useSummaryStore.getState().save(key, scope, draft, pinned, fp, true);
    setEditing(false);
  };

  return (
    <section className={s.root} data-surface="card" data-testid="executive-summary" aria-label="エグゼクティブサマリー">
      <div className={s.head}>
        <Text as="h3" weight="semibold" size={400}>エグゼクティブサマリー</Text>
        <Badge appearance={edited?.human ? 'filled' : 'tint'} color={edited?.human ? 'brand' : 'informative'} data-testid="summary-origin">{label}</Badge>
        {edited?.pinned ? <Badge appearance="outline" color="success" icon={<Pin16Regular aria-hidden />}>固定済み</Badge> : null}
        <span className={s.grow} />
        {editing ? null : (
          <span className={s.actions}>
            <Button size="small" icon={<Edit16Regular aria-hidden />} disabled={!editEnabled} title={editEnabled ? undefined : '編集モードを ON にすると編集できます'} onClick={startEdit}>編集</Button>
            {edited?.pinned ? (
              <Button size="small" icon={<PinOff16Regular aria-hidden />} disabled={!editEnabled} onClick={() => (edited.human ? useSummaryStore.getState().setPinned(key, scope, false) : useSummaryStore.getState().discard(key, scope))}>固定を解除</Button>
            ) : (
              <Button
                size="small" icon={<Pin16Regular aria-hidden />} disabled={!editEnabled}
                onClick={() => { useSummaryStore.getState().save(key, scope, shown, true, fp, false); }}
              >固定</Button>
            )}
            {edited?.human ? <Button size="small" appearance="subtle" disabled={!editEnabled} onClick={() => useSummaryStore.getState().discard(key, scope)}>AI 版に戻す</Button> : null}
          </span>
        )}
      </div>

      {editing ? (
        <>
          <Field label="結論"><Textarea resize="vertical" rows={2} value={draft.conclusion} onChange={(_, d) => setDraft({ ...draft, conclusion: d.value })} /></Field>
          <Field label="根拠の数値"><Textarea resize="vertical" rows={2} value={draft.evidence} onChange={(_, d) => setDraft({ ...draft, evidence: d.value })} /></Field>
          <Field label="推奨アクション"><Textarea resize="vertical" rows={2} value={draft.action} onChange={(_, d) => setDraft({ ...draft, action: d.value })} /></Field>
          <div className={s.actions}>
            <Button appearance="primary" icon={<Pin16Regular aria-hidden />} onClick={() => save(true)}>固定</Button>
            <Button onClick={() => save(false)}>保存のみ</Button>
            <Button appearance="subtle" onClick={() => setEditing(false)}>キャンセル</Button>
          </div>
        </>
      ) : (
        <>
          <div className={s.row}>
            <Text weight="semibold" className={s.label}>結論</Text>
            <Text className={s.body} data-testid="summary-conclusion">{shown.conclusion}</Text>
          </div>
          <div className={s.row}>
            <Text weight="semibold" className={s.label}>根拠の数値</Text>
            <Text className={s.body} data-testid="summary-evidence">
              {edited ? shown.evidence : generated.evidence.map((p, i) => (
                typeof p === 'string' ? <Fragment key={i}>{p}</Fragment> : <NumericValue key={i} sourceIds={p.sourceIds}>{partText(p)}</NumericValue>
              ))}
            </Text>
          </div>
          <div className={s.row}>
            <Text weight="semibold" className={s.label}>推奨アクション</Text>
            <Text className={s.body} data-testid="summary-action">{shown.action}</Text>
          </div>
        </>
      )}
    </section>
  );
}
