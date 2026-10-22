// 「Copilot で分析実行」（FR-278〜283）用の中継プロセス＋Foundry の差し替え部品。本物の Foundry は呼ばない。HTTP の形は CONTRACT.md §26。
// POST /foundry/review  body: { components: [{ key, data }] } → 200 { drafts: [{ key, text }] }（omit に入れた key と data が空の key は返さない）
// GET/PUT/DELETE /foundry/config は接続設定（キーは返さず伏せ字だけ）。GET /health は foundry.keyConfigured（真偽）。
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface ReviewStub {
  url: string;
  received: Array<{ method: string; path: string; body: string }>;
  reviewCalls(): number;
  requestedKeys(): string[];
  close(): Promise<void>;
}

export async function startCopilotReviewStub(
  opts: { configured?: boolean; delayMs?: number; omit?: string[] } = {},
): Promise<ReviewStub> {
  const received: ReviewStub['received'] = [];
  let cfg: { endpoint: string; deployment: string; key: string; auth: string } | null = opts.configured === false
    ? null
    : { endpoint: 'https://example.invalid/', deployment: 'dummy-deploy', key: 'dummy-key-for-system-test-0000', auth: 'api-key' };
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
      if (u.pathname === '/health') { json(200, { status: 'ready', copilot: 'signed-in', foundry: { keyConfigured: cfg !== null } }); return; }
      if (u.pathname === '/foundry/config') {
        if (req.method === 'PUT') {
          try {
            const b = JSON.parse(body) as { endpoint?: string; deployment?: string; key?: string; auth?: string };
            if (!b.endpoint || !b.deployment || (!b.key && b.auth !== 'entra')) { json(400, { error: '入力してください' }); return; }
            cfg = { endpoint: b.endpoint, deployment: b.deployment, key: b.key ?? '', auth: b.auth ?? 'api-key' };
          } catch { json(400, { error: '不正な入力です' }); return; }
        } else if (req.method === 'DELETE') cfg = null;
        json(200, cfg
          ? { configured: true, endpoint: cfg.endpoint, host: new URL(cfg.endpoint).host, deployment: cfg.deployment, keyMask: cfg.key ? `••••${cfg.key.slice(-4)}` : '', enabled: true }
          : { configured: false, endpoint: '', host: '', deployment: '', keyMask: '', enabled: false });
        return;
      }
      if (u.pathname === '/foundry/review') {
        const reply = () => {
          let comps: Array<{ key: string; data?: unknown }> = [];
          try { comps = (JSON.parse(body) as { components?: typeof comps }).components ?? []; } catch { /* 空 */ }
          const drafts = comps
            .filter((c) => !(opts.omit ?? []).includes(c.key))
            .filter((c) => c.data !== undefined && c.data !== null && JSON.stringify(c.data) !== '{}' && JSON.stringify(c.data) !== '[]')
            .map((c) => ({ key: c.key, text: `案-${c.key}-差し替え部品の提案` }));
          json(200, { drafts });
        };
        if (opts.delayMs) setTimeout(reply, opts.delayMs); else reply();
        return;
      }
      json(404, { error: 'not found' });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    received,
    reviewCalls: () => received.filter((r) => r.method === 'POST' && r.path === '/foundry/review').length,
    requestedKeys: () => {
      const last = [...received].reverse().find((r) => r.path === '/foundry/review');
      try { return ((JSON.parse(last?.body ?? '{}') as { components?: Array<{ key: string }> }).components ?? []).map((c) => c.key); } catch { return []; }
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
