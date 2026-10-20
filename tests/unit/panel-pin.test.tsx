// @vitest-environment jsdom
// NFR-UX-018 AC-481・AC-482（見出しの操作の数・定義の一貫性）、FR-215 AC-493・AC-494（ピン止めの切替）、
// FR-216 AC-496・AC-497・AC-505（ピン止めしたコンポーネントの固定・縮退・最大化/最小化/非表示との組み合わせ）。jsdom + testing-library。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { Panel } from '../../src/components/Panel';
import { ViewAsTableButton } from '../../src/components/ViewTable';
import { Workspace } from '../../src/workspace/Workspace';
import { getCommands } from '../../src/commands/registry';
import { setAvailableComponents, useLayout, type FloatRect } from '../../src/store/layout';
import {
  ACTION_ICON_PX, HEADER_ACTION_LIMIT, PANE_ACTIONS, PIN_MOVE_REASON, PIN_NO_ROOM_REASON, PIN_TABS_REASON, paneAction, type PaneActionId,
} from '../../src/workspace/paneActions';
import { paneCommands, NO_TARGET_MESSAGE } from '../../src/workspace/paneCommands';
import { nearestFree, resolveAround, overlapArea, type PxMap } from '../../src/workspace/freeLayout';
import type { PaneInfo } from '../../src/workspace/PaneContext';
import type { ScreenDefinition } from '../../src/screens/types';

const A = () => <Panel testId="component-a" title="パネルA"><p>a</p></Panel>;
const B = () => <Panel testId="component-b" title="パネルB"><p>b</p></Panel>;
const C = () => <Panel testId="component-c" title="パネルC"><p>c</p></Panel>;
const screens: ScreenDefinition[] = [
  { key: 'a', label: 'A', icon: (() => null) as never, component: A },
  { key: 'b', label: 'B', icon: (() => null) as never, component: B },
  { key: 'c', label: 'C', icon: (() => null) as never, component: C },
];
const st = () => useLayout.getState();
const persona = () => st().persona;
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;
let spy: ReturnType<typeof vi.spyOn>;
let rectsSpy: ReturnType<typeof vi.spyOn>;
let areaW = 1200;

/** 3 列（a・b・c）。作業領域は areaW x 800 */
function setup(width = 1200) {
  areaW = width;
  setAvailableComponents(['a', 'b', 'c']);
  useLayout.setState({
    floats: {}, pinned: {}, zOrder: [], expanded: null, maximized: null, minimized: {}, manual: {},
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
  spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.hasAttribute('data-layout')) return rect(0, 0, areaW, 800);
    const id = this.getAttribute('data-testid') ?? '';
    const third = areaW / 3;
    if (id === 'component-a') return rect(0, 0, third, 400);
    if (id === 'component-b') return rect(third, 0, third, 400);
    if (id === 'component-c') return rect(2 * third, 0, third, 400);
    return rect(0, 0, 0, 0);
  });
  // 表示中の要素として扱う（ピン止めで置き場所が変わった後、フォーカスを戻す処理が働くように）
  rectsSpy = vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(() => [rect(0, 0, 10, 10)] as unknown as DOMRectList);
});
afterEach(() => { cleanup(); spy.mockRestore(); rectsSpy.mockRestore(); });

const wrap = (ui: JSX.Element) => <FluentProvider theme={webLightTheme}>{ui}</FluentProvider>;
const section = (k: string) => screen.getByTestId(`component-${k}`);
const actionsOf = (k: string) => within(section(k)).getByTestId('component-actions');
const pinBtn = (k: string) => within(actionsOf(k)).getByRole('button', { name: /^ピン止め(する|を外す)$/ });
const focus = (k: string) => act(() => { (document.activeElement as HTMLElement | null)?.blur?.(); section(k).focus(); });
const pins = () => st().pinned[persona()] ?? {};
const floats = () => st().floats[persona()] ?? {};
const status = () => screen.getByRole('status');
/** 名前（Fluent の Tooltip の relationship=label は aria-label に名前を入れる。文字のボタンは文字が名前） */
const nameOf = (el: Element) => el.getAttribute('aria-label') ?? (el.textContent ?? '').trim();
const overlapsFr = (x: FloatRect, y: FloatRect) => Math.max(0, Math.min(x.x + x.w, y.x + y.w) - Math.max(x.x, y.x)) * Math.max(0, Math.min(x.y + x.h, y.y + y.h) - Math.max(x.y, y.y)) > 1e-6;

