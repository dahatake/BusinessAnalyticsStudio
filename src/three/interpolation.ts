export type NumericVector = readonly number[];

export interface VectorTransition {
  from: NumericVector;
  to: NumericVector;
  elapsedMs: number;
  durationMs: number;
}

export function easedProgress(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return 1 - (1 - clamped) ** 3;
}

export function interpolateVector(from: NumericVector, to: NumericVector, progress: number): number[] {
  if (from.length !== to.length) throw new RangeError('Vector dimensions must match');
  const eased = easedProgress(progress);
  return from.map((value, index) => value + ((to[index] ?? value) - value) * eased);
}

export function sampleVectorTransition(transition: VectorTransition, deltaMs: number): { value: number[]; done: boolean } {
  const elapsedMs = Math.max(0, transition.elapsedMs + deltaMs);
  const progress = transition.durationMs <= 0 ? 1 : elapsedMs / transition.durationMs;
  const done = progress >= 1;
  return {
    value: done ? [...transition.to] : interpolateVector(transition.from, transition.to, progress),
    done,
  };
}
