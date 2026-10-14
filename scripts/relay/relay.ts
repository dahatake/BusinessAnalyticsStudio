// Copilot SDK 中継プロセス（FR-010・FR-011・FR-132）。
// - 127.0.0.1 / ::1 だけで待ち受ける（ループバック以外の host は起動を拒否する）。
// - LLM を使う 5 種類の処理は、すべて POST /ask の 1 つの呼び出し口を通る。
// - 実接続を明示的に有効にした顧客パックの要求にだけ SDK を呼ぶ。それ以外はモックで答え、SDK は 0 回。
// - Copilot の API キー・トークンは持たない。認証は利用者の GitHub Copilot のサインインを使う（SDK 側）。
// - 音声合成の API キーだけは、暗号化して PC 内に保管し、読み上げを中継する（FR-168・NFR-SEC-005。speech-vault.ts）。
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { openSpeechVault, type SpeechVault } from './speech-vault';

export const AI_KINDS = ['structure', 'summary', 'recommend', 'chat', 'exec-summary'] as const;
export type AiKind = (typeof AI_KINDS)[number];

/** Copilot SDK の薄い差し替え口。実体は copilot-adapter.ts、検査ではスタブをつなぐ。 */
export interface CopilotSdk {
  /** サインイン済み・利用可能か */
  status(): Promise<{ signedIn: boolean }>;
  complete(kind: AiKind, prompt: string): Promise<string>;
}

export interface RelayOptions {
  sdk: CopilotSdk | null;
  host?: string;
  port?: number;
  /** 音声合成のキーの保管庫（FR-168）。省略すると既定のデータフォルダー */
  speechVault?: SpeechVault;
  /** 音声合成の接続先への送信口。検査ではモックを渡す */
  speechFetch?: typeof fetch;
}

export interface Relay {
  host: string;
  port: number;
  url: string;
  close(): Promise<void>;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1']);
const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function mockAnswer(kind: AiKind, prompt: string): string {
  const head = prompt.replace(/\s+/g, ' ').slice(0, 60);
  return `（モックの回答）${kind} 「${head}」への回答の例です。実際の AI には送信していません。`;
}

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    return LOOPBACK_NAMES.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c: Buffer) => {
      body += c.toString('utf8');
      if (body.length > 1_000_000) reject(new Error('too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export async function startRelay(opts: RelayOptions): Promise<Relay> {
  const host = opts.host ?? '127.0.0.1';
  if (!LOOPBACK_HOSTS.has(host)) throw new Error(`中継プロセスはループバック（127.0.0.1 / ::1）だけで待ち受けます: ${host}`);
  /** 実接続を有効にした顧客パックの ID（プロセスの再起動で消える。FR-132 A-15） */
  const enabled = new Set<string>();
  let vault: SpeechVault | null = opts.speechVault ?? null;
  const getVault = (): SpeechVault => (vault ??= openSpeechVault());
  const speechFetch = opts.speechFetch ?? ((u, i) => fetch(u, i));
  const signedIn = async (): Promise<boolean> => (opts.sdk ? (await opts.sdk.status().catch(() => ({ signedIn: false }))).signedIn : false);

  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    const json = (status: number, obj: unknown) => {
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        ...(origin && originAllowed(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}),
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
      });
      res.end(JSON.stringify(obj));
    };
    if (!originAllowed(origin)) return json(403, { error: 'forbidden origin' });
    if (req.method === 'OPTIONS') return json(204, {});
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    void (async () => {
      try {
        if (req.method === 'GET' && path === '/health') {
          return json(200, { status: 'ready', copilot: (await signedIn()) ? 'signed-in' : 'signed-out' });
        }
        if (path === '/speech/config') {
          if (req.method === 'GET') return json(200, getVault().view());
          if (req.method === 'PUT') {
            const b = JSON.parse((await readBody(req)) || '{}') as { endpoint?: string; region?: string; key?: string };
            try {
              return json(200, getVault().save({ endpoint: String(b.endpoint ?? ''), region: b.region, key: typeof b.key === 'string' ? b.key : undefined }));
            } catch (e) {
              return json(400, { error: e instanceof Error ? e.message : '保存できませんでした' });
            }
          }
          if (req.method === 'DELETE') {
            getVault().remove();
            return json(200, getVault().view());
          }
        }
        if (req.method === 'POST' && path === '/speech/synthesize') {
          const b = JSON.parse((await readBody(req)) || '{}') as { ssml?: string };
          const s = getVault().secret();
          if (!s) return json(409, { error: '音声合成の接続先とキーが設定されていません' });
          if (typeof b.ssml !== 'string' || !b.ssml) return json(400, { error: 'ssml が必要です' });
          try {
            const up = await speechFetch(s.endpoint, {
              method: 'POST',
              headers: { 'content-type': 'application/ssml+xml', 'ocp-apim-subscription-key': s.key, 'x-microsoft-outputformat': 'riff-16khz-16bit-mono-pcm' },
              body: b.ssml,
            });
            if (!up.ok) return json(502, { error: '音声合成の接続先がエラーを返しました' });
            const audio = Buffer.from(await up.arrayBuffer());
            res.writeHead(200, { 'content-type': 'audio/wav', ...(origin && originAllowed(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}) });
            return void res.end(audio);
          } catch {
            return json(502, { error: '音声合成の接続先に届きませんでした' });
          }
        }
        if (req.method === 'POST' && path === '/connection') {
          const b = JSON.parse((await readBody(req)) || '{}') as { packId?: string; enable?: boolean; confirmed?: boolean };
          if (typeof b.packId !== 'string' || !b.packId) return json(400, { error: 'packId が必要です' });
          if (b.enable) {
            if (b.confirmed !== true) return json(400, { error: '送信内容の確認が必要です' });
            if (!(await signedIn())) return json(409, { error: 'Copilot にサインインしていません', mode: 'mock' });
            enabled.add(b.packId);
          } else {
            enabled.delete(b.packId);
          }
          return json(200, { mode: enabled.has(b.packId) ? 'connected' : 'mock' });
        }
        if (req.method === 'POST' && path === '/ask') {
          const b = JSON.parse((await readBody(req)) || '{}') as { kind?: string; packId?: string; prompt?: string };
          if (!AI_KINDS.includes(b.kind as AiKind) || typeof b.prompt !== 'string' || typeof b.packId !== 'string') {
            return json(400, { error: 'kind・packId・prompt が必要です' });
          }
          const kind = b.kind as AiKind;
          if (!opts.sdk || !enabled.has(b.packId)) {
            return json(200, { answer: mockAnswer(kind, b.prompt), sourceIds: [], mode: 'mock' });
          }
          const answer = await opts.sdk.complete(kind, b.prompt);
          return json(200, { answer, sourceIds: [], mode: 'connected' });
        }
        return json(404, { error: 'not found' });
      } catch (e) {
        return json(500, { error: e instanceof Error ? e.message : String(e) });
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, host, resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    host,
    port,
    url: `http://${host.includes(':') ? `[${host}]` : host}:${port}`,
    close: () => new Promise<void>((r) => { server.close(() => r()); server.closeAllConnections?.(); }),
  };
}
