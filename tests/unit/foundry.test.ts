// FR-275 Microsoft Foundry の接続設定（中継プロセスの結合検査。Foundry へは実接続せず、送信口はスタブ）
// AC-704 AC-705 AC-706 AC-707（AC-703 の画面は System Test E2E-367〜371 の spec）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startRelay, type Relay } from '../../scripts/relay/relay';
import { openFoundryVault } from '../../scripts/relay/foundry-vault';
import { fileProtector } from '../../scripts/relay/speech-vault';
import { askFoundry, deleteFoundryConfig, fetchFoundryView, putFoundryConfig, setFoundryConnection } from '../../src/ai/foundryClient';

const DUMMY_KEY = 'dummy-foundry-key-0123456789';
const EP = 'https://foundry.example.invalid/openai/v1';
const open: Relay[] = [];
const dirs: string[] = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

async function setup(stub: (url: string, init?: RequestInit) => Promise<Response> = async () => new Response(JSON.stringify({ output_text: '説明です' }), { status: 200 })) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-test-'));
  dirs.push(dir);
  const calls: Array<{ url: string; auth: string | null }> = [];
  const foundryVault = openFoundryVault(dir, { protector: fileProtector, restrict: () => {}, warn: () => {} });
  const relay = await startRelay({
    sdk: null, foundryVault, foundryTimeoutMs: 200,
    foundryFetch: (async (u: string, i?: RequestInit) => {
      calls.push({ url: String(u), auth: new Headers(i?.headers).get('authorization') });
      return stub(String(u), i);
    }) as typeof fetch,
  });
  open.push(relay);
  return { dir, calls, relay, url: relay.url };
}
const ready = async (url: string) => {
  expect((await putFoundryConfig(url, 'P', { endpoint: EP, deployment: 'dep1', key: DUMMY_KEY })).ok).toBe(true);
  expect((await setFoundryConnection(url, 'P', true, { consent: true, confirmed: true })).mode).toBe('connected');
};
const ask = (url: string, o: Partial<Parameters<typeof askFoundry>[1]> = {}) => askFoundry(url, { packId: 'P', prompt: '課題の説明', consent: true, ...o });

