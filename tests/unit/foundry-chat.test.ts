// FR-286 チャットの Microsoft Foundry 送信（単体: 送る内容の組み立て・利用量。結合: 中継プロセス（Foundry の送信口はスタブ）を通した 1 回分の流れ）
// AC-741 AC-742 AC-743 AC-745 AC-746 AC-747（AC-744 は System Test E2E-380）。Foundry へは実接続しない。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startRelay, type Relay } from '../../scripts/relay/relay';
import { openFoundryVault } from '../../scripts/relay/foundry-vault';
import { fileProtector } from '../../scripts/relay/speech-vault';
import { putFoundryConfig, setFoundryConnection, type FoundryUnavailableReason } from '../../src/ai/foundryClient';
import { buildFoundryPrompt, estimateTokens, foundryReasonText, HISTORY_PAIRS, MAX_INPUT_TOKENS } from '../../src/ai/foundryChat';
import { sendFoundryChat } from '../../src/ai/foundryChatFlow';
import { addUsage, checkUsage, DEFAULT_LIMITS, emptyRecord, rollover } from '../../src/ai/foundryUsage';

const DUMMY_KEY = 'dummy-foundry-key-0123456789';
const EP = 'https://foundry.example.invalid/openai/v1';
const open: Relay[] = [];
const dirs: string[] = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

async function setup(reply: (signal?: AbortSignal | null) => Response | Promise<Response> = () => new Response(JSON.stringify({ output_text: '回答です' }), { status: 200 })) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-chat-'));
  dirs.push(dir);
  const bodies: string[] = [];
  const foundryVault = openFoundryVault(dir, { protector: fileProtector, restrict: () => {}, warn: () => {} });
  const relay = await startRelay({
    sdk: null, foundryVault, foundryTimeoutMs: 200,
    foundryFetch: (async (_u: string, i?: RequestInit) => { bodies.push(String(i?.body ?? '')); return reply(i?.signal); }) as typeof fetch,
  });
  open.push(relay);
  expect((await putFoundryConfig(relay.url, 'P', { endpoint: EP, deployment: 'dep1', key: DUMMY_KEY })).ok).toBe(true);
  expect((await setFoundryConnection(relay.url, 'P', true, { consent: true, confirmed: true })).mode).toBe('connected');
  return { bodies, url: relay.url };
}

const NOW = new Date(2026, 9, 22, 12, 0, 0);
function usageDeps(limits = DEFAULT_LIMITS) {
  let rec = emptyRecord(NOW);
  return {
    get rec() { return rec; },
    usage: { check: () => checkUsage(rec, limits, NOW), count: (n: number) => { rec = addUsage(rec, limits, NOW, n); } },
  };
}
const turn = (i: number) => ({ question: `Q${i}-質問`, answer: `A${i}-回答` });
const base = { items: [{ label: '設備の計画外停止' }], sources: [{ id: 'S1', title: '出典タイトル1' }] };

