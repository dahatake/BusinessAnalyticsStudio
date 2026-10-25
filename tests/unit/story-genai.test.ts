// FR-290 プレゼンテーションの生成 AI によるストーリーの作成（単体: 材料・切り詰め・応答の解釈・数値の照合・重ね合わせ。
// 結合: 中継プロセス（POST /foundry/ask。生成 AI の送信口はスタブ）を通した 1 回分の流れ）。AC-775 は System Test E2E-444。
// 生成 AI へは実接続しない。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startRelay, type Relay } from '../../scripts/relay/relay';
import { openFoundryVault } from '../../scripts/relay/foundry-vault';
import { fileProtector } from '../../scripts/relay/speech-vault';
import { askFoundry, fetchFoundryView, putFoundryConfig, setFoundryConnection } from '../../src/ai/foundryClient';
import { KIND_PRESENTATION, SEND_KINDS, missingSendKinds } from '../../src/ai/sendKinds';
import { DEFAULT_LIMITS, type ExplainLimits } from '../../src/explain/params';
import { emptyUsage, type UsageState } from '../../src/explain/usage';
import { DATA_SCHEMAS, type PackData } from '../../src/schema';
import {
  STORY_GENAI_MAX_OUTPUT_TOKENS, STORY_GENAI_TIMEOUT_SEC, buildStoryMaterials, buildStoryPrompt, composeGenaiStory, filterSentences,
  allowedNumbers, parseGenaiScenes, renderMaterials,
} from '../../src/story/genai';
import { STORY_REASON_TEXT, newStorySession, runStoryGenai, type StoryGenaiDeps } from '../../src/story/genaiRun';
import { buildStory, type StoryInput } from '../../src/story/model';
import { demoUseCases } from '../../src/usecase/demo';

function loadPack(): PackData {
  const root = path.resolve(__dirname, '../../examples', 'mono', 'public');
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(DATA_SCHEMAS)) out[name] = schema.parse(JSON.parse(fs.readFileSync(path.join(root, 'data', `${name}.json`), 'utf8')));
  return out as PackData;
}
const pack = loadPack();
const input: StoryInput = {
  persona: '経営層', issues: pack.issues.issues, solutions: pack.issues.solutions, products: pack.products.products,
  customer: pack.customer as never, useCases: demoUseCases(pack.customer as never, pack.issues.solutions), weights: { impact: 1, feasibility: 1, urgency: 1 } as never,
};
const chapters = pack.show.chapters.map((c) => ({ title: c.title, topics: c.topics.map((t) => ({ title: t.title })) }));
const materials = buildStoryMaterials(input, chapters);
const base = buildStory(input);

const reply = (scenes: unknown) => JSON.stringify({ scenes });
const GOOD = reply([1, 2, 3, 4].map((p) => ({ part: p, heading: `生成の見出し${'ABCD'[p - 1]}`, narration: `生成の語り${'ABCD'[p - 1]}です。` })));

const KEY = 'dummy-foundry-key-0123456789';
const EP = 'https://foundry.example.invalid/openai/v1';
const open: Relay[] = [];
const dirs: string[] = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

type Reply = (signal?: AbortSignal | null) => Response | Promise<Response>;
async function setup(opt: { reply?: Reply; configure?: boolean; enable?: boolean; timeoutMs?: number } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-genai-'));
  dirs.push(dir);
  const bodies: Array<Record<string, unknown>> = [];
  const foundryVault = openFoundryVault(dir, { protector: fileProtector, restrict: () => {}, warn: () => {} });
  const r = opt.reply ?? (() => new Response(JSON.stringify({ output_text: GOOD }), { status: 200 }));
  const relay = await startRelay({
    sdk: null, foundryVault, foundryTimeoutMs: opt.timeoutMs,
    foundryFetch: (async (_u: string, i?: RequestInit) => { bodies.push(JSON.parse(String(i?.body ?? '{}'))); return r(i?.signal); }) as typeof fetch,
  });
  open.push(relay);
  if (opt.configure !== false) expect((await putFoundryConfig(relay.url, 'P', { endpoint: EP, deployment: 'dep1', key: KEY })).ok).toBe(true);
  if (opt.configure !== false && opt.enable !== false) expect((await setFoundryConnection(relay.url, 'P', true, { consent: true, confirmed: true })).mode).toBe('connected');
  return { bodies, url: relay.url };
}

