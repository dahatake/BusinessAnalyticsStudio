// FR-274・FR-276・FR-277 「現状の説明」の単体・結合テスト（Foundry へは実接続せず、差し替え部品で確かめる）
// AC-700 AC-701 AC-708 AC-709 AC-710 AC-711 AC-714
import { describe, expect, it } from 'vitest';
import type { FoundryAskResult, FoundryView } from '../../src/ai/foundryClient';
import { buildFallback, buildPrompt, fitToTokens, parseAiExplanation, type ExplainSnapshot } from '../../src/explain/model';
import { DEFAULT_LIMITS, type ExplainLimits } from '../../src/explain/params';
import { newSession, runExplain, type ExplainDeps } from '../../src/explain/run';
import { emptyUsage, estimateTokens, isRaise, rollover, type UsageState } from '../../src/explain/usage';

const snap: ExplainSnapshot = {
  screenKey: 'issue-solution', screenLabel: '課題-解決策分析',
  issues: [{ id: 'I-1', title: '在庫の欠品' }, { id: 'I-2', title: '納期の遅れ' }],
  solutions: [{ id: 'S-1', title: '需要予測の導入', issueIds: ['I-1'] }, { id: 'S-2', title: '配送の見直し', issueIds: ['I-2'] }],
  krs: [{ id: 'KR-1', name: '欠品率を下げる', objective: '顧客満足', kpi: '欠品率', unit: '%', baseline: 8, current: 6, target: 3, solutionIds: ['S-1'] }],
};
const goodAnswer = JSON.stringify({
  issues: [{ id: 'I-1', summary: '欠品が起きている' }],
  solutions: [{ id: 'S-1', issueIds: ['I-1'], contributions: [{ krId: 'KR-1', size: '大', basis: 'S-1 需要予測の導入 は 欠品率 に効く', estimate: true }] }],
});
const view: FoundryView = { configured: true, endpoint: 'https://x.invalid/', host: 'x.invalid', deployment: 'd', keyMask: '••••', enabled: true };
const NOW = new Date(2026, 9, 22, 12, 0, 0);

function setup(o: { view?: FoundryView | null; consent?: boolean; answer?: FoundryAskResult; limits?: Partial<ExplainLimits>; usage?: UsageState; now?: Date } = {}) {
  let usage = o.usage ?? emptyUsage(NOW);
  const calls: Array<{ prompt: string; consent: boolean; maxOutputTokens: number }> = [];
  let now = o.now ?? NOW;
  const deps: ExplainDeps = {
    now: () => now,
    limits: () => ({ ...DEFAULT_LIMITS, ...o.limits }),
    usage: { get: () => usage, set: (u) => { usage = u; } },
    consent: o.consent ?? true,
    fetchView: async () => (o.view === undefined ? view : o.view),
    ask: async (req) => { calls.push(req); return o.answer ?? { mode: 'connected', answer: goodAnswer }; },
  };
  return { deps, calls, session: newSession(), usage: () => usage, setNow: (d: Date) => { now = d; } };
}

describe('FR-274 AC-700 AI の出力の検証', () => {
  it('表示中の項目だけを参照し、根拠の引用がある出力は「AI 生成」として採用される', async () => {
    const t = setup();
    const r = await runExplain(t.deps, t.session, snap);
    expect(r.kind).toBe('ai');
    if (r.kind === 'ai') expect(r.text).toMatch(/【課題】[\s\S]*【解決策と KPI\/OKR への寄与の見込み】[\s\S]*KR-1/);
    expect(t.calls).toHaveLength(1);
  });
  it('入力の依頼には画面の名前・ID だけが入り、表示にない項目は含まれない', () => {
    const p = buildPrompt(snap);
    expect(p).toContain('I-1');
    expect(p).not.toContain('I-9');
  });
  it.each([
    ['表示にない課題', { issues: [{ id: 'I-9', summary: 'x' }], solutions: [] }],
    ['表示にない解決策', { issues: [], solutions: [{ id: 'S-9', issueIds: ['I-1'], contributions: [] }] }],
    ['表示にない課題を参照する解決策', { issues: [], solutions: [{ id: 'S-1', issueIds: ['I-9'], contributions: [] }] }],
    ['表示にない KPI/OKR', { issues: [], solutions: [{ id: 'S-1', issueIds: ['I-1'], contributions: [{ krId: 'KR-9', size: '大', basis: 'S-1' }] }] }],
    ['根拠の引用がない寄与', { issues: [], solutions: [{ id: 'S-1', issueIds: ['I-1'], contributions: [{ krId: 'KR-1', size: '大', basis: '多分効く' }] }] }],
  ])('%s を参照した出力は採用されず、代替説明に退避する', async (_n, out) => {
    const t = setup({ answer: { mode: 'connected', answer: JSON.stringify(out) } });
    const r = await runExplain(t.deps, t.session, snap);
    expect(r.kind).toBe('fallback');
    if (r.kind === 'fallback') expect(r.reason).toBe('invalid');
  });
  it('JSON でない出力も採用されない', () => {
    expect(parseAiExplanation('ただの文章', snap).ok).toBe(false);
  });
});

