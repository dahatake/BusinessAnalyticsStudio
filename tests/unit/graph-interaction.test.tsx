// @vitest-environment jsdom
// FR-245〜248 Graph の描画面の操作（パン・拡大縮小・全画面・詳細カード・表の行からの移動）の単体・結合テスト。
// 期待値は docs/requirements/graph-twin.md の AC-593〜601 と PARAM-057（1.25）・PARAM-087（0.25〜4）・PARAM-088（40px）・PARAM-105（5 件）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { GraphSurface, type GraphEdgeIn, type GraphNodeIn } from '../../src/components/GraphSurface';
import { GraphAlt } from '../../src/components/GraphAlt';
import { whenSettled } from '../../src/components/GraphViewport';
import { GRAPH_VIEW_INIT, requestGraphFocus, useGraphViewStore } from '../../src/components/graphViewStore';
import { useSelectionStore } from '../../src/store/selection';

const nodes: GraphNodeIn[] = [
  { id: 'o1', name: '目的 1', kind: 'Objective' },
  ...Array.from({ length: 7 }, (_, i) => ({ id: `k${i + 1}`, name: `成果 ${i + 1}`, kind: 'Key Result', note: `値 ${i + 1}` })),
];
const edges: GraphEdgeIn[] = Array.from({ length: 7 }, (_, i) => ({ id: `e${i + 1}`, from: `k${i + 1}`, to: 'o1', label: '達成する', meaning: 'achieves' }));
const wrap = (ui: JSX.Element) => <FluentProvider theme={webLightTheme}>{ui}</FluentProvider>;
const surface = () => document.querySelector('[data-zoom-surface="graph"]') as HTMLElement;
const num = (n: string) => Number(surface().getAttribute(n));
const btn = (name: string) => screen.getByRole('button', { name });
const node = (id: string) => document.querySelector(`[data-testid="graph-node"][data-entity-id="${id}"]`) as HTMLElement;

