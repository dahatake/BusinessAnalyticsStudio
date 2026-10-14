// @vitest-environment jsdom
// FR-154 AC-274（結合）: 未定義の「未設定」と定義への案内、色だけで示さない状態、最終更新日時、非表示からの再表示。FR-153 AC-272（画面の検証エラー）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { KpiOkrScreen } from '../../src/screens/KpiOkrScreen';
import { usePackStore } from '../../src/store/pack';
import { useOkr } from '../../src/store/okr';
import { resetProjects, useProjects } from '../../src/store/projects';
import { resetEditForTest, useEditStore } from '../../src/store/edit';
import { effectiveLayout, setAvailableComponents, useLayout } from '../../src/store/layout';
import { isVisible, keysOf } from '../../src/workspace/layoutModel';

const okr = {
  updatedAt: '2026-10-01T09:00:00+09:00',
  objectives: [{ objective: '合成の目標', keyResults: [
    { name: 'KR1', kpi: { name: '売上', unit: '万円', baseline: 0, target: 200, current: 50 } },
    { name: 'KR2', kpi: { name: '欠品率', unit: '%', baseline: 10, target: 10, current: 20 } },
  ] }],
};
const setPack = (withOkr: boolean) => usePackStore.setState({
  state: { status: 'ready', warnings: [], pack: { data: { customer: { name: 'x', ...(withOkr ? { okr } : {}) } } } },
} as never);
const ui = () => render(<FluentProvider theme={webLightTheme}><KpiOkrScreen /></FluentProvider>);

beforeEach(() => {
  resetProjects(); useOkr.getState().reset(); resetEditForTest();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView ??= vi.fn();
});
afterEach(() => cleanup());

describe('FR-154 AC-274 表示', () => {
  it('定義がないと「未設定」と定義への案内を出し、数値を捏造しない', () => {
    setPack(false);
    ui();
    expect(screen.getByTestId('okr-unset').textContent).toContain('未設定');
    expect(screen.getByTestId('okr-unset').textContent).toContain('OKR を定義');
    expect(screen.queryAllByTestId('kpi-achievement')).toHaveLength(0);
    expect(screen.getByTestId('okr-updated').textContent).toContain('最終更新日時');
  });

  it('お手本（デモ）は、数値と文字（達成度・状態）と最終更新日時を示す。状態は文字でも示す', () => {
    setPack(true);
    ui();
    const a = screen.getAllByTestId('kpi-achievement').map((e) => e.textContent);
    expect(a).toEqual(['25%', '算出できない']);
    expect(screen.getAllByTestId('kpi-state').map((e) => e.textContent)).toEqual(['進行中', '算出できない']);
    expect(screen.getByTestId('okr-updated').textContent).toMatch(/2026-10-01 09:00/);
    expect(screen.getByText(/Objective: 合成の目標/)).toBeTruthy();
  });

  it('Project を開くと、その Project の定義だけを示す（デモのお手本は混ざらない）', () => {
    setPack(true);
    const c = useProjects.getState().addCompany('A');
    if (!c.ok) throw new Error();
    const p = useProjects.getState().addProject(c.id, 'P1');
    if (!p.ok) throw new Error();
    useProjects.setState({ openId: p.id });
    ui();
    expect(screen.getByTestId('okr-unset')).toBeTruthy();
  });
});

describe('FR-153 AC-272 定義ダイアログ', () => {
  it('編集モードが OFF のときは定義できない', () => {
    setPack(false);
    ui();
    expect((screen.getByRole('button', { name: 'OKR を定義' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('単位が空・数値でない入力は検証エラーで保存されない', async () => {
    setPack(false);
    act(() => useEditStore.getState().setEditMode(true));
    ui();
    fireEvent.click(screen.getByRole('button', { name: 'OKR を定義' }));
    const dlg = await screen.findByRole('dialog', { name: 'OKR の定義' });
    fireEvent.change(within(dlg).getByRole('textbox', { name: /Objective/ }), { target: { value: '目標' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Key Result を追加' }));
    const r = within(dlg).getByTestId('key-result');
    fireEvent.change(within(r).getByRole('textbox', { name: /Key Result 名/ }), { target: { value: 'KR' } });
    fireEvent.change(within(r).getByRole('textbox', { name: /KPI 名/ }), { target: { value: '売上' } });
    fireEvent.click(within(dlg).getByRole('button', { name: '保存' }));
    expect(within(dlg).getAllByRole('alert').length).toBeGreaterThan(0); // 単位・数値が空
    expect(useOkr.getState().byTarget.demo).toBeUndefined();
    fireEvent.change(within(r).getByRole('textbox', { name: /単位/ }), { target: { value: '万円' } });
    fireEvent.change(within(r).getByRole('spinbutton', { name: /基準値/ }), { target: { value: '0' } });
    fireEvent.change(within(r).getByRole('spinbutton', { name: /目標値/ }), { target: { value: '200' } });
    fireEvent.change(within(r).getByRole('spinbutton', { name: /現在値/ }), { target: { value: '50' } });
    fireEvent.click(within(dlg).getByRole('button', { name: '保存' }));
    expect(useOkr.getState().byTarget.demo?.objectives[0]?.keyResults[0]?.kpi.current).toBe(50);
    expect(useEditStore.getState().log.length).toBeGreaterThan(0);
  });
});

describe('FR-154 AC-274 非表示からの再表示', () => {
  it('KPI/OKR を非表示にしても、再表示と「既定のレイアウトに戻す」で戻る', () => {
    setAvailableComponents(['summary', 'matrix', 'ranking', 'canvas', 'kpi-okr']);
    const lay = () => effectiveLayout(useLayout.getState());
    expect(keysOf(lay())).toContain('kpi-okr');
    act(() => useLayout.getState().hideComponent('kpi-okr'));
    expect(isVisible(lay(), 'kpi-okr')).toBe(false);
    act(() => useLayout.getState().showComponent('kpi-okr'));
    expect(isVisible(lay(), 'kpi-okr')).toBe(true);
    act(() => useLayout.getState().hideComponent('kpi-okr'));
    act(() => useLayout.getState().resetLayout());
    expect(isVisible(lay(), 'kpi-okr')).toBe(true);
  });
});