describe('FR-274 AC-701 読み取り専用・FR-277 AC-713 外部への呼び出し', () => {
  it('説明の生成は入力（顧客パック相当）を変えず、書き込みは利用量だけ', async () => {
    const before = JSON.stringify(snap);
    const t = setup();
    await runExplain(t.deps, t.session, snap);
    expect(JSON.stringify(snap)).toBe(before);
    expect(Object.keys(t.usage()).sort()).toEqual(['costYen', 'count', 'day', 'inputTokens', 'month', 'outputTokens']);
  });
  it('生成中の二重の呼び出しをしない', async () => {
    const t = setup();
    let release: (v: FoundryAskResult) => void = () => {};
    t.deps.ask = (req) => { t.calls.push(req); return new Promise((res) => { release = res; }); };
    const first = runExplain(t.deps, t.session, snap);
    await new Promise((r) => setTimeout(r, 0));
    const second = await runExplain(t.deps, t.session, snap);
    expect(second.kind).toBe('busy');
    release({ mode: 'connected', answer: goodAnswer });
    await first;
    expect(t.calls).toHaveLength(1);
  });
  it('中止できる', async () => {
    const t = setup();
    t.deps.ask = () => new Promise(() => {});
    const ctl = new AbortController();
    const p = runExplain(t.deps, t.session, snap, ctl.signal);
    await new Promise((r) => setTimeout(r, 0));
    ctl.abort();
    expect((await p).kind).toBe('cancelled');
    expect(t.session.inFlight).toBe(false);
  });
});

describe('FR-277 AC-714 代替の説明', () => {
  it('同じ入力から同じ文で、表示中の ID・名前だけを参照し、AI 生成のラベル相当を含まない', () => {
    const a = buildFallback(snap);
    expect(buildFallback(snap)).toBe(a);
    expect(a).toContain('AI 生成ではない');
    for (const id of a.match(/\b(?:I|S|KR)-\d+\b/g) ?? []) expect(['I-1', 'I-2', 'S-1', 'S-2', 'KR-1']).toContain(id);
    expect(a).toContain('欠品率を下げる');
  });
  it.each([
    ['consent', { consent: false }, '了承'],
    ['relay', { view: null }, '中継プロセス'],
    ['not-configured', { view: { ...view, configured: false } }, '未設定'],
    ['disabled', { view: { ...view, enabled: false } }, '有効になっていません'],
    ['error', { answer: { mode: 'unavailable', reason: 'error', message: 'x' } as FoundryAskResult }, '失敗'],
    ['timeout', { answer: { mode: 'unavailable', reason: 'timeout', message: 'x' } as FoundryAskResult }, 'タイムアウト'],
  ])('使えない理由 %s ごとに理由の文言が替わり、外部の呼び出しは AI が使えない設定では 0 回', async (reason, o, word) => {
    const t = setup(o);
    const r = await runExplain(t.deps, t.session, snap);
    expect(r.kind).toBe('fallback');
    if (r.kind === 'fallback') { expect(r.reason).toBe(reason); expect(r.reasonText).toContain(word); expect(r.text).toBe(buildFallback(snap)); }
    if (['consent', 'relay', 'not-configured', 'disabled'].includes(reason)) expect(t.calls).toHaveLength(0);
  });
});

