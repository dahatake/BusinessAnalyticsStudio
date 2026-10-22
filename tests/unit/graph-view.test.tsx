// @vitest-environment jsdom
// FR-238 表示形式「Graph」の追加（AC-561・AC-563・AC-564・AC-565・AC-583）と、NFR-A11Y-010（AC-580・AC-581・AC-582）の単体・結合テスト。
// AC-562（往復の速さ・保持）は System Test（tests/system/e2e/graph-view-switch.spec.ts E2E-327）が確かめる。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { TwinViewScreen } from '../../src/screens/TwinViewScreen';
import { SCREENS } from '../../src/screens/registry';
import { usePackStore } from '../../src/store/pack';
import { useSelectionStore } from '../../src/store/selection';
import { useLayout } from '../../src/store/layout';
import { setCan3DForTest } from '../../src/view/render3d';
import {
  NO_GRAPH_REASON, defaultModeOf, effectiveMode, modeOptions, registerViewDecls, screenModeFor, viewText, type ViewDecl,
} from '../../src/view/viewModel';

const GRAPH_SCREENS = ['business-graph', 'twin-view', 'spatial-view', 'data-catalog', 'issue-solution', 'kpi-okr'];
const decl = (key: string): ViewDecl => SCREENS.find((s) => s.key === key)!.view!;

describe('FR-238 AC-561 画面の登録の宣言と選択肢', () => {
  it('Graph の表現を持つ画面はちょうど 6 画面で 2D・3D・Graph を選べ、それ以外の画面は Graph が無効で理由が文字で示される', () => {
    const has = SCREENS.filter((s) => s.view?.hasGraph).map((s) => s.key).sort();
    expect(has).toEqual([...GRAPH_SCREENS].sort());
    for (const s of SCREENS) {
      const g = modeOptions(s.view!, true).find((o) => o.value === 'graph')!;
      if (s.view!.hasGraph) expect(g.enabled, `${s.key}: Graph が選べない`).toBe(true);
      else { expect(g.enabled, `${s.key}: Graph が無効でない`).toBe(false); expect(g.reason).toBe(NO_GRAPH_REASON); }
    }
    expect(NO_GRAPH_REASON).toBe('この画面には Graph の表現がありません');
  });
  it('選択肢の数は 3（2D・3D・Graph）で、操作のボタンを増やしすぎない（PARAM-073 の上限以内）', () => {
    expect(modeOptions(decl('twin-view'), true).map((o) => o.value)).toEqual(['2d', '3d', 'graph']);
    expect(viewText('graph', 'both')).toBe('Graph・両方');
  });
});

describe('FR-238 AC-583 新しい 3 画面の既定の表示形式', () => {
  it('ビジネス関係グラフは Graph、Twin ビューは 2D、空間ビューは 3D（3D を描画できない環境では 2D）', () => {
    expect(defaultModeOf(decl('business-graph'))).toBe('graph');
    expect(defaultModeOf(decl('twin-view'))).toBe('2d');
    expect(defaultModeOf(decl('spatial-view'))).toBe('3d');
    expect(effectiveMode(decl('business-graph'), undefined, true)).toBe('graph');
    expect(effectiveMode(decl('spatial-view'), undefined, true)).toBe('3d');
    expect(effectiveMode(decl('spatial-view'), undefined, false)).toBe('2d'); // 3D を描画できない環境では 2D
    expect(effectiveMode(decl('twin-view'), '3d', false)).toBe('2d');
  });
  it('既存の画面の既定は従来のまま（FR-217）。表現のない Graph は保存されていても選ばない', () => {
    expect(defaultModeOf(decl('map'))).toBe('3d');
    expect(defaultModeOf(decl('table'))).toBe('2d');
    expect(effectiveMode(decl('table'), 'graph', true)).toBe('2d');
  });
});

describe('FR-238 AC-563 3D を描画できない環境', () => {
  it('3D が無効で理由が示され、2D と Graph は選べて、保存が Graph なら Graph のまま表示する', () => {
    const opts = modeOptions(decl('twin-view'), false);
    const by = Object.fromEntries(opts.map((o) => [o.value, o]));
    expect(by['3d']!.enabled).toBe(false);
    expect(by['3d']!.reason).toMatch(/描画できません/);
    expect(by['2d']!.enabled && by.graph!.enabled).toBe(true);
    expect(effectiveMode(decl('twin-view'), 'graph', false)).toBe('graph');
  });
});

