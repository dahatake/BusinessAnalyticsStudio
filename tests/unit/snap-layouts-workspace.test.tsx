// @vitest-environment jsdom
// レイアウトの雛形（FR-305）の結合テスト: 本番の Workspace を描画し、ドラッグ（上端の中央にとどめる）・見出しのメニュー・
// コマンドパレット・Ctrl+Alt+Z の入口、区画への配置、背面の扱い、Esc・区画の外のドロップ・pointercancel の復元を確かめる。
// jsdom は寸法と elementsFromPoint を持たないので、作業領域とコンポーネントの矩形をストアの配置から返し、ポインターの下の要素を差し替える。
// FR-305 AC-861 AC-863 AC-865 AC-866 AC-867、FR-152 AC-793
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { Panel } from '../../src/components/Panel';
import { Workspace } from '../../src/workspace/Workspace';
import { CommandPalette } from '../../src/commands/CommandPalette';
import { useCommandUi } from '../../src/commands/ui';
import { pressWindow } from '../../src/workspace/windowActions';
import { LAYOUT_DWELL_MS } from '../../src/workspace/snapLayouts';
import { setAvailableComponents, useLayout, type FloatRect } from '../../src/store/layout';
import type { ScreenDefinition } from '../../src/screens/types';

const A = () => <Panel testId="component-a" title="パネルA"><input aria-label="入力A" /></Panel>;
const B = () => <Panel testId="component-b" title="パネルB"><p>b</p></Panel>;
const C = () => <Panel testId="component-c" title="パネルC"><p>c</p></Panel>;
const screens: ScreenDefinition[] = [
  { key: 'a', label: 'A', icon: (() => null) as never, component: A },
  { key: 'b', label: 'B', icon: (() => null) as never, component: B },
  { key: 'c', label: 'C', icon: (() => null) as never, component: C },
];
const st = () => useLayout.getState();
const persona = () => st().persona;
const floats = () => st().floats[persona()] ?? {};
const behind = () => st().behind[persona()] ?? [];
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;
const AREA_H = 800;
let areaW = 1200;
let under: Element[] = [];
let spy: ReturnType<typeof vi.spyOn>;
let rectsSpy: ReturnType<typeof vi.spyOn>;
let efp: unknown;

/** 3 列（a・b・c。高さは上半分）。作業領域は areaW x 800 */
function setup(width = 1200) {
  areaW = width;
  setAvailableComponents(['a', 'b', 'c']);
  useLayout.setState({
    floats: {}, pinned: {}, zOrder: [], expanded: null, maximized: null, minimized: {}, manual: {}, behind: {},
    layouts: {
      [persona()]: {
        kind: 'split', dir: 'row', sizes: [1 / 3, 1 / 3, 1 / 3],
        children: [{ kind: 'tabs', tabs: ['a'], active: 'a' }, { kind: 'tabs', tabs: ['b'], active: 'b' }, { kind: 'tabs', tabs: ['c'], active: 'c' }],
      },
    },
  });
}

beforeEach(() => {
  setup();
  under = [];
  efp = (document as unknown as { elementsFromPoint?: unknown }).elementsFromPoint;
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => under;
  spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const id = this.getAttribute('data-testid') ?? '';
    if (this.hasAttribute('data-layout') && id !== 'snap-layout-zone' && id !== 'snap-assist-zone') return rect(0, 0, areaW, AREA_H);
    const m = /^component-([abc])$/.exec(id);
    if (!m) return rect(0, 0, 0, 0);
    const k = m[1]!;
    if (st().maximized === k) return rect(0, 0, areaW, AREA_H);
    const f: FloatRect | undefined = st().pinned[persona()]?.[k] ?? floats()[k];
    if (f) return rect(f.x * areaW, f.y * AREA_H, f.w * areaW, f.h * AREA_H);
    const i = 'abc'.indexOf(k);
    return rect((i * areaW) / 3, 0, areaW / 3, AREA_H / 2);
  });
  rectsSpy = vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(() => [rect(0, 0, 10, 10)] as unknown as DOMRectList);
});
afterEach(() => {
  cleanup();
  spy.mockRestore();
  rectsSpy.mockRestore();
  (document as unknown as { elementsFromPoint: unknown }).elementsFromPoint = efp;
  useCommandUi.setState({ paletteOpen: false });
});