describe('NFR-UX-018 AC-482 操作の定義の一貫性', () => {
  // NFR-UX-018 AC-482
  it('NFR-UX-018 AC-482 同じ操作の種類は 1 つの定義だけを持ち、オンの状態を持つ操作はオンで Filled・オフで Regular、アイコンは 12px より大きい', () => {
    const ids = Object.keys(PANE_ACTIONS) as PaneActionId[];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      const d = PANE_ACTIONS[id];
      expect(d.id).toBe(id);
      expect(d.size).toBeGreaterThan(12);
      expect(paneAction(id).variant).toBe('regular');
      expect(paneAction(id).Icon).toBe(d.regular);
      expect(paneAction(id).label).toBe(d.label);
      if (d.onLabel) {
        expect(paneAction(id, true).variant).toBe('filled');
        expect(paneAction(id, true).Icon).toBe(d.filled);
        expect(paneAction(id, true).label).toBe(d.onLabel);
      } else {
        // オンの状態を持たない操作は、オンを渡しても Regular のまま
        expect(paneAction(id, true).variant).toBe('regular');
      }
    }
    expect(ACTION_ICON_PX).toBeGreaterThan(12);
    expect(paneAction('pin')).toMatchObject({ label: 'ピン止めする', variant: 'regular' });
    expect(paneAction('pin', true)).toMatchObject({ label: 'ピン止めを外す', variant: 'filled' });
  });

  // NFR-UX-018 AC-482
  it('NFR-UX-018 AC-482 見出しの操作のボタンと「表で見る」は、操作の定義の名前とアイコンの種類を使う', () => {
    render(wrap(<Workspace screens={screens} />));
    focus('a');
    const btns = within(actionsOf('a')).getAllByRole('button').filter((b) => b.getAttribute('data-testid') !== 'component-menu'); // 「その他の操作」は常設ボタンに数えない（FR-222）
    for (const b of btns) {
      const id = b.getAttribute('data-action') as PaneActionId;
      expect(id, '定義を参照していないボタン').toBeTruthy();
      const variant = b.getAttribute('data-icon-variant') as 'regular' | 'filled';
      const on = variant === 'filled';
      expect(nameOf(b)).toMatch(new RegExp(`^${paneAction(id, on).label}`));
    }
    cleanup();
    render(wrap(<ViewAsTableButton asTable={false} onToggle={() => {}} />));
    expect((screen.getByRole('button', { name: '表で見る' })).getAttribute('data-icon-variant')).toBe('regular');
    cleanup();
    render(wrap(<ViewAsTableButton asTable onToggle={() => {}} />));
    expect((screen.getByRole('button', { name: '元の表示に戻る' })).getAttribute('data-icon-variant')).toBe('filled');
  });
});

