// 「Copilot で分析実行」（FR-278〜283）の Foundry 差し替え部品（中継プロセスの役）。本物の Foundry は呼ばない。HTTP の形は CONTRACT.md §27。
// POST /foundry/review: body {components:[{id, data}]} → 200 {reviews:[{id, proposal}]}（proposal を返さない id は「案なし」）
// foundry: 'ready'（設定済み）| 'not-configured'（未設定）。GET/PUT/DELETE /foundry/config は設定の保存・削除を模す。
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface ReviewStub {
  url: string;
  received: Array<{ method: string; path: string; body: string }>;
  reviewCount(): number;
  close(): Promise<void>;
}

export async function startReviewStub(
  opts: { foundry?: 'ready' | 'not-configured'; delayMs?: number; skipIds?: string[] } = {},
): Promise<ReviewStub> {
  const received: ReviewStub['received'] = [];
  let configured = (opts.foundry ?? 'ready') === 'ready';
  const server = http.createServer((req, res) => {
    const cors = {
      'access-control-allow-origin': req.headers.origin ?? '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      received.push({ method: req.method ?? '', path: u.pathname, body });
      const json = (code: number, o: unknown) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...cors }); res.end(JSON.stringify(o)); };
      if (u.pathname === '/health') return json(200, { status: 'ready', copilot: 'signed-in', foundry: { keyConfigured: configured } });
      if (u.pathname === '/foundry/config') {
        if (req.method === 'PUT') configured = true;
        if (req.method === 'DELETE') configured = false;
        return json(200, configured
          ? { configured: true, endpoint: 'https://example.invalid/', host: 'example.invalid', deployment: 'dummy-deploy', authMethod: 'api-key', keyMask: '••••', enabled: true }
          : { configured: false, endpoint: '', host: '', deployment: '', authMethod: 'api-key', keyMask: '', enabled: false });
      }
      if (u.pathname === '/foundry/connection') return json(200, { mode: 'connected' });
      if (u.pathname === '/foundry/review') {
        let comps: Array<{ id: string }> = [];
        try { comps = JSON.parse(body).components ?? []; } catch { /* 空で扱う */ }
        const reply = () => json(200, {
          reviews: comps.filter((c) => !(opts.skipIds ?? []).includes(c.id)).map((c) => ({ id: c.id, proposal: `RMARKER-${c.id}-X 差し替え部品の案です。` })),
        });
        if (opts.delayMs) setTimeout(reply, opts.delayMs); else reply();
        return;
      }
      return json(404, { error: 'not found' });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    received,
    reviewCount: () => received.filter((r) => r.path === '/foundry/review').length,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
