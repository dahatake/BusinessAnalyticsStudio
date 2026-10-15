// 音声合成（Azure AI Speech）・手書き認識（Azure AI Vision）の接続部品（FR-182）。呼ぶ主体は中継プロセス。
// - キーは中継側の環境変数（.env）だけに置く。ブラウザー・応答・ログ・エラーには出さない（NFR-SEC-001）。
// - キー未設定、または機能が有効でない、または了承の記録がないときは、外部を呼ばずモックで答える。
// - HTTP 呼び出しは HttpPost として差し替えられる（テストはスタブ、本番は fetch）。

export type AzureFeature = 'speech' | 'vision';
export const AZURE_FEATURES: readonly AzureFeature[] = ['speech', 'vision'];

export interface HttpResponse { status: number; body: Uint8Array }
export type HttpPost = (url: string, init: { headers: Record<string, string>; body: string | Uint8Array }) => Promise<HttpResponse>;

export const fetchPost: HttpPost = async (url, init) => {
  const res = await fetch(url, { method: 'POST', headers: init.headers, body: init.body as BodyInit });
  return { status: res.status, body: new Uint8Array(await res.arrayBuffer()) };
};

export interface AzureConfig {
  speechKey?: string;
  speechRegion?: string;
  visionKey?: string;
  visionEndpoint?: string;
}

/** 環境変数から読む（値は返すだけ。ログには出さない） */
export function azureConfigFromEnv(env: Record<string, string | undefined>): AzureConfig {
  const v = (n: string) => (env[n]?.trim() ? env[n]!.trim() : undefined);
  return { speechKey: v('AZURE_SPEECH_KEY'), speechRegion: v('AZURE_SPEECH_REGION'), visionKey: v('AZURE_VISION_KEY'), visionEndpoint: v('AZURE_VISION_ENDPOINT') };
}

export type AzureMode = 'mock' | 'connected';
export type SpeechResult = { mode: 'mock'; subtitleOnly: true } | { mode: 'connected'; audioBase64: string; contentType: string };
export type VisionResult = { mode: 'mock'; text: string } | { mode: 'connected'; text: string };

export class AzureServiceError extends Error {}

/** 入力の上限（NFR-SEC-003）。中継（relay.ts）と部品の両方で使う */
export const MAX_SPEECH_TEXT_CHARS = 5000;
export const MAX_IMAGE_BASE64_CHARS = 4_000_000;
export const MAX_STROKE_COUNT = 100_000;

/** リージョンは英数字とハイフンだけ（キーを任意のホストへ送らせない。NFR-SEC-001/002） */
export const isValidSpeechRegion = (r: string | undefined): r is string => !!r && /^[A-Za-z0-9-]{1,64}$/.test(r);
/** エンドポイントは https かつ Azure 標準ドメイン（*.cognitiveservices.azure.com）だけ */
export function isValidVisionEndpoint(e: string | undefined): e is string {
  if (!e) return false;
  try {
    const u = new URL(e);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.cognitiveservices\.azure\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}
export const isValidBase64 = (s: string): boolean => s.length > 0 && s.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s);
export const isValidStrokeCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_STROKE_COUNT;

export interface AzureServices {
  /** キーが設定されているか（値は返さない） */
  hasKey(feature: AzureFeature): boolean;
  /** 有効にする。了承・キーの条件を満たさなければ有効にならず、理由を返す */
  enable(feature: AzureFeature, packId: string, consent: boolean): { ok: true; mode: 'connected' } | { ok: false; mode: 'mock'; reason: string; code: 'no-consent' | 'no-key' };
  disable(feature: AzureFeature, packId: string): void;
  mode(feature: AzureFeature, packId: string): AzureMode;
  synthesize(packId: string, text: string): Promise<SpeechResult>;
  recognize(packId: string, imageBase64: string, strokeCount: number): Promise<VisionResult>;
}

export function mockRecognitionText(strokeCount: number): string {
  return `手書きメモ（${strokeCount} 画。モックの認識結果）`;
}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export function createAzureServices(config: AzureConfig, http: HttpPost = fetchPost): AzureServices {
  const enabled = new Set<string>();
  const slot = (f: AzureFeature, p: string) => `${f}:${p}`;
  const keyOf = (f: AzureFeature) => (f === 'speech' ? config.speechKey : config.visionKey);
  const ready = (f: AzureFeature) => !!keyOf(f) && (f === 'speech' ? isValidSpeechRegion(config.speechRegion) : isValidVisionEndpoint(config.visionEndpoint));
  /** エラーの文面からキーの値を取り除く */
  const scrub = (m: string): string => {
    let out = m;
    for (const k of [config.speechKey, config.visionKey]) if (k) out = out.split(k).join('***');
    return out;
  };
  const fail = (what: string, cause: unknown): never => {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new AzureServiceError(scrub(`${what}に失敗しました: ${detail}`));
  };

  return {
    hasKey: ready,
    enable(feature, packId, consent) {
      if (!consent) return { ok: false, mode: 'mock', code: 'no-consent', reason: '顧客の了承の記録がないため、実接続を有効にできません' };
      if (!ready(feature)) return { ok: false, mode: 'mock', code: 'no-key', reason: 'キーが未設定のため、モックのまま動作します' };
      enabled.add(slot(feature, packId));
      return { ok: true, mode: 'connected' };
    },
    disable(feature, packId) { enabled.delete(slot(feature, packId)); },
    mode: (feature, packId) => (enabled.has(slot(feature, packId)) && ready(feature) ? 'connected' : 'mock'),

    async synthesize(packId, text) {
      if (!enabled.has(slot('speech', packId)) || !ready('speech')) return { mode: 'mock', subtitleOnly: true };
      try {
        const ssml = `<speak version='1.0' xml:lang='ja-JP'><voice xml:lang='ja-JP' name='ja-JP-NanamiNeural'>${escapeXml(text)}</voice></speak>`;
        const res = await http(`https://${config.speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
          headers: {
            'Ocp-Apim-Subscription-Key': config.speechKey!,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
          },
          body: ssml,
        });
        if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
        return { mode: 'connected', audioBase64: Buffer.from(res.body).toString('base64'), contentType: 'audio/mpeg' };
      } catch (e) {
        return fail('音声合成（Azure AI Speech）', e);
      }
    },

    async recognize(packId, imageBase64, strokeCount) {
      if (!enabled.has(slot('vision', packId)) || !ready('vision')) return { mode: 'mock', text: mockRecognitionText(strokeCount) };
      try {
        const base = config.visionEndpoint!.replace(/\/+$/, '');
        const res = await http(`${base}/computervision/imageanalysis:analyze?api-version=2023-10-01&features=read&language=ja`, {
          headers: { 'Ocp-Apim-Subscription-Key': config.visionKey!, 'Content-Type': 'application/octet-stream' },
          body: new Uint8Array(Buffer.from(imageBase64, 'base64')),
        });
        if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
        const j = JSON.parse(Buffer.from(res.body).toString('utf8')) as { readResult?: { blocks?: { lines?: { text?: string }[] }[] } };
        const text = (j.readResult?.blocks ?? []).flatMap((b) => b.lines ?? []).map((l) => l.text ?? '').join(' ').trim();
        return { mode: 'connected', text };
      } catch (e) {
        return fail('手書き認識（Azure AI Vision）', e);
      }
    },
  };
}