describe('NFR-UX-018 AC-481 見出しの操作の数とコマンドパレット', () => {
  // NFR-UX-018 AC-481
  it('NFR-UX-018 AC-481 各コンポーネントの見出しの操作のボタンは PARAM-073 個以下で、ほかの操作は「その他の操作」にあり、コマンドパレットからも実行できる', async () => {
    render(wrap(<Workspace screens={screens} />));
    for (const k of ['a', 'b', 'c']) {
      focus(k);
      const btns = within(actionsOf(k)).getAllByRole('button').filter((b) => b.getAttribute('data-testid') !== 'component-menu');
      expect(btns.length).toBeLessThanOrEqual(HEADER_ACTION_LIMIT);
    }
    expect(HEADER_ACTION_LIMIT).toBe(6);
    fireEvent.click(within(section('a')).getByTestId('component-menu'));
    const items = screen.getAllByRole('menuitem').map((m) => m.textContent ?? '');
    const labels = getCommands().map((c) => c.label);
    // メニューの各操作に対応するコマンドがある
    const map: Record<string, RegExp> = {
      ピン止めする: /^ピン止めの切替/, 最小化: /^最小化の切替/, 上へ移動: /^上へ移動/, 下へ移動: /^下へ移動/, 左へ移動: /^左へ移動/, 右へ移動: /^右へ移動/,
      '並べる方向を変える（横/縦）': /^並べる方向を変える/, 画面に配置: /^画面に配置/, 最大化: /^最大化の切替|を最大化する$/, '拡大表示（75%）': /^拡大表示/,
      自由に動かせる配置にする: /^自由に動かせる配置の切替/, タブにまとめる: /^タブにまとめる/, 非表示: /^非表示|を非表示にする$/,
      // FR-217・FR-218 のビューの切替
      ビュー: /^ビュー: /,
      // FR-243・FR-244 の情報の階層と自動配置
      情報の階層: /^情報の階層/, 自動配置を実行: /^自動配置を実行/, 自動配置を停止: /^自動配置を停止/, 自動配置を取り消す: /^自動配置を取り消す/,       階層を既定に戻す: /^階層を既定に戻す/,      // FR-224 AC-522 の大きさの変更
      幅を広げる: /^幅を広げる/, 幅を狭める: /^幅を狭める/, 高さを広げる: /^高さを広げる/,       高さを狭める: /^高さを狭める/,    };
    for (const it of items) {
      const key = Object.keys(map).find((k) => it.startsWith(k));
      expect(key, `メニューの「${it}」に対応する定義がない`).toBeTruthy();
      expect(labels.some((l) => map[key!]!.test(l)), `「${it}」がコマンドパレットにない`).toBe(true);
    }
  });

  // NFR-UX-018 AC-481（異常系: 操作中のコンポーネントがないときは何もせず、理由を示す）
  it('NFR-UX-018 AC-481 異常系: 操作中のコンポーネントがないと、コマンドは何もせず理由を通知する', () => {
    const notify = vi.fn();
    const cmds = paneCommands(() => null, notify);
    cmds.find((c) => c.id === 'pane.pin')!.run();
    expect(notify).toHaveBeenCalledWith(NO_TARGET_MESSAGE);
    // ピン止め中は移動のコマンドも理由を示す
    const p = { pinned: true, move: vi.fn(), mergeInto: vi.fn(), peers: [{ key: 'x', label: 'X' }] } as unknown as PaneInfo;
    const cmds2 = paneCommands(() => p, notify);
    cmds2.find((c) => c.id === 'pane.move.up')!.run();
    cmds2.find((c) => c.id === 'pane.tabs')!.run();
    expect(p.move).not.toHaveBeenCalled();
    expect(p.mergeInto).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(PIN_MOVE_REASON);
    expect(notify).toHaveBeenCalledWith(PIN_TABS_REASON);
  });
});

