// @vitest-environment jsdom
// FR-183 AC-387 AC-388 AC-389（ハンドルの表示・ドラッグの開始・ダブルクリックで 75% 表示）。jsdom + testing-library。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { Panel } from '../../src/components/Panel';
import { Workspace } from '../../src/workspace/Workspace';
import { setAvailableComponents, useLayout } from '../../src/store/layout';
import type { ScreenDefinition } from '../../src/screens/types';

const A = () => <Panel testId="component-a" title="パネルA"><p>a</p></Panel>;
const B = () => <Panel testId="component-b" title="パネルB"><p>b</p></Panel>;
const screens: ScreenDefinition[] = [
  { key: 'a', label: 'A', icon: (() => null) as never, component: A },
  { key: 'b', label: 'B', icon: (() => null) as never, component: B },
];
const st = () => useLayout.getState();
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;
let spy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  setAvailableComponents(['a', 'b']);
  useLayout.setState({
    floats: {}, zOrder: [], expanded: null, maximized: null,
    layouts: { [st().persona]: { kind: 'split', dir: 'row', sizes: [0.5, 0.5], children: [{ kind: 'tabs', tabs: ['a'], active: 'a' }, { kind: 'tabs', tabs: ['b'], active: 'b' }] } },
  });
  // 作業領域 1000x800。a は左半分、b は右半分
  spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.hasAttribute('data-layout')) return rect(0, 0, 1000, 800);
    const id = this.getAttribute('data-testid') ?? '';
    if (id === 'component-a') return rect(0, 0, 500, 800);
    if (id === 'component-b') return rect(500, 0, 500, 800);
    return rect(0, 0, 0, 0);
  });
});
afterEach(() => { cleanup(); spy.mockRestore(); });

const wrap = (ui: JSX.Element) => <FluentProvider theme={webLightTheme}>{ui}</FluentProvider>;
const section = (k: string) => screen.getByTestId(`component-${k}`);

describe('FR-183 ハンドル', () => {
  // FR-183 AC-387
  it('FR-183 AC-387 すべてのコンポーネントの上部にハンドルと掴みの印があり、本体（panel-body）とは別の要素', () => {
    render(wrap(<Workspace screens={screens} />));
    for (const k of ['a', 'b']) {
      const c = section(k);
      const h = within(c).getByTestId('panel-handle');
      expect(within(h).getByTestId('panel-handle-grip')).toBeTruthy();
      expect(within(c).getByTestId('panel-body')).not.toBe(h);
      expect(c.firstElementChild).toBe(h);
    }
  });

  // FR-183 AC-389
  it('FR-183 AC-389 ハンドルのダブルクリックで拡大し、もう一度で戻る。本体のダブルクリックでは拡大しない', () => {
    render(wrap(<Workspace screens={screens} />));
    fireEvent.doubleClick(within(section('a')).getByTestId('panel-body'));
    expect(section('a').getAttribute('data-expanded')).toBeNull();
    fireEvent.doubleClick(within(section('a')).getByTestId('panel-handle'));
    expect(section('a').getAttribute('data-expanded')).toBe('true');
    expect(section('a').getAttribute('data-maximized')).toBeNull();
    fireEvent.doubleClick(within(section('a')).getByTestId('panel-handle'));
    expect(section('a').getAttribute('data-expanded')).toBeNull();
  });

  // FR-185 AC-394
  it('FR-185 AC-394 アニメーションが止まっている（動きの軽減）ときは、移動中の動きをつなぐ指定が付かず、結果は同じ', async () => {
    const { useAnimation } = await import('../../src/store/animation');
    const classOf = (playing: boolean): { cls: string; saved: boolean } => {
      cleanup();
      useAnimation.setState({ playing });
      useLayout.setState({ floats: {} });
      render(wrap(<Workspace screens={screens} />));
      const ptr = (target: Element | Window, type: string, x: number, y: number) =>
        fireEvent(target, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
      ptr(within(section('a')).getByTestId('panel-handle'), 'pointerdown', 250, 5);
      ptr(window, 'pointermove', 400, 100);
      ptr(window, 'pointermove', 750, 400);
      const cls = (document.querySelector('[data-float="a"]') as HTMLElement).className;
      ptr(window, 'pointerup', 750, 400);
      return { cls, saved: !!st().floats[st().persona]?.a };
    };
    const on = classOf(true);
    const off = classOf(false);
    expect(on.cls).not.toBe(off.cls);
    expect(on.saved && off.saved).toBe(true);
    useAnimation.setState({ playing: true });
  });

  // FR-183 AC-388 FR-185 AC-392 FR-184 AC-390
  it('FR-183 AC-388 ハンドルのドラッグで追従して動き、ドロップで重ならない位置が保存される。本体のドラッグでは動かない', () => {
    render(wrap(<Workspace screens={screens} />));
    const ptr = (target: Element | Window, type: string, x: number, y: number) =>
      fireEvent(target, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
    // 本体を押しても動かない
    ptr(within(section('a')).getByTestId('panel-body'), 'pointerdown', 100, 300);
    ptr(window, 'pointermove', 300, 300);
    ptr(window, 'pointerup', 300, 300);
    expect(st().floats[st().persona]).toBeUndefined();
    // ハンドルを b の中央へ
    ptr(within(section('a')).getByTestId('panel-handle'), 'pointerdown', 250, 5);
    ptr(window, 'pointermove', 400, 100);
    ptr(window, 'pointermove', 750, 400);
    expect(document.querySelector('[data-float="a"]')).not.toBeNull();
    ptr(window, 'pointerup', 750, 400);
    const f = st().floats[st().persona]!;
    expect(f.a).toBeDefined();
    expect(f.b).toBeDefined();
    const ov = Math.max(0, Math.min(f.a!.x + f.a!.w, f.b!.x + f.b!.w) - Math.max(f.a!.x, f.b!.x)) * Math.max(0, Math.min(f.a!.y + f.a!.h, f.b!.y + f.b!.h) - Math.max(f.a!.y, f.b!.y));
    expect(ov).toBeLessThan(0.0001);
  });
});
