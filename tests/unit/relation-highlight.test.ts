// @vitest-environment jsdom
// FR-227 AC-526 / AC-527: 選択に関連する要素を全コンポーネントでハイライトし、関連しないものを減光する。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyRelationHighlight } from '../../src/selection/relationHighlight';
import { installBackgroundClear, isBackgroundClick } from '../../src/selection/keys';
import { installRelationHighlightStyle } from '../../src/selection/relationHighlightStyle';
import { resetSelectionForTest, setUrlAdapter, useSelectionStore } from '../../src/store/selection';

beforeEach(() => {
  resetSelectionForTest();
  setUrlAdapter({ hash: () => '', push: () => undefined, replace: () => undefined, back: () => undefined, forward: () => undefined } as never);
  document.body.innerHTML = '<div id="a"><span data-entity-id="x">x</span><span data-entity-id="y">y</span></div><ul><li data-entity-id="x">x2</li></ul>';
});
afterEach(() => { document.body.innerHTML = ''; });

describe('FR-227 relation highlight', () => {
  // FR-227 AC-526: 選択がなければ何も付けない
  it('FR-227 AC-526 選択なしでは data-highlight を付けない', () => {
    expect(applyRelationHighlight()).toBe(0);
    expect(document.querySelectorAll('[data-highlight]').length).toBe(0);
  });

  // FR-227 AC-527: 減光は不透明度ではなく文字色（4.5:1 以上の補助色）で示す
  it('FR-227 AC-527 減光のスタイルは不透明度を使わず、文字色と破線で示す', () => {
    installRelationHighlightStyle();
    const css = document.getElementById('relation-highlight-style')?.textContent ?? '';
    expect(css).toContain('dimmed');
    expect(css).toContain('colorNeutralForeground3');
    expect(css).not.toContain('opacity');
    expect(css).toContain('dashed');
  });

  // FR-227 AC-526: 背景のクリックで解除。項目・ボタン・入力・リンク・ドラッグ後は解除しない
  it('FR-227 AC-526 背景（ペイン本文の空白）のクリックだけが解除の対象', () => {
    document.body.innerHTML = '<div data-testid="panel-body"><p id="blank">空白</p><button id="b">b</button><input id="i"/><a id="a" href="#">a</a><div data-entity-id="x"><span id="in">x</span></div><div data-testid="resize-se" id="rz"></div></div><div id="outside"></div>';
    const q = (id: string) => document.getElementById(id);
    expect(isBackgroundClick(q('blank'))).toBe(true);
    for (const id of ['b', 'i', 'a', 'in', 'rz', 'outside']) expect(isBackgroundClick(q(id)), id).toBe(false);
    expect(isBackgroundClick(q('blank'), true)).toBe(false);
  });

  it('FR-227 AC-526 空白のクリックで選択が解除される（項目のクリックでは解除されない）', () => {
    document.body.innerHTML = '<div data-testid="panel-body"><p id="blank">空白</p><span id="it" data-entity-id="x">x</span></div>';
    const off = installBackgroundClear();
    useSelectionStore.getState().setSelection(['x'], { history: 'none' });
    document.getElementById('it')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(useSelectionStore.getState().selectedIds).toEqual(['x']);
    document.getElementById('blank')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(useSelectionStore.getState().selectedIds).toEqual([]);
    off();
  });

  // FR-227 AC-526: グラフにない ID を選んでも例外にならない
  it('FR-227 AC-526 グラフが無いときは何も壊さない', () => {
    useSelectionStore.getState().setSelection(['x'], { history: 'none' });
    expect(() => applyRelationHighlight()).not.toThrow();
  });
});
