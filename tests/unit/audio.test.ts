// 音声の単体・結合テスト: FR-073 AC-089（クロスフェード・手続き生成の BGM）、FR-074 AC-091/AC-193（ミュート・最初の操作）、
// FR-075 AC-092（ダッキング）、NFR-A11Y-002（音を使えなくても動く）。Web Audio は記録するだけの偽物で置き換える。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioController } from '../../src/audio/controller';
import {
  CROSSFADE_SECONDS, DEFAULT_AUDIO_SETTINGS, DUCK_FACTOR, bgmBeatNotes, crossfadeLevels, effectiveBgmVolume,
  masterLevel, muteAnnouncement, sceneSeed, seTones, selectBgm, wantsSound, type AudioSettings,
} from '../../src/audio/model';
import { isMuteKey } from '../../src/audio/keys';
import { MOTION_PROFILES } from '../../src/motion/tone';

class FakeParam {
  value = 0;
  /** 最後に予約された目標の値と、そこまでの秒数 */
  target: number | null = null;
  rampSeconds = 0;
  cancelScheduledValues() { return this; }
  setValueAtTime(v: number) { this.value = v; return this; }
  linearRampToValueAtTime(v: number, t: number) { this.target = v; this.rampSeconds = t; return this; }
}
class FakeNode {
  connected: FakeNode[] = [];
  connect(n: FakeNode) { this.connected.push(n); return n; }
  disconnect() { this.connected = []; }
}
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeOsc extends FakeNode {
  type = 'sine'; frequency = new FakeParam(); started: number | null = null; onended: (() => void) | null = null;
  start(t: number) { this.started = t; }
  stop() { /* 何もしない */ }
}
class FakeContext {
  currentTime = 0;
  state: 'running' | 'suspended' | 'closed' = 'running';
  destination = new FakeNode();
  gains: FakeGain[] = [];
  oscillators: FakeOsc[] = [];
  resumed = 0;
  suspended = 0;
  createGain() { const g = new FakeGain(); this.gains.push(g); return g; }
  createOscillator() { const o = new FakeOsc(); this.oscillators.push(o); return o; }
  async resume() { this.resumed += 1; this.state = 'running'; }
  async suspend() { this.suspended += 1; this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}

function setup(opts: { sources?: Parameters<typeof selectBgm>[0]; settings?: Partial<AudioSettings> } = {}) {
  const ctx = new FakeContext();
  const created = vi.fn(() => ctx as unknown as AudioContext);
  const audio = new AudioController({ createContext: created, sources: opts.sources, mood: 'driving-electronic' });
  audio.setSettings({ ...DEFAULT_AUDIO_SETTINGS, ...opts.settings });
  return { ctx, created, audio };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('FR-073 BGM と効果音', () => {
  // FR-073 AC-089
  it('AC-089 シーンを切り替えると前の BGM の音量が下がりながら次の BGM の音量が上がる（クロスフェード）', () => {
    const { audio } = setup({ settings: { muted: false } });
    audio.setScene('workspace');
    audio.activate();
    const first = audio.snapshot().tracks;
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ scene: 'workspace', fading: 'in', target: 1 });
    audio.setScene('chapter:ch2');
    const tracks = audio.snapshot().tracks;
    expect(tracks).toHaveLength(2);
    const prev = tracks.find((t) => t.scene === 'workspace')!;
    const next = tracks.find((t) => t.scene === 'chapter:ch2')!;
    expect(prev).toMatchObject({ fading: 'out', target: 0 });
    expect(next).toMatchObject({ fading: 'in', target: 1 });
    // 同じシーンへの切替は何もしない
    audio.setScene('chapter:ch2');
    expect(audio.snapshot().tracks).toHaveLength(2);
    // クロスフェードのあと、前の BGM は片づく
    vi.advanceTimersByTime((CROSSFADE_SECONDS + 0.5) * 1000);
    expect(audio.snapshot().tracks.map((t) => t.scene)).toEqual(['chapter:ch2']);
    audio.dispose();
  });

  // FR-073 AC-089
  it('AC-089 実際の音量の変化: 前のトラックの音量は 0 へ、次のトラックは 1 へ、同じ時間で変わる', () => {
    const { ctx, audio } = setup({ settings: { muted: false } });
    audio.activate();
    audio.setScene('a');
    audio.setScene('b');
    const bgmBus = ctx.gains[1]!;
    const trackGains = ctx.gains.filter((g) => g.connected.includes(bgmBus));
    expect(trackGains).toHaveLength(2);
    const [prev, next] = trackGains as [FakeGain, FakeGain];
    expect(prev.gain.target).toBe(0); // 前の BGM は 0 へ
    expect(next.gain.target).toBe(1); // 次の BGM は 1 へ
    expect(prev.gain.rampSeconds).toBeCloseTo(next.gain.rampSeconds, 5); // 同じ時間で
    expect(prev.gain.rampSeconds).toBeCloseTo(CROSSFADE_SECONDS, 5);
    audio.dispose();
  });

  // FR-073 AC-089
  it('AC-089 音源フォルダーが空のときは手続き生成の BGM が選ばれ、指定があればその音源が選ばれる', () => {
    expect(selectBgm([], 'workspace', 'quiet-ambient')).toEqual({ kind: 'procedural', scene: 'workspace', mood: 'quiet-ambient' });
    const sources = [{ id: 'a', url: '/assets/audio/a.mp3', scene: 'opening' }, { id: 'any', url: '/assets/audio/any.mp3' }];
    expect(selectBgm(sources, 'opening', 'quiet-ambient')).toMatchObject({ kind: 'file', id: 'a' });
    expect(selectBgm(sources, 'workspace', 'quiet-ambient')).toMatchObject({ kind: 'file', id: 'any' });
    const { audio } = setup({ settings: { muted: false } });
    audio.setScene('workspace');
    audio.activate();
    expect(audio.snapshot().tracks[0]!.choice.kind).toBe('procedural');
    audio.dispose();
  });

  // FR-073 AC-089
  it('AC-089 手続き生成の BGM は、先読みして音（オシレーター）を予約し、シーンごとに調が変わる', () => {
    const { ctx, audio } = setup({ settings: { muted: false } });
    audio.setScene('workspace');
    audio.activate();
    expect(ctx.oscillators.length).toBeGreaterThan(0);
    expect(ctx.oscillators.every((o) => o.started !== null)).toBe(true);
    const n0 = ctx.oscillators.length;
    ctx.currentTime += 2;
    vi.advanceTimersByTime(300);
    expect(ctx.oscillators.length).toBeGreaterThan(n0);
    audio.dispose();
    expect(sceneSeed('a')).not.toBe(sceneSeed('b'));
    for (const mood of Object.keys(MOTION_PROFILES).map((k) => MOTION_PROFILES[k as keyof typeof MOTION_PROFILES].bgmMood)) {
      const a = bgmBeatNotes(mood, sceneSeed('a'), 0);
      expect(a).toEqual(bgmBeatNotes(mood, sceneSeed('a'), 0)); // 決定的
      for (let beat = 0; beat < 16; beat++) for (const n of bgmBeatNotes(mood, 1, beat)) { expect(n.freq).toBeGreaterThan(20); expect(n.freq).toBeLessThan(8000); expect(n.peak).toBeLessThan(0.3); }
    }
  });

  // FR-073 AC-089
  it('AC-089 クロスフェードの音量は等パワーで、出ていく音と入ってくる音が滑らかにつながる', () => {
    expect(crossfadeLevels(0)).toEqual({ out: 1, in: 0 });
    const end = crossfadeLevels(1);
    expect(end.out).toBeCloseTo(0, 10);
    expect(end.in).toBeCloseTo(1, 10);
    const mid = crossfadeLevels(0.5);
    expect(mid.out ** 2 + mid.in ** 2).toBeCloseTo(1, 10);
    expect(crossfadeLevels(-1).in).toBe(0);
    expect(crossfadeLevels(9).out).toBeCloseTo(0, 10);
  });

  // FR-073
  it('効果音は手続き生成で、ミュート・効果音 OFF・最初の操作の前では鳴らさず、鳴らせるときは音を予約する', async () => {
    const muted = setup();
    muted.audio.activate();
    expect(muted.audio.playSe('select')).toBe(false);
    muted.audio.dispose();

    const off = setup({ settings: { muted: false, seEnabled: false } });
    off.audio.activate();
    expect(off.audio.playSe('select')).toBe(false);
    off.audio.dispose();

    const before = setup({ settings: { muted: false } });
    expect(before.audio.playSe('select')).toBe(false); // activate 前
    before.audio.activate();
    const n = before.ctx.oscillators.length;
    expect(before.audio.playSe('confirm')).toBe(true);
    expect(before.ctx.oscillators.length).toBe(n + seTones('confirm').length);
    before.audio.dispose();
  });
});

