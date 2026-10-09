// 音声の制御（FR-073・FR-074・FR-075）。Web Audio の BGM・効果音・ミュート・音量・ナレーション中のダッキングをまとめる。
// 自動再生ポリシー: AudioContext は、利用者の最初の操作（activate）の後にだけ作る。最初の操作は音を出せるようにするだけで、ミュートの状態は変えない（FR-074 AC-193）。
// 音源は外部から取得せず、手続き生成する（音源フォルダーの指定があればそれを使う）。React・ストアに依存しない（設定は setSettings で渡す）。
import type { BgmMood } from '../motion/tone';
import {
  BGM_STYLES, CROSSFADE_SECONDS, DEFAULT_AUDIO_SETTINGS, DUCK_RAMP_SECONDS, LEVEL_RAMP_SECONDS,
  bgmBeatNotes, bgmBusLevel, effectiveBgmVolume, masterLevel, sceneSeed, selectBgm, seBusLevel, seTones, wantsSound,
  type AudioSettings, type BgmChoice, type BgmSource, type Note, type SeKind,
} from './model';

/** 先読みして予約する長さ（秒）と、予約の間隔（ミリ秒） */
const LOOKAHEAD_SECONDS = 1.5;
const TICK_MS = 250;

export interface TrackSnapshot {
  scene: string;
  choice: BgmChoice;
  /** このトラックの音量の目標（1 に向けて上がる = in、0 に向けて下がる = out） */
  target: number;
  fading: 'in' | 'out';
}

export interface AudioSnapshot {
  activated: boolean;
  /** AudioContext の状態（作っていなければ 'none'） */
  contextState: string;
  settings: AudioSettings;
  ducked: boolean;
  scene: string | null;
  /** 設定から決まる全体の音量・BGM の系統・効果音の系統 */
  masterLevel: number;
  bgmBusLevel: number;
  seBusLevel: number;
  /** 実際に出る BGM の音量（全体 × BGM の系統。ダッキング中は設定値より下がる） */
  effectiveBgmVolume: number;
  tracks: TrackSnapshot[];
}

interface Track {
  scene: string;
  choice: BgmChoice;
  gain: GainNode;
  target: number;
  fading: 'in' | 'out';
  disposed: boolean;
  /** 手続き生成の予約（音源ファイルのトラックは null） */
  schedule: ((until: number) => void) | null;
  stopSource: (() => void) | null;
  disposeTimer: ReturnType<typeof setTimeout> | null;
}

export interface AudioControllerOptions {
  createContext: () => AudioContext;
  sources?: readonly BgmSource[];
  mood?: BgmMood;
  /** モーションのテンポ（1 より大きいほどゆっくり） */
  tempo?: number;
}

function ramp(p: AudioParam, value: number, seconds: number, now: number): void {
  p.cancelScheduledValues(now);
  p.setValueAtTime(p.value, now);
  p.linearRampToValueAtTime(value, now + Math.max(0.001, seconds));
}

export class AudioController {
  private readonly createContext: () => AudioContext;
  private sources: readonly BgmSource[];
  private mood: BgmMood;
  private tempo: number;
  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private ducked = false;
  private scene: string | null = null;
  private activated = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private seBus: GainNode | null = null;
  private tracks: Track[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: AudioControllerOptions) {
    this.createContext = opts.createContext;
    this.sources = opts.sources ?? [];
    this.mood = opts.mood ?? 'driving-electronic';
    this.tempo = opts.tempo ?? 1;
  }

  /** 利用者の最初の操作で呼ぶ。AudioContext を作り、再生を可能にする。ミュートなどの設定は変えない */
  activate(): void {
    if (this.activated) return;
    this.activated = true;
    let ctx: AudioContext;
    try {
      ctx = this.createContext();
    } catch {
      return; // 音声を使えない環境でも、ほかの機能は使える（NFR-A11Y-002）
    }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.bgmBus = ctx.createGain();
    this.seBus = ctx.createGain();
    this.bgmBus.connect(this.master);
    this.seBus.connect(this.master);
    this.master.connect(ctx.destination);
    this.applyLevels(false);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    if (this.scene !== null) this.startTrack(this.scene);
  }

