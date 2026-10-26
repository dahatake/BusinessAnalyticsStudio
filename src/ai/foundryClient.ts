// Microsoft Foundry の接続設定と生成の呼び出し口（FR-275）。ブラウザーからの送信先は localhost の中継プロセスだけ。
// キー・エンドポイントの値は、入力した瞬間に中継へ送るだけで、ブラウザーには保存しない。取得できるのは「設定済みか」と伏せ字だけ。
import { isLoopbackUrl } from './client';
import { clearConfirmedSendKinds, recordConfirmedSendKinds } from './sendKinds';

/** 設定画面の入力欄の既定（FR-275） */
export const DEFAULT_FOUNDRY_ENDPOINT = 'https://GraphcRecordingPanel.services.ai.azure.com/openai/v1';
export const DEFAULT_FOUNDRY_DEPLOYMENT = 'gpt-chat-latest';

export type AuthMethod = 'api-key' | 'entra';

export interface FoundryView {
  provider?: 'foundry' | 'copilot';
  configured: boolean;
  endpoint: string;
  host: string;
  deployment: string;
  keyMask: string;
  /** 認証方式（FR-282）。省略（旧中継）は api-key */
  authMethod?: 'api-key' | 'entra';
  /** この案件で実接続を有効にしているか */
  enabled: boolean;
}

export type FoundryUnavailableReason = 'consent' | 'disabled' | 'not-configured' | 'person-unconfirmed' | 'timeout' | 'error' | 'relay';
export type FoundryAskResult =
  | { mode: 'connected'; answer: string }
  | { mode: 'unavailable'; reason: FoundryUnavailableReason; message: string };

/** 設定画面での有効化・無効化・保存・削除を、取り込み画面などへ知らせる（FR-289 AC-757/758: 古い状態のままにしない） */
export const FOUNDRY_CHANGED_EVENT = 'foundry-config-changed';
export function notifyFoundryChanged(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event(FOUNDRY_CHANGED_EVENT));
}

type F = typeof fetch;
const dflt: F = (u, i) => fetch(u, i);
const NO_RELAY = '中継プロセスに届きませんでした。`npm run relay` で起動しているか確認してください';

export async function fetchFoundryView(relayUrl: string | undefined, packId: string, f: F = dflt, withProvider = true): Promise<FoundryView | null> {
  if (!relayUrl || !isLoopbackUrl(relayUrl)) return null;
  try {
    const r = await f(`${relayUrl}/foundry/config?packId=${encodeURIComponent(packId)}`);
    if (!r.ok) return null;
    const v = (await r.json()) as FoundryView;
    // FR-275 AC-769: 接続先の選択は GET /ai/provider が正（CONTRACT.md §30）。設定の応答に含まれないときだけ問い合わせる
    if (withProvider && v.provider !== 'foundry' && v.provider !== 'copilot') {
      try {
        const p = await f(`${relayUrl}/ai/provider`);
        const j = p.ok ? ((await p.json()) as { provider?: unknown }) : {};
        if (j.provider === 'foundry' || j.provider === 'copilot') v.provider = j.provider;
      } catch { /* 旧中継（/ai/provider なし）は Microsoft Foundry として扱う */ }
    }
    return v;
  } catch {
    return null;
  }
}