describe('FR-074 ミュートと音量の操作', () => {
  // FR-074 AC-091
  it('AC-091 既定はミュートで、BGM だけ OFF にしても効果音の設定は変わらない', () => {
    expect(DEFAULT_AUDIO_SETTINGS.muted).toBe(true);
    expect(masterLevel(DEFAULT_AUDIO_SETTINGS)).toBe(0);
    const { audio } = setup({ settings: { muted: false, bgmEnabled: false } });
    const snap = audio.snapshot();
    expect(snap.bgmBusLevel).toBe(0);
    expect(snap.seBusLevel).toBe(1);
    expect(snap.settings.seEnabled).toBe(true);
    expect(wantsSound({ ...DEFAULT_AUDIO_SETTINGS, muted: false, bgmEnabled: false })).toBe(true); // 効果音だけで音は出る
    expect(wantsSound({ ...DEFAULT_AUDIO_SETTINGS, muted: false, bgmEnabled: false, seEnabled: false })).toBe(false);
  });

  // FR-074 NFR-A11Y-002
  it('M キー・コマンド・ボタンのミュートの切替を、aria-live で「ミュートにしました／ミュートを解除しました」と通知する文言になる', () => {
    expect(muteAnnouncement(true)).toBe('ミュートにしました');
    expect(muteAnnouncement(false)).toBe('ミュートを解除しました');
  });

  // FR-074 AC-091
  it('AC-091 M キーは、入力欄の中・修飾キー付き・長押しでは受けず、ボタンやスライダーの上では受ける', () => {
    const el = (tagName: string, type?: string) => ({ tagName, type });
    expect(isMuteKey({ key: 'm', target: el('BODY') })).toBe(true);
    expect(isMuteKey({ key: 'M', target: el('BUTTON') })).toBe(true);
    expect(isMuteKey({ key: 'm', target: el('INPUT', 'range') })).toBe(true);
    expect(isMuteKey({ key: 'm', target: el('INPUT', 'text') })).toBe(false);
    expect(isMuteKey({ key: 'm', target: el('TEXTAREA') })).toBe(false);
    expect(isMuteKey({ key: 'm', target: { tagName: 'DIV', isContentEditable: true } })).toBe(false);
    expect(isMuteKey({ key: 'm', ctrlKey: true, target: el('BODY') })).toBe(false);
    expect(isMuteKey({ key: 'm', repeat: true, target: el('BODY') })).toBe(false);
    expect(isMuteKey({ key: 'p', target: el('BODY') })).toBe(false);
  });

  // FR-074 AC-193
  it('AC-193 最初の操作（activate）の前は音声を作らず、操作の後もミュートのままなら音は鳴らない（ミュートの状態は変わらない）', () => {
    const { audio, created, ctx } = setup();
    audio.setScene('workspace');
    expect(created).not.toHaveBeenCalled();
    expect(audio.isAudible()).toBe(false);
    audio.activate();
    expect(created).toHaveBeenCalledTimes(1);
    expect(audio.snapshot().settings.muted).toBe(true);
    expect(audio.isAudible()).toBe(false);
    expect(audio.snapshot().effectiveBgmVolume).toBe(0);
    // ミュートの間は音声の処理を止める
    vi.advanceTimersByTime(500);
    expect(ctx.suspended).toBeGreaterThan(0);
    // 2 回目の activate は何もしない
    audio.activate();
    expect(created).toHaveBeenCalledTimes(1);
    audio.dispose();
  });

  // FR-074 AC-193
  it('AC-193 ミュートを解除した設定で再読込した直後は、最初の操作までは鳴らず、最初の操作の後に鳴り始める', () => {
    const { audio, ctx } = setup({ settings: { muted: false, volume: 0.4 } });
    audio.setScene('workspace');
    expect(audio.isAudible()).toBe(false); // 操作の前
    audio.activate(); // 最初の操作
    expect(audio.isAudible()).toBe(true);
    expect(audio.snapshot().settings.muted).toBe(false);
    expect(masterLevel(audio.snapshot().settings)).toBeCloseTo(0.4, 5);
    // 後からミュートすると鳴らなくなり、解除すると resume して鳴る
    audio.setSettings({ ...DEFAULT_AUDIO_SETTINGS, muted: true });
    expect(audio.isAudible()).toBe(false);
    vi.advanceTimersByTime(500);
    expect(ctx.state).toBe('suspended');
    audio.setSettings({ ...DEFAULT_AUDIO_SETTINGS, muted: false });
    expect(ctx.resumed).toBeGreaterThan(0);
    audio.dispose();
  });

  // FR-074
  it('音量は 0〜1 に収まり、0 なら鳴らない。BGM を OFF にすると鳴らない', () => {
    expect(masterLevel({ ...DEFAULT_AUDIO_SETTINGS, muted: false, volume: 5 })).toBe(1);
    expect(masterLevel({ ...DEFAULT_AUDIO_SETTINGS, muted: false, volume: -1 })).toBe(0);
    expect(masterLevel({ ...DEFAULT_AUDIO_SETTINGS, muted: false, volume: Number.NaN })).toBe(0);
    const { audio } = setup({ settings: { muted: false, volume: 0 } });
    audio.setScene('x');
    audio.activate();
    expect(audio.isAudible()).toBe(false);
    audio.setSettings({ ...DEFAULT_AUDIO_SETTINGS, muted: false, bgmEnabled: false });
    expect(audio.isAudible()).toBe(false);
    audio.dispose();
  });
});

