// @vitest-environment jsdom
// FR-281 反映の失敗時の扱いと取り消し（AC-723・AC-724）、NFR-COST-001 分析実行の利用量と月の予算の上限（AC-731・AC-732）の単体・結合。
// Foundry へは実接続しない（request を差し替える）。保存先の失敗は localStorage.setItem の差し替えで起こす。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AiUsagePanel } from '../../src/ai/AiUsagePanel';
import { DEFAULT_LIMITS, emptyRecord, useUsageStore } from '../../src/ai/foundryUsage';
import type { FoundryView } from '../../src/ai/foundryClient';
import { runReview, type ReviewDeps, type ReviewTarget } from '../../src/review/reviewFlow';
import { useReviewStore } from '../../src/review/reviewStore';
import { MemoScreen } from '../../src/screens/MemoScreen';
import { MEMO_STORAGE_KEY, useMemoStore } from '../../src/store/memo';

const wrap = (n: React.ReactNode) => <FluentProvider theme={webLightTheme}>{n}</FluentProvider>;
const view: FoundryView = { configured: true, endpoint: 'e', host: 'h', deployment: 'd', keyMask: '', enabled: true };
const T: ReviewTarget[] = [{ id: 'table', label: '表', data: 'A 100' }];

beforeEach(() => {
  localStorage.clear();
  useMemoStore.setState({ text: '元のメモ', author: 'user' });
  useReviewStore.setState({ proposals: {}, none: {}, done: {}, failure: {}, undoable: {} });
  useUsageStore.setState({ limits: { ...DEFAULT_LIMITS }, record: emptyRecord(new Date()) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('FR-281 AC-723 反映の保存に失敗したときは反映前のまま・案を残し・原因と次の行動を示す', () => {
  it('保存先が書き込みに失敗する差し替えで「反映」を押す', async () => {
    useReviewStore.setState({ proposals: { memo: '編集した案' } });
    render(wrap(<MemoScreen />));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '反映' })); });
    expect(screen.getByTestId('memo-text').textContent).toBe('元のメモ');
    expect(useMemoStore.getState().text).toBe('元のメモ');
    vi.restoreAllMocks();
    expect(JSON.parse(localStorage.getItem(MEMO_STORAGE_KEY) ?? '{}').state?.text).not.toBe('編集した案');
    expect((screen.getByLabelText('メモの Copilot の案を編集') as HTMLTextAreaElement).value).toBe('編集した案');
    expect(useReviewStore.getState().done.memo).toBeUndefined();
    const err = screen.getByTestId('copilot-reflect-error').textContent ?? '';
    expect(err).toContain('QuotaExceededError');
    expect(err).toContain('もう一度「反映」を押してください');
  });
});

describe('FR-281 AC-724 反映の取り消しで反映前の内容に戻る', () => {
  it('反映の直後に取り消すと、表示と保存データが反映前に戻り、顧客パックのファイル（fetch）には触れない', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    localStorage.setItem(MEMO_STORAGE_KEY, JSON.stringify({ state: { text: '元のメモ', author: 'user' }, version: 1 }));
    useReviewStore.setState({ proposals: { memo: '新しい内容' } });
    render(wrap(<MemoScreen />));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '反映' })); });
    expect(screen.getByTestId('memo-text').textContent).toBe('新しい内容');
    expect(localStorage.getItem('eabk.reflectBackup.v1')).toContain('元のメモ'); // 端末内の退避
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '反映の取り消し' })); });
    expect(screen.getByTestId('memo-text').textContent).toBe('元のメモ');
    const saved = JSON.parse(localStorage.getItem(MEMO_STORAGE_KEY) ?? '{}');
    expect(saved.state).toEqual({ text: '元のメモ', author: 'user' });
    expect(useReviewStore.getState().done.memo).toBeUndefined();
    expect(useReviewStore.getState().proposals.memo).toBe('新しい内容');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

function deps(over: Partial<ReviewDeps> = {}) {
  const calls = { request: 0 };
  const u = useUsageStore.getState();
  const d: ReviewDeps = {
    relayUrl: 'http://127.0.0.1:1', packId: 'P', consent: true, includesPerson: false,
    view: async () => view,
    usage: { check: () => useUsageStore.getState().check(), count: (n, out) => u.count(n, undefined, undefined, out) },
    confirmSend: async () => true,
    confirmPerson: async () => ({ allowed: true }),
    request: async () => { calls.request++; return { ok: true, reviews: [{ id: 'table', proposal: '案' }], usage: { inputTokens: 1000, outputTokens: 500 } }; },
    ...over,
  };
  return { d, calls };
}

describe('NFR-COST-001 AC-731 応答の利用量を記録し、概算額を請求額ではない旨とともに表示する', () => {
  it('利用量つきの分析実行を 2 回行うと、2 回分のトークンと単価による概算額が出る', async () => {
    useUsageStore.setState({ limits: { ...DEFAULT_LIMITS, priceInPer1k: 1, priceOutPer1k: 2 } });
    const x = deps();
    expect((await runReview(x.d, T)).kind).toBe('done');
    expect((await runReview(x.d, T)).kind).toBe('done');
    render(wrap(<AiUsagePanel />));
    expect(screen.getByTestId('ai-usage-tokens').textContent).toContain('入力 2000 トークン / 出力 1000 トークン');
    // 概算額: (2000/1000)*1 + (1000/1000)*2 = 4 円
    expect(screen.getByText(/概算費用: 4 円/)).toBeTruthy();
    expect(screen.getByTestId('ai-usage-disclaimer').textContent).toContain('請求額ではありません');
  });
});

describe('NFR-COST-001 AC-732 概算額が予算に達したら止まり、予算を上げると再開できる', () => {
  it('達した状態では Foundry を呼ばず上限の旨を示し、予算を引き上げると実行できる', async () => {
    useUsageStore.setState({ record: { ...emptyRecord(new Date()), monthCost: DEFAULT_LIMITS.monthlyBudget } });
    const x = deps();
    const out = await runReview(x.d, T);
    expect(out.kind).toBe('blocked');
    expect(x.calls.request).toBe(0);
    expect(out.kind === 'blocked' && out.text).toContain('上限');
    useUsageStore.getState().setLimits({ ...useUsageStore.getState().limits, monthlyBudget: DEFAULT_LIMITS.monthlyBudget + 50000 });
    expect((await runReview(x.d, T)).kind).toBe('done');
    expect(x.calls.request).toBe(1);
  });
});
