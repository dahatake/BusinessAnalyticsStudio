// FR-291 ユースケースのストーリー動画（AI 生成）・FR-292 作成 1 回の予算（単体・結合検査。Foundry へは実接続せず、送信口はスタブ。キーはダミー値）
// AC-779（生成物の検査・隔離表示）、AC-780（共通接続・送信内容・条件）、AC-781（古い）、AC-782（見積りと事前の制御）、AC-783（実行中の制御と中止）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startRelay, type Relay } from '../../scripts/relay/relay';
import { openFoundryVault } from '../../scripts/relay/foundry-vault';
import { fileProtector } from '../../scripts/relay/speech-vault';
import { currentUsage, recordCall, type Usage, type UsageStore } from '../../src/ai/aiImportLogic';
import type { FoundryView } from '../../src/ai/foundryClient';
import { useUseCases } from '../../src/store/usecases';
import { emptyDraft, type UseCaseDraft } from '../../src/usecase/model';
import {
  DEFAULT_PRICES, STORY_VIDEO_BUDGET_YEN, STORY_VIDEO_MAX_CALLS, STORY_VIDEO_SANDBOX, appendUsageLog, planStoryVideo, requestStoryVideo, runStoryVideo,
  storyVideoAvailability, storyVideoState, toPayload, toSrcDoc, validateAnimationHtml, type CallResult, type RunDeps, type UsageLogEntry,
} from '../../src/usecase/storyVideo';

const GOOD_HTML = '<!doctype html><html><head><meta charset="utf-8"><style>@keyframes a{from{opacity:0}to{opacity:1}}</style></head><body><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" data-testid="story-svg"><text>x</text></svg><script>var n=0;setInterval(function(){n++;},1000);</script></body></html>';
const ucOf = (n: number, desc = '説明'): UseCaseDraft => ({
  ...emptyDraft(), name: '受注処理', summary: '概要', persona: '現場担当者', effect: '半分になる',
  steps: Array.from({ length: n }, (_, i) => ({ title: `手順${i + 1}`, description: desc })),
});
const usage = (costYen = 0): Usage => ({ month: '2026-10', calls: 0, costYen });
const SCENES = [{ scene: '場面1', person: '現場担当者', trouble: '困りごと', change: '実現後の変化' }];

describe('FR-291 AC-779 生成物の検査と隔離表示', () => {
  it('HTML・CSS・JS・SVG だけの出力は採用される（SVG の名前空間 URI は外部 URL に数えない）', () => {
    expect(validateAnimationHtml(GOOD_HTML)).toEqual({ ok: true });
  });
  it.each([
    ['動画ファイル', '<div><video src="a.mp4"></video></div>'],
    ['外部 URL', '<div><a href="https://example.com/x">x</a></div>'],
    ['fetch', '<div></div><script>fetch("/x")</script>'],
    ['XMLHttpRequest', '<div></div><script>new XMLHttpRequest()</script>'],
    ['eval', '<div></div><script>eval("1")</script>'],
    ['外部のスクリプト', '<div></div><script src="x.js"></script>'],
    ['外部の画像', '<div><img src="a.png"></div>'],
    ['CSS の外部読み込み', '<div style="background:url(a.png)"></div>'],
    ['GIF', '<div>a.gif</div>'],
    ['iframe', '<div><iframe></iframe></div>'],
  ])('%s を含む出力は採用されず、理由が返る', (_n, html) => {
    const r = validateAnimationHtml(html);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.length).toBeGreaterThan(0);
  });
  it('ページ内の参照（#）と画像の data: は許可し、空・巨大な出力は採用しない', () => {
    expect(validateAnimationHtml('<svg><use href="#a"/><image href="data:image/png;base64,AAAA"/></svg>')).toEqual({ ok: true });
    expect(validateAnimationHtml('').ok).toBe(false);
    expect(validateAnimationHtml(`<div>${'a'.repeat(200_001)}</div>`).ok).toBe(false);
  });
  it('表示枠は同一オリジンの許可のない sandbox（スクリプトだけ）で、srcdoc に外部通信を禁じる CSP が入る', () => {
    expect(STORY_VIDEO_SANDBOX).toBe('allow-scripts');
    expect(STORY_VIDEO_SANDBOX).not.toContain('allow-same-origin');
    const doc = toSrcDoc(GOOD_HTML);
    expect(doc).toContain("connect-src 'none'");
    expect(doc).toContain("default-src 'none'");
    expect(toSrcDoc('<svg></svg>')).toContain('Content-Security-Policy');
  });
  it('<header> を含み <head> のない HTML でも CSP の meta が入り、<header> 内には入らない', () => {
    const doc = toSrcDoc('<header>h</header><svg></svg>');
    expect(doc).toContain("default-src 'none'");
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<header>'));
  });
});

