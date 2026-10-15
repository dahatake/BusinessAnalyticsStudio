// 中継プロセスの結合検査（Copilot SDK の代わりのスタブ使用）。
// FR-010 AC-010, FR-011 AC-012, FR-132 AC-190 AC-191（了承の記録がある案件で検査する）, FR-181 AC-373 AC-374
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { startRelay, type CopilotSdk, type Relay } from '../../scripts/relay/relay';
import { AI_KINDS, askAi, MOCK_LABEL, probeRelay, setRelayConnection, type AiEnv } from '../../src/ai/client';

function stubSdk(signedIn = true): CopilotSdk & { calls: Array<{ kind: string; prompt: string }> } {
  const calls: Array<{ kind: string; prompt: string }> = [];
  return {
    calls,
    status: async () => ({ signedIn }),
    complete: async (kind, prompt) => { calls.push({ kind, prompt }); return `SDK回答:${prompt}`; },
  };
}

const open: Relay[] = [];
afterEach(async () => { while (open.length) await open.pop()!.close(); });
async function start(sdk: CopilotSdk | null): Promise<Relay> {
  const r = await startRelay({ sdk });
  open.push(r);
  return r;
}

describe('FR-011 AC-012 待ち受けアドレス', () => {
  it('ループバックだけで待ち受け、ループバック以外の host は起動を拒否する', async () => {
    const r = await start(null);
    expect(['127.0.0.1', '::1']).toContain(r.host);
    expect(r.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    await expect(startRelay({ sdk: null, host: '0.0.0.0' })).rejects.toThrow(/ループバック/);
    await expect(startRelay({ sdk: null, host: '192.168.0.10' })).rejects.toThrow(/ループバック/);
  });

  it('ほかのオリジンからのブラウザー要求は拒否する', async () => {
    const r = await start(null);
    const res = await fetch(`${r.url}/health`, { headers: { origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
  });

  it('実際の待ち受けソケットがループバックのアドレスである', async () => {
    const r = await start(null);
    const addr = await new Promise<string>((resolve) => {
      http.get(`${r.url}/health`, (res) => { resolve(res.socket.remoteAddress ?? ''); res.resume(); });
    });
    expect(addr).toBe('127.0.0.1');
  });
});

describe('FR-010 AC-010 5 種類の処理が 1 つの呼び出し口を通る', () => {
  it('5 種類すべてが中継プロセスの POST /ask 1 本に届き、送信先は localhost の中継プロセスだけ', async () => {
    const sdk = stubSdk();
    const r = await start(sdk);
    const urls: string[] = [];
    const env: AiEnv = {
      relayUrl: r.url,
      realEnabled: true,
      fetchFn: async (u, i) => { urls.push(u); return fetch(u, i); },
    };
    expect(await setRelayConnection(r.url, 'pack-A', true, env.fetchFn, true)).toBe(true);
    for (const kind of AI_KINDS) {
      const res = await askAi({ kind, packId: 'pack-A', prompt: `質問-${kind}` }, env);
      expect(res.mode).toBe('connected');
      expect(res.answer).toBe(`SDK回答:質問-${kind}`);
    }
    expect(sdk.calls.map((c) => c.kind)).toEqual([...AI_KINDS]);
    expect(urls.filter((u) => u.endsWith('/ask'))).toHaveLength(5);
    for (const u of urls) expect(new URL(u).hostname).toBe('127.0.0.1');
  });

  it('localhost 以外の中継 URL には送信せず、モックで答える', async () => {
    let called = 0;
    const res = await askAi({ kind: 'chat', packId: 'p', prompt: 'x' }, {
      relayUrl: 'https://example.com', realEnabled: true, fetchFn: async () => { called++; return { ok: true, status: 200, json: async () => ({}) }; },
    });
    expect(called).toBe(0);
    expect(res.mode).toBe('mock');
  });
});

describe('FR-132 AC-190 実接続を有効にしていなければモック', () => {
  it('SDK を使える状態でも、有効にするまで SDK の呼び出しが 0 回で、回答はモック', async () => {
    const sdk = stubSdk();
    const r = await start(sdk);
    expect((await probeRelay(r.url)).ok).toBe(true); // 使える状態
    const res = await fetch(`${r.url}/ask`, { method: 'POST', body: JSON.stringify({ kind: 'chat', packId: 'pack-A', prompt: '顧客の質問' }) });
    const j = (await res.json()) as { answer: string; mode: string };
    expect(j.mode).toBe('mock');
    expect(j.answer).toContain('モック');
    expect(sdk.calls).toHaveLength(0);
    // クライアントも、有効にしていなければ中継プロセスへ何も送らずモックラベルで返す
    let called = 0;
    const mine = await askAi({ kind: 'chat', packId: 'pack-A', prompt: 'q' }, {
      relayUrl: r.url, realEnabled: false, fetchFn: async () => { called++; return { ok: true, status: 200, json: async () => ({}) }; },
    });
    expect(called).toBe(0);
    expect(mine.mode).toBe('mock');
    expect(MOCK_LABEL).toBe('AI 生成（モック）');
  });
});

describe('FR-132 AC-191 確認のあとだけ接続済み', () => {
  it('確認なしの有効化は拒否され、確認つきで有効にした後にだけ SDK が呼ばれる', async () => {
    const sdk = stubSdk();
    const r = await start(sdk);
    const noConfirm = await fetch(`${r.url}/connection`, { method: 'POST', body: JSON.stringify({ packId: 'pack-A', enable: true, consent: true }) });
    expect(noConfirm.status).toBe(400);
    const ask = async (packId: string) => (await (await fetch(`${r.url}/ask`, { method: 'POST', body: JSON.stringify({ kind: 'summary', packId, prompt: 'p' }) })).json()) as { mode: string };
    expect((await ask('pack-A')).mode).toBe('mock');
    expect(sdk.calls).toHaveLength(0);
    expect(await setRelayConnection(r.url, 'pack-A', true, undefined, true)).toBe(true);
    expect((await ask('pack-A')).mode).toBe('connected');
    expect(sdk.calls).toHaveLength(1);
    // 別の顧客パックは有効化されていない
    expect((await ask('pack-B')).mode).toBe('mock');
    expect(sdk.calls).toHaveLength(1);
    // 解除するとモックに戻る
    await setRelayConnection(r.url, 'pack-A', false);
    expect((await ask('pack-A')).mode).toBe('mock');
  });

  it('未サインインでは有効にできず、モックのまま', async () => {
    const sdk = stubSdk(false);
    const r = await start(sdk);
    expect((await probeRelay(r.url))).toEqual({ ok: false, reason: expect.stringContaining('サインイン') });
    expect(await setRelayConnection(r.url, 'pack-A', true, undefined, true)).toBe(false);
    const j = (await (await fetch(`${r.url}/ask`, { method: 'POST', body: JSON.stringify({ kind: 'chat', packId: 'pack-A', prompt: 'p' }) })).json()) as { mode: string };
    expect(j.mode).toBe('mock');
    expect(sdk.calls).toHaveLength(0);
  });

  it('中継プロセスを再起動すると有効化は消えてモックに戻る（別の顧客パックの起動も同じ）', async () => {
    const sdk = stubSdk();
    const r1 = await start(sdk);
    await setRelayConnection(r1.url, 'pack-A', true, undefined, true);
    await r1.close();
    const r2 = await start(sdk);
    const j = (await (await fetch(`${r2.url}/ask`, { method: 'POST', body: JSON.stringify({ kind: 'chat', packId: 'pack-A', prompt: 'p' }) })).json()) as { mode: string };
    expect(j.mode).toBe('mock');
  });

  it('オフライン・未起動の中継プロセスは「使えない」と判定する', async () => {
    expect((await probeRelay('http://127.0.0.1:1')).ok).toBe(false);
    expect((await probeRelay(undefined)).ok).toBe(false);
  });
});

describe('FR-181 AC-373 了承の記録がない案件は実接続を有効にできない', () => {
  it('了承の記録がないと有効化は拒否され、状態はモックのままで SDK の呼び出しが 0 回', async () => {
    const sdk = stubSdk();
    const r = await start(sdk);
    // クライアント（consent 既定 false）も、中継プロセスへの直接の要求（consent なし）も拒否される
    expect(await setRelayConnection(r.url, 'pack-A', true)).toBe(false);
    const direct = await fetch(`${r.url}/connection`, { method: 'POST', body: JSON.stringify({ packId: 'pack-A', enable: true, confirmed: true }) });
    expect(direct.status).toBe(403);
    expect(((await direct.json()) as { error: string }).error).toContain('了承の記録がない');
    const j = (await (await fetch(`${r.url}/ask`, { method: 'POST', body: JSON.stringify({ kind: 'chat', packId: 'pack-A', prompt: '質問' }) })).json()) as { mode: string };
    expect(j.mode).toBe('mock');
    expect(sdk.calls).toHaveLength(0);
  });
});

describe('FR-181 AC-374 了承の取消でモックに戻る', () => {
  it('了承の記録がある案件で接続済みにした後、取り消す（解除する）と以後 SDK の呼び出しが 0 回', async () => {
    const sdk = stubSdk();
    const r = await start(sdk);
    const ask = async () => (await (await fetch(`${r.url}/ask`, { method: 'POST', body: JSON.stringify({ kind: 'chat', packId: 'pack-A', prompt: 'q' }) })).json()) as { mode: string };
    expect(await setRelayConnection(r.url, 'pack-A', true, undefined, true)).toBe(true);
    expect((await ask()).mode).toBe('connected');
    expect(sdk.calls).toHaveLength(1);
    expect(await setRelayConnection(r.url, 'pack-A', false)).toBe(true);
    expect((await ask()).mode).toBe('mock');
    expect(sdk.calls).toHaveLength(1);
  });
});