const wrap = (ui: JSX.Element) => <FluentProvider theme={webLightTheme}>{ui}</FluentProvider>;
const section = (k: string) => screen.getByTestId(`component-${k}`);
const handle = (k: string) => within(section(k)).getByTestId('panel-handle');
const focus = (k: string) => act(() => { (document.activeElement as HTMLElement | null)?.blur?.(); section(k).focus(); });
const ptr = (target: Element | Window, type: string, x: number, y: number) =>
  fireEvent(target, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
const wait = (ms: number) => act(() => new Promise<void>((r) => { setTimeout(r, ms); }));
const popup = () => screen.queryByTestId('snap-layouts');
const zoneBtn = (id: number, zone: number) => document.querySelector<HTMLElement>(`[data-testid="snap-layout-zone"][data-layout="${id}"][data-zone="${zone}"]`)!;
const zIndexOf = (k: string) => Number((document.querySelector<HTMLElement>(`[data-float="${k}"]`)?.style.zIndex) ?? NaN);
const close = (r: FloatRect | undefined, e: FloatRect) => {
  expect(r).toBeDefined();
  for (const p of ['x', 'y', 'w', 'h'] as const) expect(r![p]).toBeCloseTo(e[p], 2);
};

/** `k` を（gx, gy）で掴み、作業領域の中を通って（x, y）へ動かし、とどまる */
async function dragTo(k: string, gx: number, gy: number, x: number, y: number) {
  ptr(handle(k), 'pointerdown', gx, gy);
  ptr(window, 'pointermove', gx, 400);
  ptr(window, 'pointermove', x, y);
  await wait(LAYOUT_DWELL_MS + 100);
}

describe('FR-305 AC-866 ポップアップを閉じたときの復元（本番の Workspace の restoreBefore）', () => {
  const snapshot = () => ({ zOrder: [...st().zOrder], behind: st().behind[persona()], floats: JSON.stringify(floats()), layouts: JSON.stringify(st().layouts) });

  for (const how of ['Esc', '区画の外のドロップ', 'pointercancel'] as const) {
    it(`FR-305 AC-866 ${how}で閉じると、配置・前後関係・背面は操作の前と同じで、入力中の内容も変わらない`, async () => {
      useLayout.setState({ zOrder: ['c', 'a'], behind: { [persona()]: ['c'] } });
      render(wrap(<Workspace screens={screens} />));
      const input = screen.getByLabelText('入力A') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '入力中' } });
      const before = snapshot();
      await dragTo('b', 600, 100, 600, 5);
      expect(popup(), 'ポップアップが出ない').not.toBeNull();
      expect(st().zOrder.at(-1), '掴んだものが手前に出ていない').toBe('b');
      if (how === 'Esc') fireEvent.keyDown(window, { key: 'Escape' });
      else if (how === 'pointercancel') ptr(window, 'pointercancel', 600, 5);
      else { under = []; ptr(window, 'pointerup', 600, 5); }
      expect(popup()).toBeNull();
      expect(snapshot()).toEqual(before);
      expect((screen.getByLabelText('入力A') as HTMLInputElement).value).toBe('入力中');
    });
  }

  it('FR-305 AC-866 最大化中のものを掴んでポップアップを出し、Esc で閉じると最大化に戻る（没入・最大化は保つ）', async () => {
    useLayout.setState({ maximized: 'a' });
    render(wrap(<Workspace screens={screens} />));
    await dragTo('a', 600, 100, 600, 5);
    expect(popup()).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(popup()).toBeNull();
    expect(st().maximized).toBe('a');
  });

  it('FR-305 AC-866 最大化中に Ctrl+Alt+Z で開いたポップアップの Esc は、ポップアップだけを閉じ、最大化を保つ', async () => {
    useLayout.setState({ maximized: 'a' });
    render(wrap(<Workspace screens={screens} />));
    focus('a');
    fireEvent.keyDown(section('a'), { key: 'z', code: 'KeyZ', ctrlKey: true, altKey: true });
    expect(popup()).not.toBeNull();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(popup()).toBeNull();
    expect(st().maximized).toBe('a');
  });
});

