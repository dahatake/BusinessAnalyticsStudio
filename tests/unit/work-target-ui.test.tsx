// @vitest-environment jsdom
// FR-144 の描画テスト（AC-229・AC-231・AC-232・AC-237・AC-238・AC-241）。jsdom + testing-library。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import { ProjectsPanel } from '../../src/projects/ProjectsPanel';
import { WorkTargetPicker } from '../../src/projects/WorkTargetPicker';
import type { TargetChoice } from '../../src/projects/workTarget';
import { resetProjects, useProjects } from '../../src/store/projects';
import { resetAnalyses, useAnalyses } from '../../src/store/analyses';
import { useRestoreStatus } from '../../src/store/persist';
import { useSettings } from '../../src/store/settings';

const st = () => useProjects.getState();
const wrap = (ui: ReactNode) => <FluentProvider theme={webLightTheme}>{ui}</FluentProvider>;

function seed(projects: number) {
  const a = st().addCompany('合成株式会社A');
  if (!a.ok) throw new Error();
  const ids: string[] = [];
  for (const n of ['業務改善 2026', '在庫最適化'].slice(0, projects)) {
    const p = st().addProject(a.id, n);
    if (!p.ok) throw new Error();
    ids.push(p.id);
  }
  return ids;
}

beforeEach(() => {
  resetProjects(); resetAnalyses();
  useRestoreStatus.setState({ done: false });
  // jsdom に無い API（Fluent が使う）
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView ??= vi.fn();
});
afterEach(() => cleanup());

describe('FR-144 作業先の選択画面（描画）', () => {
  // FR-144 AC-232
  it('FR-144 AC-232 矢印キーで候補を選び、Enter で確定できる', async () => {
    seed(2);
    const chosen: TargetChoice[] = [];
    render(wrap(<WorkTargetPicker projects={st().projects} companies={st().companies} onChoose={(c) => chosen.push(c)} onClose={() => undefined} />));
    const list = await screen.findByRole('listbox', { name: '作業先の候補' });
    expect(within(list).getAllByRole('option').length).toBe(4); // デモ・2 Project・登録
    act(() => list.focus());
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    await waitFor(() => expect(chosen.length).toBe(1));
    expect(chosen[0]?.kind).toBe('project');
  });
});

describe('FR-144 ProjectsPanel（描画）', () => {
  // FR-144 AC-229 AC-236: 読込完了後に評価する
  it('FR-144 AC-229 読込の完了前は出さず、完了後に 2 件以上なら起動時に選択画面を出す', async () => {
    render(wrap(<ProjectsPanel />));
    seed(2); // 読込が終わる前に（空の状態から）データが入っても、完了の通知まで評価しない
    expect(screen.queryByRole('dialog', { name: '作業先の選択' })).toBeNull();
    act(() => useRestoreStatus.setState({ done: true }));
    expect(await screen.findByRole('dialog', { name: '作業先の選択' })).toBeTruthy();
  });

  // FR-144 AC-238
  it('FR-144 AC-238 1 件でも読込完了後に選択画面を出し、前回の作業先が最初の候補。デモも選べる', async () => {
    const [p1] = seed(1);
    st().open(p1 ?? null);
    render(wrap(<ProjectsPanel />));
    act(() => useRestoreStatus.setState({ done: true }));
    const picker = await screen.findByRole('dialog', { name: '作業先の選択' });
    const opts = within(picker).getAllByRole('option');
    expect(opts[0]!.textContent).toContain('合成株式会社A / 業務改善 2026');
    expect(opts.some((o) => /デモ/.test(o.textContent ?? ''))).toBe(true);
    fireEvent.click(opts[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '作業先の選択' })).toBeNull());
    expect(screen.getByTestId('work-target').textContent).toBe('合成株式会社A / 業務改善 2026');
  });

  // FR-144 AC-237
  it('FR-144 AC-237 0 件でも選択画面が出て、Esc では閉じられず、デモを選ぶと「デモ」になる', async () => {
    render(wrap(<ProjectsPanel />));
    act(() => useRestoreStatus.setState({ done: true }));
    const picker = await screen.findByRole('dialog', { name: '作業先の選択' });
    fireEvent.keyDown(picker, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '作業先の選択' })).toBeTruthy();
    fireEvent.click(within(picker).getByRole('option', { name: /デモ/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '作業先の選択' })).toBeNull());
    expect(screen.getByTestId('work-target').textContent).toBe('デモ');
  });

  // FR-144 AC-241
  it('FR-144 AC-241 デモ非表示・0 件でも「実際の Project を登録」と設定への案内が出る', async () => {
    useSettings.getState().setShowDemoInPicker(false);
    try {
      render(wrap(<ProjectsPanel />));
      act(() => useRestoreStatus.setState({ done: true }));
      const picker = await screen.findByRole('dialog', { name: '作業先の選択' });
      expect(within(picker).queryByRole('option', { name: /デモ/ })).toBeNull();
      expect(within(picker).getByRole('option', { name: '実際の Project を登録' })).toBeTruthy();
      expect(within(picker).getByText(/設定の「選択画面にデモを表示」/)).toBeTruthy();
    } finally {
      useSettings.getState().setShowDemoInPicker(true);
    }
  });

  // FR-144 AC-231
  it('FR-144 AC-231 デモを選ぶと企業一覧を出さず、未保存の入力があると確認し、キャンセルで残す', async () => {
    const [p1] = seed(2);
    st().open(p1 ?? null);
    useAnalyses.getState().setDraft(p1 ?? '', 'param', '123');
    render(wrap(<ProjectsPanel />));
    act(() => useRestoreStatus.setState({ done: true }));
    const picker = await screen.findByRole('dialog', { name: '作業先の選択' });
    expect(screen.getAllByText(/合成株式会社A/).length).toBeGreaterThan(0);
    fireEvent.click(within(picker).getByRole('option', { name: /デモ/ }));
    // 確認ダイアログ（FR-138 AC-210 と同じ条件）。切替は確定されていない
    const confirm = await screen.findByRole('alertdialog', { name: '未保存の入力があります' });
    expect(st().openId).toBe(p1);
    fireEvent.click(within(confirm).getByRole('button', { name: 'キャンセル' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(st().openId).toBe(p1);
    expect(useAnalyses.getState().drafts[p1 ?? '']?.param).toBe('123');

    // もう一度デモへ → 「切り替える」で切替。入力は Project に残り、企業一覧は出ない
    fireEvent.click(screen.getByRole('button', { name: '作業先' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: '作業先の選択' })).getByRole('option', { name: /デモ/ }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '切り替える' }));
    await waitFor(() => expect(st().openId).toBeNull());
    expect(screen.getByTestId('work-target').textContent).toBe('デモ');
    expect(screen.queryByText(/業務改善 2026/)).toBeNull(); // 企業一覧・Project は出ない（作業先の表示は「デモ」）
    expect(useAnalyses.getState().drafts[p1 ?? '']?.param).toBe('123');
  });
});