  /** 設定（ミュート・音量・BGM と効果音の ON/OFF）を反映する */
  setSettings(next: AudioSettings): void {
    this.settings = { ...next };
    this.applyLevels(true);
  }

  /** 手続き生成の BGM の曲調とテンポ（ブランドのトーンから決まる。FR-063）。次に始めるトラックから反映する */
  setStyle(mood: BgmMood, tempo: number): void {
    this.mood = mood;
    this.tempo = tempo;
  }

  /** 音源フォルダーの BGM の指定（空なら手続き生成）。次に始めるトラックから反映する */
  setSources(sources: readonly BgmSource[]): void {
    this.sources = sources;
  }

  /** シーンを切り替える。前の BGM の音量を下げながら、次の BGM の音量を上げる（クロスフェード。FR-073） */
  setScene(scene: string): void {
    if (this.scene === scene) return;
    this.scene = scene;
    if (!this.ctx) return;
    const current = this.current();
    if (current && current.scene === scene) return;
    if (current) this.fadeOut(current);
    this.startTrack(scene);
  }

  /** ナレーションの開始・終了を通知する。開始で BGM の音量を下げ、終了で元に戻す（FR-075） */
  notifyNarration(active: boolean): void {
    if (this.ducked === active) return;
    this.ducked = active;
    if (!this.ctx || !this.bgmBus) return;
    ramp(this.bgmBus.gain, bgmBusLevel(this.settings, this.ducked), DUCK_RAMP_SECONDS, this.ctx.currentTime);
  }

  /** 効果音を 1 つ鳴らす。鳴らせない（未操作・ミュート・効果音 OFF）ときは false */
  playSe(kind: SeKind): boolean {
    const ctx = this.ctx;
    const bus = this.seBus;
    if (!ctx || !bus || masterLevel(this.settings) <= 0 || seBusLevel(this.settings) <= 0) return false;
    const play = () => {
      const t0 = ctx.currentTime + 0.01;
      for (const tone of seTones(kind)) this.scheduleTone(bus, t0 + tone.at, tone.duration, tone.freq, tone.wave, tone.peak, 0.005);
    };
    if (ctx.state === 'running') play();
    else void ctx.resume().then(play, () => undefined);
    return true;
  }

  /** 実際に音が出ている（出せる）状態か。操作の前・ミュート・BGM OFF・音量 0 では false */
  isAudible(): boolean {
    const ctx = this.ctx;
    if (!this.activated || !ctx || ctx.state !== 'running') return false;
    if (effectiveBgmVolume(this.settings, this.ducked) <= 0) return false;
    const cur = this.current();
    return !!cur && cur.target > 0;
  }

  snapshot(): AudioSnapshot {
    return {
      activated: this.activated,
      contextState: this.ctx ? this.ctx.state : 'none',
      settings: { ...this.settings },
      ducked: this.ducked,
      scene: this.scene,
      masterLevel: masterLevel(this.settings),
      bgmBusLevel: bgmBusLevel(this.settings, this.ducked),
      seBusLevel: seBusLevel(this.settings),
      effectiveBgmVolume: effectiveBgmVolume(this.settings, this.ducked),
      tracks: this.tracks.filter((t) => !t.disposed).map((t) => ({ scene: t.scene, choice: t.choice, target: t.target, fading: t.fading })),
    };
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.timer = null;
    this.suspendTimer = null;
    for (const t of [...this.tracks]) this.disposeTrack(t);
    const ctx = this.ctx;
    this.ctx = null;
    this.master = this.bgmBus = this.seBus = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }

  // ── 内部 ────────────────────────────────────────────────

