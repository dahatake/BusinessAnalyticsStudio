// チャットの土台（FR-010・FR-011・FR-132・NFR-SEC-002）と、Copilot 風チャットの根拠・出典カード（FR-017）。質問は askAi だけを通る。
// 回答には、顧客パックの出典から選んだ出典カードと「AI 生成」のラベルを付ける。モックの回答は顧客パックの項目だけを根拠にする。
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Link, MessageBar, MessageBarBody, Spinner, Text, makeStyles, tokens } from '@fluentui/react-components';
import { safeHttpUrl, type Source } from '../analysis/model';
import { Panel } from '../components/Panel';
import { useEntityGraph } from '../selection/hooks';
import { usePackStore } from '../store/pack';
import { MOCK_LABEL, REAL_LABEL, type AiResult } from './client';
import { groundQuestion } from './grounding';
import { useAi } from './useAi';
import { useConsent } from './useConsent';
import { fetchFoundryView } from './foundryClient';
import { buildFoundryPrompt, TRIM_NOTICE, type FoundryPrompt } from './foundryChat';
import { sendFoundryChat } from './foundryChatFlow';
import { useUsageStore } from './foundryUsage';
import { confirmViaUi, countPersons, gatePersonConfirm } from './personConfirm';

const FOUNDRY_LABEL = 'AI 生成（Microsoft Foundry）';
const FOUNDRY_SCOPE_LABEL = 'チャットの質問・直近の履歴・根拠の Microsoft Foundry への送信（中継プロセス経由）';

const useStyles = makeStyles({
  row: { display: 'flex', columnGap: tokens.spacingHorizontalS, alignItems: 'center' },
  list: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM },
  answer: {
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS,
  },
  cards: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS },
  card: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXXS,
    minWidth: '180px', maxWidth: '320px',
    padding: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  pre: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200 },
  // 強制カラー（ハイコントラスト）では OS の色で描く。主ボタンの色の固定を外す（FR-058 AC-071）
  osColors: { '@media (forced-colors: active)': { forcedColorAdjust: 'auto' } },
});

interface Entry { question: string; result: AiResult; sources: Source[]; basis: string[]; foundry?: boolean }

/** 出典カード（FR-017）。タイトル・種別・取得日・確度。URL があれば新しいタブで開く。 */
function ChatSourceCard({ source }: { source: Source }) {
  const s = useStyles();
  const href = safeHttpUrl(source.url);
  return (
    <section className={s.card} data-testid="source-card" aria-label={`出典: ${source.title}`}>
      <Text weight="semibold">{source.title}</Text>
      <Text size={200}>取得日: {source.retrievedAt} ／ 確度: {source.confidence}</Text>
      {href ? <Link href={href} target="_blank" rel="noopener noreferrer">{href}</Link> : null}
    </section>
  );
}