describe('FR-291 AC-780 共通接続・送信内容・条件', () => {
  const view = (o: Partial<FoundryView> = {}): FoundryView => ({ configured: true, endpoint: 'e', host: 'h', deployment: 'd', keyMask: '', enabled: true, ...o });
  it('FR-291 AC-780 (b) 送信内容は、名称・概要・対象ペルソナ・手順・期待する効果だけ（id・導出元は含めない）', () => {
    const uc = { ...ucOf(2), id: 'uc-1', source: { solutionId: 's', issueId: 'i' } } as UseCaseDraft;
    expect(Object.keys(toPayload(uc)).sort()).toEqual(['effect', 'name', 'persona', 'steps', 'summary']);
    expect(JSON.stringify(toPayload(uc))).not.toContain('uc-1');
  });
  it('FR-291 AC-780 (a) 呼び出しは localhost の中継の /foundry/story-video だけ。中継以外の宛先には呼び出し 0 回', async () => {
    const urls: string[] = [];
    const f = (async (u: string) => { urls.push(u); return new Response(JSON.stringify({ scenes: SCENES, usage: { inputTokens: 1, outputTokens: 1 } }), { status: 200 }); }) as unknown as typeof fetch;
    const base = { packId: 'P', kind: 'storyboard' as const, usecase: toPayload(ucOf(1)), consent: true, includesPerson: false, personConfirmed: false, maxOutputTokens: 100 };
    const ng = await requestStoryVideo('https://example.com', base, f);
    expect(ng.ok).toBe(false);
    expect(urls).toEqual([]);
    const ok = await requestStoryVideo('http://127.0.0.1:9', base, f);
    expect(ok.ok).toBe(true);
    expect(urls).toEqual(['http://127.0.0.1:9/foundry/story-video']);
  });
  it('FR-291 AC-780 (c) 設定・有効化・了承のどれかが欠ける、または接続先が Copilot SDK のときは使えず、理由と直し方が示される', () => {
    const a = storyVideoAvailability(view({ configured: false, enabled: false }), false);
    expect(a.available).toBe(false);
    expect(a.missing).toEqual(['設定', '有効化', '了承']);
    expect(a.guide).toContain('設定画面');
    expect(storyVideoAvailability(view({ enabled: false }), true).missing).toEqual(['有効化']);
    expect(storyVideoAvailability(view(), false).missing).toEqual(['了承']);
    const c = storyVideoAvailability(view({ provider: 'copilot' }), true);
    expect(c.available).toBe(false);
    expect(c.guide).toContain('Foundry を選んだときだけ');
    expect(storyVideoAvailability(view(), true).available).toBe(true);
  });
});

