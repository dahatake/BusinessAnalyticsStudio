// FR-182 AC-376〜AC-378・AC-380: 音声合成（Azure AI Speech）・手書き認識（Azure AI Vision）の接続部品の切替。
// 外部へは接続しない。HTTP 呼び出しは差し替え部品（スタブ）で確かめる。
import { afterEach, describe, expect, it } from 'vitest';
import { startRelay, type Relay } from '../../scripts/relay/relay';
import { azureConfigFromEnv, createAzureServices, type HttpPost } from '../../scripts/relay/azure-services';
import { recognizeViaRelay, setAzureConnection, synthesizeSpeech } from '../../src/ai/azureClient';

const KEY = 'sk-test-DUMMY-0123456789';
const open: Relay[] = [];
afterEach(async () => { while (open.length) await open.pop()!.close(); });

function stub(over?: Partial<{ status: number; body: string; throws: boolean }>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const http: HttpPost = async (url, init) => {
    calls.push({ url, headers: init.headers });
    if (over?.throws) throw new Error(`boom with key ${init.headers['Ocp-Apim-Subscription-Key']}`);
    return { status: over?.status ?? 200, body: new TextEncoder().encode(over?.body ?? JSON.stringify({ readResult: { blocks: [{ lines: [{ text: '決定事項' }] }] } })) };
  };
  return { http, calls };
}
const cfgFull = { speechKey: KEY, speechRegion: 'japaneast', visionKey: KEY, visionEndpoint: 'https://v.example.cognitiveservices.azure.com' };

async function relayWith(cfg: Parameters<typeof createAzureServices>[0], http: HttpPost) {
  const r = await startRelay({ sdk: null, azure: createAzureServices(cfg, http) });
  open.push(r);
  return r;
}

describe('FR-182 接続部品の切替', () => {
  // FR-182 AC-376
  it('AC-376 キーが未設定のまま実接続を有効にしても、モックで動作し外部呼び出しは 0 回', async () => {
    const { http, calls } = stub();
    const r = await relayWith({}, http);
    for (const f of ['speech', 'vision'] as const) {
      const c = await setAzureConnection(r.url, f, 'p', true, true);
      expect(c).toMatchObject({ ok: true, mode: 'mock' });
    }
    const sp = await synthesizeSpeech({ relayUrl: r.url, realEnabled: true, packId: 'p' }, '台本です');
    expect(sp.kind).toBe('subtitle-only');
    const rec = await recognizeViaRelay({ relayUrl: r.url, packId: 'p' }, 'AAAA', 3);
    expect(rec).toEqual({ text: '手書きメモ（3 画。モックの認識結果）', mock: true });
    expect(calls).toHaveLength(0);
  });

  // FR-182 AC-377
  it('AC-377 ダミーのキー・了承あり・有効のときだけ差し替え部品が呼ばれる', async () => {
    const { http, calls } = stub();
    const r = await relayWith(cfgFull, http);
    // 有効化の前・了承なし・無効化後は 0 回
    await synthesizeSpeech({ relayUrl: r.url, realEnabled: true, packId: 'p' }, '台本');
    expect((await setAzureConnection(r.url, 'speech', 'p', true, false)).ok).toBe(false);
    await synthesizeSpeech({ relayUrl: r.url, realEnabled: true, packId: 'p' }, '台本');
    expect(calls).toHaveLength(0);
    // 有効
    expect(await setAzureConnection(r.url, 'speech', 'p', true, true)).toMatchObject({ ok: true, mode: 'connected' });
    const o = await synthesizeSpeech({ relayUrl: r.url, realEnabled: true, packId: 'p' }, '台本');
    expect(o.kind).toBe('audio');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('japaneast.tts.speech.microsoft.com');
    // 無効にすると、キーがあっても 0 回
    await setAzureConnection(r.url, 'speech', 'p', false, false);
    await synthesizeSpeech({ relayUrl: r.url, realEnabled: true, packId: 'p' }, '台本');
    expect(calls).toHaveLength(1);
    // 手書き認識
    await setAzureConnection(r.url, 'vision', 'p', true, true);
    expect(await recognizeViaRelay({ relayUrl: r.url, packId: 'p' }, 'AAAA', 1)).toEqual({ text: '決定事項', mock: false });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.url).toContain('imageanalysis:analyze');
    // 別の案件はモック
    expect((await recognizeViaRelay({ relayUrl: r.url, packId: 'other' }, 'AAAA', 1)).mock).toBe(true);
    expect(calls).toHaveLength(2);
  });

  // FR-182 AC-378
  it('AC-378 実接続の後も、キーの値が応答・エラーのどこにも含まれない', async () => {
    const { http } = stub();
    const r = await relayWith(cfgFull, http);
    const seen: string[] = [];
    const spy = async (u: string, i?: { method?: string; headers?: Record<string, string>; body?: string }) => {
      const res = await fetch(u, i);
      const t = await res.text();
      seen.push(t);
      return { ok: res.ok, status: res.status, json: async () => JSON.parse(t) as unknown };
    };
    await setAzureConnection(r.url, 'speech', 'p', true, true, spy);
    await setAzureConnection(r.url, 'vision', 'p', true, true, spy);
    await synthesizeSpeech({ relayUrl: r.url, realEnabled: true, packId: 'p', fetchFn: spy }, '台本');
    await recognizeViaRelay({ relayUrl: r.url, packId: 'p', fetchFn: spy }, 'AAAA', 1);
    expect(seen.length).toBe(4);
    for (const t of seen) expect(t).not.toContain(KEY);
    expect(JSON.stringify(azureConfigFromEnv({ AZURE_SPEECH_KEY: ' ' }))).not.toContain(KEY);
  });

  // FR-182 AC-380
  it('AC-380 エラー時は音声は字幕だけ・手書き認識は失敗として返り、キーの値はエラーに含まれない', async () => {
    const { http } = stub({ throws: true });
    const r = await relayWith(cfgFull, http);
    await setAzureConnection(r.url, 'speech', 'p', true, true);
    await setAzureConnection(r.url, 'vision', 'p', true, true);
    const sp = await synthesizeSpeech({ relayUrl: r.url, realEnabled: true, packId: 'p' }, '台本');
    expect(sp.kind).toBe('error');
    expect(JSON.stringify(sp)).not.toContain(KEY);
    expect((sp as { message: string }).message).toContain('音声合成');
    await expect(recognizeViaRelay({ relayUrl: r.url, packId: 'p' }, 'AAAA', 1)).rejects.toThrow(/手書き認識/);
    try { await recognizeViaRelay({ relayUrl: r.url, packId: 'p' }, 'AAAA', 1); } catch (e) { expect((e as Error).message).not.toContain(KEY); }
    // HTTP エラー状態
    const bad = stub({ status: 401 });
    const r2 = await relayWith(cfgFull, bad.http);
    await setAzureConnection(r2.url, 'speech', 'p', true, true);
    expect((await synthesizeSpeech({ relayUrl: r2.url, realEnabled: true, packId: 'p' }, 'x')).kind).toBe('error');
  });

  it('localhost 以外の中継 URL には送信しない（NFR-SEC-002）', async () => {
    let called = 0;
    const fetchFn = async () => { called++; return { ok: true, status: 200, json: async () => ({}) }; };
    expect((await synthesizeSpeech({ relayUrl: 'https://example.com', realEnabled: true, packId: 'p', fetchFn }, 'x')).kind).toBe('subtitle-only');
    await expect(recognizeViaRelay({ relayUrl: 'https://example.com', packId: 'p', fetchFn }, 'A', 1)).rejects.toThrow();
    expect(called).toBe(0);
  });
});