  private current(): Track | undefined {
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      const t = this.tracks[i];
        if (t && !t.disposed && t.fading === 'in') return t;
    }
    return undefined;
  }

  private applyLevels(smooth: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.bgmBus || !this.seBus) return;
    const targets: Array<[GainNode, number]> = [
      [this.master, masterLevel(this.settings)],
      [this.bgmBus, bgmBusLevel(this.settings, this.ducked)],
      [this.seBus, seBusLevel(this.settings)],
    ];
    for (const [node, v] of targets) {
      if (smooth) ramp(node.gain, v, LEVEL_RAMP_SECONDS, ctx.currentTime);
      else node.gain.value = v;
    }
    // 音が出ないときは、音声の処理を止める（ミュートのまま動かし続けない）
    if (this.suspendTimer) { clearTimeout(this.suspendTimer); this.suspendTimer = null; }
    if (wantsSound(this.settings)) {
      if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    } else if (ctx.state === 'running') {
      this.suspendTimer = setTimeout(() => {
        this.suspendTimer = null;
        if (this.ctx && !wantsSound(this.settings) && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
      }, (LEVEL_RAMP_SECONDS + 0.05) * 1000);
    }
  }

  private fadeOut(track: Track): void {
    const ctx = this.ctx;
    if (!ctx) return;
    track.fading = 'out';
    track.target = 0;
    ramp(track.gain.gain, 0, CROSSFADE_SECONDS, ctx.currentTime);
    track.disposeTimer = setTimeout(() => this.disposeTrack(track), (CROSSFADE_SECONDS + 0.3) * 1000);
  }

  private disposeTrack(track: Track): void {
    if (track.disposed) return;
    track.disposed = true;
    if (track.disposeTimer) clearTimeout(track.disposeTimer);
    try { track.stopSource?.(); } catch { /* すでに止まっている */ }
    try { track.gain.disconnect(); } catch { /* すでに外れている */ }
    this.tracks = this.tracks.filter((t) => t !== track);
  }

  private startTrack(scene: string): void {
    const ctx = this.ctx;
    const bus = this.bgmBus;
    if (!ctx || !bus) return;
    const choice = selectBgm(this.sources, scene, this.mood);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(bus);
    const track: Track = { scene, choice, gain, target: 1, fading: 'in', disposed: false, schedule: null, stopSource: null, disposeTimer: null };
    this.tracks.push(track);
    ramp(gain.gain, 1, CROSSFADE_SECONDS, ctx.currentTime);
    if (choice.kind === 'file') void this.startFile(track, choice.url);
    else this.startProcedural(track, choice.mood);
  }

  private startProcedural(track: Track, mood: BgmMood): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const seed = sceneSeed(track.scene);
    const beatSeconds = (60 / BGM_STYLES[mood].bpm) * this.tempo;
    let next = ctx.currentTime + 0.05;
    let beat = 0;
    track.schedule = (until) => {
      while (next < until) {
        for (const n of bgmBeatNotes(mood, seed, beat)) this.scheduleNote(track.gain, n, next, beatSeconds);
        next += beatSeconds;
        beat += 1;
      }
    };
    track.schedule(ctx.currentTime + LOOKAHEAD_SECONDS);
  }

  private async startFile(track: Track, url: string): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      if (track.disposed || this.ctx !== ctx) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(track.gain);
      src.start();
      track.stopSource = () => { src.stop(); src.disconnect(); };
    } catch {
      // 読めない音源は、手続き生成の BGM に切り替える（音が出ないままにしない）
      if (!track.disposed) this.startProcedural(track, this.mood);
    }
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    for (const t of this.tracks) if (!t.disposed) t.schedule?.(ctx.currentTime + LOOKAHEAD_SECONDS);
  }

  private scheduleNote(dest: AudioNode, n: Note, when: number, beatSeconds: number): void {
    this.scheduleTone(dest, when + n.offset * beatSeconds, n.beats * beatSeconds, n.freq, n.wave, n.peak, n.attack);
  }

  private scheduleTone(dest: AudioNode, when: number, duration: number, freq: number, wave: OscillatorType, peak: number, attack: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const a = Math.min(attack, duration / 2);
    osc.type = wave;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + a);
    g.gain.linearRampToValueAtTime(0, when + duration);
    osc.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + duration + 0.05);
    osc.onended = () => {
      try { osc.disconnect(); g.disconnect(); } catch { /* すでに外れている */ }
    };
  }
}
