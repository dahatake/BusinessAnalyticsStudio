// @vitest-environment jsdom
// FR-163（AC-315・AC-316）・FR-164（AC-317・AC-318・AC-319）・FR-165（AC-321・AC-322）・FR-166（AC-323・AC-324）の単体・結合テスト。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { StoryboardEditor, StoryboardPlayer, StylePicker } from '../../src/usecase/StoryboardPlayer';
import { UseCaseScreen } from '../../src/screens/UseCaseScreen';
import { resetProjects, useProjects } from '../../src/store/projects';
import { useUseCases } from '../../src/store/usecases';
import { useAnimation } from '../../src/store/animation';
import { useStoryStyle } from '../../src/store/storyboardStyle';
import { useStoryboardUi } from '../../src/store/storyboardUi';
import { restore, startPersistence } from '../../src/store/persist';
import {
  DEFAULT_STORY_INTENSITY, DEFAULT_STYLE, STYLES, TARGET_MS, TELOP_MAX, buildStoryScenes, createStoryboard, sceneMs, storyboardState, telopParts, telopPlain, validateScenes,
  type StoryScene,
} from '../../src/usecase/storyboard';
import type { UseCaseDraft } from '../../src/usecase/model';

const steps = (n: number, p = 'A') => Array.from({ length: n }, (_, i) => ({ title: `${p}手順${i + 1}`, description: `${p}説明${i + 1}` }));
const uc = (n: number, p = 'A', persona = '現場担当者', effect = '半分になる'): UseCaseDraft => ({ name: `UC${p}`, summary: '概要', persona, steps: steps(n, p), effect });
const wrap = (ui: React.ReactElement) => render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>);

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