describe('FR-075 ナレーション中のダッキング', () => {
  // FR-075 AC-092
  it('AC-092 ナレーションの開始を通知すると BGM の音量が設定値より下がり、終了を通知すると元に戻る', () => {
    const { audio, ctx } = setup({ settings: { muted: false, volume: 0.8 } });
    audio.setScene('workspace');
    audio.activate();
    const normal = audio.snapshot().effectiveBgmVolume;
    expect(normal).toBeCloseTo(0.8, 5);
    const bgmBus = ctx.gains[1]!.gain;
    audio.notifyNarration(true);
    const ducked = audio.snapshot();
    expect(ducked.ducked).toBe(true);
    expect(ducked.effectiveBgmVolume).toBeLessThan(normal);
    expect(ducked.effectiveBgmVolume).toBeCloseTo(0.8 * DUCK_FACTOR, 5);
    expect(bgmBus.target).toBeCloseTo(DUCK_FACTOR, 5); // 実際の音量の目標も下がる
    audio.notifyNarration(false);
    expect(audio.snapshot().effectiveBgmVolume).toBeCloseTo(normal, 5);
    expect(bgmBus.target).toBe(1);
    // 効果音の系統はダッキングしない
    audio.notifyNarration(true);
    expect(audio.snapshot().seBusLevel).toBe(1);
    audio.dispose();
  });

  // FR-075 AC-092
  it('AC-092 操作の前でも通知を受け、操作の後にダッキングの状態で始まる。ミュート中は 0 のまま', () => {
    expect(effectiveBgmVolume({ ...DEFAULT_AUDIO_SETTINGS, muted: false, volume: 1 }, true)).toBeCloseTo(DUCK_FACTOR, 5);
    expect(effectiveBgmVolume(DEFAULT_AUDIO_SETTINGS, true)).toBe(0);
    const { audio, ctx } = setup({ settings: { muted: false } });
    audio.notifyNarration(true);
    audio.activate();
    expect(ctx.gains[1]!.gain.value).toBeCloseTo(DUCK_FACTOR, 5);
    audio.dispose();
  });
});