describe('FR-238 AC-564 / AC-565 保存・復元と既存の挙動', () => {
  beforeEach(() => { registerViewDecls(SCREENS); useLayout.setState({ views: {}, screenView: {} }); });
  it('AC-564 表示形式 Graph はレイアウトに保存され、「既定のレイアウトに戻す」で各画面の既定に戻る', () => {
    useLayout.getState().setView('twin-view', { mode: 'graph' });
    const st = useLayout.getState();
    expect(st.views[st.persona]?.['twin-view']?.mode).toBe('graph');
    useLayout.getState().resetLayout();
    const after = useLayout.getState();
    expect(after.views[after.persona]?.['twin-view']?.mode).toBeUndefined();
    expect(effectiveMode(decl('twin-view'), after.views[after.persona]?.['twin-view']?.mode, true)).toBe('2d');
  });
  it('AC-565 画面の見出しの切替: 表現を固定したコンポーネントは変わらず、Graph の表現のない画面は Graph で変わらない。2D・3D の挙動は従来どおり', () => {
    expect(screenModeFor({ has2D: false, has3D: true, world: 'items', fixed: true, kinds: ['entity'] }, '2d')).toBeUndefined();
    expect(screenModeFor(decl('table'), 'graph')).toBeUndefined();
    expect(screenModeFor(decl('table'), '3d')).toBe('3d');
    expect(screenModeFor(decl('twin-view'), 'graph')).toBe('graph');
    expect(screenModeFor({ has2D: true, has3D: false, world: 'items', fixed: true, kinds: ['entity'] }, '3d')).toBeUndefined();
  });
});

const src = ['src-1'];
const e = (id: string, world: 'real' | 'digital', kind: string, extra: object = {}) => ({ id, createdBy: 't', type: 'x', name: `名-${id}`, world, kind, sourceIds: src, ...extra });
const fl = (id: string, from: string, to: string, kind: string, label: string) => ({ id, createdBy: 't', from, to, kind, label, sourceIds: src });
const data = () => ({
  entities: {
    entities: [e('r-eq', 'real', 'equipment'), e('r-pe', 'real', 'person'), e('d-op', 'digital', 'system', { layer: 'operations' }), e('d-in', 'digital', 'metric', { layer: 'insights' })],
    flows: [fl('f1', 'r-eq', 'd-op', 'data', '計測値'), fl('f3', 'd-op', 'r-eq', 'control', '稼働指示')],
    twins: [{ realId: 'r-eq', digitalId: 'd-op', relation: 'measures', sourceIds: src }],
  },
  sources: { sources: [{ id: 'src-1', retrievedAt: '2026-01-02' }] },
  issues: { issues: [], solutions: [] }, products: { products: [] }, plan: { features: [], tasks: [] }, architecture: { nodes: [], edges: [] }, mocks: { mocks: [] }, show: { chapters: [] },
});

