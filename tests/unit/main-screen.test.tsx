// @vitest-environment jsdom
// FR-186（メイン画面）と FR-187（メイン画面へ戻るボタン）の描画テスト。jsdom + testing-library。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import { MainScreen } from '../../src/projects/MainScreen';
import { ProjectsPanel } from '../../src/projects/ProjectsPanel';
import { resetProjects, useProjects } from '../../src/store/projects';
import { resetAnalyses, useAnalyses } from '../../src/store/analyses';
import { useMainScreen } from '../../src/store/mainScreen';
import { useWorkTargetUi } from '../../src/projects/workTargetUi';

const st = () => useProjects.getState();
const wrap = (ui: ReactNode) => <FluentProvider theme={webLightTheme}>{ui}</FluentProvider>;
const NAMES = ['企業を登録', 'Project を作成', 'Project を開く', '分析を開始'];

beforeEach(() => {
  resetProjects(); resetAnalyses();
  useMainScreen.setState({ shown: true });
  useWorkTargetUi.setState({ demoOnly: false });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView ??= vi.fn();
});
afterEach(() => cleanup());

function seed() {
  const c = st().addCompany('合成株式会社M');
  if (!c.ok) throw new Error();
  const p = st().addProject(c.id, '案件一号');
  if (!p.ok) throw new Error();
  return p.id;
}

describe('FR-186 メイン画面', () => {
  // FR-186 AC-395
  it('FR-186 AC-395 手順 4 つを順に示す案内と各手順の操作があり、手順外の機能は出ない', () => {
    render(wrap(<MainScreen />));
    const items = within(screen.getByTestId('main-guide')).getAllByRole('listitem');
    expect(items.length).toBe(4);
    items.forEach((li, i) => expect(li.textContent).toContain(NAMES[i]!));
    for (const n of NAMES) expect(screen.getAllByRole('button', { name: n }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('workspace')).toBeNull();
    expect(screen.queryByTestId('work-target-menu')).toBeNull();
  });

  // FR-186 AC-396
  it('FR-186 AC-396 企業を登録し Project を作成すると、企業の欄に出て、共通の保存先に入る', async () => {
    render(wrap(<MainScreen />));
    fireEvent.click(screen.getByRole('button', { name: '企業を登録' }));
    const dlg = await screen.findByRole('dialog', { name: '企業を登録' });
    fireEvent.change(within(dlg).getByRole('textbox', { name: '企業名' }), { target: { value: '合成株式会社M' } });
    fireEvent.click(within(dlg).getByRole('button', { name: '登録' }));
    // 並列負荷時の揺れを避けるため、保存の完了とダイアログ（モーダル）の閉じ終わりを待ってから次の操作をする。
    await waitFor(() => expect(st().companies.length).toBe(1));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '企業を登録' })).toBeNull());
    const region = await screen.findByRole('region', { name: '企業 合成株式会社M' });
    fireEvent.click(within(region).getByRole('button', { name: 'Project を作成' }));
    const d2 = await screen.findByRole('dialog', { name: 'Project を作成' });
    fireEvent.change(within(d2).getByRole('textbox', { name: 'Project 名' }), { target: { value: '案件一号' } });
    fireEvent.click(within(d2).getByRole('button', { name: '作成' }));
    await waitFor(() => expect(st().projects.map((p) => p.name)).toEqual(['案件一号']));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Project を作成' })).toBeNull());
    // 閉じ終わった後の企業の欄（再描画で置き換わっても追えるよう取り直す）に出ること。
    await waitFor(() => expect(within(screen.getByRole('region', { name: '企業 合成株式会社M' })).getByText('案件一号')).toBeTruthy());
  });

  // FR-186 AC-397
  it('FR-186 AC-397 現在の手順が aria-current で伝わり、空の企業名は原因が示され、入力は残る', async () => {
    render(wrap(<MainScreen />));
    const current = () => within(screen.getByTestId('main-guide')).getAllByRole('listitem').filter((li) => li.getAttribute('aria-current') === 'step').map((li) => li.textContent);
    expect(current()[0]).toContain('企業を登録');
    fireEvent.click(screen.getByRole('button', { name: '企業を登録' }));
    const dlg = await screen.findByRole('dialog', { name: '企業を登録' });
    fireEvent.click(within(dlg).getByRole('button', { name: '登録' }));
    expect(await within(dlg).findByRole('alert')).toBeTruthy();
    expect(st().companies.length).toBe(0);
    fireEvent.change(within(dlg).getByRole('textbox', { name: '企業名' }), { target: { value: '合成株式会社M' } });
    fireEvent.click(within(dlg).getByRole('button', { name: '登録' }));
    await waitFor(() => expect(st().companies.length).toBe(1));
    // 登録後はダイアログ（モーダル）が閉じ終わるまで背後の要素が支援技術から隠れるため、閉じ終わりを待ってから同じ判定をする。
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '企業を登録' })).toBeNull());
    await waitFor(() => expect(current()[0]).toContain('Project を作成'));
  });

  // FR-186 AC-395
  it('FR-186 AC-395 Project が 0 件のまま「分析を開始」を押すと案内が出て、メイン画面に留まる', async () => {
    render(wrap(<MainScreen />));
    fireEvent.click(screen.getByRole('button', { name: '分析を開始' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(useMainScreen.getState().shown).toBe(true);
  });

  // FR-186 AC-398（FR-144 AC-237・AC-239）
  it('FR-186 AC-398 Project を開くと 0 件でも選択画面が出て、閉じるとメイン画面に戻り、選ぶとメイン画面が閉じる', async () => {
    render(wrap(<MainScreen />));
    fireEvent.click(screen.getByRole('button', { name: 'Project を開く' }));
    const picker = await screen.findByRole('dialog', { name: '作業先の選択' });
    expect(within(picker).getByRole('option', { name: /デモ/ })).toBeTruthy();
    fireEvent.keyDown(picker, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '作業先の選択' })).toBeNull());
    expect(useMainScreen.getState().shown).toBe(true);

    const id = seed();
    fireEvent.click(screen.getByRole('button', { name: 'Project を開く' }));
    const p2 = await screen.findByRole('dialog', { name: '作業先の選択' });
    fireEvent.click(within(p2).getByRole('option', { name: /案件一号/ }));
    await waitFor(() => expect(useMainScreen.getState().shown).toBe(false));
    expect(st().openId).toBe(id);
  });
});

