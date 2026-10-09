// 音声の純粋なモデル（FR-073・FR-074・FR-075）。Web Audio にも React にも依存しない。
// 音源は外部から取得せず、BGM・効果音とも Web Audio API で手続き生成する（権利: CREDITS.md、NFR-LEGAL-001）。
import type { BgmMood } from '../motion/tone';

/** シーンを切り替えるときのクロスフェードの長さ（秒） */
export const CROSSFADE_SECONDS = 1.5;
/** ナレーション中の BGM の音量の倍率（FR-075） */
export const DUCK_FACTOR = 0.3;
/** ダッキングの下げ始め・戻し始めからの所要（秒） */
export const DUCK_RAMP_SECONDS = 0.4;
/** 音量・ミュートなどの変更を滑らかに反映する所要（秒） */
export const LEVEL_RAMP_SECONDS = 0.08;

/** 音声の設定（store/settings.ts の値）。ミュートが既定（FR-074） */
export interface AudioSettings {
  muted: boolean;
  /** 0〜1 */
  volume: number;
  bgmEnabled: boolean;
  seEnabled: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { muted: true, volume: 0.6, bgmEnabled: true, seEnabled: true };

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** ミュートの切替の通知の文言（スクリーンリーダー向け。NFR-A11Y-002） */
export function muteAnnouncement(muted: boolean): string {
  return muted ? 'ミュートにしました' : 'ミュートを解除しました';
}

/** 全体の音量（ミュートなら 0） */
export function masterLevel(s: AudioSettings): number {
  return s.muted ? 0 : clamp01(s.volume);
}

/** BGM の系統の倍率（BGM が OFF なら 0、ナレーション中は DUCK_FACTOR） */
export function bgmBusLevel(s: AudioSettings, ducked: boolean): number {
  if (!s.bgmEnabled) return 0;
  return ducked ? DUCK_FACTOR : 1;
}

/** 効果音の系統の倍率 */
export function seBusLevel(s: AudioSettings): number {
  return s.seEnabled ? 1 : 0;
}

/** 実際に出る BGM の音量（全体 × BGM の系統）。ダッキング中は設定値より下がる */
export function effectiveBgmVolume(s: AudioSettings, ducked: boolean): number {
  return masterLevel(s) * bgmBusLevel(s, ducked);
}

/** 音が出る状態か（全体の音量があり、BGM か効果音のどちらかが ON）。出ないなら音声の処理を止める */
export function wantsSound(s: AudioSettings): boolean {
  return masterLevel(s) > 0 && (s.bgmEnabled || s.seEnabled);
}

/** クロスフェードの進み具合（0〜1）での、出ていく側と入ってくる側の音量（等パワー） */
export function crossfadeLevels(progress: number): { out: number; in: number } {
  const p = clamp01(progress);
  return { out: Math.cos((p * Math.PI) / 2), in: Math.sin((p * Math.PI) / 2) };
}

// ── BGM の選択 ──────────────────────────────────────────────

/** 音源フォルダー（assets/audio/）の BGM の指定 */
export interface BgmSource {
  id: string;
  url: string;
  /** 対応するシーン。省略は、どのシーンにも使える */
  scene?: string;
}

export type BgmChoice =
  | { kind: 'file'; id: string; url: string; scene: string }
  | { kind: 'procedural'; scene: string; mood: BgmMood };

/** シーンに使う BGM を選ぶ。音源の指定がなければ（空なら）手続き生成にする（FR-073 AC-089） */
export function selectBgm(sources: readonly BgmSource[], scene: string, mood: BgmMood): BgmChoice {
  const exact = sources.find((s) => s.scene === scene);
  const any = sources.find((s) => s.scene === undefined);
  const hit = exact ?? any;
  if (hit) return { kind: 'file', id: hit.id, url: hit.url, scene };
  return { kind: 'procedural', scene, mood };
}

/** 文字列から決まる 32 bit の値（シーンごとに手続き生成の BGM の調を変えるため） */
export function sceneSeed(scene: string): number {
  let h = 2166136261;
  for (let i = 0; i < scene.length; i++) {
    h ^= scene.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const hash2 = (a: number, b: number): number => {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return (h ^ (h >>> 12)) >>> 0;
};

// ── 手続き生成の BGM ────────────────────────────────────────

export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth';

export interface Note {
  /** 拍の先頭からの開始位置（拍） */
  offset: number;
  /** 長さ（拍） */
  beats: number;
  /** 周波数（Hz） */
  freq: number;
  wave: Wave;
  /** 最大の音量（0〜1。全体の系統で更に調整される） */
  peak: number;
  /** 立ち上がり（秒） */
  attack: number;
}

const midiToFreq = (m: number): number => 440 * 2 ** ((m - 69) / 12);

export interface BgmStyle {
  bpm: number;
}

export const BGM_STYLES: Record<BgmMood, BgmStyle> = {
  'quiet-ambient': { bpm: 60 },
  'driving-electronic': { bpm: 112 },
  'warm-acoustic': { bpm: 84 },
};

const MINOR_PENTATONIC = [0, 3, 5, 7, 10, 12] as const;
const MAJOR_PENTATONIC = [0, 2, 4, 7, 9, 12] as const;
const ROOT_OFFSETS = [0, 2, 3, 5, 7] as const;

/** 曲調・シーンの種・拍の番号から、その拍で鳴らす音を決める。同じ入力なら同じ結果（決定的） */
export function bgmBeatNotes(mood: BgmMood, seed: number, beat: number): Note[] {
  const root = 45 + (ROOT_OFFSETS[seed % ROOT_OFFSETS.length] ?? 0); // A2 付近
  const notes: Note[] = [];
  if (mood === 'quiet-ambient') {
    // 8 拍ごとに和音を変える長いパッド
    if (beat % 8 !== 0) return notes;
    const degrees = [0, -4, 3, -2];
    const chord = degrees[(beat / 8) % degrees.length] ?? 0;
    for (const iv of [0, 3, 7, 12]) {
      notes.push({ offset: 0, beats: 8.5, freq: midiToFreq(root + 12 + chord + iv), wave: 'sine', peak: 0.03, attack: 2 });
    }
    return notes;
  }
  if (mood === 'driving-electronic') {
    const bar = Math.floor(beat / 4);
    const bassDeg = [0, 0, 3, 5][bar % 4] ?? 0;
    notes.push({ offset: 0, beats: 0.45, freq: midiToFreq(root + bassDeg), wave: 'triangle', peak: 0.07, attack: 0.01 });
    for (let k = 0; k < 2; k++) {
      const idx = hash2(seed, beat * 2 + k) % MINOR_PENTATONIC.length;
      notes.push({ offset: k * 0.5, beats: 0.4, freq: midiToFreq(root + 24 + bassDeg + (MINOR_PENTATONIC[idx] ?? 0)), wave: 'square', peak: 0.012, attack: 0.005 });
    }
    return notes;
  }
  // warm-acoustic: 休みを挟んだ長調のペンタトニックのつま弾きと、4 拍ごとの低音
  if (beat % 4 === 0) notes.push({ offset: 0, beats: 3.5, freq: midiToFreq(root), wave: 'sine', peak: 0.05, attack: 0.02 });
  if (hash2(seed, beat) % 3 !== 0) {
    const idx = hash2(beat, seed) % MAJOR_PENTATONIC.length;
    notes.push({ offset: 0, beats: 1.4, freq: midiToFreq(root + 24 + (MAJOR_PENTATONIC[idx] ?? 0)), wave: 'triangle', peak: 0.04, attack: 0.01 });
  }
  return notes;
}

// ── 効果音 ──────────────────────────────────────────────────

export type SeKind = 'unmute' | 'select' | 'transition' | 'confirm';

export interface SeTone {
  /** 開始（秒） */
  at: number;
  /** 長さ（秒） */
  duration: number;
  freq: number;
  wave: Wave;
  peak: number;
}

/** 効果音の定義（短い音の並び）。すべて手続き生成 */
export function seTones(kind: SeKind): SeTone[] {
  switch (kind) {
    case 'unmute': return [
      { at: 0, duration: 0.12, freq: 523.25, wave: 'sine', peak: 0.18 },
      { at: 0.09, duration: 0.18, freq: 783.99, wave: 'sine', peak: 0.18 },
    ];
    case 'select': return [{ at: 0, duration: 0.07, freq: 880, wave: 'triangle', peak: 0.12 }];
    case 'transition': return [
      { at: 0, duration: 0.16, freq: 392, wave: 'sine', peak: 0.14 },
      { at: 0.07, duration: 0.2, freq: 587.33, wave: 'sine', peak: 0.14 },
    ];
    case 'confirm': return [
      { at: 0, duration: 0.1, freq: 659.25, wave: 'triangle', peak: 0.15 },
      { at: 0.08, duration: 0.1, freq: 880, wave: 'triangle', peak: 0.15 },
      { at: 0.16, duration: 0.22, freq: 1318.5, wave: 'triangle', peak: 0.15 },
    ];
  }
}
