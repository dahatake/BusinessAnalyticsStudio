// @vitest-environment jsdom
// FR-280 「反映」による画面コンポーネントと管理データの更新（AC-721 の単体・結合、AC-722）。AC-721 の System Test は E2E-393。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { CopilotProposal, reflectProposal } from '../../src/review/CopilotProposal';
import { registerReflector, useReviewStore } from '../../src/review/reviewStore';
import { useMemoStore } from '../../src/store/memo';

const wrap = (ui: React.ReactNode) => render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>);

beforeEach(() => {
  useReviewStore.setState({ proposals: { memo: '案-memo', table: '案-table' }, none: {} });
  useMemoStore.setState({ byPack: {} });
});
afterEach(() => cleanup());

describe('FR-280 AC-721 反映（単体・結合）', () => {
  it('編集した案で反映すると、メモが編集後の内容で保存され、そのコンポーネントの案は「反映済み」になる', async () => {
    const off = registerReflector('memo', (t) => { useMemoStore.getState().save('P / Q', t, 'ai-assisted'); });
    wrap(<CopilotProposal componentKey="memo" title="メモ" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'REFLECTED-0001' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '反映' })); });
    expect(useMemoStore.getState().byPack['P / Q']).toEqual({ text: 'REFLECTED-0001', author: 'ai-assisted' });
    expect(useReviewStore.getState().done.memo).toBe(true);
    off();
  });

  it('メモのストアは localStorage に保存され、再読み込み後も復元される', async () => {
    useMemoStore.getState().save('P / Q', '保存される内容', 'ai-assisted');
    await useMemoStore.persist.rehydrate();
    expect(useMemoStore.getState().byPack['P / Q']?.text).toBe('保存される内容');
    expect(localStorage.getItem('edb.memo') ?? '').toContain('保存される内容');
  });

  it('反映に対応していない・反映が失敗したときは案を残す', async () => {
    expect(await reflectProposal('table', '内容')).toBe(false);
    const off = registerReflector('table', () => { throw new Error('x'); });
    expect(await reflectProposal('table', '内容')).toBe(false);
    expect(useReviewStore.getState().proposals.table).toBe('案-table');
    off();
  });
});

describe('FR-280 AC-722 反映はコンポーネントごと（結合）', () => {
  it('一つだけ反映すると、ほかのコンポーネントの案とデータは変わらない', async () => {
    const offM = registerReflector('memo', (t) => { useMemoStore.getState().save('P / Q', t, 'ai-assisted'); });
    const calls: string[] = [];
    const offT = registerReflector('table', (t) => { calls.push(t); });
    await reflectProposal('memo', '案-memo');
    expect(useReviewStore.getState().proposals).toEqual({ memo: '案-memo', table: '案-table' });
    expect(useReviewStore.getState().done).toEqual({ memo: true });
    expect(calls).toEqual([]);
    expect(useMemoStore.getState().byPack).toEqual({ 'P / Q': { text: '案-memo', author: 'ai-assisted' } });
    offM(); offT();
  });
});
