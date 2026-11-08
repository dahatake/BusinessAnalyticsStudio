// System Test（integration 相当）: Foundry の Microsoft Entra ID 認証と接続テスト（FR-282 AC-761・AC-762・AC-763）
// 期待値は受入基準だけから決める。中継プロセスを実際に起動し、Foundry への送信口（foundryFetch）とトークン取得部品（foundryToken）を差し替える。
// 本物の Foundry・Azure CLI は呼ばない。実行: npx tsx --test tests/system/api/foundry-entra.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startRelay, type Relay } from '../../../scripts/relay/relay';
import { openFoundryVault } from '../../../scripts/relay/foundry-vault';

const TOKEN = 'ENTRA-TOKEN-DUMMY-7f3a9c1e5b2d4a60';
const KEY = 'DUMMY-API-KEY-b81d0c47e9f2a356';
const ENDPOINT = 'https://dummyres.openai.azure.com/openai/v1';
const UPSTREAM_BODY = 'UPSTREAM-BODY-MARKER-93ac';
const RELAY_DIR = path.join(import.meta.dirname, '../../../scripts/relay');
const protector = { name: 'test', wrap: (k: Buffer) => k.toString('base64'), unwrap: (s: string) => Buffer.from(s, 'base64') };

interface Call { url: string; headers: Record<string, string>; body: string }
type Reply = { status: number; text?: string } | 'timeout' | 'network';

function makeFetch(reply: () => Reply): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)), body: String(init?.body ?? '') });
    const r = reply();
    if (r === 'network') throw new TypeError('fetch failed');
    if (r === 'timeout') return new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
    const ok = r.status >= 200 && r.status < 300;
    return new Response(JSON.stringify(ok ? { output_text: r.text ?? 'OK' } : { error: UPSTREAM_BODY }), { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetch: f, calls };
}

interface Env { relay: Relay; dir: string; calls: Call[]; logs: string[]; call(method: string, p: string, body?: unknown): Promise<{ status: number; text: string }>; cleanup(): Promise<void> }

async function setup(o: { auth?: 'entra' | 'api-key' | 'none'; token?: () => Promise<string>; reply?: () => Reply; timeoutMs?: number } = {}): Promise<Env> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-foundry-'));
  const vault = openFoundryVault(dir, { protector, restrict: () => undefined, warn: () => undefined });
  const auth = o.auth ?? 'entra';
  if (auth === 'entra') vault.save({ endpoint: ENDPOINT, deployment: 'dummy-deploy', authMethod: 'entra' });
  if (auth === 'api-key') vault.save({ endpoint: ENDPOINT, deployment: 'dummy-deploy', key: KEY, authMethod: 'api-key' });
  const up = makeFetch(o.reply ?? (() => ({ status: 200, text: '{}' })));
  const logs: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  for (const k of ['log', 'warn', 'error'] as const) console[k] = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
  const relay = await startRelay({ sdk: null, foundryVault: vault, foundryFetch: up.fetch, foundryTimeoutMs: o.timeoutMs ?? 2000, foundryToken: o.token ?? (async () => TOKEN) });
  const call = async (method: string, p: string, body?: unknown) => {
    const r = await fetch(relay.url + p, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, text: await r.text() };
  };
  return {
    relay, dir, calls: up.calls, logs, call,
    cleanup: async () => { await relay.close(); Object.assign(console, orig); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

const enable = (e: Env, packId = 'pack-1') => e.call('POST', '/foundry/connection', { packId, enable: true, confirmed: true });
function allFiles(dir: string): string[] { return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => path.join(d.parentPath, d.name)); }
const noSecrets = (label: string, s: string) => { for (const v of [TOKEN, KEY]) assert.ok(!s.includes(v), `${label} に秘密の値が含まれる`); };

// FR-282 AC-761
test('FR-282 AC-761 未承認の場合は Entra の接続情報があっても呼び出さず、トークンとキーを応答・ログ・保管ファイルに出さない', async () => {
  const e = await setup({ auth: 'entra' });
  try {
    await enable(e);
    const seen: string[] = [];
    seen.push((await e.call('POST', '/foundry/ask', { packId: 'pack-1', prompt: '現状を説明して' })).text);
    seen.push((await e.call('POST', '/foundry/analyze', { packId: 'pack-1', solution: 'ソリューションの説明' })).text);
    seen.push((await e.call('POST', '/foundry/test', {})).text);
    assert.equal(e.calls.length, 0, '未承認の用途で Foundry を呼んだ');
    for (const c of e.calls) {
      assert.ok(Object.values(c.headers).some((v) => v === `Bearer ${TOKEN}`), 'Authorization: Bearer <取得したトークン> で呼んでいない');
    }
    seen.push((await e.call('GET', '/health')).text, (await e.call('GET', '/foundry/config?packId=pack-1')).text);
    for (const [i, s] of seen.entries()) noSecrets(`応答 ${i}`, s);
    noSecrets('ログ', e.logs.join('\n'));
    for (const f of allFiles(e.dir)) noSecrets(`保管ファイル ${path.basename(f)}`, fs.readFileSync(f).toString('utf8') + fs.readFileSync(f).toString('base64'));
  } finally { await e.cleanup(); }
});

// FR-282 AC-761（異常系: トークンを取得できない）
test('FR-282 AC-761 異常系: 未承認かつトークンを取得できないときは Foundry を呼ばず、秘密を出さない', async () => {
  const e = await setup({ auth: 'entra', token: async () => { throw new Error(`az: not logged in ${TOKEN}`); } });
  try {
    await enable(e);
    const ask = await e.call('POST', '/foundry/ask', { packId: 'pack-1', prompt: 'x' });
    const t = await e.call('POST', '/foundry/test', {});
    for (const r of [ask, t]) {
      noSecrets('応答', r.text);
    }
    assert.equal(e.calls.length, 0, 'トークンなしで Foundry を呼んだ');
    noSecrets('ログ', e.logs.join('\n'));
  } finally { await e.cleanup(); }
});

// FR-282 AC-761（start.ts が startRelay にトークン取得部品を渡す）
test('FR-282 AC-761 scripts/relay/start.ts は startRelay にトークン取得部品（foundryToken）を渡し、Azure CLI の get-access-token（cognitiveservices）で取得する', () => {
  const start = fs.readFileSync(path.join(RELAY_DIR, 'start.ts'), 'utf8');
  const all = fs.readdirSync(RELAY_DIR).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(path.join(RELAY_DIR, f), 'utf8')).join('\n');
  assert.match(start, /foundryToken/);
  assert.match(all, /get-access-token/);
  assert.match(all, /https:\/\/cognitiveservices\.azure\.com/);
});

