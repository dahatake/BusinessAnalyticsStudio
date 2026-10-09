// 常時表示する AI 接続の状態（FR-011 AC-013、NFR-SEC-002）。ヘッダーに置く。
import { Badge } from '@fluentui/react-components';
import { useAi, useAiSync } from './useAi';

export function AiStatus() {
  useAiSync();
  const { mode } = useAi();
  return (
    <Badge
      data-testid="ai-status"
      role="status"
      appearance="tint"
      color={mode === 'connected' ? 'success' : 'warning'}
      shape="rounded"
    >
      {mode === 'connected' ? 'AI: 接続済み（Copilot）' : 'AI: モック'}
    </Badge>
  );
}