describe('FR-215 ピン止めの切替', () => {
  // FR-215 AC-493（結合: 見出しのピンのアイコン）
  it('FR-215 AC-493 ピンのアイコンを押すと「ピン止めを外す」（Filled・押下 true）、もう一度で「ピン止めする」（Regular）。アイコンは常に 1 つで、保存した状態から復元される', async () => {
    render(wrap(<Workspace screens={screens} />));
    focus('a');
    expect(within(actionsOf('a')).getAllByRole('button', { name: /^ピン止め/ })).toHaveLength(1);
    expect(nameOf(pinBtn('a'))).toBe('ピン止めする');
    expect((pinBtn('a')).getAttribute('aria-pressed')).toBe('false');
    expect((pinBtn('a')).getAttribute('data-icon-variant')).toBe('regular');
    fireEvent.click(pinBtn('a'));
    expect(within(actionsOf('a')).getAllByRole('button', { name: /^ピン止め/ })).toHaveLength(1);
    expect(nameOf(pinBtn('a'))).toBe('ピン止めを外す');
    expect((pinBtn('a')).getAttribute('aria-pressed')).toBe('true');
    expect((pinBtn('a')).getAttribute('data-icon-variant')).toBe('filled');
    // 比率で保持（1200x800 の左 1/3、高さ半分）
    expect(pins().a!.x).toBeCloseTo(0);
    expect(pins().a!.w).toBeCloseTo(1 / 3);
    expect(pins().a!.h).toBeCloseTo(0.5);
    fireEvent.click(pinBtn('a'));
    expect(nameOf(pinBtn('a'))).toBe('ピン止めする');
    expect((pinBtn('a')).getAttribute('aria-pressed')).toBe('false');
    expect(pins().a).toBeUndefined();
    // 保存と復元（再読込の代わりに、保存した内容から状態を作り直す）
    fireEvent.click(pinBtn('a'));
    const saved = localStorage.getItem('edb.layout');
    expect(saved).toContain('"pinned"');
    useLayout.setState({ pinned: {} });
    localStorage.setItem('edb.layout', saved!);
    await act(async () => { await useLayout.persist.rehydrate(); });
    expect(pins().a).toBeDefined();
    expect(pins().b).toBeUndefined();
  });

  // FR-215 AC-494
  it('FR-215 AC-494 キーボード（Enter・Space）とコマンドパレットの「ピン止めの切替」で切り替わり、状態の変化を通知する。既定のレイアウトに戻すと固定なし', async () => {
    const user = userEvent.setup();
    render(wrap(<Workspace screens={screens} />));
    focus('a');
    pinBtn('a').focus();
    await user.keyboard('{Enter}');
    expect((pinBtn('a')).getAttribute('aria-pressed')).toBe('true');
    expect((status()).textContent).toContain('Aをピン止めしました');
    pinBtn('a').focus();
    await user.keyboard(' ');
    expect((pinBtn('a')).getAttribute('aria-pressed')).toBe('false');
    expect((status()).textContent).toContain('Aのピン止めを外しました');
    // コマンドパレット（操作中のコンポーネント = b）
    focus('b');
    const cmd = getCommands().find((c) => c.label.startsWith('ピン止めの切替'));
    expect(cmd).toBeDefined();
    act(() => cmd!.run());
    expect(pins().b).toBeDefined();
    expect((status()).textContent).toContain('Bをピン止めしました');
    // 既定のレイアウトに戻す → すべて固定なし
    act(() => st().resetLayout());
    expect(st().pinned[persona()]).toBeUndefined();
    // 既定のレイアウトでは b がタブの後ろに隠れることがあるので、隠れた要素も含めて名前を確かめる
    for (const k of ['a', 'b', 'c']) {
      const btn = actionsOf(k).querySelector('[data-action="pin"]')!;
      expect(btn.getAttribute('aria-label')).toBe('ピン止めする');
      expect(btn.getAttribute('aria-pressed')).toBe('false');
    }
  });
});

