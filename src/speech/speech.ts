// 字幕の読み上げ（FR-167）。音声合成の接続先（Azure AI Speech 想定）へ字幕の文言を送り、返った音声を鳴らす。
// 接続先とキーは runtime-config.json の `speech`（モックのキー受け渡し枠）だけから読む。
// API キーの入力・保存・削除は FR-168（承認待ち）なので、ここでは localStorage にも画面にも出さない。
import { tr } from '../i18n';
export interface SpeechConfig {
  endpoint?: string;
  key?: string;
}

export type SpeechFailure = 'unconfigured' | 'offline' | 'timeout' | 'http' | 'network';
export type SpeechResult = { ok: true; audio: Blob } | { ok: false; kind: SpeechFailure; message: string };

export const SPEECH_TIMEOUT_MS = 8_000;

/** 接続先の URL として使えるか（https、または手元の中継の http://localhost） */
export function isSpeechEndpoint(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'));
  } catch {
    return false;
  }
}

/** 接続先とキーの両方がそろっているか。キーの値は返さない */
export function isSpeechConfigured(cfg: SpeechConfig | undefined): boolean {
  return !!cfg && isSpeechEndpoint(cfg.endpoint) && typeof cfg.key === 'string' && cfg.key.trim() !== '';
}

/** 送信先の表示用の名前（ホスト名だけ。キーやパスは出さない） */
export function speechHost(cfg: SpeechConfig | undefined): string {
  try {
    return new URL(cfg?.endpoint ?? '').host;
  } catch {
    return '';
  }
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Azure AI Speech の SSML。字幕の文言をそのまま入れる */
export function buildSsml(text: string): string {
  return `<speak version="1.0" xml:lang="ja-JP"><voice xml:lang="ja-JP" name="ja-JP-NanamiNeural">${xmlEscape(text)}</voice></speak>`;
}

/** 失敗の原因と直し方（利用者に見せる文言） */
export function explainFailure(kind: SpeechFailure): string {
  switch (kind) {
    case 'unconfigured':
      return tr('原因: 音声合成の接続先が設定されていません。直し方: 実行時の設定（runtime-config.json の speech、または .env）に接続先とキーを入れて、再読み込みしてください。字幕だけで再生を続けます。');
    case 'offline':
      return tr('原因: ネットワークに接続されていません。直し方: 接続を確認してから、もう一度再生してください。字幕だけで再生を続けます。');
    case 'timeout':
      return tr('原因: 音声合成の接続先から時間内に応答がありませんでした。直し方: 接続先の状態とネットワークを確認してください。字幕だけで再生を続けます。');
    case 'http':
      return tr('原因: 音声合成の接続先がエラーを返しました（接続先やキーが正しくない可能性があります）。直し方: 接続先とキーの設定を確認してください。字幕だけで再生を続けます。');
    default:
      return tr('原因: 音声合成の接続先に届きませんでした。直し方: 接続先の URL とネットワークを確認してください。字幕だけで再生を続けます。');
  }
}

const fail = (kind: SpeechFailure): SpeechResult => ({ ok: false, kind, message: explainFailure(kind) });

export interface SpeakOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  online?: () => boolean;
  signal?: AbortSignal;
}

/** 字幕 1 文を接続先へ送る。例外は投げず、結果で返す（失敗しても再生は字幕だけで続けるため） */
export async function requestSpeech(cfg: SpeechConfig | undefined, text: string, opt: SpeakOptions = {}): Promise<SpeechResult> {
  if (!isSpeechConfigured(cfg)) return fail('unconfigured');
  const online = opt.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  if (!online()) return fail('offline');
  const f = opt.fetchFn ?? ((u, i) => fetch(u, i));
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, opt.timeoutMs ?? SPEECH_TIMEOUT_MS);
  opt.signal?.addEventListener('abort', () => ctl.abort());
  try {
    const res = await f(cfg!.endpoint as string, {
      method: 'POST',
      headers: {
        'content-type': 'application/ssml+xml',
        'ocp-apim-subscription-key': cfg!.key as string,
        'x-microsoft-outputformat': 'riff-16khz-16bit-mono-pcm',
      },
      body: buildSsml(text),
      signal: ctl.signal,
    });
    if (!res.ok) return fail('http');
    return { ok: true, audio: await res.blob() };
  } catch {
    if (timedOut) return fail('timeout');
    if (!online()) return fail('offline');
    return fail('network');
  } finally {
    clearTimeout(timer);
  }
}