beforeEach(() => {
  useStoryboardUi.setState({ playId: null, editId: null, index: 0, state: 'playing' });
  resetProjects(); useUseCases.getState().reset();
  useStoryStyle.setState({ style: DEFAULT_STYLE });
  useAnimation.setState({ playing: true, choice: null });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView ??= vi.fn();
  // jsdom には全画面 API がない → 既定では「全画面にできない環境」になる
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('FR-163 AC-315 AC-316 ストーリーボードの生成（単体）', () => {
  it('AC-315 導入（対象ペルソナ）+ 手順 + 効果が順序どおり並び、各シーンに見出し・字幕・強調テロップがあり、別のユースケースの内容は混ざらない', () => {
    const s = buildStoryScenes(uc(3));
    expect(s).toHaveLength(5);
    expect(s[0]!.caption).toContain('現場担当者');
    expect(s.slice(1, 4).map((x) => x.heading)).toEqual(['A手順1', 'A手順2', 'A手順3']);
    for (const x of s) { expect(x.heading).not.toBe(''); expect(x.caption).not.toBe(''); expect(x.telop).not.toBe(''); }
    expect(JSON.stringify(s)).not.toContain('B手順');
  });
  it('AC-316 同じユースケースから同じ構成になり、作成は 2 秒（PARAM-048）以内に終わる。手順 0 件は拒否される', () => {
    expect(buildStoryScenes(uc(3))).toEqual(buildStoryScenes(uc(3)));
    const t0 = Date.now();
    const r = createStoryboard(uc(20));
    expect(r.ok).toBe(true);
    expect(Date.now() - t0).toBeLessThan(2000);
    const z = createStoryboard(uc(0));
    expect(z.ok).toBe(false);
    if (!z.ok) expect(z.errors.join('')).toContain('手順を 1 つ以上追加する');
  });
  it('AC-316 字幕を編集して保存すると次の再生に反映され、元のユースケースは変わらない。作成状態は 未作成→最新→古い', () => {
    const st = useUseCases.getState();
    const id = (st.save('p1', uc(2)) as { ok: true; id: string }).id;
    expect(storyboardState(uc(2), undefined)).toBe('none');
    expect(st.createStoryboard('p1', id).ok).toBe(true);
    const set = () => useUseCases.getState().byProject['p1']!;
    const scenes = set().storyboards![id]!.scenes.map((x) => ({ ...x }));
    scenes[0]!.caption = '編集後の字幕 ABC';
    expect(useUseCases.getState().saveStoryboardScenes('p1', id, scenes).ok).toBe(true);
    expect(set().storyboards![id]!.scenes[0]!.caption).toBe('編集後の字幕 ABC');
    expect(set().items[0]!.steps[0]!.description).toBe('A説明1');
    expect(storyboardState(set().items[0]!, set().storyboards![id])).toBe('latest');
    useUseCases.getState().save('p1', { ...uc(2), summary: '変えた' }, id);
    expect(storyboardState(set().items[0]!, set().storyboards![id])).toBe('stale');
    // 手順 0 件の作成は拒否され、何も変わらない
    const zero = (useUseCases.getState().save('p1', uc(0, 'Z')) as { ok: true; id: string }).id;
    expect(useUseCases.getState().createStoryboard('p1', zero).ok).toBe(false);
    expect(set().storyboards![zero]).toBeUndefined();
  });
  it('AC-316 文言と順序の編集: 強調テロップが最大文字数を超えると保存できない。シーンの順序を動かせる', () => {
    const scenes = buildStoryScenes(uc(2));
    const bad = scenes.map((x, i) => (i === 0 ? { ...x, telop: '*あ*'.padEnd(TELOP_MAX + 5, 'い') } : x));
    expect(validateScenes(bad).ok).toBe(false);
    const onSave = vi.fn(() => ({ ok: true as const }));
    wrap(<StoryboardEditor name="n" persona="p" scenes={scenes} onSave={onSave} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'シーン 1 を後ろへ' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((onSave.mock.calls[0] as unknown as [StoryScene[]])[0][1]!.kind).toBe('intro');
  });
});

describe('FR-164 AC-318 再生の長さ', () => {
  it('手順 3 件・6 件のどちらでも、全シーンの合計が 30 秒（PARAM-052）±5 秒（PARAM-053）に収まり、多いほど 1 シーンは短い', () => {
    for (const n of [3, 6, 20]) {
      const c = buildStoryScenes(uc(n)).length;
      const total = sceneMs(c) * c;
      expect(total).toBeGreaterThanOrEqual(TARGET_MS - 5000);
      expect(total).toBeLessThanOrEqual(TARGET_MS + 5000);
    }
    expect(sceneMs(8)).toBeLessThan(sceneMs(5));
  });
  it('AC-318 実際に自動で進み、約 30 秒で終了する', () => {
    vi.useFakeTimers();
    const scenes = buildStoryScenes(uc(3));
    wrap(<StoryboardPlayer name="n" scenes={scenes} onClose={() => undefined} />);
    const p = screen.getByTestId('storyboard-player');
    expect(p.getAttribute('data-storyboard-state')).toBe('playing');
    for (let i = 0; i < scenes.length; i++) {
      expect(p.getAttribute('data-storyboard-state')).toBe('playing');
      act(() => { vi.advanceTimersByTime(sceneMs(scenes.length) + 1); });
    }
    expect(p.getAttribute('data-storyboard-state')).toBe('ended');
  });
});

describe('FR-164 AC-320 再生の既定の演出強度', () => {
  it('AC-320 既定は Entertainment と文字で出し、閉じて再生し直しても同じ。Executive にはならない', () => {
    expect(DEFAULT_STORY_INTENSITY).toBe('Entertainment');
    const r = wrap(<StoryboardPlayer name="n" scenes={buildStoryScenes(uc(3))} onClose={() => undefined} />);
    expect(screen.getByTestId('storyboard-intensity').textContent).toContain('Entertainment');
    expect(screen.getByTestId('storyboard-intensity').textContent).not.toContain('Executive');
    r.unmount();
    wrap(<StoryboardPlayer name="n" scenes={buildStoryScenes(uc(3))} onClose={() => undefined} />);
    expect(screen.getByTestId('storyboard-intensity').textContent).toContain('Entertainment');
  });
  it('AC-320（G-002）シーンは Entertainment でも対象ペルソナ・手順・期待する効果を省かない', () => {
    const text = buildStoryScenes(uc(2)).map((s) => `${s.heading}${s.caption}${s.telop}`).join('');
    expect(text).toContain('現場担当者');
    expect(text).toContain('A手順1');
    expect(text).toContain('半分になる');
  });
});

describe('FR-164 AC-317 AC-319 全画面・キーボード・動きの停止', () => {
  it('AC-317 全画面にできない環境では覆う表示で代わりにし旨を表示する。Esc で閉じる', () => {
    const onClose = vi.fn();
    wrap(<StoryboardPlayer name="n" scenes={buildStoryScenes(uc(3))} onClose={onClose} />);
    expect(screen.getByTestId('storyboard-fullscreen-fallback').textContent).toContain('覆う');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('AC-317 全画面にできる環境では要求し、閉じるときに全画面を終える', async () => {
    const req = vi.fn(() => Promise.resolve());
    const exit = vi.fn(() => Promise.resolve());
    (Element.prototype as unknown as { requestFullscreen: unknown }).requestFullscreen = req;
    (document as unknown as { exitFullscreen: unknown }).exitFullscreen = exit;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => document.body });
    try {
      const r = wrap(<StoryboardPlayer name="n" scenes={buildStoryScenes(uc(3))} onClose={() => undefined} />);
      expect(req).toHaveBeenCalled();
      expect(screen.queryByTestId('storyboard-fullscreen-fallback')).toBeNull();
      r.unmount();
      expect(exit).toHaveBeenCalled();
    } finally {
      delete (Element.prototype as unknown as { requestFullscreen?: unknown }).requestFullscreen;
      delete (document as unknown as { exitFullscreen?: unknown }).exitFullscreen;
      delete (document as unknown as { fullscreenElement?: unknown }).fullscreenElement;
    }
  });
  it('AC-319 ←/→ で前後、再生・一時停止がキーボードとボタンでできる。動きの停止中は自動に進まず全シーンの字幕が読める', () => {
    vi.useFakeTimers();
    useAnimation.setState({ playing: false, choice: false });
    const scenes = buildStoryScenes(uc(3));
    wrap(<StoryboardPlayer name="n" scenes={scenes} onClose={() => undefined} />);
    const p = screen.getByTestId('storyboard-player');
    expect(p.getAttribute('data-motion')).toBe('stopped');
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByTestId('storyboard-position').textContent).toBe('1 / 5');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('storyboard-position').textContent).toBe('2 / 5');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByTestId('storyboard-position').textContent).toBe('1 / 5');
    for (const s of scenes) expect(p.textContent).toContain(s.caption);
    fireEvent.click(screen.getByRole('button', { name: '一時停止' }));
    expect(p.getAttribute('data-storyboard-state')).toBe('paused');
    fireEvent.click(screen.getByRole('button', { name: '再生' }));
    expect(p.getAttribute('data-storyboard-state')).toBe('playing');
  });
});

