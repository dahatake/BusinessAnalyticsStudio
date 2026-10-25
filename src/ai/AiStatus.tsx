// 常時表示する AI 接続の状態（FR-011 AC-013、NFR-SEC-002）。ヘッダーに置く。
// 生成AIの共通接続（POST /foundry/*）の接続先と有効／モックも文字で示す（FR-275 AC-773。`ai-provider-status`）。POST /ask の状態とは別に示す。
import { Badge } from '@fluentui/react-components';
import { useAi, useAiSync } from './useAi';
import { useAzureSync } from './useAzure';
import { genAiStatusLabel, useGenAiProviderStatus } from './genAiProviderStatus';

export function AiStatus() {
  useAiSync();
  useAzureSync();
  const { mode } = useAi();
  const genai = useGenAiProviderStatus();
  return (
    <Badge
      data-testid="ai-status"
      role="status"
      appearance="tint"
      color={mode === 'connected' ? 'success' : 'warning'}
      shape="rounded"
    >
      {mode === 'connected' ? 'AI: 接続済み（Copilot）' : 'AI: モック'}
      <span aria-hidden="true">{' ｜ '}</span>
      <span data-testid="ai-provider-status" data-provider={genai.provider} data-enabled={genai.enabled ? 'true' : 'false'}>{genAiStatusLabel(genai)}</span>
    </Badge>
  );
}
