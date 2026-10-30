import { useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DURATION, scaledDuration } from '../motion/fluent';
import { useMotionProfile, usePlaying } from '../motion/useMotion';
import { prefersReducedMotion } from '../store/animation';
import { sampleVectorTransition, type VectorTransition } from './interpolation';

const motionListeners = new Set<() => void>();
let reducedMotionQuery: MediaQueryList | null = null;

function notifyMotionChange(): void {
  for (const listener of motionListeners) listener();
}

function subscribeMotion(onChange: () => void): () => void {
  motionListeners.add(onChange);
  if (motionListeners.size === 1 && typeof window !== 'undefined') {
    if (typeof window.matchMedia === 'function') {
      reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      reducedMotionQuery.addEventListener?.('change', notifyMotionChange);
    }
    document.addEventListener('visibilitychange', notifyMotionChange);
  }
  return () => {
    motionListeners.delete(onChange);
    if (motionListeners.size === 0) {
      reducedMotionQuery?.removeEventListener?.('change', notifyMotionChange);
      reducedMotionQuery = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', notifyMotionChange);
    }
  };
}

function motionSnapshot(): number {
  const reduced = prefersReducedMotion();
  const hidden = typeof document !== 'undefined' && document.hidden;
  return (reduced ? 1 : 0) | (hidden ? 2 : 0);
}

export function useSceneMotionAllowed(): boolean {
  const playing = usePlaying();
  const motionState = useSyncExternalStore(subscribeMotion, motionSnapshot, () => 0);
  return playing && motionState === 0;
}

type AnimatedObject = Pick<THREE.Object3D, 'position' | 'scale'>;
type AnimatedProperty = 'position' | 'scale';

export function useObjectVectorTransition(
  objectRef: RefObject<AnimatedObject | null>,
  target: readonly [number, number, number],
  property: AnimatedProperty,
): void {
  const allowed = useSceneMotionAllowed();
  const tempo = useMotionProfile().tempo;
  const invalidate = useThree((state) => state.invalidate);
  const transition = useRef<VectorTransition | null>(null);
  const initialized = useRef(false);
  const durationMs = scaledDuration(DURATION.gentle, tempo, allowed);

  useLayoutEffect(() => {
    const object = objectRef.current;
    if (!object) return;
    const vector = object[property];
    const from = initialized.current ? [vector.x, vector.y, vector.z] : [0, 0, 0];
    if (!initialized.current) {
      vector.set(0, 0, 0);
      initialized.current = true;
    }
    const to = [...target];
    const unchanged = from.every((value, index) => value === to[index]);
    if (!allowed || durationMs === 0 || unchanged) {
      vector.set(...(to as [number, number, number]));
      transition.current = null;
    } else {
      transition.current = { from, to, elapsedMs: 0, durationMs };
    }
    invalidate();
  }, [allowed, durationMs, invalidate, objectRef, property, target[0], target[1], target[2]]);

  useFrame((_, delta) => {
    const active = transition.current;
    const object = objectRef.current;
    if (!active || !object) return;
    if (!allowed) {
      object[property].set(...(active.to as [number, number, number]));
      transition.current = null;
      invalidate();
      return;
    }
    const sample = sampleVectorTransition(active, delta * 1000);
    object[property].set(...(sample.value as [number, number, number]));
    transition.current = sample.done ? null : { ...active, elapsedMs: active.elapsedMs + delta * 1000 };
    if (!sample.done) invalidate();
  });

  useLayoutEffect(() => () => { transition.current = null; }, []);
}