const NOW = new Date(2026, 9, 25, 12, 0, 0);
function deps(url: string, opt: Partial<Omit<StoryGenaiDeps, 'limits'>> & { limits?: ExplainLimits; usage0?: UsageState } = {}) {
  const { limits, usage0, ...o } = opt;
  let usage = usage0 ?? emptyUsage(NOW);
  const d: StoryGenaiDeps = {
    now: () => NOW,
    limits: () => limits ?? DEFAULT_LIMITS,
    usage: { get: () => usage, set: (s) => { usage = s; } },
    consent: true,
    fetchView: () => fetchFoundryView(url, 'P'),
    confirmedKinds: () => SEND_KINDS.map((k) => k.id),
    ask: (req, sig) => askFoundry(url, { packId: 'P', ...req }, undefined, sig),
    ...o,
  };
  return { d, usage: () => usage };
}
/** 生成 AI に送った入力の文（Responses API の input） */
const sentText = (b: Record<string, unknown>): string => (typeof b.input === 'string' ? b.input : JSON.stringify(b.input));

describe('FR-290 AC-776 材料・切り詰め・応答の解釈・数値の照合（単体）', () => {
  it('FR-290 AC-776 材料は選んだペルソナと FR-179 の材料（解決策・優先順位・ROI・コスト・KPI/OKR・ユースケース・番組構成）だけ', () => {
    const text = renderMaterials(materials);
    expect(text).toContain('ペルソナ: 経営層');
    expect(materials.solutions.length).toBeGreaterThan(0);
    for (const s of materials.solutions) expect(text).toContain(s.title);
    expect(text).toContain('第 1 位');
    expect(text).toContain('KPI/OKR');
    expect(text).toContain('番組構成');
    // ほかの企業・顧客の識別情報（連絡先など）は入れない
    expect(text).not.toContain(pack.customer.name === '' ? '\u0000' : '@');
  });
  it('FR-290 AC-776 上限を超えると 番組構成 → ユースケースの説明 → ROI・コスト の順に省き、上限以下にして切り詰めた印を付ける', () => {
    const full = buildStoryPrompt(materials, 100000);
    expect(full.truncated).toBe(false);
    expect(full.prompt).toContain('番組構成');
    const noProgram = buildStoryPrompt(materials, full.tokens - 1);
    expect(noProgram.truncated).toBe(true);
    expect(noProgram.tokens).toBeLessThanOrEqual(full.tokens - 1);
    expect(noProgram.prompt).not.toContain('番組構成:');
    const tiny = buildStoryPrompt(materials, 50);
    expect(tiny.truncated).toBe(true);
    expect(tiny.tokens).toBeLessThanOrEqual(50);
  });
  it('FR-290 AC-776 応答は JSON の scenes（コードフェンスつきでもよい）。形が違えば採用しない', () => {
    expect(parseGenaiScenes('```json\n' + GOOD + '\n```')?.length).toBe(4);
    expect(parseGenaiScenes('ただの文章')).toBeNull();
    expect(parseGenaiScenes(reply([{ part: 9, heading: 'x', narration: 'y' }]))).toBeNull();
  });
  it('FR-290 AC-776 材料にない数値を含む文は除き、材料にある数値の文は残す', () => {
    const allowed = allowedNumbers('ROI 120 %、目標 3.5 件');
    const r = filterSentences('ROI は 120 % です。売上が 999 億円増えます。目標は３.５件です。', allowed);
    expect(r.kept).toEqual(['ROI は 120 % です。', '目標は３.５件です。']);
    expect(r.removed).toBe(1);
  });
  it('FR-290 AC-776 生成 AI が材料と違う名称・数値を返しても、名称・数値の欄は材料の値のまま。材料にない数値の文は表示せず件数を示す', () => {
    const gen = parseGenaiScenes(reply([
      { part: 1, heading: '架空ソリューション X で 777 億円', narration: '架空の解決策です。効果は 12345 件です。' },
      { part: 3, heading: 'KPI の話', narration: 'KPI を確かめます。' },
    ]))!;
    const { scenes, removed } = composeGenaiStory(base, gen, renderMaterials(materials));
    const p1 = scenes.find((s) => s.part === 1)!;
    const b1 = base.find((s) => s.part === 1)!;
    expect(p1.kicker).toBe(b1.kicker);
    expect(p1.big).toEqual(b1.big);
    expect(p1.lines).toEqual(b1.lines);
    expect(p1.aiHeading).toBeUndefined(); // 見出しに材料にない数値 → 表示しない
    expect(p1.narration).toEqual(['架空の解決策です。']);
    expect(p1.removedSentences).toBe(2);
    expect(removed).toBe(2);
    expect(scenes.find((s) => s.part === 3)!.aiHeading).toBe('KPI の話');
    expect(scenes.map((s) => s.part)).toEqual(base.map((s) => s.part));
  });
  it('FR-290 AC-777 送信情報の種類に FR-290 の材料が含まれないときは、増えた種類を返す', () => {
    expect(missingSendKinds(['screen', 'chat'], [KIND_PRESENTATION]).map((k) => k.id)).toEqual([KIND_PRESENTATION]);
    expect(missingSendKinds(SEND_KINDS.map((k) => k.id), [KIND_PRESENTATION])).toEqual([]);
    expect(SEND_KINDS.find((k) => k.id === KIND_PRESENTATION)!.label).toMatch(/ペルソナ.*解決策.*優先順位.*ROI.*コスト.*KPI\/OKR.*ユースケース.*番組構成/);
  });
});