describe('FR-286 AC-742 送る内容の組み立て（単体）', () => {
  it('直近 PARAM-123 組の履歴だけが時系列で含まれ、古い組は含まれない', () => {
    const history = [1, 2, 3, 4, 5, 6, 7].map(turn);
    const b = buildFoundryPrompt({ question: '最新の質問', history, ...base });
    expect(HISTORY_PAIRS).toBe(5);
    expect(b.history).toEqual(history.slice(2));
    for (const i of [3, 4, 5, 6, 7]) expect(b.prompt).toContain(`Q${i}-質問`);
    for (const i of [1, 2]) expect(b.prompt).not.toContain(`Q${i}-質問`);
    expect(b.prompt.indexOf('Q3-質問')).toBeLessThan(b.prompt.indexOf('Q7-質問'));
    expect(b.trimmed).toBe(false);
  });
  it('入力の上限を超えるときは古い履歴から落とし、切り詰めた印が付く', () => {
    const big = 'あ'.repeat(12000); // 約 3000 トークン
    const history = [1, 2, 3].map((i) => ({ question: `Q${i}-質問${big}`, answer: `A${i}` }));
    const b = buildFoundryPrompt({ question: '要点', history, ...base });
    expect(b.tokens).toBeLessThanOrEqual(MAX_INPUT_TOKENS);
    expect(b.trimmed).toBe(true);
    expect(b.dropped).toBeGreaterThanOrEqual(1);
    expect(b.prompt).not.toContain('Q1-質問');
    expect(b.prompt).toContain('Q3-質問');
  });
  it('異常系: 履歴を全部落としても超える質問は切り詰める', () => {
    const b = buildFoundryPrompt({ question: 'あ'.repeat(40000), history: [], ...base });
    expect(b.tokens).toBeLessThanOrEqual(MAX_INPUT_TOKENS);
    expect(b.trimmed).toBe(true);
  });
  it('履歴なし: 根拠（項目と出典）と質問が入り、キーらしい値は入らない（AC-743・AC-745）', () => {
    const b = buildFoundryPrompt({ question: '質問です', history: [], ...base });
    expect(b.prompt).toContain('設備の計画外停止');
    expect(b.prompt).toContain('出典タイトル1');
    expect(b.prompt).toContain('質問です');
    expect(b.prompt).not.toContain(DUMMY_KEY);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('FR-276/FR-286 AC-747 利用量の記録（単体）', () => {
  it('上限に達したら止め、失敗した呼び出しも数え、日付・月が替わるとリセットする。記録に文章を持たない', () => {
    const l = { ...DEFAULT_LIMITS, dailyLimit: 1 };
    let r = emptyRecord(NOW);
    expect(checkUsage(r, l, NOW).allowed).toBe(true);
    r = addUsage(r, l, NOW, 100);
    const g = checkUsage(r, l, NOW);
    expect(g.allowed).toBe(false);
    expect(rollover(r, new Date(2026, 9, 23, 0, 0, 0)).dayCount).toBe(0);
    expect(rollover(r, new Date(2026, 10, 1, 0, 0, 0)).monthCost).toBe(0);
    expect(Object.keys(r).sort()).toEqual(['day', 'dayCount', 'month', 'monthCost', 'monthCount', 'monthTokensIn', 'monthTokensOut']);
  });
  it('予算の警告と停止', () => {
    const l = { ...DEFAULT_LIMITS, monthlyBudget: 100 };
    const warn = { ...emptyRecord(NOW), monthCost: 80 };
    const stop = { ...emptyRecord(NOW), monthCost: 100 };
    expect(checkUsage(warn, l, NOW)).toMatchObject({ allowed: true, warning: expect.stringContaining('80') });
    expect(checkUsage(stop, l, NOW).allowed).toBe(false);
  });
});

describe('FR-286 結合（中継プロセス＋Foundry スタブ）', () => {
  const deps = (url: string, u: ReturnType<typeof usageDeps>, o: Partial<Parameters<typeof sendFoundryChat>[0]> = {}) => ({
    relayUrl: url, packId: 'P', consent: true, includesPerson: false, confirmPerson: async () => ({ allowed: true }), usage: u.usage, ...o,
  });

  it('AC-741 そろった状態で 1 回だけ Foundry へ送られ、回答が返る', async () => {
    const { bodies, url } = await setup();
    const u = usageDeps();
    const b = buildFoundryPrompt({ question: '質問A', history: [], ...base });
    const out = await sendFoundryChat(deps(url, u), b);
    expect(out).toMatchObject({ kind: 'answer', answer: '回答です' });
    expect(bodies).toHaveLength(1);
  });

  it('AC-741 異常系: 了承なしは Foundry が呼ばれず（中継が拒否）理由が返る', async () => {
    const { bodies, url } = await setup();
    const out = await sendFoundryChat(deps(url, usageDeps(), { consent: false }), buildFoundryPrompt({ question: 'q', history: [], ...base }));
    expect(out).toMatchObject({ kind: 'failed', reason: 'consent' });
    expect(bodies).toHaveLength(0);
  });

  it('AC-742・AC-743・AC-745 Foundry への入力に直近の履歴と根拠が入り、新しい会話（空の履歴）では前の会話が入らず、キーは入らない', async () => {
    const { bodies, url } = await setup();
    const u = usageDeps();
    const hist = [1, 2, 3, 4, 5, 6].map(turn);
    await sendFoundryChat(deps(url, u), buildFoundryPrompt({ question: '次の質問X', history: hist, ...base }));
    const sent = bodies[0]!;
    expect(sent).toContain('Q6-質問');
    expect(sent).toContain('Q2-質問');
    expect(sent).not.toContain('Q1-質問');
    expect(sent).toContain('設備の計画外停止');
    expect(sent).toContain('出典タイトル1');
    expect(sent).not.toContain(DUMMY_KEY);
    await sendFoundryChat(deps(url, u), buildFoundryPrompt({ question: '新しい会話の質問', history: [], ...base }));
    expect(bodies[1]).toContain('新しい会話の質問');
    expect(bodies[1]).not.toContain('Q6-質問');
  });

  it('AC-745 二重送信は呼び出し側が送信中に防ぐ（1 回の流れは 1 回だけ呼ぶ）', async () => {
    const { bodies, url } = await setup();
    await sendFoundryChat(deps(url, usageDeps()), buildFoundryPrompt({ question: 'q', history: [], ...base }));
    expect(bodies).toHaveLength(1);
  });

  const FAILS: Array<[string, (s?: AbortSignal | null) => Response | Promise<Response>, FoundryUnavailableReason]> = [
    ['error', () => new Response('{}', { status: 500 }), 'error'],
    ['timeout', (s) => new Promise<Response>((_, rej) => s?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))), 'timeout'],
  ];
  for (const [label, reply, reason] of FAILS) {
    it(`AC-746 ${label}: 理由が返り、キーを含まず、自動で再送信しない。失敗も回数に数える（AC-747）`, async () => {
      const { bodies, url } = await setup(reply);
      const u = usageDeps();
      const out = await sendFoundryChat(deps(url, u), buildFoundryPrompt({ question: 'q', history: [], ...base }));
      expect(out).toMatchObject({ kind: 'failed', reason });
      expect(out.kind === 'failed' && out.text).toBe(foundryReasonText(reason));
      expect(JSON.stringify(out)).not.toContain(DUMMY_KEY);
      expect(bodies).toHaveLength(1);
      expect(u.rec.dayCount).toBe(1);
    });
  }

  it('AC-746 中継プロセスの停止: relay の理由が返り、別の送信先へ切り替えない', async () => {
    const u = usageDeps();
    const out = await sendFoundryChat(deps('http://127.0.0.1:1', u), buildFoundryPrompt({ question: 'q', history: [], ...base }));
    expect(out).toMatchObject({ kind: 'failed', reason: 'relay' });
    expect(out.kind === 'failed' && out.text).toMatch(/中継/);
  });

  it('AC-746 種別「人」の確認で中止すると送信されず、理由が返る。続行なら personConfirmed つきで送る', async () => {
    const { bodies, url } = await setup();
    const u = usageDeps();
    const b = buildFoundryPrompt({ question: 'q', history: [], ...base });
    const stopped = await sendFoundryChat(deps(url, u, { includesPerson: true, confirmPerson: async () => ({ allowed: false, reason: '確認で中止を選んだため、送信・出力しませんでした。' }) }), b);
    expect(stopped).toEqual({ kind: 'blocked', text: '確認で中止を選んだため、送信・出力しませんでした。' });
    expect(bodies).toHaveLength(0);
    expect(u.rec.dayCount).toBe(0);
    const ok = await sendFoundryChat(deps(url, u, { includesPerson: true }), b);
    expect(ok.kind).toBe('answer');
    expect(bodies).toHaveLength(1);
  });

  it('AC-747 1 日の上限に達した後は Foundry を呼ばず理由を返し、記録に文章を含まない', async () => {
    const { bodies, url } = await setup();
    const u = usageDeps({ ...DEFAULT_LIMITS, dailyLimit: 1 });
    const b = buildFoundryPrompt({ question: '秘密の質問文', history: [], ...base });
    expect((await sendFoundryChat(deps(url, u), b)).kind).toBe('answer');
    const out = await sendFoundryChat(deps(url, u), b);
    expect(out.kind).toBe('blocked');
    expect(out.kind === 'blocked' && out.text).toMatch(/上限/);
    expect(bodies).toHaveLength(1);
    expect(JSON.stringify(u.rec)).not.toContain('秘密の質問文');
    expect(JSON.stringify(u.rec)).not.toContain('回答です');
    expect(u.rec.dayCount).toBe(1);
  });

  it('AC-747 予算の停止に達した後も呼ばない', async () => {
    const { bodies, url } = await setup();
    const l = { ...DEFAULT_LIMITS, monthlyBudget: 1 };
    const u = usageDeps(l);
    const b = buildFoundryPrompt({ question: 'q', history: [], ...base });
    await sendFoundryChat(deps(url, u), b); // 出力 1500 トークンの概算で予算 1 円を超える
    const out = await sendFoundryChat(deps(url, u), b);
    expect(out.kind).toBe('blocked');
    expect(bodies).toHaveLength(1);
  });
});
