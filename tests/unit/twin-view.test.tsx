// @vitest-environment jsdom
// FR-239 Twin ビュー（AC-567 層の割り当て、AC-569 Control の注記・鮮度・送信なし、AC-570 件数・流れの本数・世界の表示）の単体・結合テスト。
// AC-566・AC-568 は System Test（tests/system/e2e/graph-twin-b.spec.ts E2E-332・E2E-333）が確かめる。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { TwinViewScreen } from '../../src/screens/TwinViewScreen';
import { SCREENS } from '../../src/screens/registry';
import { buildEntityGraph } from '../../src/selection/graph';
import { usePackStore } from '../../src/store/pack';
import { useSelectionStore } from '../../src/store/selection';
import { useLayout } from '../../src/store/layout';
import { setCan3DForTest } from '../../src/view/render3d';
import { registerViewDecls } from '../../src/view/viewModel';
import { CONTROL_NOTE, FRESHNESS_NOTE, buildTwinModel } from '../../src/twin/model';

const src = ['src-1'];
const e = (id: string, world: 'real' | 'digital', kind: string, extra: object = {}) => ({ id, createdBy: 't', type: 'x', name: `名-${id}`, world, kind, sourceIds: src, ...extra });
const ENTITIES = [
  e('r-eq', 'real', 'equipment'), e('r-pe', 'real', 'person'), e('r-si', 'real', 'site'),
  e('d-op', 'digital', 'system', { layer: 'operations' }), e('d-ex', 'digital', 'ui-component', { layer: 'experience' }),
  e('d-in', 'digital', 'metric', { layer: 'insights' }), e('d-none', 'digital', 'data'),
];
const fl = (id: string, from: string, to: string, kind: string, label: string) => ({ id, createdBy: 't', from, to, kind, label, sourceIds: src });
const FLOWS = [
  fl('f1', 'r-eq', 'd-op', 'data', '計測値'), fl('f2', 'r-eq', 'd-op', 'data', '稼働'), fl('f3', 'd-op', 'r-eq', 'control', '稼働指示'),
  fl('f4', 'r-si', 'r-pe', 'goods', '物流'),
];
const data = () => ({
  entities: { entities: ENTITIES, flows: FLOWS, twins: [{ realId: 'r-eq', digitalId: 'd-op', relation: 'measures', sourceIds: src }] },
  sources: { sources: [{ id: 'src-1', retrievedAt: '2026-01-02' }, { id: 'src-2', retrievedAt: '2026-03-04' }] },
  issues: { issues: [], solutions: [] }, products: { products: [] }, plan: { features: [], tasks: [] }, architecture: { nodes: [], edges: [] }, mocks: { mocks: [] }, show: { chapters: [] },
});

describe('FR-239 AC-567 層の割り当て（結合）', () => {
  it('デジタル世界の項目は三つの層のどれかに入り、層を持たない項目は「層なし」に入る（消えない）', () => {
    const m = buildTwinModel(ENTITIES as never, FLOWS, 'both');
    const by = Object.fromEntries(m.layers.map((l) => [l.layer, l.items.map((i) => i.id)]));
    expect(by).toEqual({ operations: ['d-op'], experience: ['d-ex'], insights: ['d-in'], none: ['d-none'] });
    expect(m.layers.flatMap((l) => l.items).length).toBe(m.digital.length);
  });
  it('異常系: 不正な層の値は「層なし」に入り、層なしの項目がないときは枠を出さない', () => {
    const bad = buildTwinModel([e('d1', 'digital', 'data', { layer: 'bogus' })] as never, [], 'digital');
    expect(bad.layers.find((l) => l.layer === 'none')?.items.map((i) => i.id)).toEqual(['d1']);
    const ok = buildTwinModel([e('d1', 'digital', 'data', { layer: 'insights' })] as never, [], 'digital');
    expect(ok.layers.some((l) => l.layer === 'none')).toBe(false);
  });
});

describe('FR-239 AC-570 世界の表示と流れの本数（結合）', () => {
  it('流れは「両方」のときだけ。Twin の流れ（現実×デジタル。data／control）だけを、同じ向き・両端でまとめて数える', () => {
    const both = buildTwinModel(ENTITIES as never, FLOWS, 'both');
    expect(both.flows.map((f) => [f.kind, f.from, f.to, f.count, f.label])).toEqual([['data', 'r-eq', 'd-op', 2, '計測値・稼働'], ['control', 'd-op', 'r-eq', 1, '稼働指示']]);
    const real = buildTwinModel(ENTITIES as never, FLOWS, 'real');
    expect(real.flows).toEqual([]);
    expect(real.itemIds).toEqual(['r-eq', 'r-pe', 'r-si']);
    expect(real.layers.flatMap((l) => l.items)).toEqual([]);
    const dig = buildTwinModel(ENTITIES as never, FLOWS, 'digital');
    expect(dig.flows).toEqual([]);
    expect(dig.itemIds).toEqual(['d-op', 'd-ex', 'd-in', 'd-none']);
  });
});