describe('FR-165 AC-321 AC-322 字幕とテロップ', () => {
  it('AC-321 最初のシーンの冒頭に最大文字数以内の強調テロップ（強調語つき）があり、全シーンの字幕が文字である', () => {
    for (const n of [1, 3, 20]) {
      const s = buildStoryScenes(uc(n, 'A', '現場担当者', '入力時間が半分になる大きな効果がある'));
      for (const x of s) {
        expect(Array.from(telopPlain(x.telop)).length).toBeLessThanOrEqual(TELOP_MAX);
        expect(telopParts(x.telop).some((p) => p.emphasis)).toBe(true);
        expect(x.caption.trim()).not.toBe('');
      }
    }
    wrap(<StoryboardPlayer name="n" scenes={buildStoryScenes(uc(3))} onClose={() => undefined} />);
    expect(screen.getByTestId('storyboard-telop').textContent).not.toBe('');
    expect(screen.getAllByTestId('storyboard-emphasis').length).toBeGreaterThan(0);
  });
  it('AC-322 字幕・テロップは折り返し、背景色を自身に持つ表示である（CSS）', async () => {
    const css = (await import('node:fs')).readFileSync('src/usecase/storyboard.css', 'utf8');
    for (const cls of ['.sbp-caption', '.sbp-telop']) {
      const m = new RegExp(`${cls.replace('.', '\\.')} \\{[^}]*\\}`).exec(css)![0];
      expect(m).toContain('background-color');
      expect(m).toContain('overflow-wrap: anywhere');
      expect(m).toContain('max-width: 100%'.replace('max-width: 100%', cls === '.sbp-telop' ? 'max-width: 100%' : 'align-self: stretch'));
    }
  });
});

