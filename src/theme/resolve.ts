// テーマの決定: 利用者の選択（Light / Dark / システム）と、OS の設定（ダーク・ハイコントラスト）から Fluent のテーマを選ぶ。
import { useEffect, useState } from 'react';
import {
  teamsHighContrastTheme, webDarkTheme, webLightTheme, type Theme,
} from '@fluentui/react-components';
import type { ThemeMode } from '../store/settings';

export type ResolvedThemeName = 'light' | 'dark' | 'high-contrast';

export function resolveThemeName(mode: ThemeMode, prefersDark: boolean, forcedColors: boolean): ResolvedThemeName {
  if (forcedColors) return 'high-contrast';
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

export const THEMES: Record<ResolvedThemeName, Theme> = {
  light: webLightTheme,
  dark: webDarkTheme,
  'high-contrast': teamsHighContrastTheme,
};

function useMedia(query: string): boolean {
  const get = () => typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

export function useResolvedTheme(mode: ThemeMode): { name: ResolvedThemeName; theme: Theme } {
  const prefersDark = useMedia('(prefers-color-scheme: dark)');
  const forced = useMedia('(forced-colors: active)');
  const name = resolveThemeName(mode, prefersDark, forced);
  return { name, theme: THEMES[name] };
}