describe('FR-216 ピン止めしたコンポーネントの固定', () => {
  // FR-216 AC-496（単体: 押し出しはピン止めしたものを動かさない）
  it('FR-216 AC-496 ピン止めした領域の上に置くと、ピン止めしたものは変わらず、置いたものが重ならない最寄りの位置に置かれる', () => {
    const b = { w: 1200, h: 800 };
    const input: PxMap = { p: { x: 0, y: 0, w: 400, h: 400 }, q: { x: 600, y: 0, w: 300, h: 300 }, r: { x: 800, y: 500, w: 200, h: 200 } };
    const out = resolveAround({ ...input, q: { x: 100, y: 100, w: 300, h: 300 } }, 'q', b, new Set(['p']))!;
    expect(out.p).toEqual(input.p);
    expect(overlapArea(out.q!, out.p!)).toBe(0);
    expect(overlapArea(out.q!, out.r!)).toBe(0);
    // 最寄り: 右（x=400）か下（y=400）に接する
    expect(Math.min(Math.abs(out.q!.x - 400), Math.abs(out.q!.y - 400))).toBeLessThan(1);
    // ピン止めがなければ従来の押し出し（置いたものは動かない）
    const legacy = resolveAround({ ...input, q: { x: 100, y: 100, w: 300, h: 300 } }, 'q', b)!;
    expect(legacy.q).toEqual({ x: 100, y: 100, w: 300, h: 300 });
  });

  // FR-216 AC-496（結合: ドラッグ・移動の操作・フォーカス）
  it('FR-216 AC-496 ピン止めしたものの見出しをドラッグしても動かず理由が示され、外した後は動かせる。フォーカスしても大きさは変わらない', () => {
    render(wrap(<Workspace screens={screens} />));
    focus('a');
    fireEvent.click(pinBtn('a'));
    const before = { ...pins().a! };
    const ptr = (target: Element | Window, type: string, x: number, y: number) =>
      fireEvent(target, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
    const heading = within(section('a')).getByRole('heading');
    ptr(heading, 'pointerdown', 50, 20);
    ptr(window, 'pointermove', 300, 300);
    ptr(window, 'pointerup', 300, 300);
    expect((status()).textContent).toContain(PIN_MOVE_REASON);
    expect(floats().a).toEqual(before);
    // キーボードの移動も動かさない
    fireEvent.keyDown(section('a'), { key: 'ArrowRight', altKey: true, shiftKey: true });
    expect(floats().a).toEqual(before);
    // フォーカスしても、ピン止めした大きさのまま（自由配置で描くので、自動のサイズ調整の対象外）
    focus('a');
    const box = document.querySelector('[data-float="a"]') as HTMLElement;
    expect(box.getAttribute('data-pinned')).toBe('true');
    expect(parseFloat(box.style.width)).toBeCloseTo(before.w * 100);
    // メニューの移動の操作は無効で理由が示される
    fireEvent.click(within(section('a')).getByTestId('component-menu'));
    const up = screen.getByRole('menuitem', { name: new RegExp('上へ移動') });
    expect((up).getAttribute('aria-disabled')).toBe('true');
    expect((up).textContent).toContain(PIN_MOVE_REASON);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    // 外した後は移動できる
    focus('a');
    fireEvent.click(pinBtn('a'));
    fireEvent.keyDown(section('a'), { key: 'ArrowDown', altKey: true, shiftKey: true });
    expect(floats().a!.y).toBeGreaterThan(before.y);
  });

  // FR-216 AC-497
  it('FR-216 AC-497 縮退の幅ではピン止めしたものが縦積みの先頭に置かれ、幅が戻るとピン止めした比率の配置に戻る', () => {
    useLayout.setState({ pinned: { [persona()]: { c: { x: 0.5, y: 0.1, w: 0.4, h: 0.5 } } }, floats: { [persona()]: { c: { x: 0.5, y: 0.1, w: 0.4, h: 0.5 } } } });
    areaW = 600;
    const { unmount } = render(wrap(<Workspace screens={screens} />));
    const root = document.querySelector('[data-layout]')!;
    expect(root.getAttribute('data-layout')).toBe('stacked');
    const first = document.querySelector('[data-stacked="0"]')!;
    expect(first.querySelector('[data-testid="component-c"]')).not.toBeNull();
    unmount();
    areaW = 1200;
    render(wrap(<Workspace screens={screens} />));
    expect(document.querySelector('[data-layout]')!.getAttribute('data-layout')).toBe('split');
    const box = document.querySelector('[data-float="c"]') as HTMLElement;
    expect(parseFloat(box.style.left)).toBeCloseTo(50);
    expect(parseFloat(box.style.width)).toBeCloseTo(40);
    expect(Math.abs(pins().c!.x - 0.5)).toBeLessThanOrEqual(0.01);
  });

  // FR-216 AC-497（異常系: 比率から求めた幅が最小の幅を下回る広い画面でも縮退する）
  it('FR-216 AC-497 異常系: ピン止めの比率から求めた幅が最小の幅（PARAM-034）を下回ると、縦積みの先頭に置く', () => {
    useLayout.setState({ pinned: { [persona()]: { b: { x: 0, y: 0, w: 0.15, h: 0.5 } } }, floats: { [persona()]: { b: { x: 0, y: 0, w: 0.15, h: 0.5 } } } });
    areaW = 1200; // 0.15 × 1200 = 180 < 240
    render(wrap(<Workspace screens={screens} />));
    expect(document.querySelector('[data-layout]')!.getAttribute('data-layout')).toBe('stacked');
    expect(document.querySelector('[data-stacked="0"] [data-testid="component-b"]')).not.toBeNull();
  });

  // FR-216 AC-505
  it('FR-216 AC-505 最大化・最小化・非表示から戻しても、ピン止めの状態と比率の配置が保たれ、重ならない。タブにまとめるは無効で理由が示される', () => {
    render(wrap(<Workspace screens={screens} />));
    focus('a');
    fireEvent.click(pinBtn('a'));
    const pr = { ...pins().a! };
    // 最大化 → 通常表示
    act(() => st().setMaximized('a'));
    act(() => st().setMaximized(null));
    expect(pins().a).toEqual(pr);
    // 最小化 → 復元
    act(() => st().setMinimized('a', true));
    act(() => st().setMinimized('a', false));
    expect(pins().a).toEqual(pr);
    // 非表示 → 再表示: ピン止めした位置に戻り、そこにあるものは押し出される
    act(() => st().hideComponent('a'));
    expect(pins().a).toEqual(pr);
    act(() => st().setFloats({ b: { x: 0, y: 0, w: 0.3, h: 0.4 } }));
    act(() => st().showComponent('a'));
    expect(floats().a).toEqual(pr);
    for (const k of ['b', 'c']) expect(overlapsFr(floats()[k]!, pr), `${k} が重なる`).toBe(false);
    // タブにまとめるは無効で理由
    focus('a');
    const tabs = within(actionsOf('a')).getByRole('button', { name: /^タブにまとめる/ });
    expect((tabs).getAttribute('aria-disabled')).toBe('true');
    expect(nameOf(tabs)).toBe(`タブにまとめる（${PIN_TABS_REASON}）`);
    expect(nameOf(pinBtn('a'))).toBe('ピン止めを外す');
  });

  // FR-216 AC-505（重ならない位置が残っていないとき）
  it('FR-216 AC-505 ピン止めした領域の上へ置き、重ならない位置が残っていなければ、元の位置に戻り理由が示される', () => {
    // a を全幅・高さ 95% でピン止めし、残りは高さ 40px（b の高さ 80px が入らない）
    useLayout.setState({
      pinned: { [persona()]: { a: { x: 0, y: 0, w: 1, h: 0.95 } } },
      floats: { [persona()]: { a: { x: 0, y: 0, w: 1, h: 0.95 }, b: { x: 0, y: 0.9, w: 0.5, h: 0.1 }, c: { x: 0.5, y: 0.9, w: 0.5, h: 0.1 } } },
    });
    render(wrap(<Workspace screens={screens} />));
    const before = { ...floats().b! };
    const out = nearestFree({ x: 0, y: 300, w: 400, h: 300 }, [{ x: 0, y: 0, w: 1200, h: 720 }], { w: 1200, h: 800 });
    expect(out).toBeNull();
    // b を上へ動かす → ピン止めの領域と重なり、置き場所がない
    focus('b');
    fireEvent.keyDown(section('b'), { key: 'ArrowUp', altKey: true, shiftKey: true });
    expect(floats().b).toEqual(before);
    expect(floats().a).toEqual({ x: 0, y: 0, w: 1, h: 0.95 });
    expect((status()).textContent).toContain(PIN_NO_ROOM_REASON);
  });
});

/** 描かれた自由配置の箱の位置と大きさ（作業領域に対する割合。style の % から） */
function drawnRects(): Record<string, FloatRect> {
  const out: Record<string, FloatRect> = {};
  document.querySelectorAll<HTMLElement>('[data-float]').forEach((el) => {
    out[el.dataset.float!] = { x: parseFloat(el.style.left) / 100, y: parseFloat(el.style.top) / 100, w: parseFloat(el.style.width) / 100, h: parseFloat(el.style.height) / 100 };
  });
  return out;
}
const ptr = (target: Element | Window, type: string, x: number, y: number) =>
  fireEvent(target, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));