describe('FR-291 AC-781 作成状態（最新／古い）', () => {
  it('手順を編集すると「古い」になり、再作成すると「最新」になる。ほかのユースケース・Project は変わらない', () => {
    const s = useUseCases.getState();
    s.reset();
    const a = s.save('P1', ucOf(2));
    const b = s.save('P1', { ...ucOf(3), name: '別' });
    const o = s.save('P2', ucOf(1));
    if (!a.ok || !b.ok || !o.ok) throw new Error('save');
    for (const [p, id] of [['P1', a.id], ['P1', b.id], ['P2', o.id]] as const) expect(useUseCases.getState().saveStoryVideo(p, id, { scenes: SCENES, html: GOOD_HTML }).ok).toBe(true);
    const get = (p: string, id: string) => useUseCases.getState().byProject[p]!;
    const st = (p: string, id: string) => { const set = get(p, id); return storyVideoState(set.items.find((u) => u.id === id)!, set.storyVideos?.[id]); };
    expect(st('P1', a.id)).toBe('latest');
    useUseCases.getState().save('P1', { ...ucOf(2), steps: [{ title: '編集後', description: '' }] }, a.id);
    expect(st('P1', a.id)).toBe('stale');
    expect(get('P1', a.id).storyVideos?.[a.id]?.html).toBe(GOOD_HTML); // 古い間も再生できる（保存されたまま）
    expect(st('P1', b.id)).toBe('latest');
    expect(st('P2', o.id)).toBe('latest');
    useUseCases.getState().saveStoryVideo('P1', a.id, { scenes: SCENES, html: GOOD_HTML });
    expect(st('P1', a.id)).toBe('latest');
    useUseCases.getState().remove('P1', a.id);
    expect(get('P1', b.id).storyVideos?.[a.id]).toBeUndefined();
    useUseCases.getState().reset();
  });
});

describe('FR-292 AC-782 見積りと事前の制御', () => {
  it('見積りは上限以内なら切り詰めず、見積りの費用・上限（1,000 円）・月の残額が返る', () => {
    const p = planStoryVideo(ucOf(3), DEFAULT_PRICES, usage());
    expect(p.ok).toBe(true);
    if (p.ok) { expect(p.truncated).toBe(false); expect(p.limitYen).toBe(STORY_VIDEO_BUDGET_YEN); expect(p.estimateYen).toBeGreaterThan(0); expect(p.monthRemainingYen).toBe(100000); }
  });
  it('見積りが上限を超えるときは、入力の切り詰め・出力の上限の引き下げで上限以内にして「切り詰めた」旨を示す', () => {
    const uc = ucOf(20, 'あ'.repeat(2000));
    const price = { inPerM: 40000, outPerM: 40000 };
    const p = planStoryVideo(uc, price, usage());
    expect(p.ok).toBe(true);
    if (p.ok) { expect(p.truncated).toBe(true); expect(p.truncatedNote).toContain('切り詰め'); expect(p.estimateYen).toBeLessThanOrEqual(STORY_VIDEO_BUDGET_YEN); }
  });
  it('どうしても超えるときは呼び出し 0 回の理由と直し方を返す（1 回の上限）', () => {
    const p = planStoryVideo(ucOf(3), { inPerM: 5_000_000, outPerM: 5_000_000 }, usage());
    expect(p.ok).toBe(false);
    if (!p.ok) { expect(p.reason).toBe('budget'); expect(p.message).toContain('呼び出し 0 回'); expect(p.estimateYen).toBeGreaterThan(STORY_VIDEO_BUDGET_YEN); }
  });
  it('月の予算の残額が見積りより少ないときは、残額を示し、呼び出し 0 回で理由（月の予算）を返す', () => {
    const p = planStoryVideo(ucOf(3), { inPerM: 40000, outPerM: 40000 }, usage(99_900));
    expect(p.ok).toBe(false);
    if (!p.ok) { expect(p.reason).toBe('month'); expect(p.monthRemainingYen).toBe(100); expect(p.message).toContain('月の予算'); expect(p.limitYen).toBe(100); }
  });
  it('今月の概算費用が月の予算の停止の水準に達しているときも、呼び出し 0 回（月の予算）', () => {
    const p = planStoryVideo(ucOf(1), DEFAULT_PRICES, usage(100_000));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toBe('month');
  });
});