describe('FR-187 メイン画面へ戻るボタン', () => {
  // FR-187 AC-399 AC-402
  it('FR-187 AC-399 AC-402 上部のボタン「メイン画面へ戻る」は上部の段にあり、押すとメイン画面になり、Project は保たれる', () => {
    const id = seed();
    st().open(id);
    useMainScreen.setState({ shown: false });
    render(wrap(<ProjectsPanel />));
    const back = screen.getByRole('button', { name: 'メイン画面へ戻る' });
    expect(screen.getByTestId('projects-head').contains(back)).toBe(true); // 上部（作業先・企業を登録と同じ段）にある
    fireEvent.click(back);
    expect(useMainScreen.getState().shown).toBe(true);
    expect(st().openId).toBe(id);
  });

  // FR-187 AC-400
  it('FR-187 AC-400 未保存の入力があると確認が出て、キャンセルで留まり入力が残る。確定で戻っても入力は残る', async () => {
    const id = seed();
    st().open(id);
    useAnalyses.getState().setDraft(id, 'param', '7');
    useMainScreen.setState({ shown: false });
    render(wrap(<ProjectsPanel />));
    fireEvent.click(screen.getByRole('button', { name: 'メイン画面へ戻る' }));
    await screen.findByRole('alertdialog', { name: '未保存の入力があります' });
    expect(useMainScreen.getState().shown).toBe(false);
    await waitFor(() => fireEvent.click(within(screen.getByRole('alertdialog', { name: '未保存の入力があります' })).getByRole('button', { name: 'キャンセル' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(useMainScreen.getState().shown).toBe(false);
    expect(useAnalyses.getState().drafts[id]?.param).toBe('7');
    fireEvent.click(screen.getByRole('button', { name: 'メイン画面へ戻る' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '切り替える' }));
    await waitFor(() => expect(useMainScreen.getState().shown).toBe(true));
    expect(useAnalyses.getState().drafts[id]?.param).toBe('7');
  });
});
