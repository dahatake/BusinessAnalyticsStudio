// 音声合成のキーの保存・削除と、読み上げの中継（FR-168・NFR-SEC-005）。
// キーは入力した瞬間に localhost の中継プロセスへ送るだけで、ブラウザーには保存しない（store にも持たない）。
// 取得できるのは「設定済みか」と伏せ字だけ。
import { create } from 'zustand';
import { buildSsml, explainFailure, SPEECH_TIMEOUT_MS, type SpeechResult } from './speech';

export interface RelaySpeechView {
  configured: boolean;
  endpoint: string;
  host: string;
  region: string;
  keyMask: string;
}

type F = typeof fetch;
const isLoopback = (u: string | undefined): u is string => {
  try {
    const h = new URL(u ?? '').hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch {
    return false;
  }
};

export async function fetchSpeechView(relayUrl: string | undefined, f: F = (u, i) => fetch(u, i)): Promise<RelaySpeechView | null> {
  if (!isLoopback(relayUrl)) return null;
  try {
    const r = await f(`${relayUrl}/speech/config`);
    return r.ok ? ((await r.json()) as RelaySpeechView) : null;
  } catch {
    return null;
  }
}

export async function putSpeechConfig(
  relayUrl: string,
  input: { endpoint: string; region: string; key: string },
  f: F = (u, i) => fetch(u, i),
): Promise<{ ok: true; view: RelaySpeechView } | { ok: false; message: string }> {
  try {
    const r = await f(`${relayUrl}/speech/config`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    const j = (await r.json()) as RelaySpeechView & { error?: string };
    return r.ok ? { ok: true, view: j } : { ok: false, message: j.error ?? '保存できませんでした' };
  } catch {
    return { ok: false, message: '中継プロセスに届きませんでした。`npm run relay` で起動しているか確認してください' };
  }
}

export async function deleteSpeechConfig(relayUrl: string, f: F = (u, i) => fetch(u, i)): Promise<RelaySpeechView | null> {
  try {
    const r = await f(`${relayUrl}/speech/config`, { method: 'DELETE' });
    return r.ok ? ((await r.json()) as RelaySpeechView) : null;
  } catch {
    return null;
  }
}

/** 中継経由の読み上げ。キーはブラウザーを通らない */
export async function requestSpeechViaRelay(
  relayUrl: string,
  text: string,
  opt: { fetchFn?: F; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<SpeechResult> {
  const fail = (kind: 'timeout' | 'http' | 'network'): SpeechResult => ({ ok: false, kind, message: explainFailure(kind) });
  const f = opt.fetchFn ?? ((u, i) => fetch(u, i));
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, opt.timeoutMs ?? SPEECH_TIMEOUT_MS);
  opt.signal?.addEventListener('abort', () => ctl.abort());
  try {
    const res = await f(`${relayUrl}/speech/synthesize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ssml: buildSsml(text) }),
      signal: ctl.signal,
    });
    if (!res.ok) return fail('http');
    return { ok: true, audio: await res.blob() };
  } catch {
    return fail(timedOut ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}

interface RelayKeyState {
  /** 中継から取得した状態（キーの値は含まない） */
  view: RelaySpeechView | null;
  refresh(relayUrl: string | undefined): Promise<void>;
  setView(v: RelaySpeechView | null): void;
}

export const useSpeechRelay = create<RelayKeyState>((set) => ({
  view: null,
  refresh: async (relayUrl) => set({ view: await fetchSpeechView(relayUrl) }),
  setView: (view) => set({ view }),
}));