describe('FR-292 AC-783 実行中の制御と超過時の中止', () => {
  const mk = (o: { prices?: { inPerM: number; outPerM: number }; limit?: number; month?: number; replies?: CallResult[]; cancelAfter?: number } = {}) => {
    const prices = o.prices ?? DEFAULT_PRICES;
    const plan = planStoryVideo(ucOf(2), DEFAULT_PRICES, usage());
    if (!plan.ok) throw new Error('plan');
    const replies = [...(o.replies ?? [{ ok: true, scenes: SCENES, usage: { inputTokens: 500, outputTokens: 500 } }, { ok: true, html: GOOD_HTML, usage: { inputTokens: 500, outputTokens: 500 } }] as CallResult[])];
    const calls: string[] = [];
    const costs: number[] = [];
    const deps: RunDeps = {
      call: async (kind) => { calls.push(kind); return replies.shift() ?? { ok: false, cause: 'x', message: 'もう応答がない' }; },
      recordCost: (c) => { costs.push(c); },
      isCancelled: () => o.cancelAfter !== undefined && calls.length >= o.cancelAfter,
    };
    return { run: () => runStoryVideo({ payload: plan.payload, limits: plan.limits, limitYen: o.limit ?? plan.limitYen, monthRemainingYen: o.month ?? plan.monthRemainingYen, prices }, deps), calls, costs };
  };
  it('正常: ストーリーボード → アニメーションの 2 回で採用され、1 回ごとに費用が記録される', async () => {
    const t = mk();
    const r = await t.run();
    expect(r.status).toBe('done');
    expect(t.calls).toEqual(['storyboard', 'animation']);
    expect(t.costs).toHaveLength(2);
  });
  it('検査を通らない出力は、1 回だけ修復を試み、それでも通らなければ採用せずに失敗にする（呼び出しは最大回数を超えない）', async () => {
    const bad: CallResult = { ok: true, html: '<div><script>fetch("x")</script></div>', usage: { inputTokens: 1, outputTokens: 1 } };
    const t = mk({ replies: [{ ok: true, scenes: SCENES }, bad, bad, bad, bad] });
    const r = await t.run();
    expect(r.status).toBe('failed');
    expect(t.calls.length).toBeLessThanOrEqual(STORY_VIDEO_MAX_CALLS);
    if (r.status === 'failed') expect(r.message).toContain('fetch');
  });
  it('累計の概算費用が上限に達する応答で以後の呼び出しが 0 回になり、中止（上限到達）。途中の生成物は返さない', async () => {
    const t = mk({ limit: 1000, replies: [{ ok: true, scenes: SCENES, usage: { inputTokens: 2_000_000, outputTokens: 0 } }, { ok: true, html: GOOD_HTML }] });
    const r = await t.run();
    expect(r.status).toBe('aborted');
    expect(t.calls).toEqual(['storyboard']);
    if (r.status === 'aborted') { expect(r.reason).toBe('limit'); expect(r.message).toContain('上限'); expect(r.message).toContain('途中の生成物は採用していません'); expect(r).not.toHaveProperty('html'); }
  });
  it('月の予算の残額が尽きたときも中止され、理由は月の予算', async () => {
    const t = mk({ limit: 50, month: 50, replies: [{ ok: true, scenes: SCENES, usage: { inputTokens: 200_000, outputTokens: 0 } }] });
    const r = await t.run();
    expect(r.status).toBe('aborted');
    if (r.status === 'aborted') { expect(r.reason).toBe('month'); expect(r.message).toContain('月の予算'); }
  });
  it('利用者の中止の操作でも、以後の呼び出しが 0 回になる', async () => {
    const t = mk({ cancelAfter: 1 });
    const r = await t.run();
    expect(r.status).toBe('aborted');
    expect(t.calls).toEqual(['storyboard']);
    if (r.status === 'aborted') expect(r.reason).toBe('user');
  });
  it('失敗した呼び出しも、見積りの費用で数える（安全側）', async () => {
    const t = mk({ replies: [{ ok: false, cause: 'timeout', message: 'タイムアウト' }] });
    const r = await t.run();
    expect(r.status).toBe('failed');
    expect(t.costs).toHaveLength(1);
    expect(t.costs[0]).toBeGreaterThan(0);
  });
  it('作成の費用は月の概算費用（FR-276 の記録）に合算され、利用量の記録に入力の文章・生成結果は含まれない', () => {
    let u: Usage | null = null;
    const store: UsageStore = { get: () => u, set: (v) => { u = v; } };
    recordCall(store, new Date(2026, 9, 25), 12.5);
    recordCall(store, new Date(2026, 9, 25), 7.5);
    expect(currentUsage(store, new Date(2026, 9, 25)).costYen).toBe(20);
    let log: UsageLogEntry[] = [];
    appendUsageLog({ get: () => log, set: (v) => { log = v; } }, { date: '2026-10-25', calls: 2, inputTokens: 10, outputTokens: 20, costYen: 20, outcome: 'limit' });
    expect(Object.keys(log[0]!).sort()).toEqual(['calls', 'costYen', 'date', 'inputTokens', 'outcome', 'outputTokens']);
  });
});

