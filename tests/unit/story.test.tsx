// @vitest-environment jsdom
// FR-177（AC-356〜AC-358）・FR-178（AC-360・AC-361）・FR-179（AC-362・AC-363）の単体・結合テスト。
import fs from 'node:fs';
import path from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AI_WEIGHTS } from '../../src/analysis/priority';
import { DATA_SCHEMAS, type PackData, type PackFiles } from '../../src/schema';
import { demoUseCases } from '../../src/usecase/demo';
import { SCENE_SECONDS } from '../../src/usecase/model';
import {
  PERSONA_ANGLE, STORY_PERSONAS, STORY_TOP, buildStory, positionText, rankSolutions, stepScene, storyKeyAction, type StoryInput, type StoryPersona,
} from '../../src/story/model';
import { StoryHost } from '../../src/story/StoryHost';
import { usePackStore } from '../../src/store/pack';
import { usePresentationStore } from '../../src/store/presentation';
import { useStoryStore } from '../../src/store/story';
import { useAnimation } from '../../src/store/animation';
import { resetProjects, useProjects } from '../../src/store/projects';
import { useUseCases } from '../../src/store/usecases';

const KINDS = ['mono', 'koto'] as const;

function loadPack(kind: (typeof KINDS)[number]): PackData {
  const root = path.resolve(__dirname, '../../examples', kind, 'public');
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(DATA_SCHEMAS)) {
    out[name] = schema.parse(JSON.parse(fs.readFileSync(path.join(root, 'data', `${name}.json`), 'utf8')));
  }
  return out as PackData;
}

function inputOf(pack: PackData, persona: StoryPersona, over: Partial<StoryInput> = {}): StoryInput {
  return {
    persona, issues: pack.issues.issues, solutions: pack.issues.solutions, products: pack.products.products,
    customer: pack.customer as never, useCases: demoUseCases(pack.customer, pack.issues.solutions), weights: { ...AI_WEIGHTS }, ...over,
  };
}

describe.each(KINDS)('FR-177 ストーリーの組み立て（%s）', (kind) => {
  const pack = loadPack(kind);

  // FR-177 AC-356
  it('FR-177 AC-356 ①解決策（上位 3 件・優先順位の順）→②理由→③KPI/OKR→④ユースケースの順で、すべてパックの値', () => {
    expect(STORY_TOP).toBe(3);
    const scenes = buildStory(inputOf(pack, '経営層'));
    const ranked = rankSolutions(pack.issues.issues, pack.issues.solutions, { ...AI_WEIGHTS }).map((r) => r.solution.id);
    expect(scenes.filter((s) => s.part === 1).map((s) => s.solutionId)).toEqual(ranked);
    expect(ranked.length).toBeLessThanOrEqual(3);
    const firstIdx = [1, 2, 3, 4].map((p) => scenes.findIndex((s) => s.part === p));
    expect(firstIdx.every((i) => i >= 0)).toBe(true);
    expect([...firstIdx].sort((a, b) => a - b)).toEqual(firstIdx);
    const reason = scenes.filter((s) => s.part === 2).flatMap((s) => s.lines).join('\n');
    for (const label of ['ROI', 'コスト', 'インパクト', '実現性']) expect(reason).toMatch(new RegExp(`${label}：[^\\n]*\\d`));
    expect(scenes.some((s) => s.noData)).toBe(false);
    // 先頭は結果の数字（FR-178 AC-359）
    expect(scenes[0]!.big?.value).toMatch(/\d/);
  });

  // FR-177 AC-357
  it('FR-177 AC-357 4 つのペルソナのすべてで①〜④が含まれ、②の理由の切り口がペルソナごとに異なる', () => {
    const reasons: Record<string, string> = {};
    for (const p of STORY_PERSONAS) {
      const scenes = buildStory(inputOf(pack, p));
      expect(new Set(scenes.map((s) => s.part))).toEqual(new Set([1, 2, 3, 4]));
      const reason = scenes.filter((s) => s.part === 2);
      reasons[p] = reason.map((s) => `${s.kicker}\n${s.heading}\n${s.lines.join('\n')}`).join('\n');
      expect(reason.every((s) => s.kicker.includes(PERSONA_ANGLE[p]))).toBe(true);
    }
    expect(reasons['経営層']).toMatch(/ROI/);
    expect(reasons['経営層']).toMatch(/コスト/);
    expect(reasons['事業部門']).toMatch(/課題/);
    expect(reasons['事業部門']).toMatch(/業務/);
    expect(reasons['IT']).toMatch(/既存環境/);
    expect(reasons['IT']).toMatch(/実現性/);
    expect(reasons['現場']).toMatch(/日々の作業/);
    expect(reasons['現場']).not.toMatch(/投資判断/);
    expect(new Set(Object.values(reasons)).size).toBe(4);
  });

  // FR-177 AC-358（ほかの Project・企業のデータが混ざらない）
  it('FR-177 AC-358 ユースケースは渡された作業先のものだけを使う（別の解決策・別のペルソナのものは現れない）', () => {
    const own = [{ id: 'x1', name: '自分だけのユースケース', persona: '経営層', steps: [{ title: '手順' }], effect: '効果', solutionId: pack.issues.solutions[0]!.id }];
    const scenes = buildStory(inputOf(pack, '経営層', { useCases: own }));
    const text = scenes.map((s) => `${s.heading}${s.lines.join('')}`).join('');
    expect(text).toContain('自分だけのユースケース');
    for (const u of demoUseCases(pack.customer, pack.issues.solutions)) expect(text).not.toContain(u.name);
  });
});

