import { useEffect, type ReactNode } from 'react';
import { FluentProvider } from '@fluentui/react-components';
import { useSettings } from '../store/settings';
import { useResolvedTheme } from './resolve';

/** アプリ全体のテーマ。`data-theme` に解決後のテーマ名を付ける（Light / Dark / ハイコントラスト）。 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const mode = useSettings((s) => s.themeMode);
  const { name, theme } = useResolvedTheme(mode);

  // ページの余白（body）もテーマの色にそろえる
  useEffect(() => {
    document.body.style.backgroundColor = theme.colorNeutralBackground1;
    document.body.style.color = theme.colorNeutralForeground1;
    document.body.style.margin = '0';
    document.documentElement.dataset.theme = name;
  }, [theme, name]);

  return (
    <FluentProvider theme={theme} data-theme={name} style={{ minHeight: '100vh' }}>
      {children}
    </FluentProvider>
  );
}
