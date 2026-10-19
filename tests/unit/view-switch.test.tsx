// @vitest-environment jsdom
// FR-217（全画面・全コンポーネントでの 2D/3D の切替）AC-498・AC-500・AC-506・AC-507、
// FR-218（現実世界／デジタル世界／両方の表示の切替）AC-502・AC-504 の単体・結合テスト。jsdom + testing-library。
// AC-499・AC-503（実際のアプリでの切替・ツイン関係の強調）は System Test（tests/system/e2e/view-switch.spec.ts）が確かめる。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { useState } from 'react';
import { Panel } from '../../src/components/Panel';
import { Workspace } from '../../src/workspace/Workspace';
import { paneCommands } from '../../src/workspace/paneCommands';
import type { PaneInfo } from '../../src/workspace/PaneContext';
import { setAvailableComponents, useLayout } from '../../src/store/layout';
import { useDataViewer } from '../../src/store/dataViewer';
import { useSelectionStore } from '../../src/store/selection';
import { useRetainedStore } from '../../src/store/retained';
import type { ScreenDefinition } from '../../src/screens/types';
import { setCan3DForTest } from '../../src/view/render3d';
import { applyScreenView, viewStateOf, viewTestState } from '../../src/view/useView';
import { ModeRadio } from '../../src/view/ModeRadio';
import { readFileSync } from 'node:fs';
import { NODE_KINDS, defaultWorldOfNodeKind } from '../../src/selection/graph';
import {
  HIDDEN_SELECTION_TEXT, NO_2D_REASON, NO_3D_ENV_REASON, NO_3D_REASON, NO_WORLD_REASON, defaultModeOf, effectiveMode, filterByWorld,
  canRender3D, hiddenSelected, isShownInWorld, modeOptions, registerViewDecls, selectionHiddenIn, singleWorldNote, twinLinksAmong, viewDeclOf, viewText, worldOptions,
  type ViewDecl, type WorldView,
} from '../../src/view/viewModel';

const wrap = (ui: JSX.Element) => <FluentProvider theme={webLightTheme}>{ui}</FluentProvider>;
const st = () => useLayout.getState();
const persona = () => st().persona;

const BOTH: ViewDecl = { has2D: true, has3D: true, world: 'items' };
const TWO: ViewDecl = { has2D: true, has3D: false, world: false };
const THREE_ONLY: ViewDecl = { has2D: false, has3D: true, world: 'items', fixed: true };
const TWO_FIXED: ViewDecl = { has2D: true, has3D: false, world: 'items', fixed: true };
const DIGITAL: ViewDecl = { has2D: true, has3D: false, world: 'digital' };

const mk = (key: string, label: string, view: ViewDecl): ScreenDefinition => ({
  key, label, icon: (() => null) as never, view,
  component: () => <Panel testId={`component-${key}`} title={label}><p>{label}の中身</p></Panel>,
});
const screens: ScreenDefinition[] = [mk('g', 'グラフ', BOTH), mk('s', '設定', TWO), mk('v', '立体', THREE_ONLY), mk('d', '図面', TWO_FIXED)];
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;
let spy: ReturnType<typeof vi.spyOn>;
/** コンポーネントにフォーカスして（見出しの操作はフォーカス中に現れる。FR-150）、見出しの「ビュー」ボタンを返す */
function viewBtn(key: string): HTMLElement {
  const c = screen.getByTestId(`component-${key}`);
  act(() => { (document.activeElement as HTMLElement | null)?.blur?.(); c.focus(); });
  return within(within(c).getByTestId('component-actions')).getByRole('button', { name: /^ビュー/ });
}

beforeEach(() => {
  setCan3DForTest(true);
  registerViewDecls(screens);
  setAvailableComponents(screens.map((s) => s.key));
  // 4 列（g・s・v・d）を並べる
  const cols = screens.map((x) => ({ kind: 'tabs' as const, tabs: [x.key], active: x.key }));
  useLayout.setState({ views: {}, screenView: {}, layouts: { [useLayout.getState().persona]: { kind: 'split', dir: 'row', sizes: cols.map(() => 1 / cols.length), children: cols } }, floats: {}, pinned: {}, minimized: {}, manual: {}, maximized: null, expanded: null });
  useSelectionStore.setState({ selectedIds: [] });
  // 各コンポーネントは幅 400px（見出しの操作アイコンが出る幅）
  spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.hasAttribute('data-layout')) return rect(0, 0, 1600, 800);
    return (this.getAttribute('data-testid') ?? '').startsWith('component-') ? rect(0, 0, 400, 400) : rect(0, 0, 0, 0);
  });
});
afterEach(() => { cleanup(); spy.mockRestore(); setCan3DForTest(undefined); });

