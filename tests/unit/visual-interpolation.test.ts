import { describe, expect, it } from 'vitest';
import { interpolateVector, sampleVectorTransition } from '../../src/three/interpolation';

describe('FR-070 AC-086 / FR-045 AC-056 / FR-134 AC-197 numeric interpolation', () => {
  it('moves every vector component along the eased numeric path and reaches the exact target', () => {
    const transition = { from: [2, -4, 10], to: [12, 6, 0], elapsedMs: 0, durationMs: 200 };
    const halfway = sampleVectorTransition(transition, 100);
    expect(halfway.done).toBe(false);
    expect(halfway.value).toEqual([10.75, 4.75, 1.25]);
    const finished = sampleVectorTransition({ ...transition, elapsedMs: 100 }, 100);
    expect(finished).toEqual({ value: [12, 6, 0], done: true });
  });

  it('clamps progress and completes immediately for stopped or zero-duration transitions', () => {
    expect(interpolateVector([1, 2], [3, 4], -1)).toEqual([1, 2]);
    expect(sampleVectorTransition({ from: [1], to: [9], elapsedMs: 0, durationMs: 0 }, 0)).toEqual({ value: [9], done: true });
  });

  it('rejects mismatched numeric dimensions rather than producing partial geometry', () => {
    expect(() => interpolateVector([1, 2], [3], 0.5)).toThrow(RangeError);
  });
});