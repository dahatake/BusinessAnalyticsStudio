// @vitest-environment jsdom
// FR-290「生成 AI で作成」の画面（結合: StoryHost・ストア・中継のクライアント。中継への fetch はスタブ）と、FR-179 AC-362（選ばずに開始すると外部へ送らない）。
// AC-775 は System Test E2E-444。生成 AI へは実接続しない。
import fs from 'node:fs';
import path from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DATA_SCHEMAS, type PackData } from '../../src/schema';
import { StoryHost } from '../../src/story/StoryHost';
import { usePackStore } from '../../src/store/pack';
import { usePresentationStore } from '../../src/store/presentation';
import { useStoryStore } from '../../src/store/story';
import { useAnimation } from '../../src/store/animation';
import { resetProjects, useProjects } from '../../src/store/projects';
import { useUseCases } from '../../src/store/usecases';
import { useConsentStore } from '../../src/ai/useConsent';
import { consentKeyOf } from '../../src/ai/consent';
import { setFoundryConnection } from '../../src/ai/foundryClient';
import { KIND_PRESENTATION, SEND_KINDS, confirmedSendKinds, recordConfirmedSendKinds } from '../../src/ai/sendKinds';

function loadPack(): PackData {
  const root = path.resolve(__dirname, '../../examples', 'mono', 'public');
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(DATA_SCHEMAS)) out[name] = schema.parse(JSON.parse(fs.readFileSync(path.join(root, 'data', `${name}.json`), 'utf8')));
  // 種別「人」の確認は別の要求（FR-182）の範囲。ここでは「人」を含まないパックにする
  const data = out as PackData;
  return { ...data, entities: { ...data.entities, entities: data.entities.entities.filter((e) => e.kind !== 'person') } };
}
const RELAY = 'http://127.0.0.1:8787';
const GOOD = JSON.stringify({ scenes: [1, 2, 3, 4].map((p) => ({ part: p, heading: `UI見出し${p === 1 ? 'A' : 'B'}`, narration: `UI語り${p === 1 ? 'A' : 'B'}です。` })) });

type Handler = (url: string, init?: RequestInit) => Promise<Response>;
let calls: Array<{ url: string; body?: string }> = [];
let askHandler: Handler;
let view = { configured: true, enabled: true, provider: 'foundry' as 'foundry' | 'copilot' };
// 作成の最小の間隔（PARAM-116）はテストどうしで持ち越さない（各テストの時刻を 1 分ずつ進める。Date だけを差し替える）
let clock = new Date(2026, 9, 25, 9, 0, 0).getTime();

