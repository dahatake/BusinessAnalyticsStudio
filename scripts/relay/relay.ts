// Copilot SDK 中継プロセス（FR-010・FR-011・FR-132）。
// - 127.0.0.1 / ::1 だけで待ち受ける（ループバック以外の host は起動を拒否する）。
// - LLM を使う 5 種類の処理は、すべて POST /ask の 1 つの呼び出し口を通る。
// - 実接続を明示的に有効にした顧客パックの要求にだけ SDK を呼ぶ。それ以外はモックで答え、SDK は 0 回。
// - API キー・トークンは持たない。認証は利用者の GitHub Copilot のサインインを使う（SDK 側）。
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AZURE_FEATURES, AzureServiceError, type AzureFeature, type AzureServices } from './azure-services';

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
  /** 音声合成・手書き認識の接続部品（FR-182）。なければ常にモック */
  azure?: AzureServices;
  host?: string;
  port?: number;
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
  const signedIn = async (): Promise<boolean> => (opts.sdk ? (await opts.sdk.status().catch(() => ({ signedIn: false }))).signedIn : false);

  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    const json = (status: number, obj: unknown) => {
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        ...(origin && originAllowed(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}),
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
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
        if (req.method === 'POST' && path === '/connection') {
          const b = JSON.parse((await readBody(req)) || '{}') as { packId?: string; enable?: boolean;           confirmed?: boolean; consent?: boolean };
          if (typeof b.packId !== 'string' || !b.packId) return json(400, { error: 'packId が必要です' });
          if (b.enable) {
                      // FR-181: 顧客の了承の記録（利用者の自己申告）がない案件は、実接続を有効にできない
                      if (b.consent !== true) return json(403, { error: '顧客の了承の記録がないため、実接続を有効にできません', mode: 'mock' });
                      if (b.confirmed !== true) return json(400, { error: '送信内容の確認が必要です' });
            if (!(await signedIn())) return json(409, { error: 'Copilot にサインインしていません', mode: 'mock' });
            enabled.add(b.packId);
          } else {
            enabled.delete(b.packId);
          }
          return json(200, { mode: enabled.has(b.packId) ? 'connected' : 'mock' });
        }
        // ---- FR-182: 音声合成（Azure AI Speech）・手書き認識（Azure AI Vision）。キーは中継側の環境変数だけ ----
        if (path.startsWith('/azure/')) {
          const az = opts.azure;
          if (req.method === 'POST' && path === '/azure/connection') {
            const b = JSON.parse((await readBody(req)) || '{}') as { feature?: string; packId?: string; enable?: boolean; confirmed?: boolean; consent?: boolean };
            if (!AZURE_FEATURES.includes(b.feature as AzureFeature) || typeof b.packId !== 'string' || !b.packId) return json(400, { error: 'feature・packId が必要です' });
            const feature = b.feature as AzureFeature;
            if (!b.enable) { az?.disable(feature, b.packId); return json(200, { mode: 'mock' }); }
            if (b.consent !== true) return json(403, { error: '顧客の了承の記録がないため、実接続を有効にできません', mode: 'mock' });
            if (b.confirmed !== true) return json(400, { error: '送信内容の確認が必要です' });
            if (!az) return json(200, { mode: 'mock', reason: 'キーが未設定のため、モックのまま動作します' });
            const r = az.enable(feature, b.packId, true);
            return json(200, r.ok ? { mode: 'connected' } : { mode: 'mock', reason: r.reason });
          }
          if (req.method === 'POST' && path === '/azure/speech') {
            const b = JSON.parse((await readBody(req)) || '{}') as { packId?: string; text?: string };
            if (typeof b.packId !== 'string' || typeof b.text !== 'string') return json(400, { error: 'packId・text が必要です' });
            return json(200, az ? await az.synthesize(b.packId, b.text) : { mode: 'mock', subtitleOnly: true });
          }
          if (req.method === 'POST' && path === '/azure/vision') {
            const b = JSON.parse((await readBody(req)) || '{}') as { packId?: string; image?: string; strokeCount?: number };
            if (typeof b.packId !== 'string' || typeof b.image !== 'string') return json(400, { error: 'packId・image が必要です' });
            const n = Number(b.strokeCount ?? 0);
            return json(200, az ? await az.recognize(b.packId, b.image, n) : { mode: 'mock', text: `手書きメモ（${n} 画。モックの認識結果）` });
          }
          return json(404, { error: 'not found' });
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
        if (e instanceof AzureServiceError) return json(502, { error: e.message, mode: 'connected' });
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