describe('FR-218 AC-504 世界の表示の規則（単体）', () => {
  // FR-218 AC-504
  it('FR-218 AC-504 現実世界・デジタル世界・両方の各選択で、世界区分（現実世界・デジタル世界・区分なし）ごとの表示・非表示が規則どおり', () => {
    const table: Array<[WorldView, Record<'real' | 'digital' | 'none', boolean>]> = [
      ['real', { real: true, digital: false, none: false }],
      ['digital', { real: false, digital: true, none: false }],
      ['both', { real: true, digital: true, none: true }],
    ];
    for (const [view, want] of table) {
      expect(isShownInWorld('real', view)).toBe(want.real);
      expect(isShownInWorld('digital', view)).toBe(want.digital);
      expect(isShownInWorld(undefined, view)).toBe(want.none);
    }
    const items = [{ id: 'r', w: 'real' as const }, { id: 'd', w: 'digital' as const }, { id: 'n', w: undefined }];
    expect(filterByWorld(items, (i) => i.w, 'real').map((i) => i.id)).toEqual(['r']);
    expect(filterByWorld(items, (i) => i.w, 'digital').map((i) => i.id)).toEqual(['d']);
    expect(filterByWorld(items, (i) => i.w, 'both').map((i) => i.id)).toEqual(['r', 'd', 'n']);
  });

  // FR-218 AC-504
  it('FR-218 AC-504 選択中の項目が非表示になっても選択状態は変わらず、「隠れている」の印の対象になる', () => {
    const worlds: Record<string, 'real' | 'digital' | undefined> = { r: 'real', d: 'digital', n: undefined };
    const known = (id: string) => id in worlds;
    const sel = ['r', 'd', 'n', 'unknown'];
    const before = [...sel];
    expect(hiddenSelected(sel, (id) => worlds[id], known, 'real')).toEqual(['d', 'n']);
    expect(hiddenSelected(sel, (id) => worlds[id], known, 'digital')).toEqual(['r', 'n']);
    expect(hiddenSelected(sel, (id) => worlds[id], known, 'both')).toEqual([]);
    expect(sel).toEqual(before);
    expect(HIDDEN_SELECTION_TEXT).toBe('選択中の項目はこの表示では隠れています');
  });

  // FR-218 AC-504（ツイン関係は「両方」で、両端が表示中のものだけ）
  it('FR-218 AC-504 ツイン関係の線・印は「両方」のときだけ、両端が表示中のものに付く（重複は 1 つ）', () => {
    const twins = [{ realId: 'r', digitalId: 'd' }, { realId: 'r', digitalId: 'd' }, { realId: 'r', digitalId: 'x' }];
    expect(twinLinksAmong(twins, new Set(['r', 'd']), 'both')).toEqual([['r', 'd']]);
    expect(twinLinksAmong(twins, new Set(['r', 'd']), 'real')).toEqual([]);
    expect(twinLinksAmong(undefined, new Set(['r']), 'both')).toEqual([]);
  });
});

