// 画面「生成AIの効果的な活用シナリオの分析」（FR-284・FR-285）。解決策に生成AIを使う理由、または使わない理由を、適合性の判断基準で示す。
// 分析は [分析実行] を押したときだけ実行する（開いただけ・入力しただけでは実行しない）。既定はモック（ルールベース。外部送信なし）。
// 実接続（Foundry）は、共通接続（FR-275）が有効で、了承の記録があり、種別「人」を含むときは個人情報の確認が済んだときだけ。失敗時は原因を表示し、ルールベースの結果を代替にする。
import { useMemo, useState } from 'react';
import { Badge, Button, Field, MessageBar, MessageBarBody, Select, Text, Textarea, makeStyles, tokens } from '@fluentui/react-components';
import { Panel } from '../components/Panel';
import { EmptyView, LoadingView } from '../components/StateViews';
import { usePackStore } from '../store/pack';
import { tr, useT } from '../i18n';
import { confirmViaUi, gatePersonConfirm } from '../ai/personConfirm';
import { useGenAi, isGenAiReal } from '../genai/useGenAi';
import { fetchFoundryView } from '../ai/foundryClient';
import { analyzeViaRelay } from '../genai/foundryClient';
import {
  CONCLUSION_LABELS, GENAI_MAX_INPUT_CHARS, VERDICT_LABELS, analyzeRuleBased, validateInput, type ScenarioResult,
} from '../genai/scenario';

const genaiScopeLabel = (): string => tr('入力した解決策・課題の文章（Foundry への送信。顧客パックの内容は送りません）');

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM },
  // 入力欄と [分析実行] は同じ行に置く（縦に長いコンポーネントで、ボタンが画面の下端の外・常時表示の操作帯の下に出ないように）
  inputRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS },
  grow: { flexGrow: 1, flexBasis: '260px', minWidth: 0 },
  result: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalL, backgroundColor: tokens.colorNeutralBackground2, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium },
  list: { margin: 0, paddingInlineStart: tokens.spacingHorizontalXL, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS },
});

interface Shown { result: ScenarioResult; source: 'mock' | 'foundry' | 'fallback' }

