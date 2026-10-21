// 「接続済み」として振る舞う中継プロセスの差し替え部品（AC-176）。
// Copilot SDK は使わない（外部へは送らない）。HTTP の形は CONTRACT.md §5。
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RelayStub {
  url: string;
  received: Array<{ method: string; path: string; body: string }>;
  close(): Promise<void>;
}

/**
 * 生成AIの活用分析（FR-284・FR-285）の Foundry 接続の差し替え部品（中継プロセスの役）。本物の Foundry は呼ばない。
 * HTTP の形は CONTRACT.md §25。`/health` は foundry.keyConfigured（真偽。キーの値は返さない）を返す。
 * mode: ok = 200 で分析結果、key-missing / unreachable / timeout / upstream-status = 原因つきの失敗。
 */
export type FoundryStubMode = 'ok' | 'key-missing' | 'unreachable' | 'timeout' | 'upstream-status';

export async function startFoundryRelayStub(mode: FoundryStubMode = 'ok'): Promise<RelayStub> {
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
      const json = (status: number, v: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...cors });
        res.end(JSON.stringify(v));
      };
      if (u.pathname === '/health') {
        json(200, { status: 'ready', copilot: 'signed-in', foundry: { keyConfigured: mode !== 'key-missing' } });
        return;
      }
      if (u.pathname !== '/foundry/analyze') return json(404, { error: 'not found' });
      switch (mode) {
        case 'ok':
          return json(200, {
            conclusion: 'conditional',
            criteria: [{ id: 'unstructured-input', verdict: 'yes', reason: '差し替え部品の根拠です。' }],
            reason: '差し替え部品の理由です。',
            alternatives: ['業務改善'],
          });
        case 'key-missing':
          return json(503, { error: { cause: 'key-missing' } });
        case 'unreachable':
          return json(502, { error: { cause: 'unreachable' } });
        case 'timeout':
          return json(504, { error: { cause: 'timeout', timeoutSeconds: 60 } });
        case 'upstream-status':
          return json(502, { error: { cause: 'upstream-status', upstreamStatus: 500 } });
      }
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

export async function startRelayStub(opts: { answer?: string; sourceIds?: string[]; delayMs?: number } = {}): Promise<RelayStub> {
  const received: RelayStub['received'] = [];
  let foundry: { endpoint: string; deployment: string; key: string } | null = null;
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
      // FR-275: 接続情報の保存先は中継側だけ。GET/PUT/DELETE /foundry/config は、キーを保持して伏せ字だけを返す
      if (u.pathname === '/foundry/config') {
        const json = (code: number, o: unknown) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...cors }); res.end(JSON.stringify(o)); };
        if (req.method === 'PUT') {
          try {
            const b = JSON.parse(body) as { endpoint?: string; deployment?: string; key?: string };
            if (!b.endpoint || !b.deployment || !b.key) { json(400, { error: 'エンドポイント・デプロイ名・API キーを入力してください' }); return; }
            foundry = { endpoint: b.endpoint, deployment: b.deployment, key: b.key };
          } catch { json(400, { error: '不正な入力です' }); return; }
        } else if (req.method === 'DELETE') foundry = null;
        json(200, foundry
          ? { configured: true, endpoint: foundry.endpoint, host: new URL(foundry.endpoint).host, deployment: foundry.deployment, keyMask: `••••${foundry.key.slice(-4)}`, enabled: false }
          : { configured: false, endpoint: '', host: '', deployment: '', keyMask: '', enabled: false });
        return;
      }
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