describe('FR-217 AC-498・FR-218 AC-502 全画面の宣言と「ビュー」ボタン（結合）', () => {
  // FR-217 AC-498
  it('FR-217 AC-498 画面の登録の全画面が 2D・3D の表現の有無を宣言し、3D の表現を持つ画面に地図・ナレッジグラフ・アーキテクチャ図・データカタログ・ガントチャートを含む', async () => {
    const { SCREENS } = await import('../../src/screens/registry');
    for (const s of SCREENS) {
      expect(s.view, `${s.key} が宣言していない`).toBeDefined();
      expect(s.view!.has2D || s.view!.has3D, `${s.key} が表現を 1 つも持たない`).toBe(true);
    }
    const has3D = SCREENS.filter((s) => s.view?.has3D && s.view.has2D).map((s) => s.key);
    for (const k of ['map', 'knowledge-graph', 'architecture', 'data-catalog', 'gantt']) expect(has3D).toContain(k);
    // 既定の表示モードは本要求より前の表示を変えない（3D だけ＝3D、地図＝3D、それ以外＝2D）
    const byKey = new Map(SCREENS.map((s) => [s.key, s.view!]));
    expect(defaultModeOf(byKey.get('view3d')!)).toBe('3d');
    expect(defaultModeOf(byKey.get('map')!)).toBe('3d');
    expect(defaultModeOf(byKey.get('knowledge-graph')!)).toBe('2d');
    expect(defaultModeOf(byKey.get('gantt')!)).toBe('2d');
    // FR-020 の 3D ビューと 2D 図面は表現を固定したコンポーネント
    expect(byKey.get('view3d')!.fixed && byKey.get('drawing2d')!.fixed).toBe(true);
    // 世界区分を持つデータを表示しない画面（設定パネル・チャット）は宣言で示す
    expect(byKey.get('settings')!.world).toBe(false);
    expect(byKey.get('chat')!.world).toBe(false);
    expect(byKey.get('kpi-okr')!.world).toBe('digital');
  });

  // FR-217 AC-498 / FR-218 AC-502
  it('FR-217 AC-498 FR-218 AC-502 各コンポーネントの見出しに「ビュー」ボタンが 1 つあり、名前は「ビュー」で始まり、見える文字で現在の表示モードと世界の表示を示す', () => {
    render(wrap(<Workspace screens={screens} />));
    const want: Record<string, string> = { g: '2D・両方', s: '2D・両方', v: '3D・両方', d: '2D・両方' };
    for (const s of screens) {
      const b = viewBtn(s.key);
      const c = screen.getByTestId(`component-${s.key}`);
      expect(within(within(c).getByTestId('component-actions')).getAllByRole('button', { name: /^ビュー/ })).toHaveLength(1);
      expect(b.textContent).toContain(want[s.key]);
      expect(b.getAttribute('data-action')).toBe('view');
    }
  });

  // FR-217 AC-498 / FR-218 AC-502
  it('FR-217 AC-498 FR-218 AC-502 メニューに 2D・3D・現実世界・デジタル世界・両方があり、選ぶとそのコンポーネントだけが変わり、ボタンの文字も変わる', async () => {
    render(wrap(<Workspace screens={screens} />));
    fireEvent.click(viewBtn('g'));
    const menu = await screen.findByRole('menu');
    for (const n of ['2D', '3D', '現実世界', 'デジタル世界', '両方']) expect(within(menu).getByRole('menuitemradio', { name: n })).toBeTruthy();
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: '3D' }));
    expect(viewStateOf('g').mode).toBe('3d');
    expect(viewStateOf('s').mode).toBe('2d');
    fireEvent.click(viewBtn('g'));
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitemradio', { name: '現実世界' }));
    expect(viewStateOf('g').world).toBe('real');
    expect(viewBtn('g').textContent).toContain('3D・現実世界');
  });

  // FR-218 AC-502
  it('FR-218 AC-502 世界区分を持つデータを表示しないと宣言した画面では、世界の切替が無効で理由が示される', async () => {
    render(wrap(<Workspace screens={screens} />));
    fireEvent.click(viewBtn('s'));
    const menu = await screen.findByRole('menu');
    for (const n of ['現実世界', 'デジタル世界', '両方']) {
      const item = within(menu).getByRole('menuitemradio', { name: n });
      expect(item.getAttribute('aria-disabled')).toBe('true');
    }
    expect(within(menu).getAllByText(NO_WORLD_REASON).length).toBeGreaterThan(0);
    for (const o of worldOptions(TWO)) expect(o).toMatchObject({ enabled: false, reason: NO_WORLD_REASON });
  });
});

