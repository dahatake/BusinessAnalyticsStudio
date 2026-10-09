// チャットの土台（FR-010・FR-011・FR-132・NFR-SEC-002）。質問は askAi だけを通る。
// 検索・出典カード（FR-017）は、この画面を拡張して加える。
import { useState } from 'react';
import { Button, Input, MessageBar, MessageBarBody, Spinner, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Panel } from '../components/Panel';
import { MOCK_LABEL, REAL_LABEL, type AiResult } from './client';
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
  pre: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  // 強制カラー（ハイコントラスト）では OS の色で描く。主ボタンの色の固定を外す（FR-058 AC-071）
  osColors: { '@media (forced-colors: active)': { forcedColorAdjust: 'auto' } },
});

interface Entry { question: string; result: AiResult }

export function ChatScreen() {
  const s = useStyles();
  const { ask, mode } = useAi();
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
      setEntries((e) => [...e, { question, result }]);
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
        <Button appearance="primary" className={s.osColors} onClick={() => void send()} disabled={!!pending}>送信</Button>
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
            <Text size={200}>{e.result.mode === 'mock' ? MOCK_LABEL : REAL_LABEL}</Text>
          </div>
        ))}
      </div>
    </Panel>
  );
}
