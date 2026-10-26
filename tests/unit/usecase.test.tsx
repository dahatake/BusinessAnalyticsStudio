// @vitest-environment jsdom
// FR-158（AC-285・AC-286・AC-287）と FR-155（AC-275・AC-276・AC-277・AC-278）の単体・結合テスト。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { UseCaseScreen, resetPlayback } from '../../src/screens/UseCaseScreen';
import { resetProjects, useProjects } from '../../src/store/projects';
import { useUseCases } from '../../src/store/usecases';
import { useAnimation } from '../../src/store/animation';
import { restore, startPersistence, STORAGE_KEY } from '../../src/store/persist';
import { STEPS } from '../../src/stepper/model';
import {
  MAX_STEPS, addStep, animationState, buildScenes, createAnimation, emptyDraft, validateDraft,
  type UseCaseDraft,
} from '../../src/usecase/model';

const steps = (n: number, p = 'A') => Array.from({ length: n }, (_, i) => ({ title: `${p}手順${i + 1}`, description: `${p}説明${i + 1}` }));
const uc = (n: number, effect = '半分になる'): UseCaseDraft => ({ name: 'UC', summary: '概要', persona: '現場担当者', steps: steps(n), effect });

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

beforeEach(() => {
  resetProjects(); useUseCases.getState().reset();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView ??= vi.fn();
});
afterEach(() => cleanup());