describe('FR-276 課金の安全策', () => {
  // AC-708
  it('AC-708 1 日の上限に達した後は呼び出しが 0 回で、理由と再開の時刻が出て、日付が替わるとリセットされ、失敗も数える', async () => {
    const t = setup({ limits: { dailyLimit: 2, minIntervalSec: 0 }, answer: { mode: 'unavailable', reason: 'error', message: 'x' } });
    await runExplain(t.deps, t.session, snap);
    await runExplain(t.deps, t.session, snap);
    expect(t.calls).toHaveLength(2); // 失敗した呼び出しも数える
    expect(t.usage().count).toBe(2);
    const r = await runExplain(t.deps, t.session, snap);
    expect(t.calls).toHaveLength(2);
    expect(r.kind).toBe('fallback');
    if (r.kind === 'fallback') { expect(r.reason).toBe('daily-limit'); expect(r.reasonText).toContain('2026-10-23 00:00'); }
    t.setNow(new Date(2026, 9, 23, 0, 0, 0));
    await runExplain(t.deps, t.session, snap);
    expect(t.calls).toHaveLength(3);
    expect(t.usage().count).toBe(1);
  });
  // AC-709
  it('AC-709 入力は上限以下に切り詰められて切り詰めた旨が返り、出力の上限が指定される', async () => {
    const big: ExplainSnapshot = { ...snap, issues: Array.from({ length: 400 }, (_, i) => ({ id: `I-${i}`, title: `課題の名前 ${i} `.repeat(3) })) };
    const t = setup({ limits: { inputMaxTokens: 500 } });
    const r = await runExplain(t.deps, t.session, big);
    expect(t.calls[0]!.maxOutputTokens).toBe(DEFAULT_LIMITS.outputMaxTokens);
    expect(estimateTokens(t.calls[0]!.prompt)).toBeLessThanOrEqual(500);
    expect(r.kind === 'fallback' || r.kind === 'ai').toBe(true);
    if (r.kind === 'fallback' || r.kind === 'ai') expect(r.truncated).toBe(true);
    expect(fitToTokens(snap, 8000).truncated).toBe(false);
  });
  // AC-710
  it('AC-710 最小の間隔に満たない再押下は呼び出しが 0 回で待ち時間が出る', async () => {
    const t = setup();
    await runExplain(t.deps, t.session, snap);
    t.setNow(new Date(NOW.getTime() + 2000));
    const r = await runExplain(t.deps, t.session, snap);
    expect(r.kind).toBe('wait');
    if (r.kind === 'wait') expect(r.waitSec).toBe(3);
    expect(t.calls).toHaveLength(1);
    t.setNow(new Date(NOW.getTime() + 5000));
    await runExplain(t.deps, t.session, snap);
    expect(t.calls).toHaveLength(2);
  });
  // AC-711
  it('AC-711 予算の警告の割合で警告が出て、停止の割合で呼び出しが 0 回になり、記録に文章・結果・キーがない', async () => {
    // 1 回の概算を 4.1 円（予算 10 円の 41%）にして、2 回目の呼び出しで警告（82%）、3 回目の後に停止（123%）
    const t = setup({ limits: { budgetYen: 10, unitYenPerMInput: 0, unitYenPerMOutput: (4.1 / DEFAULT_LIMITS.outputMaxTokens) * 1_000_000, minIntervalSec: 0 } });
    const r1 = await runExplain(t.deps, t.session, snap);
    const r2 = await runExplain(t.deps, t.session, snap);
    expect('warning' in r1 && r1.warning).toBeFalsy();
    expect('warning' in r2 && r2.warning).toContain('80%');
    const r3 = await runExplain(t.deps, t.session, snap);
    expect(t.calls).toHaveLength(3);
    const r4 = await runExplain(t.deps, t.session, snap);
    expect(t.calls).toHaveLength(3);
    expect(r4.kind === 'fallback' && r4.reason).toBe('budget');
    void r3;
    const rec = JSON.stringify(t.usage());
    expect(rec).not.toContain('在庫の欠品');
    expect(rec).not.toContain('KR-1');
    expect(rec).not.toMatch(/key|キー/i);
  });
  it('月が替わると概算費用がリセットされる', () => {
    const u: UsageState = { day: '2026-10-31', count: 5, month: '2026-10', inputTokens: 1, outputTokens: 2, costYen: 99 };
    const r = rollover(u, new Date(2026, 10, 1, 0, 0, 0));
    expect(r).toMatchObject({ day: '2026-11-01', count: 0, month: '2026-11', costYen: 0 });
  });
  it('上限・予算を上げる変更だけが「上げる」と判定される', () => {
    expect(isRaise(DEFAULT_LIMITS, { ...DEFAULT_LIMITS, dailyLimit: 31 })).toBe(true);
    expect(isRaise(DEFAULT_LIMITS, { ...DEFAULT_LIMITS, budgetYen: 200000 })).toBe(true);
    expect(isRaise(DEFAULT_LIMITS, { ...DEFAULT_LIMITS, dailyLimit: 10, budgetYen: 5 })).toBe(false);
    expect(isRaise(DEFAULT_LIMITS, { ...DEFAULT_LIMITS, unitYenPerMInput: 1 })).toBe(false);
  });
});

// FR-275 AC-706: selected-provider explanation may not bypass the existing person confirmation.
describe('FR-275 AC-706 explanation person confirmation', () => {
  it('FR-275 AC-706 without person confirmation there are zero generation calls; explicit confirmation forwards flags', async () => {
    const t = setup(); t.deps.includesPerson = true;
    expect(await runExplain(t.deps,t.session,snap)).toMatchObject({kind:'fallback',reason:'person-unconfirmed'});expect(t.calls).toHaveLength(0);
    t.deps.confirmPerson = async () => ({allowed:false});await runExplain(t.deps,t.session,snap);expect(t.calls).toHaveLength(0);
    t.deps.confirmPerson = async () => ({allowed:true});await runExplain(t.deps,t.session,snap);expect(t.calls[0]).toMatchObject({includesPerson:true,personConfirmed:true});
  });
});
