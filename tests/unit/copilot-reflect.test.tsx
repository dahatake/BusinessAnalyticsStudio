// @vitest-environment jsdom
// FR-280 「反映」による画面コンポーネントと管理データの更新（AC-721 の単体・結合、AC-722。AC-721 の System Test は E2E-413）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { CopilotProposal } from '../../src/review/CopilotProposal';
import { registerReflector, useReviewStore } from '../../src/review/reviewStore';
import { MemoScreen } from '../../src/screens/MemoScreen';
import { MEMO_STORAGE_KEY, useMemoStore } from '../../src/store/memo';
import { SCREENS } from '../../src/screens/registry';

const wrap = (n: React.ReactNode) => <FluentProvider theme={webLightTheme}>{n}</FluentProvider>;

beforeEach(() => {
  localStorage.clear();
  useMemoStore.setState({ text: '元のメモ', author: 'user' });
  useReviewStore.setState({ proposals: {}, none: {} });
});
afterEach(() => cleanup());

describe('FR-280 AC-721 反映でメモの表示と保存データが案の内容になる', () => {
  it('メモ画面はレジストリにあり、左メニューには出ない', () => {
    const s = SCREENS.find((x) => x.key === 'memo');
    expect(s?.nav).toBe(false);
  });

  it('案を編集して「反映」を押すと、表示が編集後の内容になり、端末内に保存される（AI 提案の採用）', async () => {
    useReviewStore.setState({ proposals: { memo: '案の初期' } });
    render(wrap(<MemoScreen />));
    fireEvent.change(screen.getByLabelText('メモの Copilot の案を編集'), { target: { value: 'REFLECTED-CONTENT-0001' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '反映' })); });
    expect(screen.getByTestId('memo-text').textContent).toBe('REFLECTED-CONTENT-0001');
    const saved = JSON.parse(localStorage.getItem(MEMO_STORAGE_KEY) ?? '{}');
    expect(saved.state.text).toBe('REFLECTED-CONTENT-0001');
    expect(saved.state.author).toBe('ai-adopted');
  });

  it('保存済みの内容は、store の再読み込み（復元）で戻る', async () => {
    useMemoStore.setState({ text: '', author: 'user' });
    localStorage.setItem(MEMO_STORAGE_KEY, JSON.stringify({ state: { text: '保存する内容', author: 'ai-adopted' }, version: 1 }));
    await useMemoStore.persist.rehydrate();
    expect(useMemoStore.getState().text).toBe('保存する内容');
  });
});

describe('FR-280 AC-722 反映は押したコンポーネントだけを変える', () => {
  it('二つの案があるとき一つだけ反映すると、もう一つの表示・保存データ・案は変わらない', async () => {
    let otherCalled = 0;
    const off = registerReflector('other', () => { otherCalled++; });
    useReviewStore.setState({ proposals: { memo: '新メモ', other: '他の案' }, none: {} });
    render(wrap(<><MemoScreen /><CopilotProposal componentKey="other" title="他" /></>));
    await act(async () => { fireEvent.click(within(screen.getByTestId('component-memo')).getByRole('button', { name: '反映' })); });
    expect(useMemoStore.getState().text).toBe('新メモ');
    expect(otherCalled).toBe(0);
    expect(useReviewStore.getState().proposals.other).toBe('他の案');
    off();
  });

  it('メモの反映は、メモ以外の保存データ（localStorage のほかのキー）を書かない', async () => {
    localStorage.setItem('eabk.projects.v1', 'UNCHANGED');
    useReviewStore.setState({ proposals: { memo: 'x' } });
    render(wrap(<MemoScreen />));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '反映' })); });
    expect(localStorage.getItem('eabk.projects.v1')).toBe('UNCHANGED');
  });
});