describe('FR-245〜248 Graph の描画面の操作', () => {
  beforeEach(() => {
    useGraphViewStore.setState({ views: {} });
    useSelectionStore.setState({ selectedIds: [] });
    render(wrap(<GraphSurface origin="t-graph" label="テスト" nodes={nodes} edges={edges} />));
  });
  afterEach(() => cleanup());

  it('FR-245 AC-593 移動ボタンと Shift＋矢印キーで図が動き、キー 1 操作は 40px。矢印キー単独では動かない', () => {
    expect([num('data-pan-x'), num('data-pan-y'), num('data-scale')]).toEqual([GRAPH_VIEW_INIT.x, GRAPH_VIEW_INIT.y, GRAPH_VIEW_INIT.s]);
    fireEvent.click(btn('図を右へ移動'));
    expect(num('data-pan-x')).toBe(40);
    fireEvent.click(btn('図を下へ移動'));
    expect(num('data-pan-y')).toBe(40);
    fireEvent.click(btn('図を左へ移動'));
    fireEvent.click(btn('図を上へ移動'));
    expect([num('data-pan-x'), num('data-pan-y')]).toEqual([0, 0]);
    fireEvent.keyDown(surface(), { key: 'ArrowLeft', shiftKey: true });
    expect(num('data-pan-x')).toBe(-40);
    fireEvent.keyDown(surface(), { key: 'ArrowDown', shiftKey: true });
    expect(num('data-pan-y')).toBe(40);
    fireEvent.keyDown(surface(), { key: 'ArrowRight' });
    expect([num('data-pan-x'), num('data-pan-y')]).toEqual([-40, 40]);
    // 空白部分のドラッグは、jsdom に PointerEvent がないため System Test（E2E-346）で確かめる
  });

  it('FR-245 AC-594 ボタン・キーの 1 操作は 1.25 倍（縮小は逆数）で、倍率は 0.25〜4 に丸められ、全体表示に戻せる', () => {
    fireEvent.click(btn('全体表示に戻す'));
    expect(num('data-scale')).toBe(1);
    fireEvent.click(btn('拡大'));
    expect(num('data-scale')).toBe(1.25);
    fireEvent.click(btn('縮小'));
    expect(num('data-scale')).toBe(1);
    fireEvent.keyDown(surface(), { key: '+' });
    expect(num('data-scale')).toBe(1.25);
    fireEvent.keyDown(surface(), { key: '-' });
    expect(num('data-scale')).toBe(1);
    for (let i = 0; i < 30; i++) fireEvent.click(btn('拡大'));
    expect(num('data-scale')).toBe(4);
    for (let i = 0; i < 60; i++) fireEvent.click(btn('縮小'));
    expect(num('data-scale')).toBe(0.25);
    fireEvent.click(btn('図を右へ移動'));
    fireEvent.click(btn('全体表示に戻す'));
    expect([num('data-pan-x'), num('data-pan-y'), num('data-scale')]).toEqual([0, 0, 1]);
    // 全体の階層は塊（種別と件数）で示し、要素の階層で個々のノードを示す
    expect(document.querySelector('[data-testid="zoom-level"]')?.getAttribute('data-depth')).toBe('0');
    expect(document.querySelectorAll('[data-zoom-cluster]').length).toBe(2);
    fireEvent.click(btn('拡大'));
    expect(document.querySelectorAll('[data-testid="graph-node"]').length).toBe(8);
  });

  // FR-245 AC-594: 「全体に戻す」の直後に全ノードが面に収まる（拡大の動きの途中の位置を残さない。動きのトランジションを止めて即時に戻す）
  it('FR-245 AC-594 拡大の動きの途中で「全体表示に戻す」を押しても、動きを止めて即時に全体表示に戻る', () => {
    const content = () => document.querySelector('[data-zoom-surface="graph"] [style*="transform"]') as HTMLElement;
    fireEvent.click(btn('全体表示に戻す'));
    const still = content().className;
    fireEvent.click(btn('拡大'));
    expect(content().className, '拡大は動きのトランジションを付ける').not.toBe(still);
    fireEvent.click(btn('全体表示に戻す'));
    expect(content().className, '全体表示に戻すは動きを付けない').toBe(still);
    expect([num('data-pan-x'), num('data-pan-y'), num('data-scale')]).toEqual([0, 0, 1]);
    fireEvent.click(btn('拡大'));
    fireEvent.keyDown(surface(), { key: '0' });
    expect(content().className, '0 キーの全体表示も動きを付けない').toBe(still);
  });

  it('FR-245 AC-594 ホイールとピンチ（Ctrl＋ホイール）で拡大縮小できる', () => {
    const stage = surface().querySelector('[data-testid="graph-canvas"]')!.parentElement!.parentElement as HTMLElement;
    fireEvent.wheel(stage, { deltaY: -200 });
    const up = num('data-scale');
    expect(up).toBeGreaterThan(1);
    fireEvent.wheel(stage, { deltaY: 200, ctrlKey: true });
    expect(num('data-scale')).toBeLessThan(up);
  });

  it('FR-246 AC-596・AC-597 全画面にでき、F キーでも入れて、カードが開いていれば Esc はカードだけ閉じ、次の Esc で全画面を終える。パン・倍率・選択は保たれる', () => {
    fireEvent.click(btn('図を右へ移動'));
    fireEvent.click(btn('拡大'));
    fireEvent.click(node('k1'));
    const before = [num('data-pan-x'), num('data-pan-y'), num('data-scale')];
    fireEvent.click(btn('全画面'));
    expect(surface().getAttribute('data-fullscreen')).toBe('true');
    expect(screen.queryByRole('button', { name: '全画面' })).toBeNull();
    expect([num('data-pan-x'), num('data-pan-y'), num('data-scale')]).toEqual(before);
    fireEvent.click(node('k2')); // 全画面でも詳細カード
    expect(screen.getByTestId('detail-card').getAttribute('data-entity-id')).toBe('k2');
    fireEvent.keyDown(node('k2'), { key: 'Escape' });
    expect(screen.queryByTestId('detail-card')).toBeNull();
    expect(surface().getAttribute('data-fullscreen')).toBe('true');
    fireEvent.keyDown(node('k2'), { key: 'Escape' });
    expect(surface().getAttribute('data-fullscreen')).toBeNull();
    expect([num('data-pan-x'), num('data-pan-y'), num('data-scale')]).toEqual(before);
    expect(useSelectionStore.getState().selectedIds).toEqual(['k2']);
    fireEvent.keyDown(surface(), { key: 'f' });
    expect(btn('全画面を終了')).toBeTruthy();
    fireEvent.click(btn('全画面を終了'));
    expect(surface().getAttribute('data-fullscreen')).toBeNull();
  });

  it('FR-247 AC-598 ノードのクリックで詳細カード（名称・種別・属性・主要な関係）、再クリックで閉じ、別のノードで内容が替わる。主要な関係は 5 件まで', () => {
    fireEvent.click(btn('拡大'));
    fireEvent.click(node('o1'));
    const card = screen.getByTestId('detail-card');
    expect(card.getAttribute('data-entity-id')).toBe('o1');
    expect(card.textContent).toContain('目的 1');
    for (const h of ['種別', '属性', '主要な関係']) expect(within(card).getByRole('heading', { name: h })).toBeTruthy();
    expect(within(card).getAllByTestId('card-relation').length).toBe(5);
    expect(card.textContent).toMatch(/ほか\s*2\s*件/);
    fireEvent.click(node('k1'));
    expect(screen.getByTestId('detail-card').getAttribute('data-entity-id')).toBe('k1');
    fireEvent.click(node('k1'));
    expect(screen.queryByTestId('detail-card')).toBeNull();
  });

  it('FR-247 AC-599 エッジのクリックで「A から B へ 意味ラベル」・種別・属性のカード、再クリック・Esc で閉じ、Enter でノード・エッジとも開閉（ズームインしない）', () => {
    fireEvent.click(btn('拡大'));
    const depth = () => document.querySelector('[data-testid="zoom-level"]')?.getAttribute('data-depth');
    const e1 = document.querySelector('[data-testid="graph-edge"][data-edge-id="e1"]') as Element;
    fireEvent.click(e1);
    const card = screen.getByTestId('detail-card');
    expect(card.textContent).toContain('成果 1 から 目的 1 へ 達成する');
    expect(within(card).getByRole('heading', { name: '種別' })).toBeTruthy();
    expect(within(card).getByRole('heading', { name: '属性' })).toBeTruthy();
    fireEvent.click(e1);
    expect(screen.queryByTestId('detail-card')).toBeNull();
    fireEvent.click(e1);
    fireEvent.keyDown(e1, { key: 'Escape' });
    expect(screen.queryByTestId('detail-card')).toBeNull();
    fireEvent.keyDown(e1, { key: 'Enter' });
    expect(screen.getByTestId('detail-card')).toBeTruthy();
    fireEvent.keyDown(e1, { key: 'Enter' });
    expect(screen.queryByTestId('detail-card')).toBeNull();
    const d = depth();
    fireEvent.keyDown(node('k3'), { key: 'Enter' });
    expect(screen.getByTestId('detail-card').getAttribute('data-entity-id')).toBe('k3');
    fireEvent.keyDown(node('k3'), { key: 'Enter' });
    expect(screen.queryByTestId('detail-card')).toBeNull();
    expect(depth()).toBe(d); // Enter ではズームインしない
    // ダブルクリックはカードを開閉せずズームインする
    fireEvent.click(node('k3'), { detail: 1 });
    fireEvent.click(node('k3'), { detail: 2 });
    fireEvent.doubleClick(node('k3'));
    expect(screen.queryByTestId('detail-card')).toBeNull();
    expect(depth()).toBe('2');
  });

  it('FR-248 AC-600・AC-601 表の行を選ぶと図の同じノードが選択され、PARAM-089（2 秒）の間ハイライトされる（別の面の依頼は受けない）', async () => {
    cleanup();
    useGraphViewStore.setState({ views: {} });
    render(wrap(
      <>
        <GraphSurface origin="t-graph" label="テスト" nodes={nodes} edges={edges} />
        <GraphAlt origin="t-graph" label="テスト" nodes={nodes.map((n) => ({ id: n.id, name: n.name, kind: n.kind }))} relations={edges} />
      </>,
    ));
    fireEvent.click(btn('拡大'));
    fireEvent.click(btn('表で見る'));
    const row = document.querySelector('tr[data-entity-id="k4"]') as HTMLElement;
    fireEvent.click(row);
    expect(useSelectionStore.getState().selectedIds).toEqual(['k4']);
    await waitFor(() => expect(node('k4').getAttribute('data-row-highlight')).toBe('true'));
    expect(node('k1').getAttribute('data-row-highlight')).toBeNull();
    requestGraphFocus('other-origin', 'k1');
    expect(node('k1').getAttribute('data-row-highlight')).toBeNull();
  });
});

