// @vitest-environment jsdom
// FR-148 の描画テスト（AC-251・AC-252・AC-253）。jsdom + testing-library。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import { ProjectsPanel } from '../../src/projects/ProjectsPanel';
import { menuGroups } from '../../src/projects/workTarget';
import { resetProjects, useProjects } from '../../src/store/projects';
import { resetAnalyses, useAnalyses } from '../../src/store/analyses';
import { useRestoreStatus } from '../../src/store/persist';
import { useWorkTargetUi } from '../../src/projects/workTargetUi';

const st = () => useProjects.getState();
const wrap = (ui: ReactNode) => <FluentProvider theme={webLightTheme}>{ui}</FluentProvider>;

function company(name: string, projects: string[]): string[] {
  const c = st().addCompany(name);
  if (!c.ok) throw new Error();
  return projects.map((n) => { const p = st().addProject(c.id, n); if (!p.ok) throw new Error(); return p.id; });
}

beforeEach(() => {
  resetProjects(); resetAnalyses();
  useWorkTargetUi.setState({ demoOnly: false });
  useRestoreStatus.setState({ done: false });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView ??= vi.fn();
});
afterEach(() => cleanup());

async function openMenu() {
  render(wrap(<ProjectsPanel />));
  // 起動時の選択画面を、デモを選んで閉じる（FR-144 は変えない）
  const picker = await screen.findByRole('dialog', { name: '作業先の選択' }).catch(() => null);
  void picker;
}

describe('FR-148 作業先メニュー', () => {
  // FR-148 AC-251: 項目の並び（企業ごとにまとめ、0 件の企業も出す）
  it('FR-148 AC-251 menuGroups は企業ごとに進行中の Project をまとめ、0 件の企業も残す', () => {
    const [a1] = company('A社', ['p1', 'p2']);
    company('B社', []);
    st().setArchived(a1 ?? '', true);
    const g = menuGroups(st().projects, st().companies);
    expect(g.map((x) => [x.company.name, x.projects.map((p) => p.name)])).toEqual([['A社', ['p2']], ['B社', []]]);
  });

  // FR-148 AC-251 AC-253: 一覧・現在の作業先・キーボード
  it('FR-148 AC-251 AC-253 デモと全 Project が企業名・Project 名で並び、現在の作業先が checked。選ぶと表示が変わる', async () => {
    company('合成株式会社A', ['業務改善 2026', '在庫最適化']);
    const [b2] = company('合成株式会社B', ['需要予測', '品質改善']).slice(1);
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: '作業先' })); // 作業先の選択画面を開く（起動直後はメイン画面。FR-144 AC-398）
    const dlg = await screen.findByRole('dialog', { name: '作業先の選択' });
    fireEvent.click(within(dlg).getByRole('option', { name: /デモ/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '作業先の選択' })).toBeNull());
    const trigger = screen.getByTestId('work-target-menu');
    expect(trigger.textContent).toBe('デモ');
    expect(trigger.getAttribute('aria-label')).toContain('デモ');
    fireEvent.click(trigger);
    const list = await screen.findByRole('menu', { name: '作業先' });
    expect(within(list).getAllByRole('menuitemradio').length).toBe(5);
    expect(within(list).getAllByRole('menuitemradio').filter((i) => i.getAttribute('aria-checked') === 'true').length).toBe(1);
    expect(within(list).getByRole('menuitemradio', { name: /デモ/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(list).getByRole('menuitemradio', { name: /合成株式会社B.*品質改善/ }));
    await waitFor(() => expect(st().openId).toBe(b2));
    expect(screen.getByTestId('work-target-menu').textContent).toBe('合成株式会社B / 品質改善');
  });

  // FR-148 AC-253: キーボードだけで開き、選び、確定し、Esc で閉じる
  it('FR-148 AC-253 キーボードだけで開き、矢印で選び、Enter で確定、Esc で閉じられる', async () => {
    const [p1] = company('合成株式会社A', ['業務改善 2026', '在庫最適化']);
    st().open(p1 ?? null);
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: '作業先' })); // 作業先の選択画面を開く（起動直後はメイン画面。FR-144 AC-398）
    const dlg = await screen.findByRole('dialog', { name: '作業先の選択' });
    fireEvent.click(within(dlg).getAllByRole('option')[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '作業先の選択' })).toBeNull());
    const trigger = screen.getByTestId('work-target-menu');
    expect(trigger.tagName).toBe('BUTTON'); // Tab で到達でき、Enter・Space で開ける標準のボタン
    act(() => trigger.focus());
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(trigger);
    const list = await screen.findByRole('menu', { name: '作業先' });
    fireEvent.keyDown(list, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu', { name: '作業先' })).toBeNull());
    expect(screen.getByTestId('work-target-menu').textContent).toContain('業務改善 2026');
  });

  // FR-148 AC-252 AC-210 AC-209
  it('FR-148 AC-252 未保存の入力があれば確認が出て、キャンセルで移動しない。確定後は前の Project の入力が表示に残らない', async () => {
    const [a1] = company('合成株式会社A', ['業務改善 2026']);
    const [b1] = company('合成株式会社B', ['需要予測']);
    st().open(a1 ?? null);
    useAnalyses.getState().setDraft(a1 ?? '', 'param', '9');
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: '作業先' })); // 作業先の選択画面を開く（起動直後はメイン画面。FR-144 AC-398）
    const dlg = await screen.findByRole('dialog', { name: '作業先の選択' });
    fireEvent.click(within(dlg).getByRole('option', { name: /業務改善 2026/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '作業先の選択' })).toBeNull());
    fireEvent.click(screen.getByTestId('work-target-menu'));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /合成株式会社B.*需要予測/ }));
    await screen.findByRole('alertdialog', { name: '未保存の入力があります' });
    expect(st().openId).toBe(a1);
    // 確認ダイアログは開いた直後に描き直されることがあるので、押す時点の要素を毎回取り直す
    await waitFor(() => fireEvent.click(within(screen.getByRole('alertdialog', { name: '未保存の入力があります' })).getByRole('button', { name: 'キャンセル' })));
    expect(st().openId).toBe(a1);
    expect(useAnalyses.getState().drafts[a1 ?? '']?.param).toBe('9'); // 失われない
    fireEvent.click(screen.getByTestId('work-target-menu'));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /合成株式会社B.*需要予測/ }));
    await waitFor(() => fireEvent.click(within(screen.getByRole('alertdialog', { name: '未保存の入力があります' })).getByRole('button', { name: '切り替える' })));
    await waitFor(() => expect(st().openId).toBe(b1));
    expect(useAnalyses.getState().drafts[a1 ?? '']?.param).toBe('9'); // 前の Project に残る
    expect(useAnalyses.getState().drafts[b1 ?? '']).toBeUndefined();
  });

  // FR-148 AC-252: 0 件の企業
  it('FR-148 AC-252 Project が 0 件の企業は、Project がないことと作成への案内が示され、押すと作成の dialog が開く', async () => {
    company('合成株式会社A', []);
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: '作業先' })); // 作業先の選択画面を開く（起動直後はメイン画面。FR-144 AC-398）
    const dlg = await screen.findByRole('dialog', { name: '作業先の選択' });
    fireEvent.click(within(dlg).getByRole('option', { name: /デモ/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '作業先の選択' })).toBeNull());
    fireEvent.click(screen.getByTestId('work-target-menu'));
    const guide = await screen.findByRole('menuitem', { name: /Project がありません/ });
    fireEvent.click(guide);
    expect(await screen.findByRole('dialog', { name: 'Project を作成' })).toBeTruthy();
  });
});