describe('FR-275 AC-704 キーの保管と送信先', () => {
  it('キーは応答・ディスクの平文のどこにも出ず、送信先は設定したエンドポイントだけ', async () => {
    const { dir, calls, url } = await setup();
    await ready(url);
    const raw = await (await fetch(`${url}/foundry/config?packId=P`)).text();
    expect(raw).not.toContain(DUMMY_KEY);
    const r = await ask(url);
    expect(r).toEqual({ mode: 'connected', answer: '説明です' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${EP}/responses`);
    expect(calls[0]!.auth).toBe(`Bearer ${DUMMY_KEY}`);
    for (const f of fs.readdirSync(dir)) expect(fs.readFileSync(path.join(dir, f), 'utf8')).not.toContain(DUMMY_KEY);
    expect(fs.existsSync(path.join(dir, 'foundry.enc'))).toBe(true);
  });
  it('https 以外・デプロイ名なし・キーなしの保存は拒否する', async () => {
    const { url } = await setup();
    expect((await putFoundryConfig(url, 'P', { endpoint: 'http://evil.example/', deployment: 'd', key: 'k' })).ok).toBe(false);
    expect((await putFoundryConfig(url, 'P', { endpoint: EP, deployment: '', key: 'k' })).ok).toBe(false);
    expect((await putFoundryConfig(url, 'P', { endpoint: EP, deployment: 'd', key: '' })).ok).toBe(false);
  });
});

describe('FR-275 AC-705 変更・削除は再起動なしで次の呼び出しから効く', () => {
  it('変更後は新しいキーで送り、削除後は使えない', async () => {
    const { calls, url } = await setup();
    await ready(url);
    await ask(url);
    await putFoundryConfig(url, 'P', { endpoint: 'https://other.example.invalid/v1', deployment: 'dep2', key: 'dummy-second-key-99999999' });
    // FR-275 AC-705: changing credentials revokes authorization until reconfirmed.
    expect(await ask(url)).toMatchObject({ mode: 'unavailable', reason: 'disabled' });
    expect(calls).toHaveLength(1);
    await setFoundryConnection(url, 'P', true, { consent: true, confirmed: true });
    await ask(url);
    expect(calls[1]!.url).toBe('https://other.example.invalid/v1/responses');
    expect(calls[1]!.auth).toBe('Bearer dummy-second-key-99999999');
    const v = await deleteFoundryConfig(url, 'P');
    expect(v?.configured).toBe(false);
    const r = await ask(url);
    expect(r).toMatchObject({ mode: 'unavailable' });
    expect(calls).toHaveLength(2);
    expect((await fetchFoundryView(url, 'P'))?.configured).toBe(false);
  });
  it('ブラウザー側のクライアントは localhost 以外の中継へは送らない', async () => {
    let called = 0;
    const f = (async () => { called++; return new Response('{}'); }) as typeof fetch;
    expect(await fetchFoundryView('https://evil.example', 'P', f)).toBeNull();
    expect((await askFoundry('https://evil.example', { packId: 'P', prompt: 'x', consent: true }, f)).mode).toBe('unavailable');
    expect(called).toBe(0);
  });
});

describe('FR-275 AC-706 条件がそろわないと呼び出し 0 回', () => {
  it('未設定・無効・了承なし・人の未確認では 0 回、そろうと呼ぶ。了承を取り消すと次から 0 回', async () => {
    const { calls, url } = await setup();
    expect(await ask(url)).toMatchObject({ reason: 'disabled' });
    await putFoundryConfig(url, 'P', { endpoint: EP, deployment: 'dep1', key: DUMMY_KEY });
    expect(await ask(url)).toMatchObject({ reason: 'disabled' });
    expect((await setFoundryConnection(url, 'P', true, { consent: false, confirmed: true })).ok).toBe(false);
    expect((await setFoundryConnection(url, 'P', true, { consent: true, confirmed: false })).ok).toBe(false);
    await setFoundryConnection(url, 'P', true, { consent: true, confirmed: true });
    expect(await ask(url, { consent: false })).toMatchObject({ mode: 'unavailable', reason: 'consent' });
    expect(await ask(url, { includesPerson: true })).toMatchObject({ reason: 'person-unconfirmed' });
    expect(calls).toHaveLength(0);
    expect(await ask(url, { includesPerson: true, personConfirmed: true })).toMatchObject({ mode: 'connected' });
    expect(calls).toHaveLength(1);
    expect(await ask(url, { consent: false })).toMatchObject({ reason: 'consent' });
    expect(calls).toHaveLength(1);
  });
  it('接続情報が未設定のとき、有効にできない', async () => {
    const { url } = await setup();
    expect((await setFoundryConnection(url, 'P', true, { consent: true, confirmed: true })).ok).toBe(false);
  });
});

describe('FR-275 AC-707 エラー・タイムアウト', () => {
  it('HTTP エラー・タイムアウトは unavailable で返し、メッセージにキーを含めない', async () => {
    const err = await setup(async () => new Response(`bad ${DUMMY_KEY}`, { status: 500 }));
    await ready(err.url);
    const r1 = await ask(err.url);
    expect(r1).toMatchObject({ mode: 'unavailable', reason: 'error' });
    expect(JSON.stringify(r1)).not.toContain(DUMMY_KEY);
    const slow = await setup((_u, i) => new Promise<Response>((_res, rej) => i?.signal?.addEventListener('abort', () => rej(new Error('abort')))));
    await ready(slow.url);
    const r2 = await ask(slow.url);
    expect(r2).toMatchObject({ mode: 'unavailable', reason: 'timeout' });
    expect(JSON.stringify(r2)).not.toContain(DUMMY_KEY);
  });
});