export function ChatScreen() {
  const s = useStyles();
  const { ask, mode, relayUrl, packId } = useAi();
  const { granted: consentGranted, record: consentRecord } = useConsent();
  const pack = usePackStore((st) => st.state);
  const graph = useEntityGraph();
  const allSources = useMemo<Source[]>(() => (pack.status === 'ready' ? pack.pack.data.sources.sources : []), [pack]);
  const [text, setText] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pending, setPending] = useState<{ question: string; preview: string; foundry: boolean } | null>(null);
  const [showSent, setShowSent] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [trimmed, setTrimmed] = useState(false);
  const busy = useRef(false);

  // Escape で「送信内容を確認」を閉じる
  useEffect(() => {
    if (preview === null) return undefined;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [preview]);

  /** Foundry で送る条件（FR-286）: 設定済み・実接続が有効・了承の記録あり。毎回中継から読み直す（取り消し・無効化が次の送信から効く）。
   *  中継に届かないときは、直前に読めた状態を使う（Foundry を使える状態だったなら、停止を理由つきで示し、別の送信先へ切り替えない） */
  const lastReady = useRef(false);
  const foundryReady = async (): Promise<boolean> => {
    if (!consentGranted || !packId) return false;
    const v = await fetchFoundryView(relayUrl, packId, undefined, false);
    if (v) lastReady.current = v.configured && v.enabled;
    return lastReady.current;
  };
  useEffect(() => { lastReady.current = false; void foundryReady(); }, [relayUrl, packId, consentGranted]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 質問に近い顧客パックの項目と出典（FR-017）と、Foundry へ送る内容 */
  const plan = (question: string) => {
    const grounding = groundQuestion(graph, question, allSources.map((x) => x.id));
    const byId = new Map(allSources.map((x) => [x.id, x]));
    const sources = grounding.sourceIds.map((id) => byId.get(id)).filter((x): x is Source => !!x);
    const built: FoundryPrompt = buildFoundryPrompt({
      question,
      history: entries.map((e) => ({ question: e.question, answer: e.result.answer })),
      items: grounding.matched.map((n) => ({ label: n.label })),
      sources: sources.map((x) => ({ id: x.id, title: x.title })),
    });
    return { grounding, sources, built };
  };

  const previewText = (foundry: boolean, question: string): string =>
    foundry ? plan(question).built.prompt : JSON.stringify({ kind: 'chat', prompt: question });

  const openPreview = async () => {
    if (preview !== null) { setPreview(null); return; }
    const question = text.trim();
    setPreview(previewText(await foundryReady(), question));
  };

  const newConversation = () => { setEntries([]); setError(null); setWarning(null); setTrimmed(false); setPreview(null); };

  const send = async () => {
    const question = text.trim();
    if (!question || pending || busy.current) return;
    busy.current = true;
    setError(null); setWarning(null); setTrimmed(false); setPreview(null); setShowSent(false);
    setPending({ question, preview: JSON.stringify({ kind: 'chat', prompt: question }), foundry: false });
    try {
      const foundry = await foundryReady();
      const { grounding, sources, built } = plan(question);
      setPending({ question, preview: foundry ? built.prompt : JSON.stringify({ kind: 'chat', prompt: question }), foundry });
      if (foundry) {
        // Foundry 送信（FR-286）。失敗は理由を出すだけで、Copilot・モックへは切り替えない
        const data = pack.status === 'ready' ? pack.pack.data : undefined;
        const usage = useUsageStore.getState();
        const provider = (await fetchFoundryView(relayUrl, packId))?.provider ?? 'foundry';
        const out = await sendFoundryChat({
          relayUrl, packId, consent: consentGranted,
          includesPerson: !!data && countPersons(data) > 0,
          confirmPerson: () => gatePersonConfirm({ destination: 'ai', scopeLabel: FOUNDRY_SCOPE_LABEL, data: data!, consent: consentRecord, confirm: confirmViaUi }),
          usage: { check: () => usage.check(new Date(), provider), count: (n) => usage.count(n, new Date(), provider) },
        }, built);
        if (out.kind === 'answer') {
          setText('');
          setTrimmed(built.trimmed);
          if (out.warning) setWarning(out.warning);
          const result: AiResult = { answer: out.answer, sourceIds: [], mode: 'connected', sent: built.prompt, transmitted: true };
          setEntries((e) => [...e, { question, result, sources, basis: grounding.matched.map((n) => n.label), foundry: true }]);
        } else {
          // 質問は残す（利用者の操作で再送信できる）
          setError(out.text);
        }
        return;
      }
      setText('');
      const result = await ask('chat', question);
      // 出典カード: 中継プロセスが返した出典 ID（顧客パックにあるものだけ）、なければ質問に近い項目の出典
      const byId = new Map(allSources.map((x) => [x.id, x]));
      const returned = result.sourceIds.filter((id) => byId.has(id));
      const ids = returned.length > 0 ? returned : grounding.sourceIds;
      const cards = ids.map((id) => byId.get(id)).filter((x): x is Source => !!x);
      setEntries((e) => [...e, { question, result, sources: cards, basis: grounding.matched.map((n) => n.label) }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
      busy.current = false;
    }
  };

  return (
    <Panel testId="component-chat" title="チャット" description="顧客パックについて質問できます。回答には「AI 生成」のラベルが付きます。">
      <div className={s.row}>
        <Input aria-label="質問" placeholder="質問を入力" value={text} onChange={(_, d) => setText(d.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} style={{ flexGrow: 1 }} />
        <Button appearance="primary" className={s.osColors} onClick={() => void send()} disabled={!!pending || text.trim() === ''}>送信</Button>
        {pending ? null : <Button onClick={() => void openPreview()}>送信内容を確認</Button>}
        <Button onClick={newConversation} disabled={!!pending}>新しい会話</Button>
      </div>
      {preview !== null ? <pre data-testid="chat-preview" role="region" aria-label="送信内容" className={s.pre}>{preview}</pre> : null}
      {pending ? (
        <div data-testid="chat-sending">
        <div data-testid="sending-indicator" role="status" className={s.answer}>
          <div className={s.row}>
            <Spinner size="tiny" />
            <Text>{pending.foundry ? '送信中…（localhost の中継プロセス経由で Microsoft Foundry へ）' : mode === 'connected' ? '送信中…（localhost の中継プロセス経由で GitHub Copilot へ）' : '送信中…（モック。外部へは送信しません）'}</Text>
            <Button size="small" onClick={() => setShowSent((v) => !v)}>送信内容を確認</Button>
          </div>
          {showSent ? <pre data-testid="sent-content" className={s.pre}>{pending.preview}</pre> : null}
        </div>
        </div>
      ) : null}
      {error ? <MessageBar intent="error"><MessageBarBody data-testid="chat-error">{error}</MessageBarBody></MessageBar> : null}
      {warning ? <MessageBar intent="warning"><MessageBarBody data-testid="chat-warning">{warning}</MessageBarBody></MessageBar> : null}
      {trimmed ? <MessageBar intent="info"><MessageBarBody data-testid="chat-trim-notice">{TRIM_NOTICE}</MessageBarBody></MessageBar> : null}
      <div className={s.list}>
        {entries.map((e, i) => (
          <div key={i} data-testid="chat-answer" className={s.answer}>
            <Text weight="semibold">{e.question}</Text>
            <Text>{e.result.answer}</Text>
            {e.result.mode === 'mock' || e.foundry ? (
              e.basis.length > 0 ? <Text size={200}>根拠にした項目（顧客パック）: {e.basis.join('、')}</Text> : null
            ) : null}
            <Text size={200}>{e.foundry ? FOUNDRY_LABEL : e.result.mode === 'mock' ? MOCK_LABEL : REAL_LABEL}</Text>
            {e.sources.length > 0 ? (
              <div className={s.cards} role="group" aria-label="出典">
                {e.sources.map((src) => <ChatSourceCard key={src.id} source={src} />)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}