export function GenAiScenarioScreen() {
  const s = useStyles();
  const t = useT();
  const state = usePackStore((st) => st.state);
  const g = useGenAi();
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | undefined>();
  const [problem, setProblem] = useState<{ reason: string; action: string } | undefined>();
  const [shown, setShown] = useState<Shown | undefined>();
  const [running, setRunning] = useState(false);

  const data = state.status === 'ready' ? state.pack.data : undefined;
  const solutions = useMemo(() => data?.issues.solutions ?? [], [data]);

  if (state.status === 'loading') return <Panel testId="component-genai-scenario" title={t('生成AIの効果的な活用シナリオの分析')}><LoadingView /></Panel>;
  if (state.status !== 'ready') return <Panel testId="component-genai-scenario" title={t('生成AIの効果的な活用シナリオの分析')}><EmptyView message={t('Project を開くと、解決策に生成AIが適するかを分析できます。')} /></Panel>;

  /** [分析実行]（押したときだけ呼ぶ） */
  const run = async (): Promise<void> => {
    const v = validateInput(text);
    setNotice(undefined);
    if (!v.ok) { setProblem({ reason: v.reason, action: v.action }); setShown(undefined); return; }
    setProblem(undefined);
    const rule = analyzeRuleBased(v.text);
    if (!g.granted || !g.relayUrl) { setShown({ result: rule, source: 'mock' }); return; }
    setRunning(true);
    try {
      // 共通接続（FR-275）が有効かどうかは中継の状態に従う（独自の切替は持たない）
      const view = await fetchFoundryView(g.relayUrl, g.packId);
      if (!isGenAiReal(g.packId, !!view?.enabled && view.configured, g.granted)) { setShown({ result: rule, source: 'mock' }); return; }
      // FR-219: 種別「人」を含む案件の外部送信は、確認（了承の記録がなければ止める）を通す
      const gate = await gatePersonConfirm({ destination: 'ai', scopeLabel: genaiScopeLabel(), data: g.data!, consent: g.consent, confirm: confirmViaUi });
      if (!gate.allowed) { setNotice(`${gate.reason ?? t('送信しませんでした。')}${t('ルールベースの結果を表示します。')}`); setShown({ result: rule, source: 'fallback' }); return; }
      const out = await analyzeViaRelay({ relayUrl: g.relayUrl, packId: g.packId }, v.text);
      if (out.ok) setShown({ result: out.result, source: 'foundry' });
      else { setNotice(`${out.message}${t('ルールベースの結果を代替として表示します。')}`); setShown({ result: rule, source: 'fallback' }); }
    } finally {
      setRunning(false);
    }
  };

  const r = shown?.result;
  return (
    <Panel testId="component-genai-scenario" title={t('生成AIの効果的な活用シナリオの分析')} description={t('解決策に生成AIを使うべきかを、適合性の判断基準で分析します。生成AIを使わない（不要／不向き）ことも正当な結論です。')}>
      <div className={s.body}>
        <div className={s.inputRow}>
          <Field label={t('解決策（自由入力）')} hint={t('{n} / {max} 文字', { n: text.length, max: GENAI_MAX_INPUT_CHARS })} className={s.grow}>
            <Textarea aria-label={t('解決策')} value={text} rows={3} onChange={(_, d) => { setText(d.value); setProblem(undefined); }} />
          </Field>
          <Button appearance="primary" disabled={running} onClick={() => { void run(); }}>{t('分析実行')}</Button>
        </div>
        <Field label={t('本アプリの解決策から選ぶ（課題-解決策分析で作成したもの）')}>
          <Select
            aria-label={t('本アプリの解決策を選ぶ')}
            value=""
            disabled={solutions.length === 0}
            onChange={(_, d) => {
              const sol = solutions.find((x) => x.id === d.value);
              if (sol) { setText(sol.title); setProblem(undefined); }
            }}
          >
            <option value="">{solutions.length === 0 ? t('（解決策がありません）') : t('選んで入力欄へ反映')}</option>
            {solutions.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </Select>
        </Field>
        {problem ? <MessageBar intent="error" role="alert"><MessageBarBody>{problem.reason}{problem.action}</MessageBarBody></MessageBar> : null}
        {notice ? <MessageBar intent="warning" role="alert"><MessageBarBody>{notice}</MessageBarBody></MessageBar> : null}
        {r && shown ? (
          <section aria-label={t('分析結果')} className={s.result}>
            <Text size={500} weight="semibold">{t('結論:')} <Badge appearance="filled" color={r.conclusion === 'suitable' ? 'success' : r.conclusion === 'conditional' ? 'warning' : 'informative'}>{CONCLUSION_LABELS[r.conclusion]}</Badge></Text>
            <Text size={200}>{t('分析の方式:')} {shown.source === 'foundry' ? t('Microsoft Foundry（実接続）') : shown.source === 'fallback' ? t('ルールベース（Foundry の代替）') : t('モック（ルールベース。外部へは送信していません）')}</Text>
            <Text>{r.reason}</Text>
            <Text weight="semibold">{t('適合性の判断基準')}</Text>
            <ul className={s.list}>
              {r.criteria.map((c) => (
                <li key={c.id}><b>{c.label}: {t(VERDICT_LABELS[c.verdict])}</b>（{t('根拠')}）{c.reason}</li>
              ))}
            </ul>
            <Text weight="semibold">{t('生成AI以外の代替案')}</Text>
            <ul className={s.list}>{r.alternatives.map((a) => <li key={a}>{a}</li>)}</ul>
          </section>
        ) : null}
      </div>
    </Panel>
  );
}
