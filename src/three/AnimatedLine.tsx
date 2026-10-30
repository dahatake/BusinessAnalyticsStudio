import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { DURATION, scaledDuration } from '../motion/fluent';
import { useMotionProfile } from '../motion/useMotion';
import { sampleVectorTransition, type VectorTransition } from './interpolation';
import { useSceneMotionAllowed } from './useSceneTransition';

type Point3 = readonly [number, number, number];
type MutableLine = { geometry?: { setPositions(points: number[]): void }; computeLineDistances?: () => void };

export function AnimatedLine({ points, ...lineProps }: {
  points: readonly [Point3, Point3];
  color: string;
  lineWidth: number;
  dashed?: boolean;
  dashSize?: number;
  gapSize?: number;
}) {
  const line = useRef<unknown>(null);
  const positions = useRef<number[]>([]);
  const transition = useRef<VectorTransition | null>(null);
  const initialized = useRef(false);
  const allowed = useSceneMotionAllowed();
  const tempo = useMotionProfile().tempo;
  const durationMs = scaledDuration(DURATION.gentle, tempo, allowed);
  const invalidate = useThree((state) => state.invalidate);
  const target = [points[0][0], points[0][1], points[0][2], points[1][0], points[1][1], points[1][2]];

  const attachLine = useCallback((instance: unknown) => { line.current = instance; }, []);
  const applyPositions = useCallback((next: number[]): void => {
    positions.current = next;
    const object = line.current as MutableLine | null;
    object?.geometry?.setPositions(next);
    object?.computeLineDistances?.();
  }, []);

  useLayoutEffect(() => {
    let from = initialized.current ? positions.current : [...target.slice(0, 3), ...target.slice(0, 3)];
    if (!initialized.current) {
      applyPositions(from);
      initialized.current = true;
    }
    if (!allowed || durationMs === 0 || from.every((value, index) => value === target[index])) {
      from = [...target];
      applyPositions(from);
      transition.current = null;
    } else {
      transition.current = { from, to: [...target], elapsedMs: 0, durationMs };
    }
    invalidate();
  }, [allowed, applyPositions, durationMs, invalidate, target[0], target[1], target[2], target[3], target[4], target[5]]);

  useFrame((_, delta) => {
    if (typeof document !== 'undefined' && document.hidden) return;
    const active = transition.current;
    if (!active) return;
    const sample = sampleVectorTransition(active, delta * 1000);
    applyPositions(sample.value);
    transition.current = sample.done ? null : { ...active, elapsedMs: active.elapsedMs + delta * 1000 };
    if (!sample.done) invalidate();
  });

  useEffect(() => () => { transition.current = null; }, []);
  return <Line ref={attachLine} points={points} {...lineProps} />;
}