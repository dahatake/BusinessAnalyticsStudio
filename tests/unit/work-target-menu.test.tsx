// @vitest-environment jsdom
// FR-148 の描画テスト（AC-251・AC-252・AC-253）。jsdom + testing-library。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import userEvent from '@testing-library/user-event';
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

// 負荷が高い並列実行でも、ダイアログの描画待ちで時間切れにならないようにする（確かめる内容は変えない）
vi.setConfig({ testTimeout: 30000 });
beforeEach(() => {
  resetProjects(); resetAnalyses();
  useWorkTargetUi.setState({ demoOnly: false });
  useRestoreStatus.setState({ done: false });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView ??= vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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
  it('FR-148 AC-251 AC-253 FR-226 AC-525 選択企業だけの Project が並び、企業の選択では現在先を変えず Project 確定で変更する', async () => {
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
    expect(within(list).getAllByRole('menuitemradio').length).toBe(3);
    expect(within(list).getAllByRole('menuitemradio').filter((i) => i.getAttribute('aria-checked') === 'true').length).toBe(1);
    expect(within(list).getByRole('menuitemradio', { name: /デモ/ }).getAttribute('aria-checked')).toBe('true');
    expect(within(list).getByRole('button', { name: '合成株式会社A' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(list).queryByRole('menuitemradio', { name: /合成株式会社B/ })).toBeNull();
    fireEvent.click(within(list).getByRole('button', { name: '合成株式会社B' }));
    expect(within(list).getByRole('button', { name: '合成株式会社B' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(list).getByRole('button', { name: '合成株式会社A' }).getAttribute('aria-pressed')).toBe('false');
    expect(list.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(list.getAttribute('aria-describedby')!)?.textContent).toContain('合成株式会社B');
    expect(within(list).getByRole('group', { name: '合成株式会社B の Project' })).toBeTruthy();
    expect(within(list).queryByRole('menuitemradio', { name: /合成株式会社A/ })).toBeNull();
    expect(st().openId).toBeNull();
    expect(trigger.textContent).toBe('デモ');
    fireEvent.click(within(list).getByRole('menuitemradio', { name: /合成株式会社B.*品質改善/ }));
    await waitFor(() => expect(st().openId).toBe(b2));
    expect(screen.getByTestId('work-target-menu').textContent).toBe('合成株式会社B - 品質改善'); // FR-226 AC-525
    const head = screen.getByTestId('projects-head');
    // 非可視の現在先通知は残し、上部の可視の企業名・Project 名はトリガーだけにする。
    expect(within(head).getByRole('status').getAttribute('aria-label')).toContain('合成株式会社B - 品質改善');
    expect(within(head).getAllByText(/合成株式会社B.*品質改善/).filter((el) => !el.closest('[role="status"]')))
      .toEqual([within(trigger).getByText('合成株式会社B - 品質改善')]);
  });

  // FR-148 AC-253: キーボードだけで開き、選び、確定し、Esc で閉じる
  it('FR-148 AC-251 AC-253 FR-226 AC-525 キーボードだけで企業選択と Project 確定ができ、Esc で閉じると現在企業に戻る', async () => {
    // jsdom はレイアウトを持たない。Tabster が可視要素を判定できるよう、
    // display:none を保った offsetParent と body の領域だけを補う（操作・focus はモックしない）。
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
      for (let el: HTMLElement | null = this; el; el = el.parentElement) {
        if (el.hidden || getComputedStyle(el).display === 'none') return null;
      }
      return this.parentElement;
    });
    vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1280, 900));
    const user = userEvent.setup();
    const [p1] = company('合成株式会社A', ['業務改善 2026', '在庫最適化']);
    const [b1] = company('合成株式会社B', ['需要予測', '品質改善']);
    st().open(p1 ?? null);
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: '作業先' })); // 作業先の選択画面を開く（起動直後はメイン画面。FR-144 AC-398）
    const dlg = await screen.findByRole('dialog', { name: '作業先の選択' });
    fireEvent.click(within(dlg).getAllByRole('option')[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '作業先の選択' })).toBeNull());
    const trigger = screen.getByTestId('work-target-menu');
    expect(trigger.tagName).toBe('BUTTON'); // Tab で到達でき、Enter・Space で開ける標準のボタン
    act(() => trigger.focus());
    await user.keyboard('{Enter}');
    const list = await screen.findByRole('menu', { name: '作業先' });
    expect(within(list).getByRole('menuitemradio', { name: /合成株式会社A.*業務改善/ }).getAttribute('aria-checked')).toBe('true');
    const tabTo = async (target: HTMLElement) => {
      for (let i = 0; i < 12 && document.activeElement !== target; i++) await user.tab();
      expect(document.activeElement).toBe(target);
    };
    await tabTo(within(list).getByRole('button', { name: '合成株式会社B' }));
    await user.keyboard('{Enter}');
    expect(st().openId).toBe(p1);
    expect(trigger.textContent).toBe('合成株式会社A - 業務改善 2026');
    expect(within(list).queryByRole('menuitemradio', { name: /合成株式会社A/ })).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu', { name: '作業先' })).toBeNull());
    expect(document.activeElement).toBe(trigger);
    await user.keyboard('{ArrowDown}');
    const reopened = await screen.findByRole('menu', { name: '作業先' });
    expect(within(reopened).getByRole('menuitemradio', { name: /合成株式会社A.*業務改善/ }).getAttribute('aria-checked')).toBe('true');
    await tabTo(within(reopened).getByRole('button', { name: '合成株式会社B' }));
    await user.keyboard(' ');
    await tabTo(within(reopened).getByRole('menuitemradio', { name: /合成株式会社B.*需要予測/ }));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(st().openId).toBe(b1));
    expect(screen.queryByRole('menu', { name: '作業先' })).toBeNull();
    expect(trigger.textContent).toBe('合成株式会社B - 需要予測');
    // 同じ企業内の切替とデモへの移動も保つ。
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitemradio', { name: /合成株式会社B.*品質改善/ }));
    expect(trigger.textContent).toBe('合成株式会社B - 品質改善');
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitemradio', { name: /デモ/ }));
    expect(trigger.textContent).toBe('デモ');
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
    fireEvent.click(await screen.findByRole('button', { name: '合成株式会社B' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /合成株式会社B.*需要予測/ }));
    await screen.findByRole('alertdialog', { name: '未保存の入力があります' }, { timeout: 5000 });
    expect(st().openId).toBe(a1);
    // 確認ダイアログは開いた直後に描き直されることがあるので、押す時点の要素を毎回取り直す
    await waitFor(() => fireEvent.click(within(screen.getByRole('alertdialog', { name: '未保存の入力があります' })).getByRole('button', { name: 'キャンセル' })), { timeout: 5000 });
    expect(st().openId).toBe(a1);
    expect(useAnalyses.getState().drafts[a1 ?? '']?.param).toBe('9'); // 失われない
    fireEvent.click(screen.getByTestId('work-target-menu'));
    fireEvent.click(await screen.findByRole('button', { name: '合成株式会社B' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /合成株式会社B.*需要予測/ }));
    await waitFor(() => fireEvent.click(within(screen.getByRole('alertdialog', { name: '未保存の入力があります' })).getByRole('button', { name: '切り替える' })), { timeout: 5000 });
    await waitFor(() => expect(st().openId).toBe(b1));
    expect(useAnalyses.getState().drafts[a1 ?? '']?.param).toBe('9'); // 前の Project に残る
    expect(useAnalyses.getState().drafts[b1 ?? '']).toBeUndefined();
  });

  // FR-148 AC-252: 0 件の企業
  it('FR-148 AC-252 Project が 0 件の企業は、Project がないことと作成への案内が示され、押すと作成の dialog が開く', async () => {
    company('合成株式会社A', []);
    company('合成株式会社B', ['需要予測']);
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: '作業先' })); // 作業先の選択画面を開く（起動直後はメイン画面。FR-144 AC-398）
    const dlg = await screen.findByRole('dialog', { name: '作業先の選択' });
    fireEvent.click(within(dlg).getByRole('option', { name: /デモ/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '作業先の選択' })).toBeNull());
    fireEvent.click(screen.getByTestId('work-target-menu'));
    fireEvent.click(await screen.findByRole('button', { name: '合成株式会社B' }));
    expect(await screen.findByRole('menuitemradio', { name: /合成株式会社B.*需要予測/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Project がありません/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '合成株式会社A' }));
    expect(screen.queryByRole('menuitemradio', { name: /合成株式会社B/ })).toBeNull();
    const guide = await screen.findByRole('menuitem', { name: /Project がありません/ });
    fireEvent.click(guide);
    const create = await screen.findByRole('dialog', { name: 'Project を作成' });
    fireEvent.change(within(create).getByRole('textbox', { name: 'Project 名' }), { target: { value: '新しい分析' } });
    fireEvent.click(within(create).getByRole('button', { name: '作成' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Project を作成' })).toBeNull());
    const added = st().projects.find((p) => p.name === '新しい分析');
    expect(added?.companyId).toBe(st().companies.find((c) => c.name === '合成株式会社A')?.id);
  });
});
