// FR-275 AC-769/770 and FR-011 AC-771/772. Reuses Fluent UI and the shared design foundation.
import { useEffect, useState } from 'react';
import { Button, DialogActions, DialogBody, DialogContent, DialogTitle, Field, Input, MessageBar, MessageBarBody, Switch, Text } from '@fluentui/react-components';
import { Radio, RadioGroup } from '../components/ChoiceRadio';
import { Dialog, DialogSurface } from '../components/Dialog';
import { tokens } from '../theme/tokens';
import { usePackStore } from '../store/pack';
import { useConsent } from './useConsent';
import { FoundrySettings } from './FoundrySettings';
import { fetchFoundryView, setFoundryConnection } from './foundryClient';
import { providerRequest, type Provider, type CopilotView, type SigninView } from './providerClient';
export function ProviderSettings() {
  const relay = usePackStore(s => s.runtime.relayUrl);
  const [provider, setProvider] = useState<Provider>('foundry');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; void providerRequest<{provider: Provider}>(relay, '/ai/provider').then(v => { if (alive) { setProvider(v.provider === 'copilot' ? 'copilot' : 'foundry'); setError(''); } }).catch(e => { if (alive) setError((e as Error).message); }); return () => { alive = false; }; }, [relay]);
  return <section aria-label="生成AIの共通接続設定" style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM }}>
    <Field label="生成AIの接続先"><RadioGroup aria-label="生成AIの接続先" value={provider} disabled={busy || !relay} onChange={(_, d) => { const previous = provider; setProvider(d.value === 'copilot' ? 'copilot' : 'foundry'); setBusy(true); void providerRequest<{provider: Provider}>(relay, '/ai/provider', 'PUT', {provider: d.value}).then(v => { setProvider(v.provider === 'copilot' ? 'copilot' : 'foundry'); setError(''); }).catch(e => { setProvider(previous); setError((e as Error).message); }).finally(() => setBusy(false)); }}>
      <Radio value="foundry" label="Microsoft Foundry"/><Radio value="copilot" label="GitHub Copilot SDK"/>
    </RadioGroup></Field>
    <Text size={200}>接続先や認証情報を変更すると実接続が解除されます。新しい送信先・費用・送信内容を確認して再有効化してください。既存の議論整理など 5 種の AI 処理は Copilot SDK 固定のままです。</Text>
    {error && <MessageBar intent="warning"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
    {provider === 'foundry' ? <FoundrySettings/> : <CopilotSettings/>}
  </section>;
}
export function CopilotSettings() {
  const relay = usePackStore(s => s.runtime.relayUrl);
  const pack = usePackStore(s => s.state);
  const packId = pack.status === 'ready' ? pack.pack.data.customer.name : '';
  const { granted } = useConsent();
  const [view, setView] = useState<CopilotView | null>(null);
  const [model, setModel] = useState('');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [signin, setSignin] = useState<SigninView | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const error = (e: unknown) => setMessage(e instanceof Error ? e.message : '接続できませんでした');
  const refresh = async () => { const v = await providerRequest<CopilotView>(relay, '/copilot/config'); setView(v); setModel(v.model); const f = await fetchFoundryView(relay, packId); setEnabled(!!f?.enabled); };
  useEffect(() => { void refresh().catch(error); }, [relay, packId]);
  useEffect(() => { if (!granted && enabled) { setEnabled(false); void setFoundryConnection(relay ?? '', packId, false, { consent: false, confirmed: false }); } }, [granted, enabled, relay, packId]);
  useEffect(() => {
    if (signin?.status !== 'pending') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const v = await providerRequest<SigninView>(relay, '/copilot/signin');
        if (cancelled) return;
        setSignin(v); setView(old => old ? { ...old, signedIn: v.signedIn } : old);
        if (v.status === 'pending') timer = setTimeout(() => void poll(), 2000);
      } catch (e) { if (!cancelled) error(e); }
    };
    timer = setTimeout(() => void poll(), 2000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [signin?.status, relay]);
  const save = async (authMethod = view?.authMethod ?? 'signin') => { setBusy(true); try { const v = await providerRequest<CopilotView>(relay, '/copilot/config', 'PUT', { authMethod, model, ...(token ? { token } : {}) }); setView(v); setEnabled(false); setMessage('設定を保存しました。送信前に再確認・再有効化してください。'); } catch(e) { error(e); } finally { setToken(''); setBusy(false); } };
  const help = 'Copilot CLI を起動して /login でサインインし、認証状態を再確認してください。またはトークン方式を使ってください。GitHub CLI・VS Code との資格情報の共有は保証されません。';
  return <section data-testid="copilot-settings" aria-label="GitHub Copilot SDK の接続設定" style={{ display:'flex', flexDirection:'column', gap: tokens.spacingVerticalS }}>
    <Text as="h3" weight="semibold">GitHub Copilot SDK（生成AI機能の共通接続）</Text>
    <Field label="認証方式"><RadioGroup aria-label="認証方式" value={view?.authMethod ?? 'signin'} disabled={busy || !view} onChange={(_,d) => void save(d.value === 'token' ? 'token' : 'signin')}><Radio value="signin" label="サインイン（既定・キー不要）"/><Radio value="token" label="トークン"/></RadioGroup></Field>
    <Text data-testid="copilot-signin-status">SDK の状態: {view?.signedIn ? 'サインイン済み' : '未サインイン・利用不可'}</Text>
    {view?.authMethod !== 'token' ? <><Text size={200}>PC の Copilot CLI に保存済みの資格情報を優先し、アプリには保存しません。</Text><Button disabled={busy || signin?.status === 'pending'} onClick={() => { setBusy(true); void providerRequest<SigninView>(relay, '/copilot/signin', 'POST').then(setSignin).catch(error).finally(() => setBusy(false)); }}>GitHub にサインイン</Button></> : <>
      <Field label="GitHub トークン" hint="暗号化して中継側だけに保管します。保存後は再表示しません。"><Input aria-label="GitHub トークン" type="password" autoComplete="off" value={token} onChange={(_,d) => setToken(d.value)}/></Field>
      <Text>トークン: {view?.tokenConfigured ? `設定済み（${view.tokenMask}）` : '未保存'}</Text>
      <Button disabled={busy || !view?.tokenConfigured} onClick={() => { setBusy(true); void providerRequest<CopilotView>(relay, '/copilot/config', 'DELETE').then(v => { setView(v); setToken(''); setEnabled(false); }).catch(error).finally(() => setBusy(false)); }}>トークンを削除</Button>
    </>}
    <Button disabled={busy} onClick={() => { setBusy(true); void refresh().catch(error).finally(() => setBusy(false)); }}>認証状態を再確認</Button>
    <Text size={200}>{help}</Text>
    {signin && <div role="status"><Text>{signin.message}</Text>{signin.code && <Text>ワンタイムコード: {signin.code}</Text>}{signin.url && <a href="https://github.com/login/device" target="_blank" rel="noreferrer">https://github.com/login/device</a>}</div>}
    <Field label="モデル名（任意）" hint="空なら SDK の既定モデルを使います。"><Input aria-label="モデル名（任意）" value={model} onChange={(_,d) => setModel(d.value)}/></Field>
    <Button appearance="primary" disabled={busy || !view} onClick={() => void save()}>Copilot の接続情報を保存</Button>
    <Text size={200}>Copilot SDK の費用は利用者の GitHub Copilot の契約に従います。AI 取り込み・ファイル添付は Copilot SDK では未対応です。</Text>
    <Switch label="実接続を有効にする" checked={enabled} disabled={busy || !view?.signedIn || !granted || !packId} onChange={(_,d) => { if (d.checked) setConfirming(true); else { setEnabled(false); void setFoundryConnection(relay ?? '', packId, false, {consent:granted,confirmed:false}); } }}/>
    <Text>現在の状態: {enabled ? '接続済み' : 'モック（外部へは送信しません）'}</Text>
    {!granted && <Text>顧客の了承の記録がないため、有効にできません。</Text>}
    {message && <MessageBar intent="info"><MessageBarBody>{message}</MessageBarBody></MessageBar>}
    <Dialog open={confirming} onOpenChange={(_,d) => setConfirming(d.open)}><DialogSurface><DialogBody><DialogTitle>GitHub Copilot SDK への実接続を有効にしますか</DialogTitle><DialogContent>送信先は GitHub Copilot SDK、モデルは {view?.model || 'SDK の既定'} です。費用は利用者の GitHub Copilot の契約に従います。現在画面の課題・解決策・KPI/OKR、活用分析の解決策、チャットの質問・履歴・顧客パックの根拠が中継を通じて送られます。種別「人」は送信前に別途確認します。</DialogContent><DialogActions><Button onClick={() => setConfirming(false)}>キャンセル</Button><Button appearance="primary" onClick={() => { setConfirming(false); setBusy(true); void setFoundryConnection(relay ?? '', packId, true, {consent:granted,confirmed:true}).then(r => { setEnabled(r.ok && r.mode === 'connected'); if (!r.ok) setMessage(r.message ?? '有効にできませんでした'); }).finally(() => setBusy(false)); }}>確認して有効にする</Button></DialogActions></DialogBody></DialogSurface></Dialog>
  </section>;
}
