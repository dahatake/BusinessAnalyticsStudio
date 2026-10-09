// 利用者の設定（テーマ・ミュート・音量・演出強度・ブランド色の上書き）。localStorage に保存し、再読込で復元する（FR-057）。
// アニメ停止は store/animation.ts、3D 品質は store/view3d.ts が、同じ localStorage に保存する。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Intensity } from '../motion/tone';

export type ThemeMode = 'light' | 'dark' | 'system';
export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

interface SettingsState {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  /** 設定パネルで上書きした Primary 色（#RRGGBB）。null は顧客パックの値を使う（FR-064） */
  brandPrimaryOverride: string | null;
  setBrandPrimaryOverride: (hex: string | null) => void;
  /** ミュート（既定はミュート。FR-074）。FR-057 の保存の対象 */
  muted: boolean;
  setMuted: (muted: boolean) => void;
  /** 音量 0〜1。FR-057 の保存の対象 */
  volume: number;
  setVolume: (volume: number) => void;
  /** 利用者が選んだ演出強度。null はブランドトーンの既定値（FR-063）。FR-057 の保存の対象 */
  intensity: Intensity | null;
  setIntensity: (intensity: Intensity | null) => void;
}

export const DEFAULT_VOLUME = 0.6;
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME);

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      setThemeMode: (themeMode) => set({ themeMode }),
      brandPrimaryOverride: null,
      setBrandPrimaryOverride: (brandPrimaryOverride) => set({ brandPrimaryOverride }),
      muted: true,
      setMuted: (muted) => set({ muted }),
      volume: DEFAULT_VOLUME,
      setVolume: (volume) => set({ volume: clamp01(volume) }),
      intensity: null,
      setIntensity: (intensity) => set({ intensity }),
    }),
    { name: 'edb.settings', version: 1 },
  ),
);
