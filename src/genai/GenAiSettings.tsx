// 生成AIの活用分析の Foundry 実接続の切替（FR-285）。有料サービスで費用が発生する旨、送信される情報の種類、有効化の操作（既定は無効）を示す。
// キーは中継プロセスの環境変数 FOUNDRY_API_KEY だけに置く。この画面にキーの入力欄・表示はない。
import { useState } from 'react';
import {
  Button, DialogActions, DialogBody, DialogContent, DialogTitle, Field, Input, MessageBar, MessageBarBody, Switch, Text,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { tokens } from '../theme/tokens';
import { useGenAi, useGenAiStore } from './useGenAi';
import { DEFAULT_FOUNDRY_DEPLOYMENT, DEFAULT_FOUNDRY_ENDPOINT } from './foundryClient';

export function GenAiSettings() {
  const { switchOn, realEnabled, granted, packId, endpoint, deployment } = useGenAi();
  const [confirming, setConfirming] = useState(false);
  return (
    <section aria-label="生成AIの活用分析の接続" style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalSNudge }}>
      <Text weight="semibold">生成AIの効果的な活用シナリオの分析（Microsoft Foundry）</Text>
      <Text size={200}>
        実接続は有料サービスで、利用に応じて費用が発生する可能性があります。有効にすると、ローカルの中継プロセスを通じて Foundry のモデルに、
        入力した解決策・課題の文章を送信します。既定は無効で、モック（ルールベース。外部へは送信しません）で動作します。
        API キーは中継プロセスの環境変数にだけ置きます（この画面には表示しません）。
      </Text>
      <Switch
        checked={switchOn}
        disabled={!packId || !granted}
        label="実接続を有効にする"
        onChange={(_, d) => { if (d.checked) setConfirming(true); else useGenAiStore.getState().setEnabledPack(null); }}
      />
      {!granted && packId ? <Text size={200}>顧客の了承の記録がないため、有効にできません。この設定パネルの了承の記録を先に入力してください。</Text> : null}
      <Field label="エンドポイント" hint={`既定: ${DEFAULT_FOUNDRY_ENDPOINT}`}>
        <Input value={endpoint} onChange={(_, d) => useGenAiStore.getState().setEndpoint(d.value)} />
      </Field>
      <Field label="デプロイ名" hint={`既定: ${DEFAULT_FOUNDRY_DEPLOYMENT}`}>
        <Input value={deployment} onChange={(_, d) => useGenAiStore.getState().setDeployment(d.value)} />
      </Field>
      <Text size={200} data-testid="genai-mode">現在の状態: {realEnabled ? '実接続（Foundry）' : 'モック（外部へは送信しません）'}</Text>
      <Dialog open={confirming} modalType="alert" onOpenChange={(_, d) => setConfirming(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>生成AIの活用分析の実接続を有効にしますか</DialogTitle>
            <DialogContent>
              <MessageBar intent="warning"><MessageBarBody>
                Microsoft Foundry は有料サービスで、費用が発生する可能性があります。有効にすると、［分析実行］のたびに、入力した解決策・課題の文章が、
                ローカルの中継プロセスを通じて Foundry に送信されます。個人情報・機密は入力しないでください。
              </MessageBarBody></MessageBar>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfirming(false)}>キャンセル</Button>
              <Button appearance="primary" onClick={() => { useGenAiStore.getState().setEnabledPack(packId); setConfirming(false); }}>有効にする</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </section>
  );
}