describe('FR-290 中継（POST /foundry/ask）を通した作成（結合。生成 AI はスタブ）', () => {
  it('FR-290 AC-776 送る入力は材料だけで、出力の上限 PARAM-132 を依頼し、AI 生成のストーリーは①〜④の順', async () => {
    const { bodies, url } = await setup();
    const { d, usage } = deps(url);
    const out = await runStoryGenai(d, newStorySession(), materials, base);
    expect(out.kind).toBe('ai');
    if (out.kind !== 'ai') return;
    expect(bodies).toHaveLength(1);
    const sent = sentText(bodies[0]!);
    expect(sent).toContain('ペルソナ: 経営層');
    for (const s of materials.solutions) expect(sent).toContain(s.title);
    for (const s of pack.sources.sources.slice(0, 5)) expect(sent).not.toContain(s.title);
    expect(bodies[0]!.max_output_tokens).toBe(STORY_GENAI_MAX_OUTPUT_TOKENS);
    expect(STORY_GENAI_MAX_OUTPUT_TOKENS).toBe(4000);
    expect(out.provider).toBe('foundry');
    const firsts = [1, 2, 3, 4].map((p) => out.scenes.findIndex((s) => s.part === p));
    expect(firsts.every((i) => i >= 0)).toBe(true);
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
    expect(out.scenes.some((s) => s.aiHeading === '生成の見出しA')).toBe(true);
    expect(out.scenes.some((s) => s.narration?.includes('生成の語りDです。'))).toBe(true);
    // 利用量は共通の記録に合算（1 回、出力は上限分を見込む）
    expect(usage().count).toBe(1);
    expect(usage().outputTokens).toBe(STORY_GENAI_MAX_OUTPUT_TOKENS);
  });
  it('FR-290 AC-776 材料が PARAM-114 を超えるとき、送る入力は上限以下に切り詰められ、切り詰めた印が付く', async () => {
    const { bodies, url } = await setup();
    const limit = buildStoryPrompt(materials, 100000).tokens - 1;
    const { d } = deps(url, { limits: { ...DEFAULT_LIMITS, inputMaxTokens: limit } });
    const out = await runStoryGenai(d, newStorySession(), materials, base);
    expect(out.kind === 'ai' && out.truncated).toBe(true);
    expect(Math.ceil(sentText(bodies[0]!).length / 4)).toBeLessThanOrEqual(limit + 2);
  });
  it('FR-290 AC-777 了承の記録がない・実接続が無効・接続情報が未設定のときは呼び出し 0 回で理由を返す', async () => {
    const a = await setup();
    expect((await runStoryGenai(deps(a.url, { consent: false }).d, newStorySession(), materials, base))).toMatchObject({ kind: 'unavailable', reason: 'consent' });
    const b = await setup({ enable: false });
    expect((await runStoryGenai(deps(b.url).d, newStorySession(), materials, base))).toMatchObject({ kind: 'unavailable', reason: 'disabled' });
    const c = await setup({ configure: false });
    expect((await runStoryGenai(deps(c.url).d, newStorySession(), materials, base))).toMatchObject({ kind: 'unavailable', reason: 'not-configured' });
    expect(a.bodies.length + b.bodies.length + c.bodies.length).toBe(0);
    for (const r of ['consent', 'disabled', 'not-configured'] as const) expect(STORY_REASON_TEXT[r]).toMatch(/了承|有効|接続/);
  });
  it('FR-290 AC-777 送信情報の種類に材料が含まれない有効化の状態では再確認を返し、確認するまで呼ばない', async () => {
    const { bodies, url } = await setup();
    let kinds: string[] = ['screen', 'genai-scenario', 'chat'];
    const { d } = deps(url, { confirmedKinds: () => kinds });
    const out = await runStoryGenai(d, newStorySession(), materials, base);
    expect(out).toMatchObject({ kind: 'reconfirm' });
    if (out.kind === 'reconfirm') expect(out.added.map((k) => k.id)).toEqual([KIND_PRESENTATION]);
    expect(bodies).toHaveLength(0);
    kinds = SEND_KINDS.map((k) => k.id);
    expect((await runStoryGenai(d, newStorySession(), materials, base)).kind).toBe('ai');
    expect(bodies).toHaveLength(1);
  });
  it('FR-290 AC-777 前回の開始から PARAM-116 秒未満の再選択は呼ばずに待ち時間を返す。1 日の上限に達したら呼ばない', async () => {
    const { bodies, url } = await setup();
    const session = newStorySession();
    const { d } = deps(url);
    expect((await runStoryGenai(d, session, materials, base)).kind).toBe('ai');
    const again = await runStoryGenai(d, session, materials, base);
    expect(again).toMatchObject({ kind: 'wait', waitSec: 5 });
    expect(bodies).toHaveLength(1);
    const full = { ...emptyUsage(NOW), count: DEFAULT_LIMITS.dailyLimit };
    expect(await runStoryGenai(deps(url, { usage0: full }).d, newStorySession(), materials, base)).toMatchObject({ kind: 'unavailable', reason: 'daily-limit' });
    expect(bodies).toHaveLength(1);
  });
  it('FR-290 AC-777 エラー・PARAM-127 秒の超過は打ち切って理由（キーを含まない）を返す', async () => {
    const e = await setup({ reply: () => new Response(`bad ${KEY}`, { status: 500 }) });
    const r1 = await runStoryGenai(deps(e.url).d, newStorySession(), materials, base);
    expect(r1).toMatchObject({ kind: 'unavailable', reason: 'error' });
    expect(JSON.stringify(r1)).not.toContain(KEY);
    expect(STORY_GENAI_TIMEOUT_SEC).toBe(90);
    const hang: Reply = (signal) => new Promise((_res, rej) => { signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))); });
    const t = await setup({ reply: hang, timeoutMs: 5_000 });
    const r2 = await runStoryGenai(deps(t.url, { timeoutSec: 0.2 }).d, newStorySession(), materials, base);
    expect(r2).toMatchObject({ kind: 'unavailable', reason: 'timeout' });
    expect((r2 as { reasonText: string }).reasonText).not.toContain(KEY);
  });
  it('FR-290 AC-777 作成中に取り消すと応答を待たずに取り消しを返す', async () => {
    let release: (() => void) | null = null;
    const slow: Reply = () => new Promise((res) => { release = () => res(new Response(JSON.stringify({ output_text: GOOD }), { status: 200 })); });
    const { url } = await setup({ reply: slow, timeoutMs: 5_000 });
    const ctl = new AbortController();
    const session = newStorySession();
    const p = runStoryGenai(deps(url).d, session, materials, base, ctl.signal);
    await new Promise((r) => setTimeout(r, 100));
    expect(session.inFlight).toBe(true);
    ctl.abort();
    expect(await p).toEqual({ kind: 'cancelled' });
    expect(session.inFlight).toBe(false);
    (release as (() => void) | null)?.();
  });
});