// FR-282 AC-762
test('FR-282 AC-762 Entra の資格情報は設定済み扱いだが未承認なら呼び出さず、キー・トークンは応答に含めない', async () => {
  const e = await setup({ auth: 'entra' });
  try {
    await enable(e);
    const h = JSON.parse((await e.call('GET', '/health')).text);
    assert.equal(h.foundry.keyConfigured, true, 'Entra で keyConfigured が未設定扱い');
    const a = await e.call('POST', '/foundry/analyze', { packId: 'pack-1', solution: 'ソリューションの説明' });
    assert.ok(!/key-missing/.test(a.text), 'Entra ID なのに「キーなし」で拒否された');
    assert.equal(e.calls.length, 0, '未承認の用途で Foundry を呼んだ');
    noSecrets('analyze 応答', a.text);
  } finally { await e.cleanup(); }
  // 異常系: Entra でも他の条件（有効化 FR-285）が欠ければ呼ばない
  const d = await setup({ auth: 'entra' });
  try {
    const a = await d.call('POST', '/foundry/analyze', { packId: 'pack-1', solution: 'x' });
    assert.notEqual(a.status, 200);
    assert.equal(d.calls.length, 0);
  } finally { await d.cleanup(); }
  // API キー方式: 保存済み → true、未保存 → false
  const k = await setup({ auth: 'api-key' });
  try {
    const t = (await k.call('GET', '/health')).text;
    assert.equal(JSON.parse(t).foundry.keyConfigured, true);
    noSecrets('health', t);
  } finally { await k.cleanup(); }
  const n = await setup({ auth: 'none' });
  try {
    assert.equal(JSON.parse((await n.call('GET', '/health')).text).foundry.keyConfigured, false);
  } finally { await n.cleanup(); }
});

// FR-282 AC-763 / FR-275 AC-706: 実際の C-03 行は未確定。
// 架空の承認済み行・契約確認を与える仕組みと、画面・取消・成功/失敗の
// 検証は別途必要。この未承認の負例だけで AC-763 全体を満たしたとはしない。
test('FR-282 AC-763 未承認の接続テストは保存済みの接続情報や直接要求でも呼び出し 0 回', async () => {
  for (const auth of ['api-key', 'entra', 'none'] as const) {
    const e = await setup({ auth });
    try {
      // 確認を装う直接要求や架空の内部情報でも C-03 の未承認を迂回できない。
      const r = await e.call('POST', '/foundry/test', {
        confirmed: true,
        information: { classification: 'internal', text: 'SYNTHETIC-HIDDEN-INTERNAL-763' },
      });
      assert.equal(e.calls.length, 0, `${auth}: 未承認なのに Foundry を呼んだ`);
      assert.match(r.text, /未確定|未承認|許可|利用でき|確認|制限/, `${auth}: 利用できない理由がない`);
      noSecrets('応答', r.text);
      noSecrets('ログ', e.logs.join('\n'));
      assert.ok(!r.text.includes(UPSTREAM_BODY), '上流の応答本文が含まれる');
      assert.ok(!e.logs.join('\n').includes(UPSTREAM_BODY), 'ログに上流の応答本文が含まれる');
    } finally { await e.cleanup(); }
  }
});
