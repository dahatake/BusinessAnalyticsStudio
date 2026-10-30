// 可視化の出入り・遷移のフック（FR-070 AC-086）。2D（SVG・HTML）・Canvas・3D が同じ仕組みで、項目の ID を保ったまま
// 追加（現れる）・更新（動く）・削除（薄れて消える）を示す。動きは useMotionAllowed（再生中かつ視差効果の軽減なし）のときだけ。
// 停止中・軽減中は、遷移なしで最終状態を即時に返す。遷移がないとき（done）は連続描画を行わない。
import { useEffect, useRef, useState } from 'react';
import { DURATION } from './fluent';
import { presenceDuration, presenceSignature, retargetPresence, samplePresence, type PresenceMachine } from './presence';
import { useMotionAllowed } from './transitions';
import { useMotionProfile } from './useMotion';

export interface PresenceItem<T> {
  id: string;
  item: T;
  vec: number[];
  /** 0=不在、1=在。入る・出るの途中の値 */
  life: number;
  exiting: boolean;
}

export interface PresenceOptions {
  /** 新しい項目が現れる出発点（既定は最終位置） */
  enterVec?: (id: string, to: readonly number[]) => readonly number[];
  /**
   * true（既定）: 遷移の間、毎フレーム描き直す（SVG・HTML・Canvas。React が唯一の更新元）。
   * false: 描き直さず、遷移が終わる時刻に 1 度だけ更新する（3D は three 側が値を補間するので、削除済みの項目の撤去だけ行う）。
   */
  perFrame?: boolean;
  baseMs?: number;
}

interface Store<T> {
  sig: string;
  machine: PresenceMachine | null;
  last: Map<string, T>;
  order: string[];
}

/**
 * items を ID で追い、遷移中の描画値を返す。値は 1 項目あたり vecOf が返す数値のベクトル（位置・幅など）。
 * 戻り値は、現在の項目 ＋ 削除の遷移中の項目（exiting）。順序は、削除中の項目を元の位置に残す。
 */
export function usePresenceItems<T>(
  items: readonly T[], idOf: (item: T) => string, vecOf: (item: T) => readonly number[], options: PresenceOptions = {},
): PresenceItem<T>[] {
  const allowed = useMotionAllowed();
  const tempo = useMotionProfile().tempo;
  const durationMs = presenceDuration(options.baseMs ?? DURATION.ultraSlow, tempo, allowed);
  const perFrame = options.perFrame ?? true;
  const store = useRef<Store<T>>({ sig: '', machine: null, last: new Map(), order: [] });
  const [, setTick] = useState(0);
  const st = store.current;

  const targets = new Map<string, readonly number[]>();
  for (const it of items) targets.set(idOf(it), vecOf(it));
  const sig = `${durationMs}|${presenceSignature(targets)}`;
  const nowMs = performance.now();
  if (st.sig !== sig) {
    st.machine = retargetPresence(st.machine, targets, nowMs, durationMs, options.enterVec);
    st.sig = sig;
  }
  for (const it of items) st.last.set(idOf(it), it);
  const sample = samplePresence(st.machine, nowMs);

  const out: PresenceItem<T>[] = items.map((it) => {
    const id = idOf(it);
    const f = sample.frames.get(id);
    return { id, item: it, vec: f ? f.vec : [...vecOf(it)], life: f ? f.life : 1, exiting: false };
  });
  const exiting = [...sample.frames.entries()].filter(([id]) => !targets.has(id))
    .map(([id, f]) => ({ id, f, at: st.order.indexOf(id) }))
    .sort((a, b) => a.at - b.at);
  for (const { id, f, at } of exiting) {
    const item = st.last.get(id);
    if (item === undefined) continue;
    out.splice(Math.min(Math.max(at, 0), out.length), 0, { id, item, vec: f.vec, life: f.life, exiting: true });
  }
  st.order = out.map((o) => o.id);
  if (sample.done) for (const id of [...st.last.keys()]) if (!targets.has(id)) st.last.delete(id);

  const done = sample.done;
  useEffect(() => {
    if (done) return undefined;
    const machine = store.current.machine;
    if (!machine) return undefined;
    if (!perFrame) {
      const remain = Math.max(0, machine.startMs + machine.durationMs - performance.now());
      const timer = window.setTimeout(() => setTick((n) => n + 1), remain + 16);
      return () => window.clearTimeout(timer);
    }
    let raf = 0;
    const loop = (): void => {
      setTick((n) => n + 1);
      if (!samplePresence(store.current.machine, performance.now()).done) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [done, sig, perFrame]);

  return out;
}