describe('FR-238 AC-562（単体部分）・NFR-A11Y-010 AC-580〜582 Graph の表現（Twin ビュー）', () => {
  const wrap = (ui: JSX.Element) => <FluentProvider theme={webLightTheme}>{ui}</FluentProvider>;
  beforeEach(() => {
    setCan3DForTest(true);
    registerViewDecls(SCREENS);
    useLayout.setState({ views: {}, screenView: {} });
    useSelectionStore.setState({ selectedIds: [] });
    usePackStore.setState({ state: { status: 'ready', pack: { data: data() } as never, warnings: [] } });
  });
  afterEach(() => { cleanup(); setCan3DForTest(undefined); });

  const ids = () => [...document.querySelectorAll('[data-testid="graph-node"]')].map((x) => x.getAttribute('data-entity-id')).sort();

  it('AC-562 2D と Graph で、表示する項目の件数が同じ（4 件）で、Graph の面（data-zoom-surface="graph"）に出る', () => {
    useLayout.getState().setView('twin-view', { mode: 'graph' });
    render(wrap(<TwinViewScreen />));
    expect(document.querySelector('[data-zoom-surface="graph"]')).toBeTruthy();
    expect(ids()).toEqual(['d-in', 'd-op', 'r-eq', 'r-pe']);
  });

  it('AC-580 Graph の表示中も、ノード・関係（意味ラベルと向き）の表と件数のテキストの要約が残り、表の行を選ぶと同じ項目が選択される', () => {
    useLayout.getState().setView('twin-view', { mode: 'graph' });
    render(wrap(<TwinViewScreen />));
    const alt = screen.getByTestId('graph-alt');
    expect(within(alt).getByTestId('graph-alt-summary').textContent).toMatch(/項目 4 件、関係 \d+ 件/);
    const rel = within(alt).getByTestId('graph-alt-relations');
    expect(rel.textContent).toContain('名-r-eq から 名-d-op へ');
    const row = alt.querySelector('tr[data-entity-id="d-in"]') as HTMLElement;
    expect(row).toBeTruthy();
    fireEvent.click(row);
    expect(useSelectionStore.getState().selectedIds).toContain('d-in');
    fireEvent.click(rel.querySelector('tr[data-relation-id]') as HTMLElement);
    expect(useSelectionStore.getState().selectedIds.length).toBe(1);
  });

  it('AC-581 キーボードだけで、隣接するノードへの移動・ズーム・詳細（Enter）・表示形式の切替ができる', () => {
    useLayout.getState().setView('twin-view', { mode: 'graph' });
    render(wrap(<TwinViewScreen />));
    const node = (id: string) => document.querySelector(`[data-testid="graph-node"][data-entity-id="${id}"]`) as HTMLElement;
    node('r-eq').focus();
    fireEvent.keyDown(node('r-eq'), { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('data-entity-id')).toBe('d-op'); // 隣接（流れ・ツイン）のノード
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' });
    expect(document.activeElement?.getAttribute('data-entity-id')).toBe('r-eq'); // たどってきた道を戻る
    fireEvent.keyDown(node('r-eq'), { key: 'Enter' });
    // FR-247: Enter は詳細カードの開閉（ズームインしない）。ズームインはダブルクリック・ボタン・「+」キー
    expect(screen.getByTestId('detail-card').getAttribute('data-entity-id')).toBe('r-eq');
    expect(screen.getByTestId('zoom-level').getAttribute('data-depth')).toBe('1');
    fireEvent.doubleClick(node('r-eq'));
    expect(screen.getByTestId('zoom-level').getAttribute('data-depth')).toBe('2');
    expect(screen.getByTestId('zoom-detail').querySelector('[data-entity-id="r-eq"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: '拡大' })).toBeTruthy(); // ドラッグの代わりのボタン
    expect(screen.getByRole('button', { name: '縮小' })).toBeTruthy();
    // 表示形式の切替はメニュー（キーボードで開く「ビュー」）。ここでは宣言が 3 択であることで代える
    expect(modeOptions(decl('twin-view'), true)).toHaveLength(3);
  });

  it('AC-582 ノード・エッジの判別が色に加えて形・線種・文字で行え、各エッジの名前に「A から B へ 意味ラベル」が含まれる', () => {
    useLayout.getState().setView('twin-view', { mode: 'graph' });
    render(wrap(<TwinViewScreen />));
    const nodes = [...document.querySelectorAll('[data-testid="graph-node"]')] as HTMLElement[];
    const shapeByKind = new Map<string, string>();
    for (const n of nodes) {
      expect(n.getAttribute('data-shape')).toBeTruthy();
      expect(n.textContent ?? '').toContain(n.getAttribute('data-kind')!.split('（')[0]!); // 種別の文字
      const k = n.getAttribute('data-kind')!;
      const sh = n.getAttribute('data-shape')!;
      if (shapeByKind.has(k)) expect(shapeByKind.get(k)).toBe(sh); else shapeByKind.set(k, sh);
    }
    expect(new Set(shapeByKind.values()).size).toBe(shapeByKind.size); // 種別が違えば形も違う
    const edges = [...document.querySelectorAll('[data-testid="graph-edge"]')] as Element[];
    expect(edges.length).toBe(3); // Data・Control・ツイン
    for (const ed of edges) {
      expect(ed.getAttribute('data-direction')).toBe('forward');
      expect(ed.getAttribute('aria-label')).toMatch(/^名-\S+ から 名-\S+ へ /);
    }
    const dashes = edges.map((ed) => ed.querySelector('line')!.getAttribute('stroke-dasharray'));
    expect(new Set(dashes).size).toBeGreaterThan(1); // Data（実線）と Control（破線）は線種が違う
    expect(edges.some((ed) => ed.getAttribute('aria-label')!.includes('Control'))).toBe(true);
  });
});
