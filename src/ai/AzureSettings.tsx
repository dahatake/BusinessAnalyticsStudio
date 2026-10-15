// 音声合成・手書き認識の実接続の切替（FR-182）。有料サービスで費用が発生する旨、送信される情報の種類、有効化の操作（既定は無効）を示す。
// キーは中継プロセスの .env だけに置く。この画面にキーの入力欄・表示はない。
import { useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, MessageBar, MessageBarBody, Switch, Text,
} from '@fluentui/react-components';
import { useAzure } from './useAzure';
import type { AzureFeature } from './azureClient';

const COPY: Record<AzureFeature, { title: string; service: string; sends: string; fallback: string; label: string }> = {
  speech: {
    title: '音声合成', service: 'Azure AI Speech', sends: '読み上げる台本の文章',
    fallback: '接続できないときは字幕だけで進行します。', label: 'Azure 音声合成を有効にする（Azure AI Speech）',
  },
  vision: {
    title: '手書き認識', service: 'Azure AI Vision', sends: '選んだ手書きの線（画像にして送信）',
    fallback: '接続できないときは、元の手書きはボードに残ります。', label: 'Azure 手書き認識を有効にする（Azure AI Vision）',
  },
};

function AzureFeatureSettings({ feature }: { feature: AzureFeature }) {
  const c = COPY[feature];
  const { switchOn, realEnabled, granted, packId, enable, disable, notice } = useAzure(feature);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <section aria-label={`${c.title}の実接続`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Text weight="semibold">{c.title}（{c.service}）</Text>
      <Text size={200}>送信するもの: {c.sends}。{c.fallback}</Text>
      <Switch
        checked={switchOn}
        disabled={busy || !packId || !granted}
        label={c.label}
        onChange={(_, d) => { if (d.checked) setConfirming(true); else void disable(); }}
      />
      <Text size={200} data-testid={`azure-${feature}-mode`}>現在の状態: {realEnabled ? '接続済み' : 'モック（外部へは送信しません）'}</Text>
      {notice ? <MessageBar intent="warning" role="alert"><MessageBarBody>{notice}</MessageBarBody></MessageBar> : null}
      <Dialog open={confirming} modalType="alert" onOpenChange={(_, d) => setConfirming(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{c.title}の実接続を有効にしますか</DialogTitle>
            <DialogContent>
              {c.service} は有料サービスで、費用が発生します。有効にすると、ローカルの中継プロセスを通じて {c.service} に「{c.sends}」が送信されます。
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfirming(false)}>キャンセル</Button>
              <Button appearance="primary" onClick={async () => { setBusy(true); setConfirming(false); await enable(); setBusy(false); }}>有効にする</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </section>
  );
}

export function AzureSettings() {
  return (
    <>
      <Text size={200}>
        音声合成（Azure AI Speech）と手書き認識（Azure AI Vision）は有料サービスです。実接続を有効にすると、利用に応じて費用が発生します。
        送信される情報は、音声合成が読み上げる台本の文章、手書き認識が選んだ手書きの線（画像にして送信）です。
        キーは中継プロセスの .env にだけ置きます（この画面には表示しません）。キーが未設定の間は、有効にしてもモックで動作します。
      </Text>
      <AzureFeatureSettings feature="speech" />
      <AzureFeatureSettings feature="vision" />
    </>
  );
}
