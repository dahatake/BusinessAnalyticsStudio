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

const enable = (e: Env, packId = 'pack-1') => e.call('POST', '/foundry/connection', { packId, enable: true, consent: true, confirmed: true });
function allFiles(dir: string): string[] { return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => path.join(d.parentPath, d.name)); }
const noSecrets = (label: string, s: string) => { for (const v of [TOKEN, KEY]) assert.ok(!s.includes(v), `${label} に秘密の値が含まれる`); };

// FR-282 AC-761
test('FR-282 AC-761 Entra ID では、差し替えたトークン取得部品の値で /foundry/ask・/foundry/analyze・接続テストを呼び、トークンとキーはどの応答・ログ・保管ファイルにも出ない', async () => {
  const e = await setup({ auth: 'entra' });
  try {
    assert.equal((await enable(e)).status, 200);
    const seen: string[] = [];
    seen.push((await e.call('POST', '/foundry/ask', { packId: 'pack-1', prompt: '現状を説明して', consent: true })).text);
    seen.push((await e.call('POST', '/foundry/analyze', { packId: 'pack-1', solution: 'ソリューションの説明' })).text);
    seen.push((await e.call('POST', '/foundry/test', {})).text);
    assert.ok(e.calls.length >= 3, `Foundry への呼び出しが 3 回に満たない（${e.calls.length}）`);
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
test('FR-282 AC-761 異常系: トークンを取得できないとき、Foundry を呼ばず「トークンを取得できませんでした」と az login の案内を示す（接続テスト・ask）', async () => {
  const e = await setup({ auth: 'entra', token: async () => { throw new Error(`az: not logged in ${TOKEN}`); } });
  try {
    await enable(e);
    const ask = await e.call('POST', '/foundry/ask', { packId: 'pack-1', prompt: 'x', consent: true });
    const t = await e.call('POST', '/foundry/test', {});
    for (const r of [ask, t]) {
      assert.match(r.text, /トークンを取得できませんでした/);
      assert.match(r.text, /az login/);
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
test('FR-282 AC-762 Entra ID では API キーなしで /foundry/analyze が呼け、/health の keyConfigured は未設定扱いにならない。API キー方式ではキー保存の有無を返し、値は応答に含まれない', async () => {
  const e = await setup({ auth: 'entra' });
  try {
    await enable(e);
    const h = JSON.parse((await e.call('GET', '/health')).text);
    assert.equal(h.foundry.keyConfigured, true, 'Entra で keyConfigured が未設定扱い');
    const a = await e.call('POST', '/foundry/analyze', { packId: 'pack-1', solution: 'ソリューションの説明' });
    assert.ok(!/key-missing/.test(a.text), 'Entra ID なのに「キーなし」で拒否された');
    assert.ok(e.calls.length >= 1, 'Foundry が呼ばれていない');
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

// FR-282 AC-763
test('FR-282 AC-763 POST /foundry/test は保存済みの接続情報で Foundry を 1 回だけ呼び、了承・有効化がなくても動き、顧客データを送らず、キー・トークンを応答・ログに出さない', async () => {
  const e = await setup({ auth: 'api-key' });
  try {
    const r = await e.call('POST', '/foundry/test', {});
    assert.equal(r.status, 200, `成功時の HTTP 状態: ${r.text}`);
    assert.equal(e.calls.length, 1, 'Foundry の呼び出しが 1 回でない（了承・有効化なしでも実行できる）');
    assert.ok(e.calls[0].body.length < 2000, '最小の入力になっていない');
    noSecrets('応答', r.text);
    noSecrets('ログ', e.logs.join('\n'));
  } finally { await e.cleanup(); }
});

// FR-282 AC-763（異常系: 原因種別）
test('FR-282 AC-763 異常系: 成功・認証失敗・デプロイ不明・接続先不正・タイムアウトは互いに異なる応答で返り、上流の本文・キーは含まれない', async () => {
  const bodies = new Map<string, string>();
  const cases: Array<[string, Reply]> = [['ok', { status: 200, text: 'OK' }], ['auth', { status: 401 }], ['deploy', { status: 404 }], ['network', 'network'], ['timeout', 'timeout']];
  for (const [name, reply] of cases) {
    const e = await setup({ auth: 'api-key', reply: () => reply, timeoutMs: 300 });
    try {
      const r = await e.call('POST', '/foundry/test', {});
      assert.equal(e.calls.length, 1, `${name}: 呼び出しが 1 回でない`);
      assert.ok(!r.text.includes(UPSTREAM_BODY), `${name}: 上流の応答本文が含まれる`);
      noSecrets(name, r.text);
      noSecrets(`${name} ログ`, e.logs.join('\n'));
      bodies.set(name, r.text);
    } finally { await e.cleanup(); }
  }
  assert.equal(new Set(bodies.values()).size, cases.length, `原因種別が区別されていない: ${JSON.stringify([...bodies])}`);
});

// FR-282 AC-763（未設定: 呼び出し 0 回）
test('FR-282 AC-763 異常系: 未設定のときは Foundry を呼ばず（0 回）、成功とは異なる応答（未設定）を返す', async () => {
  const ok = await setup({ auth: 'api-key' });
  let okBody = '';
  try { okBody = (await ok.call('POST', '/foundry/test', {})).text; } finally { await ok.cleanup(); }
  const e = await setup({ auth: 'none' });
  try {
    const r = await e.call('POST', '/foundry/test', {});
    assert.equal(e.calls.length, 0, '未設定なのに Foundry を呼んだ');
    assert.notEqual(r.text, okBody, '未設定と成功の応答が同じ');
  } finally { await e.cleanup(); }
});

// FR-282 AC-763（中継側: 停止・間隔は判定せず、受けた要求ごとに Foundry を 1 回だけ呼ぶ。間隔・予算停止の 0 回は画面側の責任）と最小の出力トークン上限
test('FR-282 AC-763 中継側: 間隔内に続けて受けた要求も間隔を判定せず 1 要求につき Foundry を 1 回呼び、1 回の呼び出しは最小の出力トークン上限を付ける', async () => {
  const e = await setup({ auth: 'api-key' });
  try {
    const first = await e.call('POST', '/foundry/test', {});
    assert.equal(first.status, 200, first.text);
    assert.equal(e.calls.length, 1);
    const sent = JSON.parse(e.calls[0].body);
    assert.equal(typeof sent.max_output_tokens, 'number', '出力トークンの上限が付いていない');
    assert.ok(sent.max_output_tokens > 0 && sent.max_output_tokens <= 100, `出力トークン上限が最小ではない: ${sent.max_output_tokens}`);
    const second = await e.call('POST', '/foundry/test', {});
    assert.equal(second.status, 200, second.text);
    assert.equal(e.calls.length, 2, '中継側が間隔を判定して Foundry を呼ばなかった（判定は画面側）');
    assert.equal(JSON.parse(e.calls[1].body).max_output_tokens, sent.max_output_tokens);
    noSecrets('応答', second.text);
  } finally { await e.cleanup(); }
});

// FR-282 AC-763 AC-761（未設定 = Entra でトークンを取得できない。認証失敗とは区別され、Foundry は 0 回）
test('FR-282 AC-763 AC-761 異常系: Entra ID でトークンを取得できないときは「未設定」として Foundry を 0 回で返し、成功・認証失敗の応答とは異なる', async () => {
  const bodies: string[] = [];
  for (const reply of [{ status: 200, text: 'OK' }, { status: 401 }] as Reply[]) {
    const e = await setup({ auth: 'entra', reply: () => reply });
    try { bodies.push((await e.call('POST', '/foundry/test', {})).text); } finally { await e.cleanup(); }
  }
  const e = await setup({ auth: 'entra', token: async () => { throw new Error(`az: not logged in ${TOKEN}`); } });
  try {
    const r = await e.call('POST', '/foundry/test', {});
    assert.equal(e.calls.length, 0, 'トークンなしで Foundry を呼んだ');
    assert.ok(!bodies.includes(r.text), '未設定が成功・認証失敗と区別されていない');
    noSecrets('応答', r.text);
    noSecrets('ログ', e.logs.join('\n'));
  } finally { await e.cleanup(); }
});
