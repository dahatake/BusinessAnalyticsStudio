// Microsoft Foundry の接続設定と生成の呼び出し口（FR-275）。ブラウザーからの送信先は localhost の中継プロセスだけ。
// キー・エンドポイントの値は、入力した瞬間に中継へ送るだけで、ブラウザーには保存しない。取得できるのは「設定済みか」と伏せ字だけ。
import { isLoopbackUrl } from './client';

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

export async function fetchFoundryView(relayUrl: string | undefined, packId: string, f: F = dflt): Promise<FoundryView | null> {
  if (!relayUrl || !isLoopbackUrl(relayUrl)) return null;
  try {
    const r = await f(`${relayUrl}/foundry/config?packId=${encodeURIComponent(packId)}`);
    return r.ok ? ((await r.json()) as FoundryView) : null;
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

export async function deleteFoundryConfig(relayUrl: string, packId: string, f: F = dflt): Promise<FoundryView | null> {
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
    return { ok: r.ok, mode: j.mode ?? 'mock', message: j.error };
  } catch {
    return { ok: false, mode: 'mock', message: NO_RELAY };
  }
}

/** 生成の依頼。了承の記録（FR-181）の有無は毎回渡す（取り消すと次の呼び出しから 0 回になる） */
export async function askFoundry(
  relayUrl: string | undefined,
  req: { packId: string; prompt: string; consent: boolean; includesPerson?: boolean; personConfirmed?: boolean; maxOutputTokens?: number },
  f: F = dflt,
): Promise<FoundryAskResult> {
  if (!relayUrl || !isLoopbackUrl(relayUrl)) return { mode: 'unavailable', reason: 'relay', message: NO_RELAY };
  try {
    const r = await f(`${relayUrl}/foundry/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) });
    const j = (await r.json()) as FoundryAskResult & { error?: string };
    if (!r.ok) return { mode: 'unavailable', reason: 'error', message: j.error ?? 'Foundry を呼べませんでした' };
    return j;
  } catch {
    return { mode: 'unavailable', reason: 'relay', message: NO_RELAY };
  }
}
