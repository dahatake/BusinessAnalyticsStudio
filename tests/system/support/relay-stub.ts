// 「接続済み」として振る舞う中継プロセスの差し替え部品（AC-176）。
// Copilot SDK は使わない（外部へは送らない）。HTTP の形は CONTRACT.md §5。
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RelayStub {
  url: string;
  received: Array<{ method: string; path: string; body: string }>;
  close(): Promise<void>;
}

/** 共通接続（FR-275）の保管庫の差し替え部品。キーは保持するが、返すのは伏せ字だけ。 */
interface FoundryVault { endpoint: string; deployment: string; key: string; enabled: boolean }
type FoundryVaultRef = { v: FoundryVault | null };

function vaultView(v: FoundryVault | null): unknown {
  return v
    ? { configured: true, endpoint: v.endpoint, host: new URL(v.endpoint).host, deployment: v.deployment, keyMask: `••••${v.key.slice(-4)}`, enabled: v.enabled }
    : { configured: false, endpoint: '', host: '', deployment: '', keyMask: '', enabled: false };
}

/**
 * 共通の保管庫の HTTP（CONTRACT.md §25）: GET/PUT/DELETE /foundry/config（保存・削除）、GET/PUT /foundry/connection（body {enabled}。有効化。未設定では有効にできない）。
 * 処理したら true を返す。
 */
function handleVault(ref: FoundryVaultRef, method: string, pathname: string, body: string, json: (code: number, o: unknown) => void): boolean {
  if (pathname === '/foundry/config') {
    if (method === 'PUT') {
      try {
        const b = JSON.parse(body) as { endpoint?: string; deployment?: string; key?: string };
        if (!b.endpoint || !b.deployment || !b.key) { json(400, { error: 'エンドポイント・デプロイ名・API キーを入力してください' }); return true; }
        ref.v = { endpoint: b.endpoint, deployment: b.deployment, key: b.key, enabled: ref.v?.enabled ?? false };
      } catch { json(400, { error: '不正な入力です' }); return true; }
    } else if (method === 'DELETE') ref.v = null;
    json(200, vaultView(ref.v));
    return true;
  }
  if (pathname === '/foundry/connection') {
    if (method === 'PUT' || method === 'POST') {
      try {
        const b = JSON.parse(body) as { enabled?: boolean };
        if (b.enabled && !ref.v) { json(409, { error: '接続情報が未設定です' }); return true; }
        if (ref.v) ref.v.enabled = !!b.enabled;
      } catch { json(400, { error: '不正な入力です' }); return true; }
    }
    json(200, vaultView(ref.v));
    return true;
  }
  return false;
}

/**
 * 生成AIの活用分析（FR-284・FR-285）の Foundry 接続の差し替え部品（中継プロセスの役）。本物の Foundry は呼ばない。
 * HTTP の形は CONTRACT.md §25。`/health` は foundry.keyConfigured（真偽。キーの値は返さない）を返す。
 * POST /foundry/analyze の body は packId・solution だけ。共通の保管庫が未設定または無効なら外部（モデル）へ送らず 503 key-missing を返す。
 * `vault` は保管庫の状態（テストが検査する）。`analyzeBodies` は受け取った分析要求の body。
 * mode: ok = 200 で分析結果、key-missing = 保管庫の状態によらず未設定の失敗、unreachable / timeout / upstream-status = 原因つきの失敗。
 */
export type FoundryStubMode = 'ok' | 'key-missing' | 'unreachable' | 'timeout' | 'upstream-status';
export interface FoundryRelayStub extends RelayStub {
  vault: FoundryVaultRef;
  /** 分析要求がモデルまで届いた回数（保管庫が有効なときだけ数える） */
  modelCalls: number;
}

export async function startFoundryRelayStub(mode: FoundryStubMode = 'ok'): Promise<FoundryRelayStub> {
  const received: RelayStub['received'] = [];
  const vault: FoundryVaultRef = { v: null };
  const state = { modelCalls: 0 };
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
      const json = (status: number, v: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...cors });
        res.end(JSON.stringify(v));
      };
      if (u.pathname === '/health') {
        json(200, { status: 'ready', copilot: 'signed-in', foundry: { keyConfigured: vault.v !== null } });
        return;
      }
      if (handleVault(vault, req.method ?? '', u.pathname, body, json)) return;
      if (u.pathname !== '/foundry/analyze') return json(404, { error: 'not found' });
      // 共通接続が未設定・無効なら外部を呼ばずに失敗を返す（FR-285）。body の endpoint・deployment は使わない
      if (mode === 'key-missing' || !vault.v || !vault.v.enabled) return json(503, { error: { cause: 'key-missing' } });
      state.modelCalls += 1;
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
    vault,
    get modelCalls() { return state.modelCalls; },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

export async function startRelayStub(opts: { answer?: string; sourceIds?: string[]; delayMs?: number } = {}): Promise<RelayStub> {
  const received: RelayStub['received'] = [];
  const vault: FoundryVaultRef = { v: null };
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
      const jsonOut = (code: number, o: unknown) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...cors }); res.end(JSON.stringify(o)); };
      if (handleVault(vault, req.method ?? '', u.pathname, body, jsonOut)) return;
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
