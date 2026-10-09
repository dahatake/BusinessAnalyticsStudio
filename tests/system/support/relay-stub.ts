// 「接続済み」として振る舞う中継プロセスの差し替え部品（AC-176）。
// Copilot SDK は使わない（外部へは送らない）。HTTP の形は CONTRACT.md §5。
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RelayStub {
  url: string;
  received: Array<{ method: string; path: string; body: string }>;
  close(): Promise<void>;
}

export async function startRelayStub(opts: { answer?: string; sourceIds?: string[]; delayMs?: number } = {}): Promise<RelayStub> {
  const received: RelayStub['received'] = [];
  const server = http.createServer((req, res) => {
    const cors = {
      'access-control-allow-origin': req.headers.origin ?? '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      received.push({ method: req.method ?? '', path: u.pathname, body });
      const reply = () => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', ...cors });
        if (u.pathname === '/health') {
          res.end(JSON.stringify({ status: 'ready', copilot: 'signed-in' }));
        } else {
          res.end(JSON.stringify({ answer: opts.answer ?? '差し替え部品の回答です。', sourceIds: opts.sourceIds ?? [] }));
        }
      };
      if (opts.delayMs && u.pathname !== '/health') setTimeout(reply, opts.delayMs);
      else reply();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    received,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