describe('FR-239 AC-568 流れで結ばれた項目の関連（結合）', () => {
  it('流れの両端はエンティティ関係グラフの関連になる（他の画面でも強調される）', () => {
    const g = buildEntityGraph(data() as never);
    expect([...g.related('r-eq')]).toEqual(expect.arrayContaining(['d-op', 'r-eq']));
    expect(g.related('d-in').has('r-eq')).toBe(false);
    expect(g.related('d-op').has('r-eq')).toBe(true);
  });
});

describe('FR-239 AC-569 / AC-570 画面（結合）', () => {
  const wrap = (ui: JSX.Element) => <FluentProvider theme={webLightTheme}>{ui}</FluentProvider>;
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    setCan3DForTest(true);
    registerViewDecls(SCREENS);
    useLayout.setState({ views: {}, screenView: {} });
    useSelectionStore.setState({ selectedIds: [] });
    usePackStore.setState({ state: { status: 'ready', pack: { data: data() } as never, warnings: [] } });
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); setCan3DForTest(undefined); });

  it('AC-569 Control の流れを含む図を操作しても送信は起きず、注記と鮮度（パックの値）が出る', () => {
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'send');
    const beacon = vi.fn();
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    render(wrap(<TwinViewScreen />));
    const ctrl = screen.getAllByTestId('twin-flow').find((f) => f.getAttribute('data-flow-kind') === 'control')!;
    expect(ctrl.textContent).toContain('Control');
    expect(ctrl.getAttribute('data-line-style')).not.toBe(screen.getAllByTestId('twin-flow').find((f) => f.getAttribute('data-flow-kind') === 'data')!.getAttribute('data-line-style'));
    fireEvent.click(ctrl);
    fireEvent.click(screen.getByRole('button', { name: /名-d-op/ }));
    expect(screen.getByTestId('twin-control-note').textContent).toContain(CONTROL_NOTE);
    expect(screen.getByTestId('twin-freshness').textContent).toContain(FRESHNESS_NOTE);
    expect(screen.getByTestId('twin-freshness').textContent).toContain('2026-01-02');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });

  it('AC-570 2D と 3D で項目の件数・流れの本数が同じ。世界の表示を「現実世界」にすると現実世界の項目だけで、流れは出ない', () => {
    const { unmount } = render(wrap(<TwinViewScreen />));
    const count2d = document.querySelectorAll('[data-entity-id]').length;
    const flows2d = screen.getAllByTestId('twin-flow').length;
    expect(flows2d).toBe(2);
    unmount();
    useLayout.getState().setView('twin-view', { mode: '3d' });
    render(wrap(<TwinViewScreen />));
    expect(screen.getAllByTestId('twin-flow').length).toBe(flows2d);
    expect(count2d).toBe(7);
    cleanup();
    useLayout.getState().setView('twin-view', { mode: '2d', world: 'real' });
    render(wrap(<TwinViewScreen />));
    const ids = [...document.querySelectorAll('[data-entity-id]')].map((x) => x.getAttribute('data-entity-id'));
    expect(ids.sort()).toEqual(['r-eq', 'r-pe', 'r-si']);
    expect(screen.queryAllByTestId('twin-flow')).toHaveLength(0);
  });

  it('AC-567 層の枠に項目が入る', () => {
    render(wrap(<TwinViewScreen />));
    expect(within(screen.getByTestId('twin-layer-none')).getByRole('button', { name: /名-d-none/ })).toBeTruthy();
    expect(within(screen.getByTestId('twin-layer-operations')).getByRole('button', { name: /名-d-op/ })).toBeTruthy();
  });

  it('画面の登録: キー twin-view・名前「Twin ビュー」（2D・3D を持ち、世界区分は項目ごと）', () => {
    const d = SCREENS.find((x) => x.key === 'twin-view');
    expect(d?.label).toBe('Twin ビュー');
    expect(d?.view).toMatchObject({ has2D: true, has3D: true, world: 'items' });
  });
});
