// @vitest-environment jsdom
// NFR-A11Y-008（AC-367・AC-368・AC-370・AC-371）の結合テスト。AC-369 は目視（docs の手順）。
import fs from 'node:fs';
import path from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DATA_SCHEMAS, type PackData } from '../../src/schema';
import { StoryHost } from '../../src/story/StoryHost';
import { usePackStore } from '../../src/store/pack';
import { usePresentationStore } from '../../src/store/presentation';
import { useStoryStore } from '../../src/store/story';
import { useAnimation } from '../../src/store/animation';
import { resetProjects } from '../../src/store/projects';
import { useUseCases } from '../../src/store/usecases';
import { SCENE_SECONDS } from '../../src/usecase/model';

function loadPack(): PackData {
  const root = path.resolve(__dirname, '../../examples', 'mono', 'public');
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(DATA_SCHEMAS)) out[name] = schema.parse(JSON.parse(fs.readFileSync(path.join(root, 'data', `${name}.json`), 'utf8')));
  return out as PackData;
}

describe('NFR-A11Y-008 ストーリーの代替の手段と動きの配慮', () => {
  const pack = loadPack();
  let fsEl: Element | null = null;

  beforeEach(() => {
    resetProjects(); useUseCases.getState().reset();
    usePackStore.setState({ state: { status: 'ready', pack: { data: pack, issues: [] } as never, warnings: [] } });
    usePresentationStore.getState().end();
    useStoryStore.getState().reset();
    useAnimation.setState({ playing: true, choice: null });
    fsEl = null;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fsEl });
    Element.prototype.requestFullscreen = vi.fn(function (this: Element) { fsEl = this; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); });
    document.exitFullscreen = vi.fn(() => { fsEl = null; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  const open = (persona = '経営層') => {
    usePresentationStore.getState().start([{ id: 't1', title: '議題', chapterId: 'c', chapterTitle: '章', chapterIndex: 0 }]);
    render(<FluentProvider theme={webLightTheme}><button data-testid="opener">開始</button><StoryHost /></FluentProvider>);
    act(() => useStoryStore.getState().openPicker());
    fireEvent.click(screen.getByRole('button', { name: persona }));
  };
  const position = () => screen.getByTestId('story-position').textContent ?? '';
  const key = (k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra });

  // NFR-A11Y-008 AC-367
  it('NFR-A11Y-008 AC-367 テキスト表示に全シーンが同じ順序で並び、切替の前後で位置が保たれ、シーン名と位置が支援技術に伝わる', () => {
    open();
    key('ArrowRight'); key('ArrowRight');
    const before = position();
    const announce = screen.getByTestId('story-announce');
    expect(announce.getAttribute('aria-live')).toBe('polite');
    expect(announce.textContent).toContain(before);
    expect(announce.textContent).toContain(screen.getByTestId('story-scene').getAttribute('aria-label')!);
    fireEvent.click(screen.getByRole('button', { name: 'テキスト表示' }));
    const items = screen.getAllByTestId('story-text-item');
    const total = Number(before.split('/')[1]);
    expect(items.length).toBe(total);
    expect(items[2]!.getAttribute('aria-current')).toBe('step');
    expect(items.filter((i) => i.getAttribute('aria-current')).length).toBe(1);
    expect(within(items[0]!).getByRole('heading', { level: 3 }).textContent!.length).toBeGreaterThan(0);
    expect(position()).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: '演出の表示に戻る' }));
    expect(position()).toBe(before);
    expect(screen.queryByTestId('story-text')).toBeNull();
    key('ArrowRight');
    expect(announce.textContent).toContain(position());
  });

  // NFR-A11Y-008 AC-368
  it('NFR-A11Y-008 AC-368 現在位置は色以外（枠線・文字）でも示され、Space で自動再生を一時停止でき、視差効果の削減で動きが付かない', () => {
    vi.useFakeTimers();
    open();
    const css = fs.readFileSync(path.resolve(__dirname, '../../src/story/StoryHost.tsx'), 'utf8'); // griffel の CSS は jsdom で読めないため、定義を確認する
    expect(css).toMatch(/prefers-reduced-motion/);
    fireEvent.click(screen.getByRole('button', { name: '自動再生' }));
    key(' '); // 一時停止
    act(() => { vi.advanceTimersByTime(SCENE_SECONDS * 1000 * 2); });
    expect(position()).toMatch(/^1 \//);
    key(' '); // 再開
    act(() => { vi.advanceTimersByTime(SCENE_SECONDS * 1000 + 10); });
    expect(position()).toMatch(/^2 \//);
    key(' ');
    fireEvent.click(screen.getByRole('button', { name: 'テキスト表示' }));
    expect(screen.getByText(/（現在のシーン）/)).toBeTruthy();
    // アプリのアニメーション停止のときは動きの属性が付かない
    fireEvent.click(screen.getByRole('button', { name: '演出の表示に戻る' }));
    expect(screen.getByTestId('story-scene').querySelector('[style*="animation-delay"]')).not.toBeNull();
    cleanup();
    useAnimation.setState({ playing: false, choice: null });
    useStoryStore.getState().reset();
    open();
    expect(screen.getByTestId('story-scene').querySelector('[style*="animation-delay"]')).toBeNull();
  });

  // NFR-A11Y-008 AC-370
  it('NFR-A11Y-008 AC-370 Tab はストーリーの外へ抜けず、閉じると開く前のフォーカスの位置に戻る', () => {
    vi.useFakeTimers();
    const opener = () => screen.getByTestId('opener');
    usePresentationStore.getState().start([{ id: 't1', title: '議題', chapterId: 'c', chapterTitle: '章', chapterIndex: 0 }]);
    render(<FluentProvider theme={webLightTheme}><button data-testid="opener">開始</button><StoryHost /></FluentProvider>);
    opener().focus();
    act(() => useStoryStore.getState().play('経営層'));
    const root = screen.getByTestId('story');
    const buttons = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled])'));
    buttons[buttons.length - 1]!.focus();
    key('Tab');
    expect(root.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    buttons[0]!.focus();
    key('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    key('Escape'); // フルスクリーンを抜ける
    key('Escape'); // 終了
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.queryByTestId('story')).toBeNull();
    expect(document.activeElement).toBe(opener());
  });

  // NFR-A11Y-008 AC-371
  it('NFR-A11Y-008 AC-371 終了後にペルソナの選択へ戻れ、別のペルソナを選ぶとそのペルソナの切り口で最初から再生される', () => {
    open('経営層');
    key('ArrowRight');
    const first = screen.getByTestId('story-scene').getAttribute('aria-label');
    fireEvent.click(screen.getByRole('button', { name: 'ストーリーを終了' }));
    expect(screen.queryByTestId('story')).toBeNull();
    usePresentationStore.getState().start([{ id: 't1', title: '議題', chapterId: 'c', chapterTitle: '章', chapterIndex: 0 }]);
    act(() => useStoryStore.getState().openPicker());
    expect(screen.getByRole('dialog', { name: 'ペルソナの選択' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '現場' }));
    expect(screen.getByTestId('story').getAttribute('data-persona')).toBe('現場');
    expect(position()).toMatch(/^1 \//);
    expect(first).toBeTruthy();
  });
});
