// デジタルツイン（3D）の出入り・遷移（FR-070 AC-086）。パックが変わって配置（TwinLayout）が変わったとき、
// 同じ ID の項目は位置・大きさが動き、追加は親の位置から現れ、削除は縮んで消える。時刻から値を求める（フレームに依存しない）ので、
// 描画（EntityTwin）とテスト用の可視判定（twinProbe）が、同じ時刻には同じ値を返す。
// 動きを付けないとき（停止中・視差効果の軽減）は遷移なしで最終状態。遷移がなければタイマーも持たない。
import { DURATION } from '../motion/fluent';
import { PRESENCE_MAX_MS, presenceSignature, retargetPresence, samplePresence, type PresenceFrame, type PresenceMachine } from '../motion/presence';
import { motionAllowed } from '../motion/useFoldMotion';
import { prefersReducedMotion, useAnimation } from '../store/animation';
import { usePackStore } from '../store/pack';
import type { TwinLayout, TwinObject } from './entityLayout';
import { getTwinLayout } from './twin';

interface State {
  layout: TwinLayout | null;
  sig: string;
  known: Map<string, TwinObject>;
  machine: PresenceMachine | null;
  union: TwinLayout | null;
  version: number;
  timer: number | null;
}

const st: State = { layout: null, sig: '', known: new Map(), machine: null, union: null, version: 0, timer: null };
const listeners = new Set<() => void>();

const vecOf = (o: TwinObject): number[] => [...o.position, ...o.size];

function notify(): void {
  st.version += 1;
  for (const l of listeners) l();
}

export function subscribeTwinTransition(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function twinTransitionVersion(): number {
  return st.version;
}

function clearTimer(): void {
  if (st.timer !== null) { window.clearTimeout(st.timer); st.timer = null; }
}

function unionOf(layout: TwinLayout, exiting: readonly TwinObject[]): TwinLayout {
  if (exiting.length === 0) return layout;
  const objects = [...layout.objects, ...exiting];
  return { ...layout, objects, byId: new Map(objects.map((o) => [o.entityId, o])) };
}

/** 配置が変わっていたら、遷移を張り直す（パックの変更の直後、描画・可視判定のどちらから呼んでもよい） */
export function syncTwinTransition(nowMs: number = performance.now()): void {
  const layout = getTwinLayout();
  if (layout === st.layout) return;
  const allowed = motionAllowed(useAnimation.getState().playing, prefersReducedMotion());
  const first = st.layout === null;
  const durationMs = allowed && !first && layout ? Math.min(PRESENCE_MAX_MS, DURATION.ultraSlow) : 0;
  const prev = st.layout;
  clearTimer();
  if (!layout) {
    st.layout = null; st.machine = null; st.union = null; st.known = new Map();
    notify();
    return;
  }
  const targets = new Map(layout.objects.map((o) => [o.entityId, vecOf(o)] as const));
  const sig = presenceSignature(targets);
  if (prev && sig === st.sig) {
    // 内容が同じ配置（無関係なパックの更新で作り直されただけ）。遷移は要らない（途中の遷移はそのまま続ける）
    st.layout = layout;
    if (st.timer === null) st.union = layout;
    return;
  }
  st.sig = sig;
  const known = new Map(st.known);
  if (prev) for (const o of prev.objects) known.set(o.entityId, o);
  for (const o of layout.objects) known.set(o.entityId, o);
  const enterVec = (id: string, to: readonly number[]): readonly number[] => {
    const parent = layout.byId.get(id)?.parentId;
    const p = parent ? layout.byId.get(parent) : undefined;
    return p ? [...p.position, to[3] ?? 0, to[4] ?? 0, to[5] ?? 0] : to;
  };
  st.machine = retargetPresence(first ? null : st.machine, targets, nowMs, durationMs, enterVec);
  st.layout = layout;
  st.known = known;
  const exiting = durationMs > 0 ? [...st.machine.tracks].filter(([, t]) => t.toLife === 0).map(([id]) => known.get(id)).filter((o): o is TwinObject => !!o) : [];
  st.union = unionOf(layout, exiting);
  if (durationMs > 0) {
    st.timer = window.setTimeout(() => {
      st.timer = null; st.union = st.layout;
      st.known = new Map((st.layout?.objects ?? []).map((o) => [o.entityId, o] as const));
      notify();
    }, durationMs + 16);
  }
  notify();
}

export interface TwinDisplayObject {
  object: TwinObject;
  position: [number, number, number];
  size: [number, number, number];
  top: number;
  life: number;
  exiting: boolean;
}

export interface TwinDisplay {
  /** 描画の対象（目標の配置 ＋ 削除の遷移中の項目） */
  layout: TwinLayout | null;
  version: number;
  /** 遷移中（false なら、すべて目標の位置・大きさ） */
  active: boolean;
  /** 項目の、いまの位置・大きさ（目標と同じなら undefined） */
  displayOf: (o: TwinObject) => TwinDisplayObject;
}

function displayFrom(o: TwinObject, f: PresenceFrame | undefined): TwinDisplayObject {
  if (!f) return { object: o, position: [...o.position], size: [...o.size], top: o.top, life: 1, exiting: false };
  const [px, py, pz, w, h, d] = f.vec as [number, number, number, number, number, number];
  const k = Math.max(0, Math.min(1, f.life));
  const size: [number, number, number] = [w * k, h * k, d * k];
  const ratio = o.size[1] > 0 ? size[1] / o.size[1] : 0;
  return { object: o, position: [px, py, pz], size, top: py + (o.top - o.position[1]) * ratio, life: f.life, exiting: f.exiting };
}

export function twinDisplay(nowMs: number = performance.now()): TwinDisplay {
  syncTwinTransition(nowMs);
  // 動きを付けない設定（停止中・視差効果の軽減）になったら、遷移の途中でも最終状態にする
  if (st.timer !== null && !motionAllowed(useAnimation.getState().playing, prefersReducedMotion())) {
    clearTimer();
    if (st.layout) st.machine = retargetPresence(null, new Map(st.layout.objects.map((o) => [o.entityId, vecOf(o)] as const)), nowMs, 0);
    st.union = st.layout;
    st.known = new Map((st.layout?.objects ?? []).map((o) => [o.entityId, o] as const));
    notify();
  }
  const sample = st.machine ? samplePresence(st.machine, nowMs) : null;
  const active = sample !== null && !sample.done;
  const frames = active ? sample.frames : null;
  return {
    layout: active ? st.union : st.layout,
    version: st.version,
    active,
    displayOf: (o) => displayFrom(o, frames?.get(o.entityId)),
  };
}

// パックの変更の直後に張り直す（描画・可視判定が呼ばれる前に開始時刻を決める）
usePackStore.subscribe(() => syncTwinTransition());