describe('FR-155 AC-276 シーンの生成（単体）', () => {
  it('手順 N 個（効果あり）なら N+2、効果なしなら N+1。同じ入力から同じ構成', () => {
    for (const n of [1, 3, 20]) {
      expect(buildScenes(uc(n))).toHaveLength(n + 2);
      expect(buildScenes(uc(n, ''))).toHaveLength(n + 1);
    }
    expect(buildScenes(uc(3))).toEqual(buildScenes(uc(3)));
  });
  it('導入は名称と対象ペルソナ、手順は入力の順序と見出し、最後が効果', () => {
    const s = buildScenes(uc(3));
    expect(s[0]).toMatchObject({ kind: 'intro', title: 'UC' });
    expect(s[0]!.body).toContain('現場担当者');
    expect(s.slice(1, 4).map((x) => x.title)).toEqual(['A手順1', 'A手順2', 'A手順3']);
    expect(s[4]).toMatchObject({ kind: 'effect' });
    expect(s[4]!.body).toContain('半分になる');
  });
  it('作成は端末内の同期処理で、AI の接続に関わらず 2 秒（PARAM-048）以内に終わる', () => {
    const t0 = Date.now();
    const r = createAnimation(uc(20));
    expect(r.ok).toBe(true);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe('FR-155 AC-277 手順 0 件の拒否', () => {
  it('作成が拒否され、「手順を 1 つ以上追加する」を示し、ユースケースとほかのアニメーションは変わらない', () => {
    const st = useUseCases.getState();
    const a = st.save('p1', uc(2), undefined); const b = st.save('p1', { ...uc(0), name: 'ゼロ' }, undefined);
    if (!a.ok || !b.ok) throw new Error();
    expect(useUseCases.getState().createAnimation('p1', a.id).ok).toBe(true);
    const before = JSON.stringify(useUseCases.getState().byProject);
    const r = useUseCases.getState().createAnimation('p1', b.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('')).toContain('手順を 1 つ以上追加する');
    expect(JSON.stringify(useUseCases.getState().byProject)).toBe(before);
  });
});

describe('FR-155 AC-278 古い状態', () => {
  it('手順を編集すると「古い」になり、再作成すると「最新」になる。古い間も場面は残る', () => {
    const st = useUseCases.getState();
    const a = st.save('p1', uc(2));
    if (!a.ok) throw new Error();
    expect(animationState(useUseCases.getState().byProject.p1!.items[0]!, undefined)).toBe('none');
    st.createAnimation('p1', a.id);
    const get = () => { const s = useUseCases.getState().byProject.p1!; return animationState(s.items[0]!, s.animations[a.id]); };
    expect(get()).toBe('latest');
    st.save('p1', { ...uc(2), steps: steps(3) }, a.id);
    expect(get()).toBe('stale');
    expect(useUseCases.getState().byProject.p1!.animations[a.id]!.scenes).toHaveLength(4);
    st.createAnimation('p1', a.id);
    expect(get()).toBe('latest');
  });
});

describe('FR-158 AC-286 検証（結合）', () => {
  it('名称が空・手順の見出しが空は拒否され、原因を示す。保存されない', () => {
    const r1 = validateDraft({ ...uc(1), name: '  ' });
    expect(r1.ok).toBe(false);
    const r2 = validateDraft({ ...uc(2), steps: [{ title: 'ok', description: '' }, { title: ' ', description: 'x' }] });
    expect(!r2.ok && r2.errors.join('')).toContain('手順 2 の見出し');
    expect(useUseCases.getState().save('p1', { ...uc(1), name: '' }).ok).toBe(false);
    expect(useUseCases.getState().byProject.p1).toBeUndefined();
  });
});

describe('FR-158 AC-287 手順の上限（単体）', () => {
  it('上限（PARAM-046 = 20）に達した追加は拒否され、理由を返し、既存の手順は変わらない', () => {
    const full = steps(MAX_STEPS);
    const r = addStep(full);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain(`${MAX_STEPS} 件`);
    expect(full).toEqual(steps(MAX_STEPS));
    expect(addStep(steps(MAX_STEPS - 1))).toMatchObject({ ok: true });
  });
});

describe('FR-158 AC-285 保存と Project の分離', () => {
  it('登録・編集・削除でき、端末内に保存して復元し、Project をまたいで混ざらない', () => {
    const storage = new MemoryStorage();
    const stop = startPersistence(storage);
    const st = useUseCases.getState();
    const a = st.save('project-A', uc(2)); const b = st.save('project-B', { ...uc(1), name: 'B社用' });
    if (!a.ok || !b.ok) throw new Error();
    st.save('project-A', { ...uc(2), name: '改名' }, a.id);
    st.createAnimation('project-A', a.id);
    expect(storage.getItem(STORAGE_KEY)).toContain('改名');
    stop();
    useUseCases.getState().reset();
    const s2 = new MemoryStorage();
    resetProjects();
    const c = useProjects.getState().addCompany('X社'); if (!c.ok) throw new Error();
    const stop2 = startPersistence(s2);
    useUseCases.getState().save('project-A', uc(2));
    stop2();
    useUseCases.getState().reset();
    expect(restore(s2)).toBe(true);
    expect(useUseCases.getState().byProject['project-A']!.items.map((x) => x.name)).toEqual(['UC']);
    expect(useUseCases.getState().byProject['project-B']).toBeUndefined();
    useUseCases.getState().remove('project-A', 'uc-1');
    expect(useUseCases.getState().byProject['project-A']!.items).toHaveLength(0);
  });

  it('FR-043 AC-054 ステッパーの「ユースケース作成」はユースケースへ直接移動する', () => {
    const step = STEPS.find((s) => s.key === 'usecase')!;
    expect(step.screen).toBe('usecase');
    expect(step.also).toBeUndefined();
    expect(step.screens).not.toContain('mock-app');
    expect(step.screens).toContain('usecase');
  });
});

describe('FR-158 FR-155 画面（結合）', () => {
  const ui = () => render(<FluentProvider theme={webLightTheme}><UseCaseScreen /></FluentProvider>);
  const openProject = () => {
    const c = useProjects.getState().addCompany('X社'); if (!c.ok) throw new Error();
    const p = useProjects.getState().addProject(c.id, 'P1'); if (!p.ok) throw new Error();
    useProjects.getState().open(p.id);
  };

  it('AC-286 名称が空の保存は拒否され、role=alert に原因が出て、入力済みの値は残る', async () => {
    openProject(); ui();
    fireEvent.click(screen.getByRole('button', { name: 'ユースケースを追加' }));
    const dlg = await screen.findByRole('dialog', { name: 'ユースケース' });
    fireEvent.change(within(dlg).getByRole('textbox', { name: '概要' }), { target: { value: '概要だけ' } });
    fireEvent.click(within(dlg).getByRole('button', { name: '保存' }));
    expect(within(dlg).getByRole('alert').textContent).toContain('名称');
    expect((within(dlg).getByRole('textbox', { name: '概要' }) as HTMLTextAreaElement).value).toBe('概要だけ');
    expect(within(screen.getByTestId('usecase-list')).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('AC-287 手順が上限のとき「手順を追加」は拒否され、理由が出て、手順は増えない', async () => {
    openProject(); ui();
    fireEvent.click(screen.getByRole('button', { name: 'ユースケースを追加' }));
    const dlg = await screen.findByRole('dialog', { name: 'ユースケース' });
    for (let i = 0; i < MAX_STEPS + 1; i++) fireEvent.click(within(dlg).getByRole('button', { name: '手順を追加' }));
    expect(within(dlg).getAllByRole('group')).toHaveLength(MAX_STEPS);
    expect(within(dlg).getByRole('alert').textContent).toContain(`${MAX_STEPS} 件`);
  });

  it('AC-277 手順 0 件のユースケースで「アニメーションを作成」を押すと、原因と直し方が出て、再生は無効のまま', () => {
    openProject();
    const pid = useProjects.getState().openId!;
    useUseCases.getState().save(pid, { ...emptyDraft(), name: '手順なし' });
    ui();
    fireEvent.click(screen.getByRole('button', { name: 'アニメーションを作成' }));
    expect(screen.getAllByRole('alert').map((x) => x.textContent).join('')).toContain('手順を 1 つ以上追加する');
    expect((screen.getByRole('button', { name: 'アニメーションを再生' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('AC-275 作成した A を再生すると、導入・A の手順・効果の順で、B の内容は含まれない。AC-278 古い表示', () => {
    openProject();
    const pid = useProjects.getState().openId!;
    const a = useUseCases.getState().save(pid, { ...uc(3), name: 'A案' });
    useUseCases.getState().save(pid, { ...uc(4), name: 'B案', steps: steps(4, 'B') });
    if (!a.ok) throw new Error();
    useUseCases.getState().createAnimation(pid, a.id);
    ui();
    const itemA = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('A案'))!;
    fireEvent.click(within(itemA).getByRole('button', { name: 'アニメーションを再生' }));
    const p = screen.getByTestId('animation-player');
    fireEvent.click(within(p).getByRole('button', { name: '一時停止' }));
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) { seen.push(within(p).getByTestId('animation-scene').textContent ?? ''); if (i < 4) fireEvent.click(within(p).getByRole('button', { name: '次へ' })); }
    expect(within(p).getByTestId('animation-position').textContent).toBe('5 / 5');
    expect(seen[0]).toContain('A案'); expect(seen[0]).toContain('現場担当者');
    expect(seen[1]).toContain('A手順1'); expect(seen[3]).toContain('A手順3'); expect(seen[4]).toContain('半分になる');
    expect(seen.join('')).not.toContain('B手順');
    expect(within(p).queryByRole('status')).toBeNull();
    // 編集すると「古い」と再生画面に表示される
    act(() => { useUseCases.getState().save(pid, { ...uc(3), name: 'A案', steps: steps(2) }, a.id); });
    expect(within(screen.getByTestId('animation-player')).getByRole('status').textContent).toContain('古い');
  });
});


describe('FR-156 FR-157 NFR-A11Y-006 NFR-UX-010 再生画面（結合）', () => {
  const ui = () => render(<FluentProvider theme={webLightTheme}><UseCaseScreen /></FluentProvider>);
  const setup = () => {
    const c = useProjects.getState().addCompany('X社'); if (!c.ok) throw new Error();
    const pr = useProjects.getState().addProject(c.id, 'P1'); if (!pr.ok) throw new Error();
    useProjects.getState().open(pr.id);
    const a = useUseCases.getState().save(pr.id, { ...uc(3), name: 'A案' }); if (!a.ok) throw new Error();
    useUseCases.getState().createAnimation(pr.id, a.id);
    const r = ui();
    // 前のテストのダイアログが残した aria-hidden（Fluent の後始末が非同期）を外す\n    document.querySelectorAll('body > [aria-hidden]').forEach((e) => e.removeAttribute('aria-hidden'));
    fireEvent.click(screen.getByRole('button', { name: 'アニメーションを再生' }));
    return { r, p: screen.getByTestId('animation-player') };
  };
  beforeEach(() => { resetPlayback(); useAnimation.getState().setPlaying(true); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('FR-156 AC-279 5 秒ごとに自動で進み、最後の後は終了。一時停止で止まる', () => {
    const { p } = setup();
    expect(within(p).getByTestId('animation-position').textContent).toBe('1 / 5');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(within(p).getByTestId('animation-position').textContent).toBe('2 / 5');
    fireEvent.click(within(p).getByRole('button', { name: '一時停止' }));
    act(() => { vi.advanceTimersByTime(20000); });
    expect(within(p).getByTestId('animation-position').textContent).toBe('2 / 5');
    fireEvent.click(within(p).getByRole('button', { name: '再生' }));
    for (let i = 0; i < 4; i++) act(() => { vi.advanceTimersByTime(5000); });
    expect(p.getAttribute('data-animation-state')).toBe('ended');
  });

  it('FR-156 AC-280 キーボードだけで前後に移動でき、Esc で終了して一覧に戻る', () => {
    const { p } = setup();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(within(p).getByTestId('animation-position').textContent).toBe('2 / 5');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(within(p).getByTestId('animation-position').textContent).toBe('1 / 5');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('animation-player')).toBeNull();
    expect(screen.getByTestId('usecase-list')).toBeTruthy();
  });

  it('FR-157 AC-281 動きが停止中は data-motion=stopped で自動進行せず、操作では進め、再開で自動進行する', () => {
    const { p } = setup();
    act(() => { useAnimation.getState().setPlaying(false); });
    expect(p.getAttribute('data-motion')).toBe('stopped');
    act(() => { vi.advanceTimersByTime(20000); });
    expect(within(p).getByTestId('animation-position').textContent).toBe('1 / 5');
    fireEvent.click(within(p).getByRole('button', { name: '次へ' }));
    expect(within(p).getByTestId('animation-position').textContent).toBe('2 / 5');
    act(() => { useAnimation.getState().setPlaying(true); });
    expect(p.getAttribute('data-motion')).toBe('running');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(within(p).getByTestId('animation-position').textContent).toBe('3 / 5');
  });

  it('FR-157 AC-282 動きを減らす設定（停止中）でも全シーンの見出しと説明が文字で読める', () => {
    const { p } = setup();
    act(() => { useAnimation.getState().setPlaying(false); });
    for (const x of ['A手順1', 'A説明1', 'A手順3', 'A説明3', '半分になる', 'A案']) expect(p.textContent).toContain(x);
  });

  it('NFR-A11Y-006 AC-283 シーン切替が通知され、操作部品は名前を持つ', () => {
    const { p } = setup();
    fireEvent.click(within(p).getByRole('button', { name: '一時停止' }));
    fireEvent.click(within(p).getByRole('button', { name: '次へ' }));
    expect(within(p).getByTestId('animation-announce').textContent).toContain('2 / 5');
    expect(within(p).getByTestId('animation-announce').textContent).toContain('A手順1');
    expect(within(p).getByTestId('animation-announce').getAttribute('aria-live')).toBe('polite');
    for (const b of within(p).getAllByRole('button')) expect((b.textContent ?? '').trim().length).toBeGreaterThan(0);
    expect(within(p).getAllByRole('heading')[0]!.textContent).toContain('A手順1');
  });

  it('NFR-A11Y-006 AC-284 手順の一覧に全シーンが番号つきで載り、現在位置と状態が文字でも示される', () => {
    const { p } = setup();
    const items = within(within(p).getByTestId('animation-outline')).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[0]!.textContent).toContain('A案');
    expect(items[2]!.textContent).toContain('A説明2');
    expect(items[0]!.getAttribute('aria-current')).toBe('step');
    expect(within(p).getByTestId('animation-state-text').textContent).toContain('再生中');
  });

  it('NFR-UX-010 AC-288 コンポーネントが作り直されても再生位置と一時停止の状態が保たれる', () => {
    const { r, p } = setup();
    fireEvent.click(within(p).getByRole('button', { name: '一時停止' }));
    fireEvent.click(within(p).getByRole('button', { name: '次へ' }));
    r.unmount();
    ui();
    const q = screen.getByTestId('animation-player');
    expect(within(q).getByTestId('animation-position').textContent).toBe('2 / 5');
    expect(q.getAttribute('data-animation-state')).toBe('paused');
  });
});