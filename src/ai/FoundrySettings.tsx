// 設定画面の Microsoft Foundry 欄（FR-275）。エンドポイント・デプロイ名・API キーを入力・変更・削除できる。
// キーは入力欄（伏せ字）から中継プロセスへ送るだけで、保存後は「設定済み」と伏せ字だけを示し、値を再表示しない。
// 実接続の既定は無効。有効にする前に、有料で費用が発生する旨と送信される情報の種類を示して確認を求める。
import { useEffect, useRef, useState } from 'react';
import {
  Button, DialogActions, DialogBody, DialogContent, DialogTitle, Field, Input, MessageBar, MessageBarBody, Switch, Text,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { usePackStore } from '../store/pack';
import { useConsent } from './useConsent';
import {
  DEFAULT_FOUNDRY_DEPLOYMENT, DEFAULT_FOUNDRY_ENDPOINT, ENDPOINT_FORMAT_EXAMPLES, deleteFoundryConfig, fetchFoundryView, putFoundryConfig, setFoundryConnection, testFoundry, validateFoundryEndpoint, type FoundryView,
} from './foundryClient';
import { newFoundryTestSession, runFoundryTest } from './foundryTest';
import { explainLimitsNow, explainUsageNow, setExplainUsage } from '../explain/store';
import { tokens } from '../theme/tokens';
import { useT } from '../i18n';

/** 値に由来しない固定の伏せ字（末尾の文字も出さない。FR-282 AC-726） */

export function FoundrySettings() {
  const t = useT();
  const relayUrl = usePackStore((s) => s.runtime.relayUrl);
  const pack = usePackStore((s) => s.state);
  const packId = pack.status === 'ready' ? pack.pack.data.customer.name : '';
  const { granted } = useConsent();
  const [view, setView] = useState<FoundryView | null>(null);
  const [endpoint, setEndpoint] = useState(DEFAULT_FOUNDRY_ENDPOINT);
  const [deployment, setDeployment] = useState(DEFAULT_FOUNDRY_DEPLOYMENT);
  const [key, setKey] = useState('');
  const [authMethod, setAuthMethod] = useState<'api-key' | 'entra'>('api-key');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [endpointError, setEndpointError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const testSession = useRef(newFoundryTestSession());

  useEffect(() => {
    let alive = true;
    void fetchFoundryView(relayUrl, packId).then((v) => {
      if (!alive) return;
      setView(v);
      if (v) { setEndpoint(v.endpoint || DEFAULT_FOUNDRY_ENDPOINT); setDeployment(v.deployment || DEFAULT_FOUNDRY_DEPLOYMENT); setAuthMethod(v.authMethod === 'entra' ? 'entra' : 'api-key'); }
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
    // 不正なエンドポイントは保存しない（中継へも送らない）。保存済みの値は変わらない。理由に入力値は含めない（AC-764）
    const invalid = validateFoundryEndpoint(endpoint);
    setEndpointError(invalid);
    if (invalid) { setResult({ ok: false, text: t('保存できませんでした。エンドポイントの入力を確認してください。') }); return; }
    const r = await putFoundryConfig(relayUrl as string, packId, { endpoint, deployment, key, authMethod });
    setKey('');
    if (r.ok) { setView(r.view); setResult({ ok: true, text: t('接続情報を保存しました（API キーは画面に再表示しません）。') }); }
    else setResult({ ok: false, text: t('保存できませんでした。{message}', { message: r.message }) });
  };
  const remove = async () => {
    const v = await deleteFoundryConfig(relayUrl as string, packId);
    setKey('');
    if (v) { setView(v); setEndpoint(DEFAULT_FOUNDRY_ENDPOINT); setDeployment(DEFAULT_FOUNDRY_DEPLOYMENT); setAuthMethod('api-key'); setResult({ ok: true, text: t('接続情報を削除しました。Foundry は使えません。') }); }
    else setResult({ ok: false, text: t('削除できませんでした。中継プロセスが起動しているか確認してください。') });
  };
  const enable = async () => {
    setConfirming(false);
    const r = await setFoundryConnection(relayUrl as string, packId, true, { consent: granted, confirmed: true });
    if (r.ok) setView((v) => (v ? { ...v, enabled: true } : v));
    else setResult({ ok: false, text: r.message ?? t('有効にできませんでした。') });
  };
  const disable = async () => {
    await setFoundryConnection(relayUrl as string, packId, false, { consent: granted, confirmed: false });
    setView((v) => (v ? { ...v, enabled: false } : v));
  };

  const connectionTest = async () => {
    setTesting(true);
    try {
      const o = await runFoundryTest(
        { now: () => new Date(), limits: explainLimitsNow, usage: { get: explainUsageNow, set: setExplainUsage }, test: () => testFoundry(relayUrl) },
        testSession.current,
      );
      if (o.kind === 'result') setTestResult({ ok: o.result.ok, text: o.result.ok ? t('接続テスト: 成功しました。') : t('接続テスト: 失敗しました。{message}', { message: o.result.message }) });
      else setTestResult({ ok: false, text: t('接続テストは実行していません。{message}', { message: o.message }) });
    } finally {
      setTesting(false);
    }
  };

  const configured = !!view?.configured;
  return (
    <section role="region" aria-labelledby="foundry-settings-title" data-testid="foundry-settings" style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS }}>
      <Text id="foundry-settings-title" as="h3" weight="semibold">{t('Microsoft Foundry（生成AI機能の共通接続）')}</Text>
      <Text size={200}>
        {t('この接続は、生成AI機能全般（「現状の説明」の生成と「生成AIの効果的な活用シナリオ」の分析）に共通で使います。')}{' '}
        {t('Microsoft Foundry は有料サービスで、実接続を有効にすると利用に応じて費用が発生します。')}{' '}
        {t('有効にすると、ローカルの中継プロセスを通じて、現在画面に表示している課題・解決策・KPI/OKR の文章、活用シナリオの分析で入力した解決策の文章、チャットの質問・直近の履歴・顧客パックの根拠、プレゼンテーションの生成 AI による作成で選んだペルソナと材料（解決策・優先順位・ROI・コスト・KPI/OKR・ユースケース・番組構成） が Foundry に送信されます。')}{' '}
        {t('接続情報は手元の中継プロセスが暗号化して保管し、設定したエンドポイント以外へは送りません。既定は無効です。')}
      </Text>
      <Text size={200}>{t('接続情報の状態:')} <b data-testid="foundry-status">{configured ? t('設定済み') : t('未設定')}</b>
        {configured ? t('（送信先: {host}）', { host: view?.host ?? '' }) : null}
      </Text>
      {configured && view?.authMethod !== 'entra' ? <Text size={200} data-testid="foundry-key-mask">{t('API キー: 設定済み（{mask}）', { mask: view?.keyMask ?? '' })}</Text> : null}
      <form data-testid="foundry-form" onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS }}>
        <Field
          label={t('エンドポイント')}
          hint={t('入力例: {a}　または　{b}（https で始まる Azure の標準ドメインだけ使えます）', { a: ENDPOINT_FORMAT_EXAMPLES[0].replace('<リソース名>', t('<リソース名>')), b: ENDPOINT_FORMAT_EXAMPLES[1].replace('<リソース名>', t('<リソース名>')) })}
          validationState={endpointError ? 'error' : 'none'}
          validationMessage={endpointError ?? undefined}
        >
          <Input value={endpoint} aria-label={t('エンドポイント')} onChange={(_, d) => { setEndpoint(d.value); setEndpointError(null); }} />
        </Field>
        <Field label={t('デプロイ名')}>
          <Input value={deployment} aria-label={t('デプロイ名')} onChange={(_, d) => setDeployment(d.value)} />
        </Field>
        <Field label={t('認証方式')} hint={t('Microsoft Entra ID を選ぶと API キーは不要です（サインイン中の資格情報で中継プロセスが接続します）。')}>
          <select aria-label={t('認証方式')} value={authMethod} onChange={(e) => setAuthMethod(e.target.value === 'entra' ? 'entra' : 'api-key')}>
            <option value="api-key">{t('API キー')}</option>
            <option value="entra">Microsoft Entra ID</option>
          </select>
        </Field>
        <Field label={t('API キー')} hint={t('入力したキーは手元の中継プロセスが暗号化して保管します。保存後は再表示しません。変更するときは新しいキーを入れて保存してください。')}>
          <Input type="password" value={key} disabled={authMethod === 'entra'} aria-label={t('API キー')} autoComplete="off" onChange={(_, d) => setKey(d.value)} />
        </Field>
        <div style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
          <Button type="submit" appearance="primary" aria-label={t('Foundry の接続情報を保存')}>{t('保存')}</Button>
          <Button type="button" aria-label={t('Foundry の接続情報を削除')} disabled={!configured} onClick={() => void remove()}>{t('削除')}</Button>
          <Button type="button" aria-label={t('Foundry の接続テスト')} disabled={!configured || !relayUrl || testing} onClick={() => void connectionTest()}>{t('接続テスト')}</Button>
        </div>
        <Text size={200}>{t('接続テストは、保存済みの接続情報で、接続の確認だけの少額の呼び出しを 1 回行います（費用は小さい。顧客のデータは送りません）。')}</Text>
        {testResult ? <MessageBar intent={testResult.ok ? 'success' : 'warning'} role={testResult.ok ? 'status' : 'alert'} data-testid="foundry-test-result"><MessageBarBody>{testResult.text}</MessageBarBody></MessageBar> : null}
      </form>
      <Switch
        checked={!!view?.enabled}
        disabled={!relayUrl || !packId || !granted || !configured}
        label={t('実接続を有効にする')}
        onChange={(_, d) => { if (d.checked) setConfirming(true); else void disable(); }}
      />
      <Text size={200} data-testid="foundry-mode">{t('現在の状態:')} {view?.enabled ? t('接続済み') : t('モック（外部へは送信しません）')}</Text>
      {!granted ? <Text size={200}>{t('この案件には顧客の了承の記録がないため、実接続は有効にできません。')}</Text> : null}
      {result ? <MessageBar intent={result.ok ? 'success' : 'warning'} role={result.ok ? 'status' : 'alert'}><MessageBarBody>{result.text}</MessageBarBody></MessageBar> : null}
      <Dialog open={confirming} modalType="alert" onOpenChange={(_, d) => setConfirming(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('Foundry の実接続を有効にしますか')}</DialogTitle>
            <DialogContent>
              {t('Microsoft Foundry は有料サービスで、費用が発生します。有効にすると、現在画面に表示している課題・解決策・KPI/OKR の文章、活用シナリオの分析で入力した解決策の文章、チャットの質問・直近の履歴・顧客パックの根拠、プレゼンテーションの生成 AI による作成で選んだペルソナと材料（解決策・優先順位・ROI・コスト・KPI/OKR・ユースケース・番組構成） が、ローカルの中継プロセスを通じて設定したエンドポイントに送信されます。')}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfirming(false)}>{t('キャンセル')}</Button>
              <Button appearance="primary" onClick={() => void enable()}>{t('有効にする')}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </section>
  );
}
