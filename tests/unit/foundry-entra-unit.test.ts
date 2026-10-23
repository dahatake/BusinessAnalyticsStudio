// FR-282 AC-761（トークン取得部品）・AC-763（接続テストの画面側の判定）・AC-764（エンドポイントの検証）の単体テスト
import { describe, expect, it } from 'vitest';
import { createAzCliTokenProvider, FOUNDRY_TOKEN_RESOURCE } from '../../scripts/relay/foundry-token';
import { validateFoundryEndpoint, testFoundry } from '../../src/ai/foundryClient';
import { runFoundryTest, newFoundryTestSession } from '../../src/ai/foundryTest';
import { DEFAULT_LIMITS } from '../../src/explain/params';
import { emptyUsage } from '../../src/explain/usage';

const TOKEN = ['tok', 'en', 'DUMMY', '0123456789'].join('-');

describe('FR-282 AC-761 Azure CLI のトークン取得部品', () => {
  it('FR-282 AC-761 az account get-access-token（cognitiveservices）を、シェルなしの固定引数・タイムアウトつきで呼び、短時間はキャッシュする', async () => {
    const calls: Array<{ file: string; args: string[]; timeout: number; shell: false }> = [];
    let t = 1000;
    const p = createAzCliTokenProvider({ exec: async (file, args, o) => { calls.push({ file, args, timeout: o.timeout, shell: o.shell }); return `${TOKEN}\n`; }, now: () => t, cacheMs: 60_000 });
    expect(await p()).toBe(TOKEN);
    expect(await p()).toBe(TOKEN);
    expect(calls).toHaveLength(1);
    const c0 = calls[0]!;
    expect(c0.file).toBe('az');
    expect(c0.args).toEqual(['account', 'get-access-token', '--resource', FOUNDRY_TOKEN_RESOURCE, '--query', 'accessToken', '-o', 'tsv']);
    expect(c0.shell).toBe(false);
    expect(c0.timeout).toBeGreaterThan(0);
    t += 61_000;
    await p();
    expect(calls).toHaveLength(2);
  });

  it('FR-282 AC-761 異常系: 失敗・空の出力は、トークンの値を含まないエラーになる', async () => {
    const failing = createAzCliTokenProvider({ exec: async () => { throw new Error(`boom ${TOKEN}`); } });
    await expect(failing()).rejects.toThrow(/^token unavailable$/);
    const empty = createAzCliTokenProvider({ exec: async () => '  \n' });
    await expect(empty()).rejects.toThrow(/token unavailable/);
  });
});

describe('FR-282 AC-764 エンドポイントの検証', () => {
  it.each(['https://r.openai.azure.com/openai/v1', 'https://r.services.ai.azure.com/openai/v1', 'https://r.cognitiveservices.azure.com/'])('FR-282 AC-764 %s は受け付ける', (v) => {
    expect(validateFoundryEndpoint(v)).toBeNull();
  });
  it.each(['http://r.openai.azure.com/openai/v1', 'https://bad-host.example.test/openai/v1', 'not a url', '', 'https://u:p@r.openai.azure.com/'])('FR-282 AC-764 異常系: 「%s」は理由つきで拒否し、理由に入力値を含めない', (v) => {
    const m = validateFoundryEndpoint(v);
    expect(m).toBeTruthy();
    if (v.length > 4) expect(m).not.toContain(v);
    expect(m).not.toContain('bad-host');
  });
});

describe('FR-282 AC-763 接続テストの画面側の判定', () => {
  const now = new Date(2026, 9, 24, 10, 0, 0);
  const mk = (usage = emptyUsage(now), result: Awaited<ReturnType<typeof testFoundry>> = { ok: true, message: 'x' }) => {
    let u = usage; let calls = 0; let t = now.getTime();
    return {
      deps: { now: () => new Date(t), limits: () => DEFAULT_LIMITS, usage: { get: () => u, set: (n: typeof u) => { u = n; } }, test: async () => { calls++; return result; } },
      calls: () => calls, usage: () => u, advance: (ms: number) => { t += ms; },
    };
  };

  it('FR-282 AC-763 1 回目は呼び、利用量に 1 回・最小の出力で数える。5 秒未満の再押下は 0 回で待ち時間を示す', async () => {
    const m = mk(); const s = newFoundryTestSession();
    expect((await runFoundryTest(m.deps, s)).kind).toBe('result');
    expect(m.calls()).toBe(1);
    expect(m.usage().count).toBe(1);
    expect(m.usage().outputTokens).toBeLessThanOrEqual(100);
    m.advance(2000);
    const w = await runFoundryTest(m.deps, s);
    expect(w.kind).toBe('wait');
    expect(m.calls()).toBe(1);
    m.advance(4000);
    expect((await runFoundryTest(m.deps, s)).kind).toBe('result');
    expect(m.calls()).toBe(2);
  });

  it('FR-282 AC-763 異常系: 概算費用が停止に達しているあいだは呼ばず（0 回）、停止の旨を示す', async () => {
    const m = mk({ ...emptyUsage(now), costYen: DEFAULT_LIMITS.budgetYen });
    const o = await runFoundryTest(m.deps, newFoundryTestSession());
    expect(o.kind).toBe('blocked');
    expect(m.calls()).toBe(0);
  });

  it('FR-282 AC-763 異常系: 中継に届かないときは relay の原因で返し、例外にしない', async () => {
    const r = await testFoundry('http://127.0.0.1:1', (async () => { throw new TypeError('x'); }) as typeof fetch);
    expect(r).toMatchObject({ ok: false, cause: 'relay' });
  });
});