// FR-248 AC-600: 表の行からの移動は、階層の切替・拡大縮小の動きが落ち着いてから対象の位置を測る（動きの途中の位置でパンの量を決めない）
describe('FR-248 AC-600 whenSettled（位置が落ち着いてから測る）', () => {
  afterEach(() => vi.unstubAllGlobals());
  const frames = () => {
    const q: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { q.push(f); return q.length; });
    return { step: () => { const f = q.shift(); f?.(0); return !!f; } };
  };

  it('FR-248 AC-600 位置が動いている間は待ち、2 フレーム続けて同じ位置になってから呼ぶ', () => {
    const f = frames();
    const xs = [100, 80, 60, 50, 50, 50, 50];
    let i = 0;
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ left: xs[Math.min(i++, xs.length - 1)], top: 0, width: 10, height: 10 }) as DOMRect;
    let called = 0;
    whenSettled(el, () => { called = i; });
    while (f.step()) { /* フレームを進める */ }
    expect(called, '動いている途中で呼んだ').toBeGreaterThanOrEqual(6);
  });

  it('FR-248 AC-600 落ち着かないときも上限のフレーム数で打ち切って呼ぶ', () => {
    const f = frames();
    let x = 0;
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ left: (x += 5), top: 0, width: 10, height: 10 }) as DOMRect;
    let called = false;
    whenSettled(el, () => { called = true; }, 10);
    let n = 0;
    while (f.step()) n++;
    expect(called).toBe(true);
    expect(n).toBe(11);
  });
});