describe('FR-216 AC-496 AC-505 ポインターの操作と表示上の配置', () => {
  let efp: unknown;
  beforeEach(() => {
    efp = (document as unknown as { elementsFromPoint?: unknown }).elementsFromPoint;
    (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [];
    // a をピン止め（左 1/3・上半分）。b・c は自由配置（DOM の測定と同じ位置）
    useLayout.setState({
      pinned: { [persona()]: { a: { x: 0, y: 0, w: 1 / 3, h: 0.5 } } },
      floats: { [persona()]: { a: { x: 0, y: 0, w: 1 / 3, h: 0.5 }, b: { x: 1 / 3, y: 0, w: 1 / 3, h: 0.5 }, c: { x: 2 / 3, y: 0, w: 1 / 3, h: 0.5 } } },
    });
  });
  afterEach(() => { (document as unknown as { elementsFromPoint: unknown }).elementsFromPoint = efp; });

  // FR-216 AC-496（ポインターで、ピン止めしたものの辺の上へ置く）
  it('FR-216 AC-496 ピン止めしたものの左の辺の上へドラッグして置くと、ピン止めしたものは変わらず、置いたものが重ならない最寄りの位置に置かれる（分割・タブへ入れない）', () => {
    render(wrap(<Workspace screens={screens} />));
    const layoutsBefore = JSON.stringify(st().layouts);
    const a0 = { ...floats().a! };
    // b のハンドル（600, 8）をつかみ、a の左の辺の領域（60, 200。画面端のスナップの範囲 32px の外）へ
    ptr(within(section('b')).getByTestId('panel-handle'), 'pointerdown', 600, 8);
    ptr(window, 'pointermove', 500, 200);
    ptr(window, 'pointermove', 60, 200);
    expect(screen.queryByTestId('snap-candidates')).toBeNull();
    expect(screen.queryByTestId('drop-indicator'), 'ピン止めしたものが置き先になっている').toBeNull();
    ptr(window, 'pointerup', 60, 200);
    expect(floats().a).toEqual(a0);
    expect(pins().a).toEqual(a0);
    expect(overlapsFr(floats().b!, a0)).toBe(false);
    expect(overlapsFr(floats().b!, floats().c!)).toBe(false);
    // 最寄り: a のすぐ下（y = 0.5）
    expect(floats().b!.y).toBeCloseTo(0.5, 2);
    expect(JSON.stringify(st().layouts)).toBe(layoutsBefore);
    const drawn = drawnRects();
    expect(drawn.a).toEqual(expect.objectContaining({ x: 0, y: 0 }));
    expect(overlapsFr(drawn.b!, drawn.a!)).toBe(false);
  });

  // FR-216 AC-496（スナップの候補は、ピン止めしたものを動かさない）
  it('FR-216 AC-496 画面端のスナップの候補で置いても、ピン止めしたものの位置と大きさは変わらず、置いたものはピン止めしたものと重ならない', () => {
    render(wrap(<Workspace screens={screens} />));
    const a0 = { ...floats().a! };
    // c を左の端へ（端から 32px 以内）→ 候補（左半分）が出る
    ptr(within(section('c')).getByTestId('panel-handle'), 'pointerdown', 1000, 8);
    ptr(window, 'pointermove', 700, 400);
    ptr(window, 'pointermove', 10, 400);
    expect(screen.getByTestId('snap-candidates')).toBeTruthy();
    ptr(window, 'pointerup', 10, 400);
    expect(floats().a).toEqual(a0);
    expect(pins().a).toEqual(a0);
    const f = floats();
    for (const k of ['b', 'c']) if (f[k]) expect(overlapsFr(f[k]!, a0), `${k} が重なる`).toBe(false);
    const drawn = drawnRects();
    expect(drawn.a).toEqual(expect.objectContaining({ x: 0, y: 0 }));
    for (const k of ['b', 'c']) if (drawn[k]) expect(overlapsFr(drawn[k]!, drawn.a!), `${k} が表示上で重なる`).toBe(false);
    // メニューの「画面に配置」で、ピン止めしたもの自身は動かせない（無効と理由）
    focus('a');
    fireEvent.click(within(section('a')).getByTestId('component-menu'));
    const place = screen.getByRole('menuitem', { name: /画面に配置/ });
    expect(place.getAttribute('aria-disabled')).toBe('true');
    expect(place.textContent).toContain(PIN_MOVE_REASON);
  });

  // FR-216 AC-505（表示上の配置: 最大化・最小化から戻したとき）
  it('FR-216 AC-505 最大化・最小化から戻すと、描かれた位置がピン止めした比率の配置に戻り、ほかと重ならない', () => {
    render(wrap(<Workspace screens={screens} />));
    const a0 = { ...pins().a! };
    const check = (tag: string) => {
      const d = drawnRects();
      for (const p of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(d.a![p] - a0[p]), `${tag}: ${p}`).toBeLessThanOrEqual(0.01);
      const ks = Object.keys(d);
      for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
        expect(overlapsFr(d[ks[i]!]!, d[ks[j]!]!), `${tag}: ${ks[i]} × ${ks[j]}`).toBe(false);
      }
      focus('a');
      expect(nameOf(pinBtn('a')), `${tag}: ピン止めの状態`).toBe('ピン止めを外す');
    };
    focus('a');
    fireEvent.click(within(actionsOf('a')).getByRole('button', { name: '最大化' }));
    expect(st().maximized).toBe('a');
    focus('a');
    fireEvent.click(within(actionsOf('a')).getByRole('button', { name: '通常表示' }));
    expect(st().maximized).toBeNull();
    check('最大化から戻す');
    focus('a');
    fireEvent.click(within(actionsOf('a')).getByRole('button', { name: '最小化' }));
    fireEvent.click(within(actionsOf('a')).getByRole('button', { name: '元に戻す' }));
    check('最小化から戻す');
  });
});

