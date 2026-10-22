// FR-289 AI 取り込み（単体・結合検査。Foundry へは実接続せず、送信口はスタブ。キーはダミー値）
// AC-757 AC-758（選べる条件）、AC-759（確認・上限・予算・失敗・プレビュー）、AC-760（キーの秘匿・送信先）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startRelay, type Relay } from '../../scripts/relay/relay';
import { openFoundryVault } from '../../scripts/relay/foundry-vault';
import { fileProtector } from '../../scripts/relay/speech-vault';
import { FOUNDRY_CHANGED_EVENT, deleteFoundryConfig, fetchFoundryView, putFoundryConfig, setFoundryConnection, type FoundryView } from '../../src/ai/foundryClient';
import {
  AI_IMPORT_MAX_BYTES, aiImportAvailability, budgetState, checkSize, currentUsage, estimateCostYen, recordCall, requestAiImport,
  type Usage, type UsageStore,
} from '../../src/ai/aiImportLogic';

const DUMMY_KEY = 'dummy-import-key-ZQ7X4-0123';
const EP = 'https://foundry.example.invalid/openai/v1';
const OK_BODY = { output_text: '{"entities":[{"name":"合成エンティティ","description":"説明"}]}' };
const open: Relay[] = [];
const dirs: string[] = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

async function setup(stub: () => Promise<Response> = async () => new Response(JSON.stringify(OK_BODY), { status: 200 })) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-import-test-'));
  dirs.push(dir);
  const calls: Array<{ url: string; auth: string | null; body: string }> = [];
  const foundryVault = openFoundryVault(dir, { protector: fileProtector, restrict: () => {}, warn: () => {} });
  const relay = await startRelay({
    sdk: null, foundryVault, foundryTimeoutMs: 200,
    foundryToken: async () => 'dummy-entra-token-ABCDE',
    foundryFetch: (async (u: string, i?: RequestInit) => {
      calls.push({ url: String(u), auth: new Headers(i?.headers).get('authorization'), body: String(i?.body ?? '') });
      return stub();
    }) as typeof fetch,
  });
  open.push(relay);
  return { calls, url: relay.url };
}
const mkFile = (name: string, content: string | Uint8Array, type = 'application/pdf') => new File([content as BlobPart], name, { type });
const req = (file: File, o: Partial<Parameters<typeof requestAiImport>[1]> = {}) =>
  ({ packId: 'P', file, consent: true, includesPerson: false, personConfirmed: false, ...o });
const view = (o: Partial<FoundryView> = {}): FoundryView => ({ configured: true, endpoint: EP, host: 'h', deployment: 'd', keyMask: '', enabled: true, ...o });

