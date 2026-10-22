// AI 取り込み（FR-289）の中継プロセスの差し替え部品。本物の Foundry は呼ばない。HTTP の形は CONTRACT.md §26。
// 接続情報（GET/PUT/DELETE /foundry/config）は startRelayStub と同じ形。キーは保持するが、応答には伏せ字しか返さない。
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RelayStub } from './relay-stub';

export type AiImportMode = 'ok' | 'upstream-error';

export interface AiImportRelayStub extends RelayStub {
  /** 保存された API キー（テストが漏えいの検査に使う。画面・応答には出さない） */
  savedKey(): string | null;
  /** /foundry/import の呼び出し回数 */
  importCalls(): number;
}

export async function startAiImportRelayStub(opts: { configured?: boolean; mode?: AiImportMode; initialKey?: string } = {}): Promise<AiImportRelayStub> {
  const received: RelayStub['received'] = [];
  let foundry: { endpoint: string; deployment: string; key: string } | null = opts.configured
    ? { endpoint: 'https://example.invalid/openai/v1', deployment: 'dummy-deploy', key: opts.initialKey ?? 'dummy-key-for-system-test-9999' }
    : null;
  const mode = opts.mode ?? 'ok';
  const server = http.createServer((req, res) => {
    const cors = {
      'access-control-allow-origin': req.headers.origin ?? '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      received.push({ method: req.method ?? '', path: u.pathname, body });
      const json = (code: number, o: unknown) => {
        res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...cors });
        res.end(JSON.stringify(o));
      };
      const view = () =>
        foundry
          ? { configured: true, endpoint: foundry.endpoint, host: new URL(foundry.endpoint).host, deployment: foundry.deployment, keyMask: `••••${foundry.key.slice(-4)}`, enabled: false }
          : { configured: false, endpoint: '', host: '', deployment: '', keyMask: '', enabled: false };
      if (u.pathname === '/foundry/config') {
        if (req.method === 'PUT') {
          try {
            const b = JSON.parse(body) as { endpoint?: string; deployment?: string; key?: string };
            if (!b.endpoint || !b.deployment || !b.key) return json(400, { error: 'エンドポイント・デプロイ名・API キーを入力してください' });
            foundry = { endpoint: b.endpoint, deployment: b.deployment, key: b.key };
          } catch {
            return json(400, { error: '不正な入力です' });
          }
        } else if (req.method === 'DELETE') foundry = null;
        return json(200, view());
      }
      if (u.pathname === '/health') return json(200, { status: 'ready', copilot: 'signed-in', foundry: { keyConfigured: foundry !== null } });
      if (u.pathname === '/foundry/import') {
        if (!foundry) return json(503, { error: { cause: 'key-missing' } });
        if (mode === 'upstream-error') return json(502, { error: { cause: 'upstream-status', status: 500 } });
        return json(200, { preview: { entities: [{ name: '合成AI取り込みエンティティ', description: '差し替え部品が返した内容です。' }] } });
      }
      return json(404, { error: 'not found' });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    received,
    savedKey: () => foundry?.key ?? null,
    importCalls: () => received.filter((r) => r.path === '/foundry/import').length,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