describe('FR-216 FR-217 FR-218 AC-510 ピン止めしたデジタル世界のコンポーネントは画面の見出しの切替で隠れない', () => {
  // FR-216 FR-217 FR-218 AC-510
  it('AC-510 ピン止めした KPI/OKR 相当は、画面の「現実世界」「3D」で中身が隠れず、同じコンポーネントの切替では隠れる。外すと画面の切替が効く', async () => {
    const { registerViewDecls } = await import('../../src/view/viewModel');
    const { applyScreenView } = await import('../../src/view/useView');
    const dig = { has2D: true, has3D: true, world: 'digital' as const };
    registerViewDecls(screens.map((s) => ({ ...s, view: dig })));
    useLayout.setState({ views: {}, screenView: {} });
    render(wrap(<A />));
    const body = () => screen.getByTestId('view-world-body');
    st().setPinned('a', { x: 0, y: 0, w: 0.3, h: 0.3 });
    act(() => { applyScreenView({ world: 'real', mode: '3d' }); });
    expect(body().style.display).toBe('contents');
    expect(st().views[persona()]?.a).toBeUndefined();
    act(() => { st().setView('a', { world: 'real' }); });
    expect(body().style.display).toBe('none');
    act(() => { st().setView('a', { world: 'both' }); st().setPinned('a', null); applyScreenView({ world: 'digital' }); applyScreenView({ world: 'real' }); });
    expect(body().style.display).toBe('none');
  });
});

