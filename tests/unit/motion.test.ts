// 演出まわりの単体テスト: ブランドトーンの反映、Fluent 2 のモーション、アニメーション停止、動きを減らす設定、演出の設定の保存と復元
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandProfileSchema } from '../../src/schema';
import {
  INTENSITIES, MOTION_PROFILES, classifyTone, motionProfileForTone, resolveIntensity,
} from '../../src/motion/tone';
import { DURATION, countUpValue, drawProgress, runTransition, scaledDuration } from '../../src/motion/fluent';
import { isShortcutTarget } from '../../src/motion/control';

const brandWithTone = (tone: string) => BrandProfileSchema.parse({
  name: 'テスト',
  colors: { primary: '#0F6CBD', source: 's', retrievedAt: '2026-10-09', confidence: '高' },
  logo: { status: 'unknown', source: 's', retrievedAt: '2026-10-09', confidence: '高' },
  fonts: { primary: 'Segoe UI', source: 's', retrievedAt: '2026-10-09', confidence: '高' },
  tone: { value: tone, source: 's', retrievedAt: '2026-10-09', confidence: '高' },
});

describe('FR-063 ブランドトーンの演出への反映', () => {
  // FR-063 AC-078
  it('FR-063 AC-078 トーンを変えた 2 種類のブランドプロファイルで、演出強度の既定値・BGM の曲調・テンポ・テロップの文体がトーンごとに定義どおりに変わる', () => {
    const calm = motionProfileForTone(brandWithTone('誠実・精密・落ち着いた').tone.value);
    const friendly = motionProfileForTone(brandWithTone('親しみやすい・やわらかな').tone.value);
    expect(calm).toEqual(MOTION_PROFILES.calm);
    expect(friendly).toEqual(MOTION_PROFILES.friendly);
    expect(calm.defaultIntensity).toBe('Executive');
    expect(friendly.defaultIntensity).toBe('Entertainment');
    expect(calm.bgmMood).not.toBe(friendly.bgmMood);
    expect(calm.tempo).toBeGreaterThan(friendly.tempo);
    expect(calm.captionStyle).not.toBe(friendly.captionStyle);
  });

  // FR-063 AC-078
  it('FR-063 AC-078 3 つの分類はすべて、4 つの設定値の組み合わせが異なる', () => {
    const keys = Object.values(MOTION_PROFILES).map((p) => [p.defaultIntensity, p.bgmMood, p.tempo, p.captionStyle].join('|'));
    expect(new Set(keys).size).toBe(3);
    for (const p of Object.values(MOTION_PROFILES)) expect(INTENSITIES).toContain(p.defaultIntensity);
  });

  // FR-063 AC-078
  it('FR-063 AC-078 トーンが「先進的」・空・未知のときは、先進的の設定になる。複数のキーワードは先に現れたものに従う', () => {
    expect(classifyTone('先進的')).toBe('innovative');
    expect(classifyTone('')).toBe('innovative');
    expect(classifyTone(undefined)).toBe('innovative');
    expect(classifyTone('ぶっきらぼう')).toBe('innovative');
    expect(classifyTone('親しみやすいが誠実')).toBe('friendly');
    expect(classifyTone('誠実で親しみやすい')).toBe('calm');
  });

  // FR-063 AC-078
  it('FR-063 AC-078 利用者が演出強度を選んでいれば選択が優先され、選んでいなければトーンの既定値になる', () => {
    const calm = MOTION_PROFILES.calm;
    expect(resolveIntensity(null, calm)).toBe('Executive');
    expect(resolveIntensity('Entertainment', calm)).toBe('Entertainment');
    expect(resolveIntensity('壊れた値' as never, calm)).toBe('Executive');
  });
});

describe('FR-070 Fluent 2 のモーション', () => {
  // FR-070 AC-086
  it('FR-070 AC-086 カウントアップは 0 から最終値へ単調に増え、完了後は最終値になる', () => {
    expect(countUpValue(0, 1000, 0)).toBe(0);
    const mid = countUpValue(0, 1000, 0.5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1000);
    expect(countUpValue(0, 1000, 0.75)).toBeGreaterThan(mid);
    expect(countUpValue(0, 1000, 1)).toBe(1000);
    expect(countUpValue(0, 1000, 5)).toBe(1000);
  });

  // FR-070 AC-086, FR-071 AC-087
  it('FR-070 AC-086 FR-071 AC-087 停止中は、時間が 0 になり、チャートは完成した状態で、画面遷移は動かさずに更新する', () => {
    expect(scaledDuration(DURATION.normal, 1.25, true)).toBe(250);
    expect(scaledDuration(DURATION.normal, 1.25, false)).toBe(0);
    expect(drawProgress(100, 1000, true)).toBeCloseTo(0.1);
    expect(drawProgress(100, 1000, false)).toBe(1);
    expect(drawProgress(0, 0, true)).toBe(1);
    const start = vi.fn((cb: () => void) => cb());
    const doc = { startViewTransition: start } as unknown as Document;
    const update = vi.fn();
    runTransition(update, false, doc);
    expect(update).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    runTransition(update, true, doc);
    expect(start).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(2);
    // View Transitions API がないブラウザーでは、そのまま更新する
    runTransition(update, true, {} as Document);
    expect(update).toHaveBeenCalledTimes(3);
  });
});

