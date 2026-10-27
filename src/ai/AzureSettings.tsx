// 音声合成・手書き認識の実接続の切替（FR-182）。有料サービスで費用が発生する旨、送信される情報の種類、有効化の操作（既定は無効）を示す。
// キーは中継プロセスの .env だけに置く。この画面にキーの入力欄・表示はない。
import { useState } from 'react';
import {
  Button, DialogActions, DialogBody, DialogContent, DialogTitle, MessageBar, MessageBarBody, Switch, Text,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { useAzure } from './useAzure';
import type { AzureFeature } from './azureClient';
import { tokens } from '../theme/tokens';
import { tr, useT } from '../i18n';

/** 表示時に評価する（言語の切替で更新される） */
const copyOf = (f: AzureFeature): { title: string; service: string; sends: string; fallback: string; label: string } => (f === 'speech'
  ? {
    title: tr('音声合成'), service: 'Azure AI Speech', sends: tr('読み上げる台本の文章'),
    fallback: tr('接続できないときは字幕だけで進行します。'), label: tr('Azure 音声合成を有効にする（Azure AI Speech）'),
  }
  : {
    title: tr('手書き認識'), service: 'Azure AI Vision', sends: tr('選んだ手書きの線（画像にして送信）'),
    fallback: tr('接続できないときは、元の手書きはボードに残ります。'), label: tr('Azure 手書き認識を有効にする（Azure AI Vision）'),
  });

function AzureFeatureSettings({ feature }: { feature: AzureFeature }) {
  const t = useT();
  const c = copyOf(feature);
  const { switchOn, realEnabled, granted, packId, enable, disable, notice } = useAzure(feature);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <section aria-label={t('{title}の実接続', { title: c.title })} style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalSNudge }}>
      <Text weight="semibold">{t('{title}（{service}）', { title: c.title, service: c.service })}</Text>
      <Text size={200}>{t('送信するもの: {sends}。{fallback}', { sends: c.sends, fallback: c.fallback })}</Text>
      <Switch
        checked={switchOn}
        disabled={busy || !packId || !granted}
        label={c.label}
        onChange={(_, d) => { if (d.checked) setConfirming(true); else void disable(); }}
      />
      <Text size={200} data-testid={`azure-${feature}-mode`}>{t('現在の状態:')} {realEnabled ? t('接続済み') : t('モック（外部へは送信しません）')}</Text>
      {notice ? <MessageBar intent="warning" role="alert"><MessageBarBody>{notice}</MessageBarBody></MessageBar> : null}
      <Dialog open={confirming} modalType="alert" onOpenChange={(_, d) => setConfirming(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('{title}の実接続を有効にしますか', { title: c.title })}</DialogTitle>
            <DialogContent>
              {t('{service} は有料サービスで、費用が発生します。有効にすると、ローカルの中継プロセスを通じて {service} に「{sends}」が送信されます。', { service: c.service, sends: c.sends })}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfirming(false)}>{t('キャンセル')}</Button>
              <Button appearance="primary" onClick={async () => { setBusy(true); setConfirming(false); await enable(); setBusy(false); }}>{t('有効にする')}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </section>
  );
}

export function AzureSettings() {
  const t = useT();
  return (
    <>
      <Text size={200}>
        {t('音声合成（Azure AI Speech）と手書き認識（Azure AI Vision）は有料サービスです。実接続を有効にすると、利用に応じて費用が発生します。 送信される情報は、音声合成が読み上げる台本の文章、手書き認識が選んだ手書きの線（画像にして送信）です。 キーは中継プロセスの .env にだけ置きます（この画面には表示しません）。キーが未設定の間は、有効にしてもモックで動作します。')}
      </Text>
      <AzureFeatureSettings feature="speech" />
      <AzureFeatureSettings feature="vision" />
    </>
  );
}