describe('FR-289 AC-757 AC-758 選べる条件', () => {
  it('設定画面での有効化・無効化・削除は変更通知を出し、取り込み画面が取得し直せる（古い状態のままにしない）', async () => {
    const target = new EventTarget();
    const g = globalThis as unknown as { window?: unknown };
    const prev = g.window;
    g.window = target;
    try {
      let n = 0;
      target.addEventListener(FOUNDRY_CHANGED_EVENT, () => { n++; });
      const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
      await setFoundryConnection('http://127.0.0.1:1', 'P', true, { consent: true, confirmed: true }, ok({ mode: 'connected' }));
      await setFoundryConnection('http://127.0.0.1:1', 'P', false, { consent: true, confirmed: false }, ok({ mode: 'mock' }));
      await deleteFoundryConfig('http://127.0.0.1:1', 'P', ok(view({ configured: false, enabled: false })));
      expect(n).toBe(3);
    } finally { g.window = prev; }
  });
  it('設定・有効化・了承のどれかが欠けると選べず、欠けた条件と設定画面への案内が示される', () => {
    const a = aiImportAvailability(view({ configured: false, enabled: false }), false);
    expect(a.available).toBe(false);
    expect(a.missing).toEqual(['設定', '有効化', '了承']);
    expect(a.guide).toContain('設定画面');
    expect(aiImportAvailability(view({ enabled: false }), true).missing).toEqual(['有効化']);
    expect(aiImportAvailability(view(), false).missing).toEqual(['了承']);
    expect(aiImportAvailability(null, true).available).toBe(false);
    expect(aiImportAvailability(view(), true)).toEqual({ available: true, missing: [], guide: '' });
  });

  it('API キー方式・Entra ID 方式のどちらでも、保存すると設定済みになり、削除すると未設定に戻る', async () => {
    const { url } = await setup();
    expect((await putFoundryConfig(url, 'P', { endpoint: EP, deployment: 'd', key: DUMMY_KEY })).ok).toBe(true);
    expect((await fetchFoundryView(url, 'P'))?.configured).toBe(true);
    const e = await putFoundryConfig(url, 'P', { endpoint: EP, deployment: 'd', key: '', authMethod: 'entra' });
    expect(e.ok && e.view.configured && e.view.authMethod === 'entra').toBe(true);
    // 実接続を有効にすると選べる。無効に戻すと再び選べない
    expect((await setFoundryConnection(url, 'P', true, { consent: true, confirmed: true })).mode).toBe('connected');
    expect(aiImportAvailability(await fetchFoundryView(url, 'P'), true).available).toBe(true);
    await setFoundryConnection(url, 'P', false, { consent: true, confirmed: false });
    expect(aiImportAvailability(await fetchFoundryView(url, 'P'), true).available).toBe(false);
    // API キー方式でキーなしは保存できない
    await fetch(`${url}/foundry/config?packId=P`, { method: 'DELETE' });
    expect((await putFoundryConfig(url, 'P', { endpoint: EP, deployment: 'd', key: '' })).ok).toBe(false);
  });

  it('条件が欠けるとき、中継は Foundry を呼ばない（呼び出し 0 回）', async () => {
    const { url, calls } = await setup();
    const f = mkFile('a.pdf', '%PDF');
    // 未設定
    expect((await requestAiImport(url, req(f))).ok).toBe(false);
    await putFoundryConfig(url, 'P', { endpoint: EP, deployment: 'd', key: DUMMY_KEY });
    // 実接続が無効
    expect((await requestAiImport(url, req(f))).ok).toBe(false);
    await setFoundryConnection(url, 'P', true, { consent: true, confirmed: true });
    // 了承なし
    expect((await requestAiImport(url, req(f, { consent: false }))).ok).toBe(false);
    // 種別「人」で確認なし
    expect((await requestAiImport(url, req(f, { includesPerson: true, personConfirmed: false }))).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('FR-289 AC-759 取り込み・上限・予算・失敗', () => {
  const ready = async (stub?: () => Promise<Response>) => {
    const s = await setup(stub);
    await putFoundryConfig(s.url, 'P', { endpoint: EP, deployment: 'd', key: DUMMY_KEY });
    await setFoundryConnection(s.url, 'P', true, { consent: true, confirmed: true });
    return s;
  };

  it('PDF・画像・Office・テキストを送り、プレビュー用のエンティティが返る（ファイルは設定したエンドポイントの /responses へ）', async () => {
    const { url, calls } = await ready();
    for (const f of [mkFile('a.pdf', '%PDF'), mkFile('a.png', new Uint8Array([137, 80, 78, 71]), 'image/png'), mkFile('a.docx', 'PK', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), mkFile('a.txt', '議事メモ', 'text/plain')]) {
      expect(await requestAiImport(url, req(f))).toEqual({ ok: true, entities: [{ name: '合成エンティティ', description: '説明' }] });
    }
    expect(calls).toHaveLength(4);
    expect(calls.every((c) => c.url === `${EP}/responses`)).toBe(true);
    expect(calls[1]!.body).toContain('input_image');
    expect(calls[0]!.body).toContain('input_file');
  });

  it('大きさが上限（10 MB）を超えるとブラウザー側でも中継側でも送らない。ちょうど 10 MB は送れる', async () => {
    expect(checkSize(AI_IMPORT_MAX_BYTES)).toEqual({ ok: true });
    const over = checkSize(AI_IMPORT_MAX_BYTES + 1);
    expect(over.ok === false && /10 MB/.test(over.message) && /超/.test(over.message)).toBe(true);
    const { url, calls } = await ready();
    const big = await requestAiImport(url, req(mkFile('big.pdf', new Uint8Array(AI_IMPORT_MAX_BYTES + 1))));
    expect(big.ok === false && /10 MB/.test(big.message)).toBe(true);
    expect(calls).toHaveLength(0);
    expect((await requestAiImport(url, req(mkFile('limit.pdf', new Uint8Array(AI_IMPORT_MAX_BYTES))))).ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('Foundry の失敗・形式の誤りでは、原因と次の行動が示される', async () => {
    const e500 = await ready(async () => new Response('{}', { status: 500 }));
    const r = await requestAiImport(e500.url, req(mkFile('a.pdf', '%PDF')));
    expect(r.ok === false && /500/.test(r.message) && /もう一度/.test(r.message) && /変わっていません/.test(r.message)).toBe(true);
    const bad = await ready(async () => new Response(JSON.stringify({ output_text: '読めない' }), { status: 200 }));
    const r2 = await requestAiImport(bad.url, req(mkFile('a.pdf', '%PDF')));
    expect(r2.ok === false && /もう一度/.test(r2.message)).toBe(true);
  });

  it('月の概算費用に算入し、警告の水準で警告・停止の水準で呼ばない。月が替わるとリセットする', () => {
    let saved: Usage | null = null;
    const store: UsageStore = { get: () => saved, set: (u) => { saved = u; } };
    const may = new Date(2026, 4, 10);
    expect(budgetState(currentUsage(store, may), estimateCostYen(1000)).state).toBe('ok');
    recordCall(store, may, 80000);
    expect(budgetState(currentUsage(store, may), 1).state).toBe('warn');
    recordCall(store, may, 20000);
    const stop = budgetState(currentUsage(store, may), 1);
    expect(stop.state).toBe('stop');
    expect(currentUsage(store, may).calls).toBe(2);
    expect(currentUsage(store, new Date(2026, 5, 1))).toEqual({ month: '2026-06', calls: 0, costYen: 0 });
  });
});

describe('FR-289 AC-760 キーの秘匿と送信先', () => {
  it('API キーは取り込みの要求・応答・失敗の文言のどこにも出ず、Entra ID 方式ではキーなしでトークンを使う', async () => {
    const seen: string[] = [];
    const spy = (async (u: RequestInfo | URL, i?: RequestInit) => { const r = await fetch(u, i); const c = r.clone(); seen.push(String(i?.body ?? ''), await c.text()); return r; }) as typeof fetch;
    const { url, calls } = await setup(async () => new Response(JSON.stringify({ error: `bad ${DUMMY_KEY}` }), { status: 401 }));
    await putFoundryConfig(url, 'P', { endpoint: EP, deployment: 'd', key: DUMMY_KEY });
    await setFoundryConnection(url, 'P', true, { consent: true, confirmed: true });
    const r = await requestAiImport(url, req(mkFile('a.pdf', '%PDF')), spy);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(DUMMY_KEY);
    expect(seen.join('\n')).not.toContain(DUMMY_KEY);
    expect(seen.join('\n')).not.toContain(DUMMY_KEY.slice(-5));
    expect(calls[0]!.auth).toBe(`Bearer ${DUMMY_KEY}`); // Foundry へ送るのは中継プロセスだけ

    // Entra ID 方式
    await putFoundryConfig(url, 'P', { endpoint: EP, deployment: 'd', key: '', authMethod: 'entra' });
    await requestAiImport(url, req(mkFile('b.pdf', '%PDF')));
    expect(calls[1]!.auth).toBe('Bearer dummy-entra-token-ABCDE');
  });

  it('ブラウザーからの通信先は localhost の中継だけ（それ以外の URL には送らない）', async () => {
    let called = false;
    const f = (async () => { called = true; return new Response('{}'); }) as typeof fetch;
    const r = await requestAiImport('https://evil.example', req(mkFile('a.pdf', '%PDF')), f);
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });
});