describe('FR-305 AC-865 区画に配置されなかったもの（背面）と押し出し（FR-184）', () => {
  it('FR-305 AC-865 区画へ置くとほかは背面になり、押し出し・スナップで動かされず、手前の区画を覆わず、FR-295 の一覧・順次の埋めで前面に出せる', async () => {
    render(wrap(<Workspace screens={screens} />));
    await dragTo('b', 600, 100, 600, 5);
    expect(popup()).not.toBeNull();
    under = [zoneBtn(1, 1)];
    ptr(window, 'pointerup', 600, 5);
    close(floats().b, { x: 0, y: 0, w: 0.5, h: 1 });
    expect([...behind()].sort()).toEqual(['a', 'c']);
    const a0 = { ...floats().a! };
    const c0 = { ...floats().c! };
    // 手前の区画を覆わない（背面のものは区画のものより奥に描く）
    expect(zIndexOf('b')).toBeGreaterThan(zIndexOf('a'));
    expect(zIndexOf('b')).toBeGreaterThan(zIndexOf('c'));
    // b を右の端へスナップ（planSnap）。背面の a・c は押し出されない（frontOnly）
    under = [];
    ptr(handle('b'), 'pointerdown', 300, 100);
    ptr(window, 'pointermove', 600, 400);
    ptr(window, 'pointermove', areaW - 5, 400);
    expect(screen.getByTestId('snap-candidates')).toBeTruthy();
    ptr(window, 'pointerup', areaW - 5, 400);
    close(floats().b, { x: 0.5, y: 0, w: 0.5, h: 1 });
    expect(floats().a, '背面の a が押し出された').toEqual(a0);
    expect(floats().c, '背面の c が押し出された').toEqual(c0);
    // 自由な移動・リサイズ（resolveAround）でも背面は動かない: b を左へ掴んで動かす
    ptr(handle('b'), 'pointerdown', 900, 100);
    ptr(window, 'pointermove', 700, 400);
    ptr(window, 'pointermove', 500, 400);
    ptr(window, 'pointerup', 500, 400);
    expect(floats().a).toEqual(a0);
    expect(floats().c).toEqual(c0);
    // FR-295 の一覧（WindowList と左メニューが共有する pressWindow）から、背面のものを前面に出せる
    act(() => pressWindow('c', 'visible', true));
    expect(behind()).not.toContain('c');
    expect(zIndexOf('c')).toBeGreaterThan(zIndexOf('a'));
  });
});

