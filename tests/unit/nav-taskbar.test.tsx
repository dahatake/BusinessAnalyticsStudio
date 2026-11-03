// @vitest-environment jsdom
// FR-295 AC-824・AC-825 左メニューのタスクバー化（件数バッジ・青いバー・押下の遷移）の単体・結合テスト
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { Add24Regular } from '@fluentui/react-icons';
import { AppShell } from '../../src/components/AppShell';
import { useWindowStatus } from '../../src/store/windowStatus';
import { navSummary, navTarget, screenKeyOf, type WindowState } from '../../src/workspace/windowStates';
import type { ScreenDefinition } from '../../src/screens/types';

afterEach(() => cleanup());

const S = (o: Record<string, WindowState>) => o;
const own = { a1: 'a', a2: 'a', b1: 'b', c1: 'c' };

describe('FR-295 AC-824 画面ごとの件数と前面の有無', () => {
  // FR-295 AC-824
  it('FR-295 AC-824 前面+最小化=2 件・前面あり、前面でないだけ=1 件・前面なし、閉じただけの画面は含めない', () => {
    const sum = navSummary(S({ a1: 'front', a2: 'minimized', b1: 'visible', c1: 'closed' }), own);
    expect(sum).toEqual({ a: { count: 2, hasFront: true }, b: { count: 1, hasFront: false } });
    expect(sum.c).toBeUndefined();
  });
  // FR-295 AC-824
  it('FR-295 AC-824 screenKey を宣言しないコンポーネントは自分自身の画面に属する', () => {
    expect(screenKeyOf({ key: 'x' })).toBe('x');
    expect(screenKeyOf({ key: 'x', screenKey: 'y' })).toBe('y');
    expect(navSummary(S({ x: 'visible' }), {})).toEqual({ x: { count: 1, hasFront: false } });
  });
});

describe('FR-295 AC-825 左メニューの項目を押したときの対象', () => {
  // FR-295 AC-825
  it('FR-295 AC-825 前面の Window があればそれを（最小化の対象として）選ぶ', () => {
    expect(navTarget('a', S({ a1: 'front', a2: 'minimized' }), own, { a2: 9 })).toEqual({ key: 'a1', state: 'front' });
  });
  // FR-295 AC-825
  it('FR-295 AC-825 前面がなければ、開いている Window のうち最後に前面にしたものを選ぶ（最小化中は復元の対象）', () => {
    expect(navTarget('a', S({ a1: 'minimized', a2: 'minimized' }), own, { a1: 5, a2: 8 })).toEqual({ key: 'a2', state: 'minimized' });
    expect(navTarget('a', S({ a1: 'visible', a2: 'minimized' }), own, { a1: 9, a2: 3 })).toEqual({ key: 'a1', state: 'visible' });
  });
  // FR-295 AC-825 異常系
  it('FR-295 AC-825 開いているものがなければ閉じた Window を表示の対象にする。属する Window がなければ null', () => {
    expect(navTarget('c', S({ c1: 'closed' }), own, {})).toEqual({ key: 'c1', state: 'closed' });
    expect(navTarget('a', S({ a1: 'closed', a2: 'closed' }), own, { a1: 2, a2: 7 })).toEqual({ key: 'a2', state: 'closed' });
    expect(navTarget('zzz', S({ a1: 'front' }), own, {})).toBeNull();
  });
});

describe('FR-295 AC-824 左メニューの描画', () => {
  const Dummy = () => null;
  const screens = ['a', 'b', 'c'].map((k) => ({ key: k, label: `画面${k}`, icon: Add24Regular, component: Dummy }) as ScreenDefinition);
  const show = (states: Record<string, WindowState>) => {
    useWindowStatus.setState({ states, screenOf: own, inTree: Object.keys(states) });
    return render(<FluentProvider theme={webLightTheme}><AppShell title="t" screens={screens} onSelect={() => {}}>x</AppShell></FluentProvider>);
  };
  beforeEach(() => useWindowStatus.setState({ states: {}, screenOf: {}, inTree: [] }));

  // FR-295 AC-824
  it('FR-295 AC-824 2 件の画面にバッジ「2」と長いバー、前面でないだけの画面に短いバー（バッジなし）、閉じた画面には何も出ない', () => {
    show({ a1: 'front', a2: 'minimized', b1: 'visible', c1: 'closed' });
    const badge = screen.getByTestId('nav-badge-a');
    expect(badge.textContent).toBe('2');
    expect(badge.getAttribute('data-count')).toBe('2');
    expect(badge.getAttribute('aria-label')).toMatch(/2/);
    expect(screen.getByTestId('nav-bar-a').getAttribute('data-state')).toBe('front');
    expect(screen.getByTestId('nav-bar-b').getAttribute('data-state')).toBe('other');
    expect(screen.queryByTestId('nav-badge-b')).toBeNull();
    expect(screen.queryByTestId('nav-badge-c')).toBeNull();
    expect(screen.queryByTestId('nav-bar-c')).toBeNull();
  });
  // FR-295 AC-824
  it('FR-295 AC-824 前面ありと前面なしのバーは、色以外（アクセシブルな名前）でも区別でき、バーは nav-<key> の中にある', () => {
    show({ a1: 'front', b1: 'visible' });
    const front = screen.getByTestId('nav-bar-a');
    const other = screen.getByTestId('nav-bar-b');
    expect(front.getAttribute('aria-label')).toBeTruthy();
    expect(front.getAttribute('aria-label')).not.toBe(other.getAttribute('aria-label'));
    expect(screen.getByTestId('nav-a').contains(front)).toBe(true);
  });
  // FR-295 AC-824
  it('FR-295 AC-824 状態が変わると即座に表示が変わる（最小化→前面なし、すべて閉じる→消える）', () => {
    show({ a1: 'front', a2: 'minimized' });
    expect(screen.getByTestId('nav-bar-a').getAttribute('data-state')).toBe('front');
    act(() => useWindowStatus.setState({ states: { a1: 'minimized', a2: 'minimized' } }));
    expect(screen.getByTestId('nav-bar-a').getAttribute('data-state')).toBe('other');
    act(() => useWindowStatus.setState({ states: { a1: 'closed', a2: 'closed' } }));
    expect(screen.queryByTestId('nav-bar-a')).toBeNull();
  });
  // FR-295 AC-825
  it('FR-295 AC-825 項目を押すと onSelect が画面の key で呼ばれる', () => {
    const calls: string[] = [];
    useWindowStatus.setState({ states: { a1: 'front' }, screenOf: own, inTree: ['a1'] });
    render(<FluentProvider theme={webLightTheme}><AppShell title="t" screens={screens} onSelect={(k) => calls.push(k)}>x</AppShell></FluentProvider>);
    fireEvent.click(screen.getByTestId('nav-a'));
    fireEvent.click(screen.getByTestId('nav-b'));
    expect(calls).toEqual(['a', 'b']);
  });
});
