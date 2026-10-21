// 設定画面の Microsoft Foundry 欄（FR-275）。エンドポイント・デプロイ名・API キーを入力・変更・削除できる。
// キーは入力欄（伏せ字）から中継プロセスへ送るだけで、保存後は「設定済み」と伏せ字だけを示し、値を再表示しない。
// 実接続の既定は無効。有効にする前に、有料で費用が発生する旨と送信される情報の種類を示して確認を求める。
import { useEffect, useState } from 'react';
import {
  Button, DialogActions, DialogBody, DialogContent, DialogTitle, Field, Input, MessageBar, MessageBarBody, Switch, Text,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { usePackStore } from '../store/pack';
import { useConsent } from './useConsent';
import { deleteFoundryConfig, fetchFoundryView, putFoundryConfig, setFoundryConnection, type FoundryView } from './foundryClient';
import { tokens } from '../theme/tokens';

export function FoundrySettings() {
  const relayUrl = usePackStore((s) => s.runtime.relayUrl);
  const pack = usePackStore((s) => s.state);
  const packId = pack.status === 'ready' ? pack.pack.data.customer.name : '';
  const { granted } = useConsent();
  const [view, setView] = useState<FoundryView | null>(null);
  const [endpoint, setEndpoint] = useState('');
  const [deployment, setDeployment] = useState('');
  const [key, setKey] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchFoundryView(relayUrl, packId).then((v) => {
      if (!alive) return;
      setView(v);
      if (v) { setEndpoint(v.endpoint); setDeployment(v.deployment); }
    });
    return () => { alive = false; };
  }, [relayUrl, packId]);

  // 了承の記録が取り消されたら、実接続を無効に戻す（FR-181・AC-706）
  useEffect(() => {
    if (!granted && view?.enabled && relayUrl && packId) {
      void setFoundryConnection(relayUrl, packId, false, { consent: false, confirmed: false }).then(() => setView((v) => (v ? { ...v, enabled: false } : v)));
    }
  }, [granted, view?.enabled, relayUrl, packId]);

  const save = async () => {
    const r = await putFoundryConfig(relayUrl as string, packId, { endpoint, deployment, key });
    setKey('');
    if (r.ok) { setView(r.view); setResult({ ok: true, text: '接続情報を保存しました（API キーは画面に再表示しません）。' }); }
    else setResult({ ok: false, text: `保存できませんでした。${r.message}` });
  };
  const remove = async () => {
    const v = await deleteFoundryConfig(relayUrl as string, packId);
    setKey('');
    if (v) { setView(v); setEndpoint(''); setDeployment(''); setResult({ ok: true, text: '接続情報を削除しました。Foundry は使えません。' }); }
    else setResult({ ok: false, text: '削除できませんでした。中継プロセスが起動しているか確認してください。' });
  };
  const enable = async () => {
    setConfirming(false);
    const r = await setFoundryConnection(relayUrl as string, packId, true, { consent: granted, confirmed: true });
    if (r.ok) setView((v) => (v ? { ...v, enabled: true } : v));
    else setResult({ ok: false, text: r.message ?? '有効にできませんでした。' });
  };
  const disable = async () => {
    await setFoundryConnection(relayUrl as string, packId, false, { consent: granted, confirmed: false });
    setView((v) => (v ? { ...v, enabled: false } : v));
  };

  const configured = !!view?.configured;
  return (
    <section role="region" aria-labelledby="foundry-settings-title" data-testid="foundry-settings" style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS }}>
      <Text id="foundry-settings-title" as="h3" weight="semibold">Microsoft Foundry（現状の説明の生成）</Text>
      <Text size={200}>
        Microsoft Foundry は有料サービスで、実接続を有効にすると利用に応じて費用が発生します。
        有効にすると、ローカルの中継プロセスを通じて、現在画面に表示している課題・解決策・KPI/OKR の文章が Foundry に送信されます。
        接続情報は手元の中継プロセスが暗号化して保管し、設定したエンドポイント以外へは送りません。既定は無効です。
      </Text>
      <Text size={200}>接続情報の状態: <b data-testid="foundry-status">{configured ? '設定済み' : '未設定'}</b>
        {configured ? `（送信先: ${view?.host}）` : null}
      </Text>
      {configured ? <Text size={200} data-testid="foundry-key-mask">API キー: 設定済み（{view?.keyMask}）</Text> : null}
      <form data-testid="foundry-form" onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS }}>
        <Field label="エンドポイント">
          <Input value={endpoint} aria-label="エンドポイント" onChange={(_, d) => setEndpoint(d.value)} />
        </Field>
        <Field label="デプロイ名">
          <Input value={deployment} aria-label="デプロイ名" onChange={(_, d) => setDeployment(d.value)} />
        </Field>
        <Field label="API キー" hint="入力したキーは手元の中継プロセスが暗号化して保管します。保存後は再表示しません。変更するときは新しいキーを入れて保存してください。">
          <Input type="password" value={key} aria-label="API キー" autoComplete="off" onChange={(_, d) => setKey(d.value)} />
        </Field>
        <div style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
          <Button type="submit" appearance="primary" aria-label="Foundry の接続情報を保存">保存</Button>
          <Button type="button" aria-label="Foundry の接続情報を削除" disabled={!configured} onClick={() => void remove()}>削除</Button>
        </div>
      </form>
      <Switch
        checked={!!view?.enabled}
        disabled={!relayUrl || !packId || !granted || !configured}
        label="Foundry の実接続を有効にする"
        onChange={(_, d) => { if (d.checked) setConfirming(true); else void disable(); }}
      />
      <Text size={200} data-testid="foundry-mode">現在の状態: {view?.enabled ? '接続済み' : 'モック（外部へは送信しません）'}</Text>
      {!granted ? <Text size={200}>この案件には顧客の了承の記録がないため、実接続は有効にできません。</Text> : null}
      {result ? <MessageBar intent={result.ok ? 'success' : 'warning'} role={result.ok ? 'status' : 'alert'}><MessageBarBody>{result.text}</MessageBarBody></MessageBar> : null}
      <Dialog open={confirming} modalType="alert" onOpenChange={(_, d) => setConfirming(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Foundry の実接続を有効にしますか</DialogTitle>
            <DialogContent>
              Microsoft Foundry は有料サービスで、費用が発生します。有効にすると、現在画面に表示している課題・解決策・KPI/OKR の文章が、ローカルの中継プロセスを通じて設定したエンドポイントに送信されます。
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfirming(false)}>キャンセル</Button>
              <Button appearance="primary" onClick={() => void enable()}>有効にする</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </section>
  );
}