describe('FR-305 AC-863 ドラッグを使わない 3 つの入口・方向キーと Enter・読み上げ名・Esc でのフォーカス復帰', () => {
  it('FR-305 AC-863 見出しのメニューの「レイアウトの雛形を開く」で開き、区画は「<雛形名> の<区画名>」と読み上げ、Esc でメニューを開く前の要素へ戻る', async () => {
    const user = userEvent.setup();
    render(wrap(<Workspace screens={screens} />));
    focus('a');
    fireEvent.click(within(section('a')).getByTestId('component-menu'));
    fireEvent.click(screen.getByRole('menuitem', { name: /レイアウトの雛形を開く/ }));
    await wait(50);
    expect(popup()).not.toBeNull();
    expect(screen.getByRole('dialog', { name: 'レイアウトの雛形' })).toBeTruthy();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('左 1/2・右 1/2 の左');
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('左 1/2・右 1/2 の右');
    await user.keyboard('{Escape}');
    expect(popup()).toBeNull();
    expect(section('a').contains(document.activeElement), 'フォーカスが操作中のコンポーネントへ戻らない').toBe(true);
    expect(floats().a, 'Esc で配置が変わった').toBeUndefined();
  });

  it('FR-305 AC-863 Ctrl+Alt+Z で開き、方向キーと Enter で区画へ置く', async () => {
    const user = userEvent.setup();
    render(wrap(<Workspace screens={screens} />));
    focus('a');
    fireEvent.keyDown(section('a'), { key: 'z', code: 'KeyZ', ctrlKey: true, altKey: true });
    expect(popup()).not.toBeNull();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('左 1/2・右 1/2 の右');
    await user.keyboard('{Enter}');
    expect(popup()).toBeNull();
    close(floats().a, { x: 0.5, y: 0, w: 0.5, h: 1 });
    expect([...behind()].sort()).toEqual(['b', 'c']);
  });

  it('FR-305 AC-863 コマンドパレットから開き、Esc で閉じるとフォーカスは消えたパレットではなく操作中のコンポーネントへ戻る', async () => {
    const user = userEvent.setup();
    render(wrap(<><Workspace screens={screens} /><CommandPalette /></>));
    focus('a');
    act(() => useCommandUi.getState().setPaletteOpen(true));
    const box = await screen.findByRole('combobox', { name: 'コマンドを検索' });
    await user.click(box);
    await user.type(box, '雛形');
    await user.keyboard('{Enter}');
    await wait(80);
    expect(popup(), 'パレットから開けない').not.toBeNull();
    expect(screen.queryByTestId('command-palette')).toBeNull();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('snap-layout-zone');
    await user.keyboard('{Escape}');
    expect(popup()).toBeNull();
    expect(document.activeElement?.isConnected).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
    expect(section('a').contains(document.activeElement), 'フォーカスが操作中のコンポーネントへ戻らない').toBe(true);
  });
});