describe('FR-290 「生成 AI で作成」の画面', () => {
  const pack = loadPack();
  const packId = pack.customer.name;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    clock += 60_000;
    vi.setSystemTime(clock);
    localStorage.clear();
    resetProjects(); useUseCases.getState().reset();
    usePackStore.setState({ runtime: { relayUrl: RELAY }, state: { status: 'ready', pack: { data: pack, issues: [] } as never, warnings: [] } });
    usePresentationStore.getState().end();
    useStoryStore.getState().reset();
    useAnimation.setState({ playing: false, choice: null });
    useConsentStore.setState({ records: {} });
    view = { configured: true, enabled: true, provider: 'foundry' };
    calls = [];
    askHandler = async () => new Response(JSON.stringify({ answer: GOOD, mode: 'connected' }), { status: 200 });
    vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
      calls.push({ url: String(u), body: init?.body ? String(init.body) : undefined });
      if (String(u).includes('/foundry/config')) return new Response(JSON.stringify({ ...view, endpoint: '', host: '', deployment: '', keyMask: '' }), { status: 200 });
      if (String(u).includes('/foundry/ask')) return askHandler(String(u), init);
      if (String(u).includes('/foundry/connection')) return new Response(JSON.stringify({ mode: 'connected' }), { status: 200 });
      return new Response('{}', { status: 404 });
    }));
    Element.prototype.requestFullscreen = vi.fn(() => Promise.resolve());
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  const consent = () => { useConsentStore.getState().save(consentKeyOf(pack.customer.name, pack.customer.projectName), '2026-10-25', '社内の検証で了承'); };
  const open = () => {
    usePresentationStore.getState().start([{ id: 't1', title: '議題', chapterId: 'c', chapterTitle: '章', chapterIndex: 0 }]);
    render(<FluentProvider theme={webLightTheme}><StoryHost /></FluentProvider>);
    act(() => useStoryStore.getState().openPicker());
  };
  const asks = () => calls.filter((c) => c.url.includes('/foundry/ask'));

  // FR-179 AC-362 / FR-290 AC-777: 選ばずに開始したときは生成 AI を呼ばない（外部への通信なし）
  it('FR-179 AC-362 FR-290 AC-777 「生成 AI で作成」は既定で選ばれておらず、選ばずに開始すると外部への通信は 0 回で FR-179 のストーリーが始まる', () => {
    open();
    const opt = screen.getByRole('checkbox', { name: '生成 AI で作成' });
    expect((opt as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '経営層' }));
    expect(screen.getByTestId('story-scene')).toBeTruthy();
    expect(screen.queryByText('AI 生成')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('FR-290 AC-777 了承の記録がないときは呼び出し 0 回で理由と「生成 AI を使わずに開始」を示し、それで FR-179 のストーリーが始まる', async () => {
    open();
    fireEvent.click(screen.getByRole('checkbox', { name: '生成 AI で作成' }));
    fireEvent.click(screen.getByRole('button', { name: '経営層' }));
    const err = await screen.findByTestId('story-genai-error');
    expect(err.textContent).toMatch(/了承/);
    fireEvent.click(screen.getByRole('button', { name: '生成 AI を使わずに開始' }));
    expect(screen.getByTestId('story-scene')).toBeTruthy();
    expect(screen.queryByText('AI 生成')).toBeNull();
    expect(asks()).toHaveLength(0);
  });

  it('FR-290 AC-777 実接続が無効のときは呼び出し 0 回で理由（有効）を示す', async () => {
    consent(); view.enabled = false;
    open();
    fireEvent.click(screen.getByRole('checkbox', { name: '生成 AI で作成' }));
    fireEvent.click(screen.getByRole('button', { name: '経営層' }));
    expect((await screen.findByTestId('story-genai-error')).textContent).toMatch(/有効/);
    expect(asks()).toHaveLength(0);
  });

  it('FR-290 AC-775 AC-776 条件がそろえば作成中を示し、生成 AI の見出し・語りと「AI 生成」・接続先の名前つきでストーリーが始まる。依頼の出力の上限は PARAM-132', async () => {
    consent(); recordConfirmedSendKinds(packId); view.provider = 'copilot';
    let release: () => void = () => {};
    askHandler = () => new Promise((res) => { release = () => res(new Response(JSON.stringify({ answer: GOOD, mode: 'connected' }), { status: 200 })); });
    open();
    fireEvent.click(screen.getByRole('checkbox', { name: '生成 AI で作成' }));
    fireEvent.click(screen.getByRole('button', { name: '経営層' }));
    await screen.findByTestId('story-generating');
    await waitFor(() => expect(asks()).toHaveLength(1));
    expect(JSON.parse(asks()[0]!.body!)).toMatchObject({ packId, consent: true, maxOutputTokens: 4000 });
    await act(async () => { release(); });
    const story = await screen.findByTestId('story');
    expect(story.textContent).toContain('AI 生成');
    expect(story.textContent).toContain('GitHub Copilot SDK');
    expect(screen.getByTestId('story-scene').textContent).toContain('UI見出しA');
    expect(screen.getByTestId('story-scene').textContent).toContain('UI語りAです。');
    expect(screen.queryByTestId('story-generating')).toBeNull();
  });

  it('FR-290 AC-777 作成中に取り消すと開始前に戻り、後から応答が届いてもストーリーは表示されない', async () => {
    consent(); recordConfirmedSendKinds(packId);
    let release: () => void = () => {};
    askHandler = () => new Promise((res) => { release = () => res(new Response(JSON.stringify({ answer: GOOD, mode: 'connected' }), { status: 200 })); });
    open();
    fireEvent.click(screen.getByRole('checkbox', { name: '生成 AI で作成' }));
    fireEvent.click(screen.getByRole('button', { name: '経営層' }));
    await waitFor(() => expect(asks()).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: '取り消す' }));
    expect(screen.queryByTestId('story-generating')).toBeNull();
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.queryByTestId('story')).toBeNull();
    expect(useStoryStore.getState().persona).toBeNull();
  });

  it('FR-290 AC-777 確認した送信情報の種類に材料が含まれなければ再確認を示し、確認するまで呼ばず、確認した後にだけ呼ぶ', async () => {
    consent();
    localStorage.setItem('edb.ai.confirmedSendKinds', JSON.stringify({ [packId]: ['screen', 'genai-scenario', 'chat'] }));
    open();
    fireEvent.click(screen.getByRole('checkbox', { name: '生成 AI で作成' }));
    fireEvent.click(screen.getByRole('button', { name: '経営層' }));
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg.textContent).toContain(SEND_KINDS.find((k) => k.id === KIND_PRESENTATION)!.label);
    expect(asks()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '確認して作成' }));
    await waitFor(() => expect(asks()).toHaveLength(1));
    expect(confirmedSendKinds(packId)).toContain(KIND_PRESENTATION);
    await screen.findByTestId('story');
  });

  it('FR-290 AC-777 実接続の有効化（確認つき）で送信情報の種類を記録し、無効にすると消す', async () => {
    await setFoundryConnection(RELAY, 'X', true, { consent: true, confirmed: true });
    expect(confirmedSendKinds('X')).toEqual(SEND_KINDS.map((k) => k.id));
    await setFoundryConnection(RELAY, 'X', false, { consent: true, confirmed: false });
    expect(confirmedSendKinds('X')).toEqual([]);
  });

  // FR-290 AC-776: すべての文を除いたときは、エラーではなく除去の通知と「生成 AI を使わずに開始」を示す
  it('FR-290 AC-776 生成文がすべて材料にない数値・名称を含むときは、エラーではなく除いた旨の通知と「生成 AI を使わずに開始」を示す', async () => {
    consent(); recordConfirmedSendKinds(packId);
    const bad = JSON.stringify({ scenes: [1, 2, 3, 4].map((p) => ({ part: p, heading: '「架空ソリューションZ」', narration: '売上が九百九十九億円増えます。' })) });
    askHandler = async () => new Response(JSON.stringify({ answer: bad, mode: 'connected' }), { status: 200 });
    open();
    fireEvent.click(screen.getByRole('checkbox', { name: '生成 AI で作成' }));
    fireEvent.click(screen.getByRole('button', { name: '経営層' }));
    const note = await screen.findByTestId('story-genai-removed');
    expect(note.textContent).toMatch(/8 文.*表示しませんでした/);
    expect(screen.queryByTestId('story-genai-error')).toBeNull();
    expect(asks()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '生成 AI を使わずに開始' }));
    expect(screen.getByTestId('story-scene')).toBeTruthy();
    expect(screen.queryByText('AI 生成')).toBeNull();
  });

  // FR-290 AC-785: Project の企業が外部 AI への送信を許可していなければ呼び出し 0 回。許可すると呼ばれ、取り消すと 0 回
  it('FR-290 AC-785 開いている Project の企業が許可していない（既定）ときは呼び出し 0 回で理由（許可）と「生成 AI を使わずに開始」を示し、許可で 1 回、取り消しで 0 回', async () => {
    consent(); recordConfirmedSendKinds(packId);
    const pj = useProjects.getState();
    const co = pj.addCompany('許可合成社QB96'); if (!co.ok) throw new Error(co.reason);
    const pr = useProjects.getState().addProject(co.id, '許可案件QB96'); if (!pr.ok) throw new Error(pr.reason);
    act(() => useProjects.getState().open(pr.id));
    open();
    fireEvent.click(screen.getByRole('checkbox', { name: '生成 AI で作成' }));
    fireEvent.click(screen.getByRole('button', { name: '経営層' }));
    expect((await screen.findByTestId('story-genai-error')).textContent).toMatch(/許可/);
    expect(screen.getByRole('button', { name: '生成 AI を使わずに開始' })).toBeTruthy();
    expect(asks()).toHaveLength(0);
    act(() => { useStoryStore.getState().reset(); useProjects.getState().setAiAllowed(co.id, true); });
    act(() => useStoryStore.getState().startGenai('経営層'));
    await screen.findByTestId('story');
    expect(asks()).toHaveLength(1);
    const body = asks()[0]!.body!;
    expect(body).toContain('経営層');
    act(() => { useStoryStore.getState().reset(); useProjects.getState().setAiAllowed(co.id, false); });
    clock += 60_000; vi.setSystemTime(clock);
    act(() => useStoryStore.getState().startGenai('経営層'));
    expect((await screen.findByTestId('story-genai-error')).textContent).toMatch(/許可/);
    expect(asks()).toHaveLength(1);
  });
});