describe('FR-217 AC-500 表現のない画面・描画できない環境', () => {
  // FR-217 AC-500
  it('FR-217 AC-500 3D の表現を持たない画面は 3D が無効で「この画面には 3D の表現がありません」、2D の表示が続く', async () => {
    expect(modeOptions(TWO, true)[1]).toMatchObject({ value: '3d', enabled: false, reason: NO_3D_REASON });
    expect(effectiveMode(TWO, '3d', true)).toBe('2d');
    render(wrap(<Workspace screens={screens} />));
    fireEvent.click(viewBtn('s'));
    const menu = await screen.findByRole('menu');
    const three = within(menu).getByRole('menuitemradio', { name: '3D' });
    expect(three.getAttribute('aria-disabled')).toBe('true');
    expect(within(menu).getByText(NO_3D_REASON)).toBeTruthy();
    fireEvent.click(three);
    expect(viewStateOf('s').mode).toBe('2d');
  });

  // FR-217 AC-500
  it('FR-217 AC-500 WebGPU・WebGL2 が使えない環境では 3D が無効で「この環境では 3D を描画できません」、保存が 3D でも 2D を表示し、選択・入力中の内容は変わらない', async () => {
    setCan3DForTest(false);
    useLayout.getState().setView('g', { mode: '3d' });
    useSelectionStore.setState({ selectedIds: ['x1'] });
    useRetainedStore.getState().set('table.filter', '見積');
    expect(modeOptions(BOTH, false)[1]).toMatchObject({ enabled: false, reason: NO_3D_ENV_REASON });
    expect(viewStateOf('g').mode).toBe('2d');
    render(wrap(<Workspace screens={screens} />));
    expect(viewBtn('g').textContent).toContain('2D');
    fireEvent.click(viewBtn('g'));
    expect(within(await screen.findByRole('menu')).getByText(NO_3D_ENV_REASON)).toBeTruthy();
    expect(useSelectionStore.getState().selectedIds).toEqual(['x1']);
    expect(useRetainedStore.getState().values['table.filter']).toBe('見積');
  });

  // FR-217 AC-500
  it('FR-217 AC-500 2D の表現を持たない画面は 2D が無効で「この画面には 2D の表現がありません」、3D の表示が続く', async () => {
    expect(modeOptions(THREE_ONLY, true)[0]).toMatchObject({ value: '2d', enabled: false, reason: NO_2D_REASON });
    expect(effectiveMode(THREE_ONLY, '2d', true)).toBe('3d');
    render(wrap(<Workspace screens={screens} />));
    fireEvent.click(viewBtn('v'));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitemradio', { name: '2D' }).getAttribute('aria-disabled')).toBe('true');
    expect(within(menu).getByText(NO_2D_REASON)).toBeTruthy();
    expect(viewStateOf('v').mode).toBe('3d');
  });

  // FR-217 AC-500（コマンドパレットから選べないものを選んでも変えず、理由を示す）
  it('FR-217 AC-500 異常系: コマンドパレットから選べない表示モード・世界を選んでも状態は変わらず、理由を通知する', () => {
    const notify = vi.fn();
    const cmds = paneCommands(() => ({ key: 's' }) as unknown as PaneInfo, notify);
    cmds.find((c) => c.id === 'pane.view.mode.3d')!.run();
    cmds.find((c) => c.id === 'pane.view.world.real')!.run();
    expect(notify).toHaveBeenCalledWith(NO_3D_REASON);
    expect(notify).toHaveBeenCalledWith(NO_WORLD_REASON);
    expect(viewStateOf('s')).toEqual({ mode: '2d', world: 'both' });
    const cmds2 = paneCommands(() => ({ key: 'g' }) as unknown as PaneInfo, notify);
    cmds2.find((c) => c.id === 'pane.view.mode.3d')!.run();
    expect(viewStateOf('g').mode).toBe('3d');
  });
});

describe('FR-217 AC-499 保存と復元（レイアウトとともに）', () => {
  // FR-217 AC-499（再読込で最後の表示モードで復元する部分の単体）
  it('FR-217 AC-499 表示モード・世界の表示はペルソナ別にレイアウトとして保存され、再読込（復元）で戻る。不正な保存値は捨てる', async () => {
    useLayout.getState().setView('g', { mode: '3d', world: 'digital' });
    const saved = JSON.parse(localStorage.getItem('edb.layout') ?? '{}');
    expect(saved.state.views[persona()].g).toEqual({ mode: '3d', world: 'digital' });
    saved.state.views[persona()].bad = { mode: '4d' };
    // メモリ上の状態を消してから（消すと保存も書き換わるので、その後で）保存値を置き、再読込と同じ復元を行う
    useLayout.setState({ views: {} });
    expect(viewStateOf('g').mode).toBe('2d');
    localStorage.setItem('edb.layout', JSON.stringify(saved));
    await useLayout.persist.rehydrate();
    expect(viewStateOf('g')).toEqual({ mode: '3d', world: 'digital' });
    expect(st().views[persona()]?.bad).toBeUndefined();
  });
});