describe('FR-071 グローバルのアニメーション停止', () => {
  // FR-071 AC-087
  it('FR-071 AC-087 P は入力欄の中と修飾キー付きでは受けない', () => {
    const input = { tagName: 'INPUT', isContentEditable: false } as unknown as EventTarget;
    const body = { tagName: 'BODY', isContentEditable: false } as unknown as EventTarget;
    expect(isShortcutTarget({ target: body, ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
    expect(isShortcutTarget({ target: input, ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
    expect(isShortcutTarget({ target: body, ctrlKey: true, metaKey: false, altKey: false })).toBe(false);
  });
});

// ---- localStorage と matchMedia を差し替えて、ストアを読み込み直す ----
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

function boot(storage: MemoryStorage, reducedMotion: boolean) {
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', {
    localStorage: storage,
    matchMedia: (q: string) => ({ matches: q.includes('prefers-reduced-motion') ? reducedMotion : false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {}, removeEventListener() {},
    location: { search: '' },
  });
  vi.resetModules();
}

describe('動きを減らす設定とアニメーション停止の状態', () => {
  let storage: MemoryStorage;
  beforeEach(() => { storage = new MemoryStorage(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  // FR-072 AC-088
  it('FR-072 AC-088 prefers-reduced-motion が reduce のブラウザーで初めて起動すると、アニメーションは停止中になる', async () => {
    boot(storage, true);
    const { useAnimation } = await import('../../src/store/animation');
    expect(useAnimation.getState().playing).toBe(false);
    expect(useAnimation.getState().choice).toBeNull();
  });

  // FR-072 AC-088
  it('FR-072 AC-088 reduce でないときは再生中で起動する', async () => {
    boot(storage, false);
    const { useAnimation } = await import('../../src/store/animation');
    expect(useAnimation.getState().playing).toBe(true);
  });

  // FR-072 AC-088
  it('FR-072 AC-088 resolvePlaying は、利用者の選択があればそれを、なければ OS の設定に従う', async () => {
    boot(storage, false);
    const { resolvePlaying } = await import('../../src/store/animation');
    expect(resolvePlaying(null, true)).toBe(false);
    expect(resolvePlaying(null, false)).toBe(true);
    expect(resolvePlaying(true, true)).toBe(true);
    expect(resolvePlaying(false, false)).toBe(false);
  });

  // FR-071 AC-087
  it('FR-071 AC-087 切り替えるたびに再生中と停止中が入れ替わる', async () => {
    boot(storage, false);
    const { useAnimation } = await import('../../src/store/animation');
    useAnimation.getState().toggle();
    expect(useAnimation.getState().playing).toBe(false);
    useAnimation.getState().toggle();
    expect(useAnimation.getState().playing).toBe(true);
  });

  // FR-057 AC-070
  it('FR-057 AC-070 ミュート解除・音量・アニメ停止・演出強度・3D 品質・ダークテーマを変えて再読込すると、6 項目すべてが復元される', async () => {
    boot(storage, false);
    {
      const { useSettings } = await import('../../src/store/settings');
      const { useAnimation } = await import('../../src/store/animation');
      const { useView3D } = await import('../../src/store/view3d');
      expect(useSettings.getState().muted).toBe(true); // 既定はミュート
      useSettings.getState().setMuted(false);
      useSettings.getState().setVolume(0.3);
      useAnimation.getState().setPlaying(false);
      useSettings.getState().setIntensity('Entertainment');
      useView3D.getState().setQuality('Low');
      useSettings.getState().setThemeMode('dark');
    }
    // 再読込: モジュールを読み直し、localStorage だけが残る
    vi.resetModules();
    const { useSettings } = await import('../../src/store/settings');
    const { useAnimation } = await import('../../src/store/animation');
    const { useView3D } = await import('../../src/store/view3d');
    expect(useSettings.getState().muted).toBe(false);
    expect(useSettings.getState().volume).toBeCloseTo(0.3);
    expect(useAnimation.getState().playing).toBe(false);
    expect(useSettings.getState().intensity).toBe('Entertainment');
    expect(useView3D.getState().quality).toBe('Low');
    expect(useSettings.getState().themeMode).toBe('dark');
  });

  // FR-057 AC-070
  it('FR-057 AC-070 音量は 0〜1 に丸め、保存が壊れていても起動できる', async () => {
    boot(storage, false);
    storage.setItem('edb.animation', '{not json');
    const { useSettings } = await import('../../src/store/settings');
    const { useAnimation } = await import('../../src/store/animation');
    useSettings.getState().setVolume(5);
    expect(useSettings.getState().volume).toBe(1);
    useSettings.getState().setVolume(-1);
    expect(useSettings.getState().volume).toBe(0);
    expect(useAnimation.getState().playing).toBe(true);
  });

  // FR-072 AC-088, FR-057 AC-070
  it('FR-072 AC-088 FR-057 AC-070 利用者が停止／再開を選んだあとは、reduce でも保存された選択で起動する', async () => {
    boot(storage, true);
    {
      const { useAnimation } = await import('../../src/store/animation');
      useAnimation.getState().setPlaying(true);
    }
    vi.resetModules();
    const { useAnimation } = await import('../../src/store/animation');
    expect(useAnimation.getState().playing).toBe(true);
  });
});