export async function putFoundryConfig(
  relayUrl: string, packId: string, input: { endpoint: string; deployment: string; key: string; authMethod?: AuthMethod }, f: F = dflt,
): Promise<{ ok: true; view: FoundryView } | { ok: false; message: string }> {
  if (!isLoopbackUrl(relayUrl)) return { ok: false, message: NO_RELAY };
  try {
    const r = await f(`${relayUrl}/foundry/config?packId=${encodeURIComponent(packId)}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    const j = (await r.json()) as FoundryView & { error?: string };
    if (r.ok) notifyFoundryChanged();
    return r.ok ? { ok: true, view: j } : { ok: false, message: j.error ?? '保存できませんでした' };
  } catch {
    return { ok: false, message: NO_RELAY };
  }
}

export async function deleteFoundryConfig(relayUrl: string, packId: string, f: F = dflt, withProvider = true): Promise<FoundryView | null> {
  if (!isLoopbackUrl(relayUrl)) return null;
  try {
    const r = await f(`${relayUrl}/foundry/config?packId=${encodeURIComponent(packId)}`, { method: 'DELETE' });
    if (r.ok) notifyFoundryChanged();
    return r.ok ? ((await r.json()) as FoundryView) : null;
  } catch {
    return null;
  }
}

export async function setFoundryConnection(
  relayUrl: string, packId: string, enable: boolean, opt: { consent: boolean; confirmed: boolean }, f: F = dflt,
): Promise<{ ok: boolean; mode: 'connected' | 'mock'; message?: string }> {
  if (!isLoopbackUrl(relayUrl)) return { ok: false, mode: 'mock', message: NO_RELAY };
  try {
    const r = await f(`${relayUrl}/foundry/connection`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ packId, enable, ...opt }),
    });
    const j = (await r.json()) as { mode?: 'connected' | 'mock'; error?: string };
    if (r.ok) notifyFoundryChanged();
    // FR-275 AC-703・FR-290 AC-777: 有効化の確認で示した送信情報の種類を記録する（無効にしたら消す）
    if (r.ok && enable && opt.confirmed && (j.mode ?? 'mock') === 'connected') recordConfirmedSendKinds(packId);
    if (r.ok && !enable) clearConfirmedSendKinds(packId);
    return { ok: r.ok, mode: j.mode ?? 'mock', message: j.error };
  } catch {
    return { ok: false, mode: 'mock', message: NO_RELAY };
  }
}

/** 生成の依頼。了承の記録（FR-181）の有無は毎回渡す（取り消すと次の呼び出しから 0 回になる） */
export async function askFoundry(
  relayUrl: string | undefined,
  req: { packId: string; prompt: string; consent: boolean; includesPerson?: boolean; personConfirmed?: boolean; maxOutputTokens?: number; timeoutSeconds?: number; purpose?: string },
  f: F = dflt,
  signal?: AbortSignal,
): Promise<FoundryAskResult> {
  if (!relayUrl || !isLoopbackUrl(relayUrl)) return { mode: 'unavailable', reason: 'relay', message: NO_RELAY };
  try {
    const r = await f(`${relayUrl}/foundry/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req), ...(signal ? { signal } : {}) });
    const j = (await r.json()) as FoundryAskResult & { error?: string };
    if (!r.ok) return { mode: 'unavailable', reason: 'error', message: j.error ?? 'Foundry を呼べませんでした' };
    return j;
  } catch {
    return { mode: 'unavailable', reason: 'relay', message: NO_RELAY };
  }
}

// ---- FR-282 AC-764: エンドポイントの入力案内と検証（値は検証メッセージに含めない） ----
export const ENDPOINT_FORMAT_EXAMPLES = ['https://<リソース名>.openai.azure.com/openai/v1', 'https://<リソース名>.services.ai.azure.com/openai/v1'] as const;
const AZURE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(services\.ai|openai|cognitiveservices)\.azure\.com$/i;

/** 保存してよいエンドポイントか。よければ null、不正なら理由（入力値は含めない） */
export function validateFoundryEndpoint(value: string): string | null {
  const v = value.trim();
  if (!v) return 'エンドポイントを入力してください。例: https://<リソース名>.openai.azure.com/openai/v1';
  let u: URL;
  try { u = new URL(v); } catch { return 'URL の形式で入力してください。例: https://<リソース名>.openai.azure.com/openai/v1'; }
  if (u.protocol !== 'https:') return 'https で始まる URL を入力してください。';
  if (u.username || u.password || u.port || !AZURE_HOST.test(u.hostname)) return 'Azure の標準のドメイン（*.openai.azure.com・*.services.ai.azure.com・*.cognitiveservices.azure.com）の URL を入力してください。';
  return null;
}

// ---- FR-282 AC-763: 接続テスト（中継の POST /foundry/test。結果は成功か原因種別だけ） ----
export type FoundryTestCause = 'not-configured' | 'auth' | 'endpoint' | 'deployment' | 'timeout' | 'other' | 'too-frequent' | 'relay';
export type FoundryTestResult = { ok: true; message: string } | { ok: false; cause: FoundryTestCause; message: string; retryAfterSeconds?: number };

export async function testFoundry(relayUrl: string | undefined, f: F = dflt): Promise<FoundryTestResult> {
  if (!relayUrl || !isLoopbackUrl(relayUrl)) return { ok: false, cause: 'relay', message: NO_RELAY };
  try {
    const r = await f(`${relayUrl}/foundry/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const j = (await r.json()) as Partial<FoundryTestResult> & { ok?: boolean; cause?: FoundryTestCause; message?: string; retryAfterSeconds?: number };
    if (j.ok === true) return { ok: true, message: '接続できました' };
    return { ok: false, cause: j.cause ?? 'other', message: j.message ?? '接続を確認できませんでした', retryAfterSeconds: j.retryAfterSeconds };
  } catch {
    return { ok: false, cause: 'relay', message: NO_RELAY };
  }
}