describe('FR-217 AC-506 既定のレイアウトに戻す', () => {
  // FR-217 AC-506
  it('FR-217 AC-506 3D・現実世界にした後で「既定のレイアウトに戻す」と、表示モードはその画面の既定、世界の表示は「両方」に戻り、選択と絞り込みは変わらない', () => {
    useLayout.getState().setView('g', { mode: '3d', world: 'real' });
    useLayout.getState().setView('v', { world: 'real' });
    applyScreenView({ world: 'digital' });
    useSelectionStore.setState({ selectedIds: ['a1'] });
    useRetainedStore.getState().set('table.filter', 'abc');
    useLayout.getState().resetLayout();
    expect(viewStateOf('g')).toEqual({ mode: '2d', world: 'both' });
    expect(viewStateOf('v')).toEqual({ mode: '3d', world: 'both' });
    expect(st().screenView[persona()]).toBeUndefined();
    expect(useSelectionStore.getState().selectedIds).toEqual(['a1']);
    expect(useRetainedStore.getState().values['table.filter']).toBe('abc');
  });
});

describe('FR-216 FR-217 FR-218 AC-510 ピン止めしたコンポーネントは画面の見出しの切替の対象外', () => {
  // FR-216 FR-217 FR-218 AC-510
  it('AC-510 ピン止めしたものは画面の見出しの切替で変わらず、コンポーネントの見出しの切替では変わる。ピン止めしていないものには効く', () => {
    useLayout.getState().setPinned('g', { x: 0, y: 0, w: 0.3, h: 0.3 });
    applyScreenView({ mode: '3d', world: 'digital' });
    expect(viewStateOf('g')).toEqual({ mode: '2d', world: 'both' });
    expect(viewStateOf('v')).toEqual({ mode: '3d', world: 'digital' });
    expect(st().screenView[persona()]).toEqual({ mode: '3d', world: 'digital' });
    useLayout.getState().setView('g', { world: 'real' });
    expect(viewStateOf('g').world).toBe('real');
  });

  it('AC-510 ピン止めを外した後の画面の見出しの切替は、そのコンポーネントにも効く（外した時点では表示は変わらない）', () => {
    useLayout.getState().setPinned('g', { x: 0, y: 0, w: 0.3, h: 0.3 });
    applyScreenView({ mode: '3d' });
    useLayout.getState().setPinned('g', null);
    expect(viewStateOf('g').mode).toBe('2d');
    applyScreenView({ mode: '2d' });
    applyScreenView({ mode: '3d' });
    expect(viewStateOf('g').mode).toBe('3d');
  });
});

