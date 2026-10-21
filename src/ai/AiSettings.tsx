// 設定パネルの AI 実接続の切替（FR-132）。有効にする前に、送信される情報の種類を示して確認を求める。
import { useState } from 'react';
import {
  Button, DialogActions, DialogBody, DialogContent, DialogTitle, Field, MessageBar, MessageBarBody, Switch, Text,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { useAi } from './useAi';
import { useConsent } from './useConsent';
import { ConsentSettings } from './ConsentSettings';
import { AzureSettings } from './AzureSettings';
import { FoundrySettings } from './FoundrySettings';
import { tokens } from '../theme/tokens';

export function AiSettings() {
  const { mode, realEnabled, enable, disable, notice, packId } = useAi();
  const { granted } = useConsent();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
    <ConsentSettings onRevoke={disable} />
    <section aria-label="AI・音声・手書きの接続" style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM }}>
    <Field label="AI 接続" hint="既定はモックです。実接続は、この顧客パックでだけ有効になり、別の顧客パックで起動するとモックに戻ります。">
      <Switch
        checked={realEnabled}
        disabled={busy || !packId || !granted}
        label="AI の実接続を有効にする（GitHub Copilot）"
        onChange={(_, d) => { if (d.checked) setConfirming(true); else void disable(); }}
      />
      <Text size={200} data-testid="ai-mode-text">現在の状態: {mode === 'connected' ? '接続済み' : 'モック（外部へは送信しません）'}</Text>
      {notice ? <MessageBar intent="warning"><MessageBarBody>{notice}</MessageBarBody></MessageBar> : null}
      <Dialog open={confirming} modalType="alert" onOpenChange={(_, d) => setConfirming(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>AI の実接続を有効にしますか</DialogTitle>
            <DialogContent>
              有効にすると、ローカルの中継プロセスを通じて GitHub Copilot に次の情報が送信されます:
              顧客名、議論の内容、顧客パックのデータ（課題・解決策・出典など）、チャットの質問。
              送信中は画面に表示され、送信した内容を確認できます。
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfirming(false)}>キャンセル</Button>
              <Button
                appearance="primary"
                onClick={async () => { setBusy(true); setConfirming(false); await enable(); setBusy(false); }}
              >
                有効にする
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </Field>
    <AzureSettings />
    <FoundrySettings />
    </section>
    </>
  );
}