describe('FR-305 AC-861 AC-867・FR-152 AC-793 ポップアップが出ない場所と、雛形の区画どうしの境界', () => {
  it('FR-305 AC-861 ピン止めを除いた空きが狭く成り立つ雛形がないと、上端の中央でもポップアップは出ず最大化のプレビューになり、キー操作は理由を知らせる', async () => {
    setup(1000);
    useLayout.setState({
      pinned: { [persona()]: { a: { x: 0, y: 0, w: 1 / 3, h: 1 } } },
      floats: { [persona()]: { a: { x: 0, y: 0, w: 1 / 3, h: 1 }, b: { x: 1 / 3, y: 0, w: 1 / 3, h: 0.5 }, c: { x: 2 / 3, y: 0, w: 1 / 3, h: 0.5 } } },
    });
    render(wrap(<Workspace screens={screens} />));
    await dragTo('b', 500, 100, 500, 5);
    expect(popup()).toBeNull();
    expect(screen.getByTestId('snap-preview'), '最大化のプレビューがない').toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    focus('b');
    fireEvent.keyDown(section('b'), { key: 'z', code: 'KeyZ', ctrlKey: true, altKey: true });
    expect(popup()).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('レイアウトの雛形を使えません');
  });

  for (const [name, x, y] of [['上端の中央の外（左寄り）', 100, 5], ['上端の中央の外（右寄り）', 1100, 5], ['左端', 5, 400], ['右端', 1195, 400], ['左上の角', 5, 5], ['右上の角', 1195, 5]] as const) {
    it(`FR-305 AC-867 FR-152 AC-793 ${name}にとどめてもポップアップは出ない（FR-152 のスナップのまま）`, async () => {
      render(wrap(<Workspace screens={screens} />));
      await dragTo('b', 600, 100, x, y);
      expect(popup()).toBeNull();
      expect(screen.getByTestId('snap-preview')).toBeTruthy();
      fireEvent.keyDown(window, { key: 'Escape' });
    });
  }

  // Q-073 A: ポップアップの表示後にポップアップと命中範囲の外へ出たら閉じ、端・角で離すと FR-152 のスナップ、端でない位置なら最大化・スナップにならない
  it('FR-305 AC-867 Q-073 A ポップアップを出してから左端へ出ると、ポップアップは外へ出た時点で閉じ、離すと FR-152 の左半分になる（AC-793）', async () => {
    render(wrap(<Workspace screens={screens} />));
    await dragTo('b', 600, 100, 600, 5);
    expect(popup(), 'ポップアップが出ない').not.toBeNull();
    ptr(window, 'pointermove', 300, 300);
    ptr(window, 'pointermove', 5, 400);
    expect(popup(), '外へ出てもポップアップが閉じない').toBeNull();
    ptr(window, 'pointerup', 5, 400);
    expect(popup()).toBeNull();
    close(floats().b, { x: 0, y: 0, w: 0.5, h: 1 });
  });

  it('FR-305 AC-867 Q-073 A 外へ出て端・角でない位置で離すと、ポップアップは閉じたまま再表示されず、最大化もスナップもされない', async () => {
    render(wrap(<Workspace screens={screens} />));
    await dragTo('b', 600, 100, 600, 5);
    expect(popup()).not.toBeNull();
    ptr(window, 'pointermove', 600, 400);
    expect(popup()).toBeNull();
    await wait(LAYOUT_DWELL_MS + 100);
    expect(popup(), '外に出たままなのに再表示された').toBeNull();
    ptr(window, 'pointerup', 600, 400);
    expect(st().maximized).toBeNull();
    const f = floats().b;
    if (f) { expect(f.w).toBeCloseTo(1 / 3, 2); expect(f.h).toBeCloseTo(0.5, 2); }
  });

  it('FR-305 AC-867 Q-073 A 閉じたポップアップは、同じドラッグで命中範囲へ戻って PARAM-144 ms とどまったときだけ再表示される', async () => {
    render(wrap(<Workspace screens={screens} />));
    await dragTo('b', 600, 100, 600, 5);
    ptr(window, 'pointermove', 600, 400);
    expect(popup()).toBeNull();
    ptr(window, 'pointermove', 600, 5);
    expect(popup(), '戻った直後に再表示された').toBeNull();
    await wait(LAYOUT_DWELL_MS + 100);
    expect(popup(), '命中範囲へ戻って待っても再表示されない').not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
  });

  it('FR-305 AC-867 雛形の区画どうしの共有する境界を動かすと、両側が同時に変わり、背面のものは変わらない', async () => {
    render(wrap(<Workspace screens={screens} />));
    await dragTo('b', 600, 100, 600, 5);
    under = [zoneBtn(1, 1)];
    ptr(window, 'pointerup', 600, 5);
    // 順次の埋め: 右の区画に a を置く
    const assist = screen.getByTestId('snap-assist');
    fireEvent.click(within(assist).getByRole('button', { name: 'A' }));
    close(floats().a, { x: 0.5, y: 0, w: 0.5, h: 1 });
    const c0 = { ...floats().c! };
    const borders = screen.getAllByTestId('float-border');
    expect(borders).toHaveLength(1);
    expect(borders[0]!.getAttribute('aria-valuenow')).toBe('50');
    fireEvent.keyDown(borders[0]!, { key: 'ArrowRight' });
    const b1 = floats().b!;
    const a1 = floats().a!;
    expect(b1.w).toBeGreaterThan(0.5);
    expect(b1.x + b1.w).toBeCloseTo(a1.x, 5);
    expect(a1.x + a1.w).toBeCloseTo(1, 5);
    expect(floats().c).toEqual(c0);
  });
});