describe('FR-179 不足するデータの扱い', () => {
  const pack = loadPack('mono');

  // FR-179 AC-363
  it('FR-179 AC-363 解決策に結び付く KPI/OKR がない・ユースケースが 0 件のとき、該当のシーンだけ「データなし」になり、ほかは作られ、値は補われない', () => {
    const noKpi = { ...pack.customer, okr: { objectives: [] } } as never;
    const scenes = buildStory(inputOf(pack, '経営層', { customer: noKpi, useCases: [] }));
    const nd = scenes.filter((s) => s.noData);
    expect(nd.length).toBeGreaterThan(0);
    for (const s of nd) {
      expect(s.noData!.reason.length).toBeGreaterThan(0);
      expect(s.noData!.entry).toMatch(/ステップ/);
      expect(s.lines).toEqual([]);
      expect(s.big).toBeUndefined();
    }
    expect(nd.some((s) => s.part === 3)).toBe(true);
    expect(nd.some((s) => s.part === 4)).toBe(true);
    // ほかの要素は表示される
    expect(scenes.filter((s) => s.part === 1 && !s.noData).length).toBeGreaterThan(0);
    expect(scenes.filter((s) => s.part === 2 && !s.noData).length).toBeGreaterThan(0);
    // 経営層の理由に KPI/OKR の行は現れない（補わない）
    expect(scenes.filter((s) => s.part === 2).flatMap((s) => s.lines).join('')).not.toMatch(/影響する KPI\/OKR/);
  });

  // FR-179 AC-363（異常系: 解決策が 0 件でも止まらない）
  it('FR-179 AC-363 異常系: 解決策が 0 件でも、4 つの「データなし」のシーンを返して止まらない', () => {
    const scenes = buildStory(inputOf(pack, '現場', { solutions: [], useCases: [] }));
    expect(scenes.map((s) => s.part)).toEqual([1, 2, 3, 4]);
    expect(scenes.every((s) => s.noData)).toBe(true);
  });

  // FR-179 AC-362
  it('FR-179 AC-362 ストーリーの組み立てはデータだけを読む純関数で、外部へ通信しない', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    for (const p of STORY_PERSONAS) buildStory(inputOf(pack, p));
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    // 本文は、パックの値かデータから決めた表示（ROI の値）
    const roi = pack.issues.issues.find((i) => i.evaluation?.roi)?.evaluation?.roi?.value;
    expect(buildStory(inputOf(pack, '経営層')).map((s) => s.big?.value ?? '').join(' ')).toContain(String(roi ?? ''));
  });
});

describe('FR-178 キー操作（モデル）', () => {
  // FR-178 AC-360
  it('FR-178 AC-360 キーと操作の対応（修飾キーつきは奪わない）', () => {
    expect(storyKeyAction({ key: 'ArrowRight' })).toBe('next');
    expect(storyKeyAction({ key: 'ArrowLeft' })).toBe('prev');
    expect(storyKeyAction({ key: 'Home' })).toBe('first');
    expect(storyKeyAction({ key: ' ' })).toBe('toggle-play');
    expect(storyKeyAction({ key: 'f' })).toBe('toggle-fullscreen');
    expect(storyKeyAction({ key: 'Escape' })).toBe('exit');
    expect(storyKeyAction({ key: 'ArrowRight', ctrlKey: true })).toBeNull();
    expect(storyKeyAction({ key: 'ArrowRight', shiftKey: true })).toBeNull();
    expect(storyKeyAction({ key: 'x' })).toBeNull();
    expect(stepScene(0, -1, 5)).toBe(0);
    expect(stepScene(4, 1, 5)).toBe(4);
    expect(positionText(1, 5)).toBe('2 / 5');
  });
});

