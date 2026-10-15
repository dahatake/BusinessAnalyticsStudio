// 音声合成・手書き認識の実接続のクライアント（FR-182）。ブラウザーからの送信先は localhost の中継プロセスだけ（NFR-SEC-002）。
// キーはブラウザーに渡らない（中継プロセスの .env だけ）。実接続が有効でなければ、中継プロセスも呼ばず、モックで動作する。
import { isLoopbackUrl, type AiEnv } from './client';

export type AzureFeature = 'speech' | 'vision';

type FetchFn = NonNullable<AiEnv['fetchFn']>;
const defaultFetch: FetchFn = (u, i) => fetch(u, i);

export interface ConnectionResult {
  ok: boolean;
  mode: 'mock' | 'connected';
  /** 画面に出す理由（キーの値を含まない） */
  reason?: string;
}

/** 中継プロセスに、この機能・顧客パックの実接続を登録・解除する */
export async function setAzureConnection(
  relayUrl: string | undefined, feature: AzureFeature, packId: string, enable: boolean, consent: boolean, fetchFn: FetchFn = defaultFetch,
): Promise<ConnectionResult> {
  if (!relayUrl || !isLoopbackUrl(relayUrl)) return { ok: false, mode: 'mock', reason: '中継プロセスの URL（localhost）が設定されていません。' };
  try {
    const res = await fetchFn(`${relayUrl}/azure/connection`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ feature, packId, enable, confirmed: enable, consent }),
    });
    const j = (await res.json().catch(() => ({}))) as { mode?: string; reason?: string; error?: string };
    if (!res.ok) return { ok: false, mode: 'mock', reason: j.error ?? `中継プロセスがエラーを返しました（${res.status}）` };
    return { ok: true, mode: j.mode === 'connected' ? 'connected' : 'mock', reason: j.reason };
  } catch {
    return { ok: false, mode: 'mock', reason: '中継プロセスに接続できません（オフライン、または未起動）。' };
  }
}

export type SpeechOutcome =
  | { kind: 'subtitle-only'; reason?: string }
  | { kind: 'audio'; audioBase64: string; contentType: string }
  /** 接続の失敗。字幕だけで進める */
  | { kind: 'error'; message: string };

/** 台本の文章を音声にする。実接続が有効でなければ呼び出さず、字幕だけにする */
export async function synthesizeSpeech(
  env: { relayUrl?: string; realEnabled: boolean; packId: string; fetchFn?: FetchFn }, text: string,
): Promise<SpeechOutcome> {
  if (!env.realEnabled || !env.relayUrl || !isLoopbackUrl(env.relayUrl)) return { kind: 'subtitle-only' };
  const f = env.fetchFn ?? defaultFetch;
  try {
    const res = await f(`${env.relayUrl}/azure/speech`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ packId: env.packId, text }) });
    const j = (await res.json().catch(() => ({}))) as { mode?: string; audioBase64?: string; contentType?: string; error?: string };
    if (!res.ok) return { kind: 'error', message: j.error ?? `音声合成に失敗しました（${res.status}）` };
    if (j.mode === 'connected' && j.audioBase64) return { kind: 'audio', audioBase64: j.audioBase64, contentType: j.contentType ?? 'audio/mpeg' };
    return { kind: 'subtitle-only' };
  } catch {
    return { kind: 'error', message: '音声合成に失敗しました（中継プロセスに接続できません）。' };
  }
}

export interface RelayRecognition { text: string; mock: boolean }

/** 手書きの画像（PNG の base64）を認識する。失敗は Error を投げる（呼び出し側は元の手書きを残したまま通知する） */
export async function recognizeViaRelay(
  env: { relayUrl?: string; packId: string; fetchFn?: FetchFn }, imageBase64: string, strokeCount: number,
): Promise<RelayRecognition> {
  if (!env.relayUrl || !isLoopbackUrl(env.relayUrl)) throw new Error('中継プロセスの URL（localhost）が設定されていません');
  const f = env.fetchFn ?? defaultFetch;
  let res;
  try {
    res = await f(`${env.relayUrl}/azure/vision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ packId: env.packId, image: imageBase64, strokeCount }) });
  } catch {
    throw new Error('中継プロセスに接続できません');
  }
  const j = (await res.json().catch(() => ({}))) as { mode?: string; text?: string; error?: string };
  if (!res.ok) throw new Error(j.error ?? `手書き認識に失敗しました（${res.status}）`);
  return { text: String(j.text ?? ''), mock: j.mode !== 'connected' };
}
