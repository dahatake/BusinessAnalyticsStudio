// 可視化の出入り・遷移の共通の核（FR-070 AC-086 / FR-045 AC-056 / FR-134 AC-197）。純粋な関数だけで構成し、three・React に依存しない。
// 項目は ID で同一性を保つ。追加＝life 0→1（位置は enterVec から）、更新＝位置 vec の補間、削除＝life 1→0（消えるまで残す）。
// 遷移の途中で新しい目標が来たら、「いまの描画値」から新しい目標へ張り直す（連続更新は最後に確定した状態へ収束する）。

import { easedProgress } from '../three/interpolation';

/** 1 項目の遷移。from→to の値と、life（0=不在、1=在）の進み */
export interface PresenceTrack {
  fromVec: readonly number[];
  toVec: readonly number[];
  fromLife: number;
  toLife: number;
}

export interface PresenceMachine {
  tracks: ReadonlyMap<string, PresenceTrack>;
  startMs: number;
  durationMs: number;
}

export interface PresenceFrame {
  vec: number[];
  life: number;
  /** 削除の遷移の途中（描画はするが、操作・選択の対象にはしない） */
  exiting: boolean;
}

export interface PresenceSample {
  frames: Map<string, PresenceFrame>;
  /** 全項目が最終状態（削除済みの項目は frames に残らない） */
  done: boolean;
}

/** 遷移の上限。PARAM-133（2000ms）以内に最新の状態へ収束する */
export const PRESENCE_MAX_MS = 2000;

export function presenceDuration(baseMs: number, tempo: number, allowed: boolean): number {
  if (!allowed) return 0;
  return Math.max(0, Math.min(PRESENCE_MAX_MS, Math.round(baseMs * tempo)));
}

function lerp(a: readonly number[], b: readonly number[], t: number): number[] {
  return a.map((v, i) => v + ((b[i] ?? v) - v) * t);
}

/** いまの描画値を求める。durationMs が 0 のときは最終状態（削除済みは残さない） */
export function samplePresence(machine: PresenceMachine | null, nowMs: number): PresenceSample {
  const frames = new Map<string, PresenceFrame>();
  if (!machine) return { frames, done: true };
  const raw = machine.durationMs <= 0 ? 1 : (nowMs - machine.startMs) / machine.durationMs;
  const done = raw >= 1;
  const p = done ? 1 : easedProgress(Math.max(0, raw));
  for (const [id, t] of machine.tracks) {
    const life = t.fromLife + (t.toLife - t.fromLife) * p;
    if (t.toLife === 0 && done) continue;
    frames.set(id, { vec: done ? [...t.toVec] : lerp(t.fromVec, t.toVec, p), life: done ? t.toLife : life, exiting: t.toLife === 0 });
  }
  return { frames, done };
}

/**
 * 新しい目標へ張り直す。targets は「いま在るべき項目」（ID→値）。
 * 新規の項目は enterVec(id,to) の位置から現れ、消えた項目は現在の位置のまま薄れて消える。
 */
export function retargetPresence(
  prev: PresenceMachine | null,
  targets: ReadonlyMap<string, readonly number[]>,
  nowMs: number,
  durationMs: number,
  enterVec?: (id: string, to: readonly number[]) => readonly number[],
): PresenceMachine {
  const current = samplePresence(prev, nowMs).frames;
  const tracks = new Map<string, PresenceTrack>();
  if (durationMs <= 0) {
    for (const [id, to] of targets) tracks.set(id, { fromVec: to, toVec: to, fromLife: 1, toLife: 1 });
    return { tracks, startMs: nowMs, durationMs: 0 };
  }
  for (const [id, to] of targets) {
    const cur = current.get(id);
    tracks.set(id, cur
      ? { fromVec: cur.vec, toVec: to, fromLife: cur.life, toLife: 1 }
      : { fromVec: enterVec ? enterVec(id, to) : to, toVec: to, fromLife: 0, toLife: 1 });
  }
  for (const [id, cur] of current) {
    if (targets.has(id) || cur.life <= 0) continue;
    tracks.set(id, { fromVec: cur.vec, toVec: cur.vec, fromLife: cur.life, toLife: 0 });
  }
  return { tracks, startMs: nowMs, durationMs };
}

/** 出入りの描画の係数。life から不透明度と拡大率を求める（入る＝減速、出る＝加速は easedProgress が担う） */
export function lifeOpacity(life: number): number {
  return Math.max(0, Math.min(1, life));
}

export function lifeScale(life: number, from = 0.6): number {
  return from + (1 - from) * Math.max(0, Math.min(1, life));
}

/** 目標の内容が変わったか調べるための署名（同じ内容なら同じ文字列） */
export function presenceSignature(targets: ReadonlyMap<string, readonly number[]>): string {
  let out = '';
  for (const [id, v] of targets) out += `${id}:${v.map((n) => Math.round(n * 100) / 100).join(',')};`;
  return out;
}
