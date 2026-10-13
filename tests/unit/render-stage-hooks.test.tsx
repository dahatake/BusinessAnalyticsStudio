// @vitest-environment jsdom
// FR-147 AC-246 AC-248 AC-249 描画の段階: LaterStage の表示、重い効果の遅延と 1 つずつの追加、段階の進行（StageProvider の中身）。
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HEAVY_EFFECTS_DELAY_MS, HEAVY_EFFECTS_GAP_MS, LaterStage, StageContext, nextHeavy, useHeavyPhase, useStageProgress,
  type RenderStage,
} from '../../src/three/stage';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('FR-147 LaterStage', () => {
  const show = (stage: RenderStage) =>
    render(<StageContext.Provider value={stage}><LaterStage><i data-testid="x" /></LaterStage></StageContext.Provider>);

  it('first では何も出さない', () => {
    expect(show('first').queryByTestId('x')).toBeNull();
  });
  it('rest では組み上げるが非表示、shown で表示', () => {
    const rest = show('rest');
    expect(rest.getByTestId('x')).toBeTruthy();
    rest.unmount();
    expect(show('shown').getByTestId('x')).toBeTruthy();
  });
});

describe('FR-147 AC-248 重い効果の遅延', () => {
  it('shown でなければ進まない／shown で 1 段ずつ進む', () => {
    expect(nextHeavy('none', 'first')).toBe('none');
    expect(nextHeavy('none', 'rest')).toBe('none');
    expect(nextHeavy('none', 'shown')).toBe('env');
    expect(nextHeavy('env', 'shown')).toBe('fx');
    expect(nextHeavy('fx', 'shown')).toBe('fx');
  });

  it('shown になってから DELAY で環境マップ、さらに GAP で後処理（それまで none）', () => {
    const { result, rerender } = renderHook(({ s }: { s: RenderStage }) => useHeavyPhase(s), { initialProps: { s: 'first' as RenderStage } });
    act(() => { vi.advanceTimersByTime(HEAVY_EFFECTS_DELAY_MS * 2); });
    expect(result.current).toBe('none');
    rerender({ s: 'shown' });
    act(() => { vi.advanceTimersByTime(HEAVY_EFFECTS_DELAY_MS - 1); });
    expect(result.current).toBe('none');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe('env');
    act(() => { vi.advanceTimersByTime(HEAVY_EFFECTS_GAP_MS - 1); });
    expect(result.current).toBe('env');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe('fx');
  });
});

describe('FR-147 AC-246 段階の進行', () => {
  it('enabled が false なら最初から shown', () => {
    const { result } = renderHook(() => useStageProgress(false, false, 10, async () => {}));
    expect(result.current).toBe('shown');
  });

  it('settled になるまで first、その後 rest、コンパイル完了で shown', async () => {
    let done!: () => void;
    const compile = () => new Promise<void>((res) => { done = res; });
    const { result, rerender } = renderHook(({ s }: { s: boolean }) => useStageProgress(true, s, 150, compile), { initialProps: { s: false } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current).toBe('first');
    rerender({ s: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(149); });
    expect(result.current).toBe('first');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current).toBe('rest');
    await act(async () => { await vi.advanceTimersByTimeAsync(10); done(); });
    expect(result.current).toBe('shown');
  });
});