describe('FR-217 AC-507 表現を固定したコンポーネントと既存の切替', () => {
  // FR-217 AC-507
  it('FR-217 AC-507 画面の見出しの切替は全コンポーネントにまとめて効くが、表現を固定したもの（3D ビュー・2D 図面）は変わらない  ', () => {
      applyScreenView({ mode: '3d' });
    expect(viewStateOf('g').mode).toBe('3d');
    expect(viewStateOf('d').mode).toBe('2d');
    expect(viewStateOf('v').mode).toBe('3d');
    applyScreenView({ mode: '2d' });
    expect(viewStateOf('g').mode).toBe('2d');
    expect(viewStateOf('v').mode).toBe('3d');
    // 世界の表示は、世界区分を持つものにまとめて効く（世界区分のない画面は対象外）
    applyScreenView({ world: 'real' });
    expect(viewStateOf('g').world).toBe('real');
    expect(viewStateOf('v').world).toBe('real');
    expect(viewStateOf('s').world).toBe('both');
    // コンポーネントの見出しの切替で戻せる
    useLayout.getState().setView('g', { world: 'both' });
    expect(viewStateOf('g').world).toBe('both');
  });

  // FR-217 AC-507（画面の見出しの「ビュー」ボタン）
  it('FR-217 AC-507 画面の見出しの「ビュー」ボタンで 3D を選ぶと、3D の表現を持つものだけが 3D になり、ボタンの文字が変わる', async () => {
    const { ScreenViewButton } = await import('../../src/view/ViewMenu');
    render(wrap(<ScreenViewButton />));
    fireEvent.click(screen.getByRole('button', { name: /^画面のビュー/ }));
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitemradio', { name: '3D' }));
    expect(screen.getByRole('button', { name: /^画面のビュー/ }).textContent).toContain('3D・両方');
    expect(viewStateOf('g').mode).toBe('3d');
    expect(viewStateOf('s').mode).toBe('2d');
    expect(viewStateOf('d').mode).toBe('2d');
  });

  // FR-217 AC-507（FR-169 の既存の切替と見出しの切替が同じ状態）
  it('FR-217 AC-507 データビュアーの既存の 2D/3D の切替と見出しの切替は同じ状態で、どちらで変えても両方が同じモードを示す', () => {
    registerViewDecls([{ key: 'data-catalog', view: BOTH }]);
    useLayout.getState().setView('data-catalog', { mode: '3d' });
    expect(useDataViewer.getState().mode).toBe('3d');
    act(() => useDataViewer.getState().setMode('2d'));
    expect(viewStateOf('data-catalog').mode).toBe('2d');
    expect(useDataViewer.getState().mode).toBe('2d');
  });
});

describe('FR-218 世界の表示のコンポーネント共通の扱い（結合）', () => {
  function Typing() {
    const [v, setV] = useState('');
    return <input aria-label="入力" value={v} onChange={(e) => setV(e.target.value)} />;
  }

  // FR-218 AC-502（1 つの世界の画面は、別の世界で中身を隠し、入力中の内容を保つ）
  it('FR-218 AC-502 画面の項目がすべてデジタル世界の画面は、「現実世界」で中身を隠して理由を示し、「両方」に戻すと入力中の内容がそのまま出る', () => {
    registerViewDecls([{ key: 'k', view: DIGITAL }]);
    render(wrap(<Panel testId="component-k" title="KPI"><Typing /></Panel>));
    fireEvent.change(screen.getByLabelText('入力'), { target: { value: '入力中' } });
    act(() => useLayout.getState().setView('k', { world: 'real' }));
    expect(screen.getByTestId('view-world-body').style.display).toBe('none');
    expect(screen.getByTestId('view-world-note').textContent).toContain('デジタル世界');
    act(() => useLayout.getState().setView('k', { world: 'both' }));
    expect(screen.getByTestId('view-world-body').style.display).toBe('contents');
    expect((screen.getByLabelText('入力') as HTMLInputElement).value).toBe('入力中');
  });

  // FR-217 AC-498（テスト用フック t.view.state）
  it('FR-217 AC-498 t.view.state(key) は表示モード・世界の表示・表示中の項目・その中の選択を返す', () => {
    useLayout.getState().setView('g', { mode: '3d' });
    useSelectionStore.setState({ selectedIds: ['a', 'z'] });
    const s = viewTestState('g');
    expect(s.mode).toBe('3d');
    expect(s.world).toBe('both');
    expect(viewText('3d', 'real')).toBe('3D・現実世界');
    expect(viewDeclOf('g')).toBe(BOTH);
  });
});

