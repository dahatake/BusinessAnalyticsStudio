// @vitest-environment jsdom
// FR-158 の導出・登録（AC-289・AC-290・AC-291・AC-292・AC-293）と、手順の上限（AC-287）の単体・結合テスト。規則は A-40 ⑤。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { UseCaseScreen, resetPlayback } from '../../src/screens/UseCaseScreen';
import { resetProjects, useProjects } from '../../src/store/projects';
import { useUseCases } from '../../src/store/usecases';
import { restore, startPersistence, STORAGE_KEY } from '../../src/store/persist';
import { usePackStore } from '../../src/store/pack';
import { deriveCandidates, NO_SOURCE_REASON } from '../../src/usecase/derive';
import { MAX_STEPS, addStep } from '../../src/usecase/model';
import type { Issue, Product, Solution } from '../../src/analysis/model';

const issue = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `課題${id}`, audience: 'internal', hypothesis: `仮説${id}`, personas: ['現場担当者'], ...extra }) as unknown as Issue;
const prod = (id: string) => ({ id, name: `製品${id}` }) as unknown as Product;
const sol = (id: string, issueId: string, extra: Record<string, unknown> = {}) =>
  ({ id, issueId, title: `解決策${id}`, productIds: ['P1', 'P2'], productFits: [{ productId: 'P1', reason: '理由1' }, { productId: 'P2', reason: '理由2' }], effects: [{ id: 'E1', title: '工数半減' }], ...extra }) as unknown as Solution;

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

describe('FR-158 AC-289 導出の規則（A-40 ⑤。単体）', () => {
  it('名称＝解決策、概要＝課題の仮説、ペルソナ＝課題、手順＝製品の順（見出し＝製品名、説明＝適合理由）、効果＝解決策の効果', () => {
    const d = deriveCandidates([issue('I1')], [sol('S1', 'I1')], [prod('P1'), prod('P2')]);
    expect(d.candidates).toHaveLength(1);
    const c = d.candidates[0]!;
    expect(c.draft).toEqual({
      name: '解決策S1', summary: '仮説I1', persona: '現場担当者', effect: '工数半減',
      steps: [{ title: '製品P1', description: '理由1' }, { title: '製品P2', description: '理由2' }],
    });
    expect(c.source).toEqual({ solutionId: 'S1', issueId: 'I1' });
  });
  it('1 つの解決策が複数の課題に効くときは課題ごとに 1 候補', () => {
    const d = deriveCandidates([issue('I1'), issue('I2')], [sol('S1', 'I1', { issueIds: ['I2'] })], [prod('P1'), prod('P2')]);
    expect(d.candidates.map((c) => c.source.issueId)).toEqual(['I1', 'I2']);
  });
});

describe('FR-158 AC-292 導出の元がない場合（結合）', () => {
  it('顧客パックなし・課題 0 件・解決策 0 件は 0 件で理由つき（エラーにならない）', () => {
    for (const d of [deriveCandidates(undefined, undefined, undefined), deriveCandidates([], [], []), deriveCandidates([issue('I1')], [], [])]) {
      expect(d.candidates).toHaveLength(0);
      expect(d.emptyReason).toBe(NO_SOURCE_REASON);
      expect(d.emptyReason).toContain('導出の元がない');
    }
  });
  it('解決策のない課題は候補に出さず、その件数を返す', () => {
    const d = deriveCandidates([issue('I1'), issue('I2'), issue('I3')], [sol('S1', 'I1')], [prod('P1'), prod('P2')]);
    expect(d.candidates).toHaveLength(1);
    expect(d.issuesWithoutSolution).toBe(2);
    expect(d.emptyReason).toBeUndefined();
  });
});

describe('FR-158 AC-293 切り詰め・AC-287 上限（単体）', () => {
  it('導出した手順が PARAM-046 件を超えると先頭の件数に切り詰め、元の件数を返す', () => {
    const ids = Array.from({ length: MAX_STEPS + 3 }, (_, i) => `P${i}`);
    const d = deriveCandidates([issue('I1')], [sol('S1', 'I1', { productIds: ids, productFits: [] })], ids.map(prod));
    const c = d.candidates[0]!;
    expect(c.draft.steps).toHaveLength(MAX_STEPS);
    expect(c.draft.steps[0]!.title).toBe('製品P0');
    expect(c.truncatedFrom).toBe(MAX_STEPS + 3);
  });
  it('ちょうど上限なら切り詰めなし', () => {
    const ids = Array.from({ length: MAX_STEPS }, (_, i) => `P${i}`);
    const c = deriveCandidates([issue('I1')], [sol('S1', 'I1', { productIds: ids, productFits: [] })], ids.map(prod)).candidates[0]!;
    expect(c.truncatedFrom).toBeUndefined();
  });
  it('FR-158 AC-287 上限に達した手順への追加は拒否され、既存は変わらない', () => {
    const steps = Array.from({ length: MAX_STEPS }, (_, i) => ({ title: `h${i}`, description: '' }));
    const r = addStep(steps);
    expect(r.ok).toBe(false);
    expect(steps).toHaveLength(MAX_STEPS);
  });
});

