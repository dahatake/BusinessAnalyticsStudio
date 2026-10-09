// チャットの土台（FR-010・FR-011・FR-132・NFR-SEC-002）と、Copilot 風チャットの根拠・出典カード（FR-017）。質問は askAi だけを通る。
// 回答には、顧客パックの出典から選んだ出典カードと「AI 生成」のラベルを付ける。モックの回答は顧客パックの項目だけを根拠にする。
import { useMemo, useState } from 'react';
import { Button, Input, Link, MessageBar, MessageBarBody, Spinner, Text, makeStyles, tokens } from '@fluentui/react-components';
import { safeHttpUrl, type Source } from '../analysis/model';
import { Panel } from '../components/Panel';
import { useEntityGraph } from '../selection/hooks';
import { usePackStore } from '../store/pack';
import { MOCK_LABEL, REAL_LABEL, type AiResult } from './client';
import { groundQuestion } from './grounding';
import { useAi } from './useAi';

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
  pre: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  // 強制カラー（ハイコントラスト）では OS の色で描く。主ボタンの色の固定を外す（FR-058 AC-071）
  osColors: { '@media (forced-colors: active)': { forcedColorAdjust: 'auto' } },
});

interface Entry { question: string; result: AiResult; sources: Source[]; basis: string[] }

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
  const { ask, mode } = useAi();
  const pack = usePackStore((st) => st.state);
  const graph = useEntityGraph();
  const allSources = useMemo<Source[]>(() => (pack.status === 'ready' ? pack.pack.data.sources.sources : []), [pack]);
  const [text, setText] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pending, setPending] = useState<{ question: string } | null>(null);
  const [showSent, setShowSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const question = text.trim();
    if (!question || pending) return;
    setText(''); setError(null); setPending({ question }); setShowSent(false);
    try {
      const result = await ask('chat', question);
      // 出典カード: 中継プロセスが返した出典 ID（顧客パックにあるものだけ）、なければ質問に近い項目の出典
      const byId = new Map(allSources.map((x) => [x.id, x]));
      const grounding = groundQuestion(graph, question, allSources.map((x) => x.id));
      const returned = result.sourceIds.filter((id) => byId.has(id));
      const ids = returned.length > 0 ? returned : grounding.sourceIds;
      const sources = ids.map((id) => byId.get(id)).filter((x): x is Source => !!x);
      setEntries((e) => [...e, { question, result, sources, basis: grounding.matched.map((n) => n.label) }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  };

  return (
    <Panel testId="component-chat" title="チャット" description="顧客パックについて質問できます。回答には「AI 生成」のラベルが付きます。">
      <div className={s.row}>
        <Input aria-label="質問" placeholder="質問を入力" value={text} onChange={(_, d) => setText(d.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} style={{ flexGrow: 1 }} />
        <Button appearance="primary" className={s.osColors} onClick={() => void send()} disabled={!!pending || text.trim() === ''}>送信</Button>
      </div>
      {pending ? (
        <div data-testid="sending-indicator" role="status" className={s.answer}>
          <div className={s.row}>
            <Spinner size="tiny" />
            <Text>{mode === 'connected' ? '送信中…（localhost の中継プロセス経由で GitHub Copilot へ）' : '送信中…（モック。外部へは送信しません）'}</Text>
            <Button size="small" onClick={() => setShowSent((v) => !v)}>送信内容を確認</Button>
          </div>
          {showSent ? <pre data-testid="sent-content" className={s.pre}>{JSON.stringify({ kind: 'chat', prompt: pending.question })}</pre> : null}
        </div>
      ) : null}
      {error ? <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar> : null}
      <div className={s.list}>
        {entries.map((e, i) => (
          <div key={i} data-testid="chat-answer" className={s.answer}>
            <Text weight="semibold">{e.question}</Text>
            <Text>{e.result.answer}</Text>
            {e.result.mode === 'mock' && e.basis.length > 0 ? (
              <Text size={200}>根拠にした項目（顧客パック）: {e.basis.join('、')}</Text>
            ) : null}
            <Text size={200}>{e.result.mode === 'mock' ? MOCK_LABEL : REAL_LABEL}</Text>
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