describe('NFR-UX-018 AC-482 メニューの名前', () => {
  // NFR-UX-018 AC-482（メニューの名前も、見出しのボタンと同じ操作の定義）
  it('NFR-UX-018 AC-482 「その他の操作」メニューのピン止め・最小化・最大化・タブ化・非表示の名前は、操作の定義と同じ（状態に応じて替わる）', () => {
    render(wrap(<Workspace screens={screens} />));
    const menuNames = () => {
      fireEvent.click(within(section('a')).getByTestId('component-menu'));
      const names = screen.getAllByRole('menuitem').map((m) => (m.firstChild?.textContent ?? m.textContent ?? '').trim());
      fireEvent.keyDown(screen.getAllByRole('menuitem')[0]!, { key: 'Escape' });
      return names;
    };
    const has = (names: string[], label: string) => names.some((n) => n === label || n.startsWith(label));
    let names = menuNames();
    for (const [id, on] of [['pin', false], ['minimize', false], ['maximize', false], ['tabs', false], ['hide', false]] as const) {
      expect(has(names, paneAction(id, on).label), `メニューに「${paneAction(id, on).label}」がない`).toBe(true);
    }
    // 最大化中・ピン止め中は、オンの名前（見出しのボタンと同じ）
    act(() => st().setMaximized('a'));
    focus('a');
    expect(within(actionsOf('a')).getByRole('button', { name: paneAction('maximize', true).label })).toBeTruthy();
    names = menuNames();
    expect(has(names, paneAction('maximize', true).label)).toBe(true);
    expect(names).not.toContain('通常表示に戻す');
    act(() => st().setMaximized(null));
    focus('a');
    fireEvent.click(pinBtn('a'));
    names = menuNames();
    expect(has(names, paneAction('pin', true).label)).toBe(true);
  });
});