// ---- 中継プロセス（FR-275 の共通接続。Foundry へは実接続せず、送信口はスタブ） ----
describe('FR-291 AC-780 中継プロセスの /foundry/story-video（条件が欠けると Foundry を呼ばない）', () => {
  const open: Relay[] = [];
  const dirs: string[] = [];
  afterEach(async () => { while (open.length) await open.pop()!.close(); while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });
  const KEY = 'dummy-sv-key-ZQ7X4-0123';
  async function setup() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-video-test-'));
    dirs.push(dir);
    const calls: string[] = [];
    const foundryVault = openFoundryVault(dir, { protector: fileProtector, restrict: () => {}, warn: () => {} });
    const relay = await startRelay({
      sdk: null, foundryVault, foundryTimeoutMs: 200,
      foundryFetch: (async (_u: string, i?: RequestInit) => {
        calls.push(String(i?.body ?? ''));
        const isBoard = String(i?.body ?? '').includes('脚本家');
        return new Response(JSON.stringify({ output_text: isBoard ? JSON.stringify({ scenes: SCENES }) : GOOD_HTML }), { status: 200 });
      }) as typeof fetch,
    });
    open.push(relay);
    return { calls, url: relay.url };
  }
  const post = (url: string, body: unknown) => fetch(`${url}/foundry/story-video`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const base = { packId: 'P', kind: 'storyboard', usecase: toPayload(ucOf(2)), consent: true, confirmed: true, includesPerson: false, personConfirmed: false, maxOutputTokens: 500 };

  it('未設定・未有効・了承なしは Foundry を呼ばず、有効にして設定するとシーンと HTML を返し、応答にキーを含めない', async () => {
    const { calls, url } = await setup();
    expect((await post(url, base)).status).toBe(403); // 未有効（未設定）
    await fetch(`${url}/foundry/config?packId=P`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: 'https://foundry.example.invalid/openai/v1', deployment: 'd', key: KEY }) });
    expect((await post(url, base)).status).toBe(403); // 未有効
    await fetch(`${url}/foundry/connection`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ packId: 'P', enable: true, consent: true, confirmed: true }) });
    expect((await post(url, { ...base, consent: false })).status).toBe(403);
    expect((await post(url, { ...base, includesPerson: true })).status).toBe(403);
    expect((await post(url, { ...base, confirmed: false })).status).toBe(400);
    expect(calls).toHaveLength(0);
    const ok = await post(url, base);
    expect(ok.status).toBe(200);
    const j = (await ok.json()) as { scenes: unknown[]; usage: { inputTokens: number } };
    expect(j.scenes).toHaveLength(1);
    expect(j.usage.inputTokens).toBeGreaterThan(0);
    const anim = await post(url, { ...base, kind: 'animation' });
    expect(((await anim.json()) as { html: string }).html).toContain('story-svg');
    expect(calls).toHaveLength(2);
    expect(calls.join('')).not.toContain(KEY);
    expect(calls.join('')).toContain('手順1');
  });
});
