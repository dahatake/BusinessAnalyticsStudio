// @vitest-environment jsdom
// FR-227 AC-526 / AC-527: 選択に関連する要素を全コンポーネントでハイライトし、関連しないものを減光する。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyRelationHighlight } from '../../src/selection/relationHighlight';
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

  // FR-227 AC-526: グラフにない ID を選んでも例外にならない
  it('FR-227 AC-526 グラフが無いときは何も壊さない', () => {
    useSelectionStore.getState().setSelection(['x'], { history: 'none' });
    expect(() => applyRelationHighlight()).not.toThrow();
  });
});
