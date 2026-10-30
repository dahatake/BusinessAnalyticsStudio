// 常時表示する AI の状態（FR-011 AC-013、NFR-SEC-002、FR-275 AC-773）。ヘッダーに置く。
// 主の表示（`ai-provider-status`）は生成AIの共通接続（/foundry/*）の接続先と有効／モックだけで決まり、色もこれに従う。POST /ask の状態に左右されない（FR-275 AC-773）。
// POST /ask（FR-132 のチャットの実接続）は別の接続なので、用途「チャット」を明記した独立の表示（`ai-chat-status`）に分ける。
import { Badge, makeStyles, tokens } from '@fluentui/react-components';
import { useAi, useAiSync } from './useAi';
import { useAzureSync } from './useAzure';
import { genAiStatusLabel, useGenAiProviderStatus } from './genAiProviderStatus';
import { tr, useT } from '../i18n';

const useStyles = makeStyles({
  root: { display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: tokens.spacingHorizontalXS, maxWidth: '100%' },
});

/** チャット（POST /ask。FR-132）の状態の文言。用途を明記する */
export function chatStatusLabel(connected: boolean): string {
  return connected ? tr('AI: 接続済み（チャット・Copilot）') : tr('AI: モック（チャット）');
}

export function AiStatus() {
  const t = useT();
  useAiSync();
  useAzureSync();
  const { mode } = useAi();
  const genai = useGenAiProviderStatus();
  const styles = useStyles();
  const chatConnected = mode === 'connected';
  return (
    <span data-testid="ai-status" role="status" className={styles.root}>
      <Badge
        data-testid="ai-provider-status"
        data-provider={genai.provider}
        data-enabled={genai.enabled ? 'true' : 'false'}
        appearance="tint"
        color={genai.enabled ? 'success' : 'warning'}
        shape="rounded"
        title={t('生成AIの共通接続（設定の「生成AIの接続先」）')}
      >
        {genAiStatusLabel(genai)}
      </Badge>
      <Badge
        data-testid="ai-chat-status"
        data-connected={chatConnected ? 'true' : 'false'}
        appearance="outline"
        color={chatConnected ? 'success' : 'informative'}
        shape="rounded"
        title={t('チャットの実接続（設定の「AI・音声・手書きの接続」）')}
      >
        {chatStatusLabel(chatConnected)}
      </Badge>
    </span>
  );
}