describe('NFR-A11Y-002 演出をすべて OFF にしたときの利用', () => {
  // NFR-A11Y-002 AC-172
  it('AC-172 AudioContext を作れない環境でも、音声の操作は例外を出さず、すべて音なしで終わる', () => {
    const audio = new AudioController({ createContext: () => { throw new Error('Web Audio が使えません'); } });
    audio.setSettings({ ...DEFAULT_AUDIO_SETTINGS, muted: false });
    expect(() => {
      audio.setScene('workspace');
      audio.activate();
      audio.setScene('chapter:1');
      audio.notifyNarration(true);
      audio.setStyle('quiet-ambient', 1.25);
      audio.setSources([]);
    }).not.toThrow();
    expect(audio.playSe('select')).toBe(false);
    expect(audio.isAudible()).toBe(false);
    expect(audio.snapshot().contextState).toBe('none');
    expect(() => audio.dispose()).not.toThrow();
  });

  // NFR-A11Y-002 AC-172
  it('AC-172 ミュートのままなら、音声の処理は音を出さない（全体の音量 0・効果音を鳴らさない）', () => {
    const { audio } = setup();
    audio.setScene('workspace');
    audio.activate();
    expect(audio.snapshot().masterLevel).toBe(0);
    expect(audio.playSe('transition')).toBe(false);
    expect(audio.isAudible()).toBe(false);
    audio.dispose();
  });
});