describe('FR-178 ストーリーの画面（結合）', () => {
  const pack = loadPack('mono');
  const fullscreenHost: { el: Element | null } = { el: null };

  beforeEach(() => {
    resetProjects(); useUseCases.getState().reset();
    usePackStore.setState({ state: { status: 'ready', pack: { data: pack, issues: [] } as never, warnings: [] } });
    usePresentationStore.getState().end();
    useStoryStore.getState().reset();
    useAnimation.setState({ playing: true, choice: null });
    fullscreenHost.el = null;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenHost.el });
    Element.prototype.requestFullscreen = vi.fn(function (this: Element) { fullscreenHost.el = this; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); });
    document.exitFullscreen = vi.fn(() => { fullscreenHost.el = null; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  const open = (persona: StoryPersona = '経営層') => {
    usePresentationStore.getState().start([{ id: 't1', title: '議題', chapterId: 'c', chapterTitle: '章', chapterIndex: 0 }]);
    render(<FluentProvider theme={webLightTheme}><StoryHost /></FluentProvider>);
    act(() => useStoryStore.getState().openPicker());
    expect(screen.getByRole('dialog', { name: 'ペルソナの選択' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: persona }));
  };
  const position = () => screen.getByTestId('story-position').textContent ?? '';
  const key = (k: string) => fireEvent.keyDown(window, { key: k });

  // FR-178 AC-740: 全シーンの各要素に配置検査用の data-story-el が付き、見出しは 1 つ（実際の矩形の検査は System Test E2E-374）
  it('FR-178 AC-740 すべてのシーンで要素に data-story-el が付く（big とラベル・見出し・本文・CTA）', () => {
    open();
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const scene = screen.getByTestId('story-scene');
      scene.querySelectorAll('[data-story-el]').forEach((e) => seen.add(e.getAttribute('data-story-el') ?? ''));
      expect(scene.querySelectorAll('[data-story-el="heading"]').length).toBe(1);
      expect(scene.querySelectorAll('[data-story-el="kicker"]').length).toBe(1);
      const big = scene.querySelector('[data-story-el="big"]');
      if (big) expect(scene.querySelector('[data-story-el="big-label"]')).not.toBeNull();
      const m = /(\d+) \/ (\d+)/.exec(position());
      if (!m || m[1] === m[2]) break;
      key('ArrowRight');
    }
    for (const k of ['kicker', 'big', 'big-label', 'heading', 'body-line']) expect(seen.has(k), k).toBe(true);
  });

  // FR-177 AC-358 / FR-178 AC-360
  it('FR-177 AC-358 FR-178 AC-360 開始でフルスクリーンになり、→・←・Home で動き、F で抜け・入り、Esc でまずフルスクリーンを抜けて位置とペルソナを保ち、もう一度で終了する', () => {
    open();
    expect(fullscreenHost.el).not.toBeNull();
    expect(screen.getByTestId('story-scene').getAttribute('data-story-part')).toBe('1');
    expect(position()).toMatch(/^1 \/ \d+$/);
    key('ArrowRight'); key('ArrowRight');
    expect(position()).toMatch(/^3 \/ /);
    key('ArrowLeft');
    expect(position()).toMatch(/^2 \/ /);
    key('f');
    expect(fullscreenHost.el).toBeNull();
    key('f');
    expect(fullscreenHost.el).not.toBeNull();
    // Esc: フルスクリーンだけを抜け、ストーリーの位置とペルソナは保つ
    key('Escape');
    expect(fullscreenHost.el).toBeNull();
    expect(screen.getByTestId('story').getAttribute('data-persona')).toBe('経営層');
    expect(position()).toMatch(/^2 \/ /);
    key('Home');
    expect(position()).toMatch(/^1 \/ /);
    // 画面の操作でも同じことができる
    fireEvent.click(screen.getByRole('button', { name: '次のシーン' }));
    expect(position()).toMatch(/^2 \/ /);
    fireEvent.click(screen.getByRole('button', { name: '先頭へ' }));
    expect(position()).toMatch(/^1 \/ /);
    // 2 度目の Esc で終了（プレゼンテーションも終わる）
    key('Escape');
    expect(screen.queryByTestId('story-scene')).toBeNull();
    expect(usePresentationStore.getState().active).toBe(false);
  });

  // FR-178 AC-359
  it('FR-178 AC-359 開始の操作で requestFullscreen が呼ばれ、PARAM-061（2 秒）以内に最初のシーンが出る。見出しは 1 つで、冒頭に数字がある', () => {
    usePresentationStore.getState().start([{ id: 't1', title: '議題', chapterId: 'c', chapterTitle: '章', chapterIndex: 0 }]);
    render(<FluentProvider theme={webLightTheme}><StoryHost /></FluentProvider>);
    act(() => useStoryStore.getState().openPicker());
    const t0 = performance.now();
    fireEvent.click(screen.getByRole('button', { name: '経営層' }));
    const scene = screen.getByTestId('story-scene');
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(Element.prototype.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(document.fullscreenElement).not.toBeNull();
    expect(scene.querySelectorAll('h2').length).toBe(1);
    expect(scene.textContent).toMatch(/\d/);
  });

  // FR-180 AC-365 / FR-177 AC-358
  it('FR-180 AC-365 実際の Project を開いているとき、ストーリーにデモのパックの値（解決策・ROI・KPI/OKR・注記）は出ず、「データなし」になる', () => {
    useProjects.setState({ openId: 'real-project-1' });
    open();
    const texts: string[] = [];
    for (let i = 0; i < 10; i++) { texts.push(screen.getByTestId('story-scene').textContent ?? ''); key('ArrowRight'); }
    const all = texts.join('\n');
    expect(all).toContain('データなし');
    for (const s of pack.issues.solutions) expect(all).not.toContain(s.title);
    for (const i of pack.issues.issues) expect(all).not.toContain(i.title);
    for (const u of demoUseCases(pack.customer, pack.issues.solutions)) expect(all).not.toContain(u.name);
    expect(all).not.toMatch(/ROI：|180 %|120 %/);
    expect(screen.queryByTestId('demo-fictional-note')).toBeNull();
  });

  // FR-180 AC-365（デモでは架空の注記が出る）
  it('FR-180 AC-365 デモのときは架空であることの注記（fictionalNote）を表示する', () => {
    open();
    expect(screen.getByTestId('demo-fictional-note').textContent).toBe(pack.customer.fictionalNote);
  });

  // FR-179 AC-362
  it('FR-179 AC-362 ストーリーを開いて最後まで進めても、通信（fetch・sendBeacon・XHR）は発生しない', () => {
    const fetchSpy = vi.fn();
    const beacon = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    (navigator as unknown as { sendBeacon: unknown }).sendBeacon = beacon;
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    open();
    for (let i = 0; i < 20; i++) key('ArrowRight');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  // FR-178 AC-359（異常系: フルスクリーンが拒否されても止まらない）
  it('FR-178 AC-359 異常系: フルスクリーンが拒否されても、ストーリーは表示され操作できる', () => {
    Element.prototype.requestFullscreen = vi.fn(() => Promise.reject(new TypeError('denied')));
    open();
    expect(screen.getByTestId('story-scene')).toBeTruthy();
    key('ArrowRight');
    expect(position()).toMatch(/^2 \/ /);
  });

  // FR-178 AC-361
  it('FR-178 AC-361 自動再生は PARAM-047 秒ごとに進み、一時停止で止まり、再開で続く', () => {
    vi.useFakeTimers();
    open();
    expect(SCENE_SECONDS).toBe(5);
    key(' '); // 自動再生を開始
    act(() => { vi.advanceTimersByTime(SCENE_SECONDS * 1000); });
    expect(position()).toMatch(/^2 \/ /);
    key(' '); // 一時停止
    act(() => { vi.advanceTimersByTime(SCENE_SECONDS * 3000); });
    expect(position()).toMatch(/^2 \/ /);
    key(' '); // 再開
    act(() => { vi.advanceTimersByTime(SCENE_SECONDS * 1000); });
    expect(position()).toMatch(/^3 \/ /);
  });

  // FR-178 AC-361
  it('FR-178 AC-361 アニメーション停止（視差効果を減らす）のとき、動きの指定なしで即座に切り替わり、内容と操作は同じ', () => {
    open();
    const animated = screen.getByTestId('story-scene').querySelectorAll('[style*="animation-delay"]').length;
    expect(animated).toBeGreaterThan(0);
    act(() => useAnimation.setState({ playing: false }));
    key('ArrowRight');
    const scene = screen.getByTestId('story-scene');
    expect(scene.querySelectorAll('[style*="animation-delay"]').length).toBe(0);
    expect(position()).toMatch(/^2 \/ /);
    expect(scene.textContent!.length).toBeGreaterThan(0);
  });

  // FR-177 AC-356（ペルソナを選ばずに閉じると始まらない）
  it('FR-177 AC-356 異常系: ペルソナを選ばずに閉じるとストーリーは始まらず、議題を巡るプレゼンテーションは続く', () => {
    usePresentationStore.getState().start([{ id: 't1', title: '議題', chapterId: 'c', chapterTitle: '章', chapterIndex: 0 }]);
    render(<FluentProvider theme={webLightTheme}><StoryHost /></FluentProvider>);
    act(() => useStoryStore.getState().openPicker());
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'ペルソナの選択' }), { key: 'Escape' });
    expect(screen.queryByTestId('story-scene')).toBeNull();
    expect(fullscreenHost.el).toBeNull();
    expect(usePresentationStore.getState().active).toBe(true);
  });
});
