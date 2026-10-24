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
  forceEnabled(v: boolean): void;
}

export async function startAiImportRelayStub(opts: { configured?: boolean; mode?: AiImportMode; initialKey?: string; enabled?: boolean; authMethod?: 'api-key' | 'entra'; provider?: 'foundry' | 'copilot' } = {}): Promise<AiImportRelayStub> {
  const received: RelayStub['received'] = [];
  let provider = opts.provider ?? 'foundry';
  let foundry: { endpoint: string; deployment: string; key: string; authMethod: 'api-key' | 'entra' } | null = opts.configured
    ? { endpoint: 'https://dummy.openai.azure.com/openai/v1', deployment: 'dummy-deploy', key: opts.initialKey ??     'dummy-key-for-system-test-9999', authMethod: opts.authMethod ?? 'api-key' }
    : null;
      // 実接続の有効化（FR-275）。configured 指定の既存ケースは有効で始まる（enabled で上書きできる）
      let enabled = opts.enabled ?? !!opts.configured;
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
          ? { configured: true, endpoint: foundry.endpoint, host: new URL(foundry.endpoint).host, deployment: foundry.deployment, keyMask: foundry.authMethod === 'entra' ? '' : `••••${foundry.key.slice(-4)}`, authMethod: foundry.authMethod, enabled }
          : { configured: false, endpoint: '', host: '', deployment: '', keyMask: '', authMethod: 'api-key', enabled };
      // FR-275 AC-769/770、CONTRACT.md §30。接続先の変更後は再有効化が必要。
      if (u.pathname === '/ai/provider') {
        if (req.method === 'PUT') {
          try {
            const b = JSON.parse(body) as { provider?: unknown };
            if (b.provider !== 'foundry' && b.provider !== 'copilot') return json(400, { error: '不正な接続先です' });
            if (provider !== b.provider) enabled = false;
            provider = b.provider;
          } catch {
            return json(400, { error: '不正な入力です' });
          }
        } else if (req.method !== 'GET') return json(405, { error: 'method not allowed' });
        return json(200, { provider });
      }
      if (u.pathname === '/foundry/config') {
        if (req.method === 'PUT') {
          try {
            const b = JSON.parse(body) as { endpoint?: string; deployment?: string;             key?: string; authMethod?: 'api-key' | 'entra' };
                        const authMethod = b.authMethod === 'entra' ? 'entra' : 'api-key';
                        if (!b.endpoint || !b.deployment || (authMethod === 'api-key' && !b.key)) return json(400, { error: authMethod === 'entra' ? 'エンドポイント・デプロイ名を入力してください' : 'エンドポイント・デプロイ名・API キーを入力してください' });
                        foundry = { endpoint: b.endpoint, deployment: b.deployment, key: authMethod === 'entra' ? '' : (b.key as string), authMethod };
                        enabled = false;
          } catch {
            return json(400, { error: '不正な入力です' });
          }
        } else if (req.method === 'DELETE') { foundry = null; enabled = false; }
        return json(200, view());
      }
      if (u.pathname === '/foundry/connection' && req.method === 'POST') {
        let b: { enable?: boolean } = {};
        try { b = JSON.parse(body); } catch { /* 空 */ }
        if (b.enable && !foundry) return json(400, { error: 'Foundry の接続情報が未設定です' });
        enabled = !!b.enable;
        return json(200, { mode: enabled ? 'connected' : 'mock' });
      }
      if (u.pathname === '/health') return json(200, { status: 'ready', copilot: 'signed-in', foundry: { keyConfigured: foundry !== null } });
      if (u.pathname === '/foundry/import') {
        if (provider === 'copilot') return json(503, { error: { cause: 'unsupported', message: 'Copilot SDK では未対応' } });
        if (!foundry) return json(503, { error: { cause: 'key-missing' } });
        if (!enabled) return json(503, { error: { cause: 'disabled' } });
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
    savedKey: () => (foundry && foundry.authMethod === 'api-key' ? foundry.key : null),
    importCalls: () => received.filter((r) => r.path === '/foundry/import').length,
    /** 設定画面を開かずに、中継の「有効」の状態だけを切り替える（了承の入力後に「設定だけが欠ける」状態を作るため） */
    forceEnabled: (v: boolean) => { enabled = v; },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
