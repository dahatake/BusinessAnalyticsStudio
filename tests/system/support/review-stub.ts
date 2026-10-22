// 「Copilot で分析実行」（FR-278〜283）の Foundry 差し替え部品（中継プロセスの役）。本物の Foundry は呼ばない。HTTP の形は CONTRACT.md §26。
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RelayStub } from './relay-stub';

export interface ReviewStubOptions {
  /** Foundry の接続設定が済んでいるか（/health の foundry.keyConfigured と /foundry/config の configured）。既定 true */
  configured?: boolean;
  /** 応答を遅らせる（進行表示の確認用）。ミリ秒 */
  delayMs?: number;
  /** 案を返さないコンポーネントの key */
  skipKeys?: string[];
}

export const REVIEW_TEXT = (key: string): string => `差し替え部品の案: ${key}`;

export async function startReviewStub(opts: ReviewStubOptions = {}): Promise<RelayStub> {
  const received: RelayStub['received'] = [];
  const configured = opts.configured ?? true;
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
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      received.push({ method: req.method ?? '', path: u.pathname, body });
      const json = (code: number, o: unknown) => {
        res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...cors });
        res.end(JSON.stringify(o));
      };
      if (u.pathname === '/health') return json(200, { status: 'ready', copilot: 'signed-in', foundry: { keyConfigured: configured } });
      if (u.pathname === '/foundry/config') {
        return json(200, configured
          ? { configured: true, endpoint: 'https://example.invalid/', host: 'example.invalid', deployment: 'dummy-deploy', keyMask: '••••0000', enabled: true }
          : { configured: false, endpoint: '', host: '', deployment: '', keyMask: '', enabled: false });
      }
      if (u.pathname === '/foundry/review') {
        let keys: string[] = [];
        try { keys = (JSON.parse(body).components ?? []).map((c: { key: string }) => c.key); } catch { /* 空 */ }
        const proposals = keys.filter((k) => !(opts.skipKeys ?? []).includes(k)).map((key) => ({ key, text: REVIEW_TEXT(key) }));
        const reply = () => json(200, { proposals });
        if (opts.delayMs) setTimeout(reply, opts.delayMs); else reply();
        return;
      }
      return json(404, { error: 'not found' });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, received, close: () => new Promise<void>((r) => server.close(() => r())) };
}

export const reviewCalls = (relay: RelayStub): number => relay.received.filter((r) => r.path === '/foundry/review').length;