describe('FR-158 AC-290・291・293 登録・やり直し・Project 分離（結合）', () => {
  const packData = {
    issues: { issues: [issue('I1'), issue('I2')], solutions: [sol('S1', 'I1'), sol('S2', 'I2')] },
    products: { products: [prod('P1'), prod('P2')] },
  };
  beforeEach(() => {
    resetProjects(); useUseCases.getState().reset(); resetPlayback();
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    Element.prototype.scrollIntoView ??= vi.fn();
    usePackStore.setState({ state: { status: 'ready', pack: { data: packData } as never, warnings: [] } });
  });
  afterEach(() => cleanup());

  const open = (name: string) => {
    const co = useProjects.getState().addCompany(`社${name}`);
    const pid = useProjects.getState().addProject(co.ok ? co.id : '', name);
    useProjects.getState().open(pid.ok ? pid.id : '');
    return pid.ok ? pid.id : '';
  };
  const view = () => render(<FluentProvider theme={webLightTheme}><UseCaseScreen /></FluentProvider>);
  const cands = () => within(screen.getByTestId('usecase-candidates')).getAllByRole('listitem');

  it('候補は未登録で表示され、保存されない。登録すると候補から外れ、導出元の参照つきで保存され、復元できる', () => {
    const pid = open('P-A');
    const st = new MemoryStorage();
    const off = startPersistence(st);
    view();
    expect(cands()).toHaveLength(2);
    expect(cands()[0]!.textContent).toContain('導出（未登録）');
    expect(useUseCases.getState().byProject[pid]).toBeUndefined(); // 登録前は保存されない
    fireEvent.click(within(cands()[0]!).getByRole('button', { name: '登録' }));
    expect(cands()).toHaveLength(1);
    const items = useUseCases.getState().byProject[pid]!.items;
    expect(items).toHaveLength(1);
    expect(items[0]!.source).toEqual({ solutionId: 'S1', issueId: 'I1' });
    off();
    useUseCases.getState().reset();
    expect(restore(st)).toBe(true);
    expect(useUseCases.getState().byProject[pid]!.items[0]!.source).toEqual({ solutionId: 'S1', issueId: 'I1' });
  });

  it('やり直しは登録済み（編集を含む）を変えず、削除すると導出元が候補に戻る', () => {
    const pid = open('P-A');
    view();
    fireEvent.click(within(cands()[0]!).getByRole('button', { name: '登録' }));
    const id = useUseCases.getState().byProject[pid]!.items[0]!.id;
    const cur = useUseCases.getState().byProject[pid]!.items[0]!;
    act(() => { useUseCases.getState().save(pid, { ...cur, name: '編集した名称' }, id); });
    fireEvent.click(screen.getByRole('button', { name: '導出をやり直す' }));
    const after = useUseCases.getState().byProject[pid]!.items;
    expect(after).toHaveLength(1);
    expect(after[0]!.name).toBe('編集した名称');
    expect(after[0]!.source).toEqual({ solutionId: 'S1', issueId: 'I1' }); // 編集しても導出元は保たれる
    expect(cands()).toHaveLength(1);
    act(() => useUseCases.getState().remove(pid, id));
    expect(cands()).toHaveLength(2);
  });

  it('Project A の登録は Project B の登録済みに現れない（候補は B では再び未登録）', () => {
    const a = open('P-A');
    view();
    fireEvent.click(within(cands()[0]!).getByRole('button', { name: '登録' }));
    cleanup();
    const b = open('P-B');
    expect(b).not.toBe(a);
    view();
    expect(within(screen.getByTestId('usecase-list')).queryAllByRole('listitem')).toHaveLength(0);
    expect(cands()).toHaveLength(2);
  });

  it('導出の元がないとき、理由を表示し、候補は 0 件、利用者による追加ボタンは使える', () => {
    usePackStore.setState({ state: { status: 'loading' } });
    open('P-A');
    view();
    expect(screen.getByTestId('usecase-candidates').textContent).toContain('導出の元がない');
    expect(within(screen.getByTestId('usecase-candidates')).queryAllByRole('listitem')).toHaveLength(0);
    expect((screen.getByRole('button', { name: 'ユースケースを追加' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('旧い保存内容（導出元の参照なし）も読める', () => {
    const pid = open('P-A');
    const st = new MemoryStorage();
    const snap = { v: 1, companies: useProjects.getState().companies, projects: useProjects.getState().projects, openId: pid, seq: 3, analyses: {}, steps: {},
      usecases: { [pid]: { items: [{ id: 'uc-1', name: '旧', summary: '', persona: '', effect: '', steps: [] }], animations: {}, seq: 1 } } };
    st.setItem(STORAGE_KEY, JSON.stringify(snap));
    expect(restore(st)).toBe(true);
    expect(useUseCases.getState().byProject[pid]!.items[0]!.name).toBe('旧');
    expect(useUseCases.getState().byProject[pid]!.items[0]!.source).toBeUndefined();
  });
});
