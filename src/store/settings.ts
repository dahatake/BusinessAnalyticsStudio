// 利用者の設定（テーマ）。localStorage に保存し、再読込で復元する。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

interface SettingsState {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  /** 設定パネルで上書きした Primary 色（#RRGGBB）。null は顧客パックの値を使う（FR-064） */
  brandPrimaryOverride: string | null;
  setBrandPrimaryOverride: (hex: string | null) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      setThemeMode: (themeMode) => set({ themeMode }),
      brandPrimaryOverride: null,
      setBrandPrimaryOverride: (brandPrimaryOverride) => set({ brandPrimaryOverride }),
    }),
    { name: 'edb.settings', version: 1 },
  ),
);