describe('FR-166 AC-323 AC-324 スタイル', () => {
  it('AC-323 5 つの名前が表示され、既定は Isometric 3D。選ぶと再生にそのスタイル名が出る', () => {
    wrap(<StylePicker />);
    const group = screen.getByRole('radiogroup', { name: 'スタイル' });
    expect(within(group).getAllByRole('radio')).toHaveLength(5);
    for (const n of STYLES) expect(within(group).getByRole('radio', { name: n })).toBeTruthy();
    expect((within(group).getByRole('radio', { name: 'Isometric 3D' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(group).getByRole('radio', { name: 'Whimsical 3D' }));
    expect(useStoryStyle.getState().style).toBe('Whimsical 3D');
    cleanup();
    wrap(<StoryboardPlayer name="n" scenes={buildStoryScenes(uc(3))} onClose={() => undefined} />);
    expect(screen.getByTestId('storyboard-style-name').textContent).toBe('Whimsical 3D');
  });
  it('AC-324 選んだスタイルが端末内に保存され、開き直しで復元される', async () => {
    useStoryStyle.getState().setStyle('アニメ');
    const raw = window.localStorage.getItem('eabk.storyboard-style.v1');
    expect(raw).toContain('アニメ');
    useStoryStyle.setState({ style: DEFAULT_STYLE }); // この操作でも保存されるため、保存内容を直接書いて復元を確かめる
    window.localStorage.setItem('eabk.storyboard-style.v1', raw!);
    await useStoryStyle.persist.rehydrate();
    expect(useStoryStyle.getState().style).toBe('アニメ');
    window.localStorage.setItem('eabk.storyboard-style.v1', JSON.stringify({ state: { style: '壊れた値' }, version: 1 }));
    await useStoryStyle.persist.rehydrate();
    expect(useStoryStyle.getState().style).toBe(DEFAULT_STYLE);
    window.localStorage.removeItem('eabk.storyboard-style.v1');
  });
  it('AC-324 ストーリーボードは Project の保存に含まれて復元される', () => {
    const storage = new MemoryStorage();
    useProjects.getState().addCompany('合成株式会社S');
    const co = useProjects.getState().companies[0]!;
    useProjects.getState().addProject(co.id, 'SB案件1');
    const off = startPersistence(storage);
    const pid = useProjects.getState().projects[0]!.id;
    const id = (useUseCases.getState().save(pid, uc(2)) as { ok: true; id: string }).id;
    useUseCases.getState().createStoryboard(pid, id);
    off();
    useUseCases.getState().reset();
    expect(restore(storage)).toBe(true);
    expect(useUseCases.getState().byProject[pid]!.storyboards![id]!.scenes.length).toBe(4);
  });
  it('AC-324 WebGL が使えない環境では 2D のアニメの表現で再生し、理由を表示し、字幕とテロップは欠けない', () => {
    // jsdom は canvas の getContext を実装しないため、WebGL なしの環境になる
    wrap(<StoryboardPlayer name="n" scenes={buildStoryScenes(uc(3))} onClose={() => undefined} />);
    expect(screen.getByTestId('storyboard-style-notice').textContent).toContain('2D');
    expect(screen.getByTestId('storyboard-player').className).toContain('sbp-2d');
    expect(screen.getByTestId('storyboard-caption').textContent).not.toBe('');
    expect(screen.getByTestId('storyboard-telop').textContent).not.toBe('');
    cleanup();
    useStoryStyle.setState({ style: 'アニメ' });
    wrap(<StoryboardPlayer name="n" scenes={buildStoryScenes(uc(3))} onClose={() => undefined} />);
    expect(screen.queryByTestId('storyboard-style-notice')).toBeNull();
  });
});

describe('画面（FR-163 AC-316）', () => {
  it('手順 0 件の作成は拒否され、原因と直し方が出る。再生は無効のまま', () => {
    useProjects.getState().addCompany('C');
    const co = useProjects.getState().companies[0]!;
    useProjects.getState().addProject(co.id, 'P');
    const pid = useProjects.getState().projects[0]!.id;
    useProjects.getState().open(pid);
    useUseCases.getState().save(pid, uc(0, 'Z'));
    wrap(<UseCaseScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'ストーリーボードを作成' }));
    expect(screen.getByRole('alert').textContent).toContain('手順を 1 つ以上追加する');
    expect((screen.getByRole('button', { name: 'ストーリーボードを再生' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