describe('FR-218 AC-502 全画面の世界区分の宣言が §3.7 の分類表と合う', () => {
  // FR-218 AC-502
  it('FR-218 AC-502 登録している全画面の world 宣言が §3.7 の分類（課題・解決策・工程・ユースケース・議題＝現実世界、出典・議論ツリー・付箋・議論テーマ・KPI/OKR・アーキテクチャ・データカタログ＝デジタル世界）と合い、1 つの世界の画面は根拠と理由を持つ', async () => {
    const { SCREENS } = await import('../../src/screens/registry');
    const want: Record<string, 'real' | 'digital' | 'items' | false> = {
      canvas: 'real', 'issue-solution': 'real', priority: 'real', summary: false, matrix: 'real', ranking: 'real',
      'knowledge-graph': 'items', architecture: 'digital', 'discussion-tree': 'digital', table: 'items', gantt: 'real',
      view3d: 'items', drawing2d: 'items', map: 'items', 'kpi-okr': 'digital', sources: 'digital', 'mock-app': false,
      usecase: 'real', 'data-catalog': 'digital', whiteboard: 'digital', themes: 'digital', settings: false, chat: false,
      // FR-240 空間ビュー（世界区分の切替は持たない）
      'spatial-view': false,
    };
    expect(SCREENS.map((x) => x.key).sort()).toEqual(Object.keys(want).sort());
    for (const sc of SCREENS) {
      expect(sc.view!.world, `${sc.key} の世界区分の宣言が §3.7 と合わない`).toBe(want[sc.key]);
      if (sc.view!.world === 'real' || sc.view!.world === 'digital') {
        expect(sc.view!.basis, `${sc.key} に §3.7 の根拠がない`).toBeTruthy();
        expect(singleWorldNote(sc.view!)).toContain(sc.view!.basis!);
      }
    }
    // §3.7 の分類表の行（要求定義書）と、根拠のエンティティの世界区分が一致する
    const rd = readFileSync('docs/requirements-definition.md', 'utf8');
    const row = (name: string) => rd.match(new RegExp(`^\\| ${name} \\| (現実世界|デジタル世界) \\|`, 'm'))?.[1];
    const check: Array<[string, string]> = [
      ['課題', 'issue-solution'], ['解決策', 'priority'], ['工程', 'gantt'], ['ユースケース', 'usecase'], ['議題', 'canvas'],
      ['出典', 'sources'], ['議論ツリー', 'discussion-tree'], ['付箋', 'whiteboard'], ['議論テーマ', 'themes'], ['KPI', 'kpi-okr'],
      ['アーキテクチャ', 'architecture'], ['データエンティティ', 'data-catalog'],
    ];
    const byKey = new Map(SCREENS.map((x) => [x.key, x.view!]));
    for (const [entity, key] of check) {
      expect(row(entity), `§3.7 に ${entity} の行がない`).toBeTruthy();
      expect(byKey.get(key)!.world).toBe(row(entity) === '現実世界' ? 'real' : 'digital');
    }
  });

  // FR-218 AC-502（A-57: 1 つの世界の画面の宣言と、グラフの節の既定の世界区分は同じ §3.7 の表から引く）
  it('FR-218 AC-502 画面の登録: 1 つの世界の画面の宣言は、表示する節の種類の §3.7 の既定の世界区分と一致する（同じ表から引く）', async () => {
    const { SCREENS } = await import('../../src/screens/registry');
    let checked = 0;
    for (const sc of SCREENS) {
      const v = sc.view!;
      if (v.world !== 'real' && v.world !== 'digital') continue;
      expect(v.basis, sc.key).toBeTruthy();
      const kinds = (v.kinds ?? []) as Array<(typeof NODE_KINDS)[number]>;
      // キャンバスは章（チャプター＝デジタル世界）と議題（現実世界）をともに含み、根拠は議題（既存の宣言のまま）
      if (sc.key === 'canvas' || kinds.length === 0) continue;
      const ws = kinds.map((kd) => defaultWorldOfNodeKind(kd));
      if (ws.some((w) => w === undefined)) continue; // エンティティ（entity）は世界区分の項目を持つため既定の区分を当てない（工程＝task はガントの宣言と照合する）
      for (const w of ws) expect(w, `${sc.key} の宣言（${v.world}）と節の既定の世界区分が合わない`).toBe(v.world);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(6);
  });

  // FR-218（「隠れている」の表示は、この画面の項目の選択のときだけ）
  it('FR-218 AC-504 「選択中の項目はこの表示では隠れています」は、選択がその画面の項目で、いまの世界の表示で隠れているときだけ', () => {
    const nodes: Record<string, { kind: string; world?: 'real' | 'digital' }> = {
      i1: { kind: 'issue' }, e1: { kind: 'entity', world: 'real' }, e2: { kind: 'entity', world: 'digital' }, s1: { kind: 'source' },
    };
    const nodeOf = (id: string) => nodes[id];
    const issues: ViewDecl = { has2D: true, has3D: false, world: 'real', kinds: ['issue'] };
    expect(selectionHiddenIn(issues, 'digital', ['i1'], nodeOf)).toBe(true);
    expect(selectionHiddenIn(issues, 'digital', ['e1', 's1'], nodeOf)).toBe(false);
    expect(selectionHiddenIn(issues, 'real', ['i1'], nodeOf)).toBe(false);
    const ents: ViewDecl = { has2D: true, has3D: true, world: 'items', kinds: ['entity'] };
    expect(selectionHiddenIn(ents, 'real', ['e2'], nodeOf)).toBe(true);
    expect(selectionHiddenIn(ents, 'real', ['e1', 'i1'], nodeOf)).toBe(false);
    expect(selectionHiddenIn(ents, 'both', ['e2'], nodeOf)).toBe(false);
    expect(selectionHiddenIn(TWO, 'real', ['e2'], nodeOf)).toBe(false);
  });

  // FR-218（結合: 関係のない選択では出ず、この画面の項目の選択で出る）
  it('FR-218 AC-504 結合: 1 つの世界の画面で別の世界を選んだとき、ほかの画面の項目を選んでいても「隠れています」は出ない', () => {
    registerViewDecls([{ key: 'k', view: DIGITAL }]);
    render(wrap(<Panel testId="component-k" title="KPI"><p>x</p></Panel>));
    act(() => { useSelectionStore.setState({ selectedIds: ['zzz-unrelated'] }); useLayout.getState().setView('k', { world: 'real' }); });
    expect(screen.queryByTestId('view-hidden-selection')).toBeNull();
  });
});

describe('FR-217 AC-500・AC-507 画面の中の既存の切替（共通の ModeRadio）', () => {
  // FR-217 AC-500
  it('FR-217 AC-500 3D を描画できない環境では、画面の中の 3D の選択肢も無効で「この環境では 3D を描画できません」を示し、選んでも変わらない', () => {
    setCan3DForTest(false);
    render(wrap(<ModeRadio viewKey="g" />));
    const three = screen.getByRole('radio', { name: '3D' }) as HTMLInputElement;
    expect(three.disabled).toBe(true);
    expect(screen.getByText(NO_3D_ENV_REASON)).toBeTruthy();
    fireEvent.click(three);
    expect(viewStateOf('g').mode).toBe('2d');
  });

  // FR-217 AC-500（FR-022 を後退させない: 2.5D は canvas 2D なので描画できない環境でも選べる）
  it('FR-217 AC-500 ガントの 2.5D（canvas 2D）は、WebGPU・WebGL2 がなくても選べ、見出しの状態と同じ値になる', async () => {
    setCan3DForTest(false);
    const { SCREENS } = await import('../../src/screens/registry');
    const gantt = SCREENS.find((x) => x.key === 'gantt')!.view!;
    expect(canRender3D(gantt, false)).toBe(true);
    registerViewDecls([{ key: 'gantt', view: gantt }]);
    render(wrap(<ModeRadio viewKey="gantt" labels={{ '3d': '2.5D' }} />));
    const r = screen.getByRole('radio', { name: '2.5D' }) as HTMLInputElement;
    expect(r.disabled).toBe(false);
    fireEvent.click(r);
    expect(viewStateOf('gantt').mode).toBe('3d');
    expect(screen.queryByText(NO_3D_ENV_REASON)).toBeNull();
  });

  // FR-217 AC-507（見出しの切替と画面の中の切替が同じ状態）
  it('FR-217 AC-507 見出しで 3D にすると画面の中の切替も 3D を示し、画面の中で 2D にすると見出しの状態も 2D になる', () => {
    render(wrap(<ModeRadio viewKey="g" />));
    act(() => useLayout.getState().setView('g', { mode: '3d' }));
    expect((screen.getByRole('radio', { name: '3D' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: '2D' }));
    expect(viewStateOf('g').mode).toBe('2d');
  });

  // FR-217 AC-507（既存の切替は二重に置かず、共通の部品を使う）
  it('FR-217 AC-507 ナレッジグラフ・アーキテクチャ図・ガントの画面の中の切替は共通の ModeRadio だけを使う', () => {
    for (const f of ['KnowledgeGraphScreen', 'ArchitectureScreen', 'GanttScreen']) {
      const src = readFileSync(`src/screens/${f}.tsx`, 'utf8');
      expect(src, f).toMatch(/<ModeRadio viewKey=/);
      expect(src, f).not.toMatch(/value="2\.?5?d"|value="3d"/);
    }
  });
});
