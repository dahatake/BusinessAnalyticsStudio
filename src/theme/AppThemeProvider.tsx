import { useEffect, useMemo, type ReactNode } from 'react';
import { FluentProvider } from '@fluentui/react-components';
import { useSettings } from '../store/settings';
import { useResolvedTheme } from './resolve';
import { useEffectiveBrand } from './useBrand';
import { buildBrandTheme } from './brandTheme';
import { forcedColorsTheme, withDesignFoundation, writeThemeVariables } from './tokens';

/** アプリ全体のテーマ。`data-theme` に解決後のテーマ名を付ける（Light / Dark / ハイコントラスト）。
 *  顧客パックが読めていれば、ブランドランプを Light / Dark のテーマに適用する（FR-059）。ハイコントラストは OS の色（システム色のトークン）に任せる。 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const mode = useSettings((s) => s.themeMode);
  const { name, theme: baseTheme } = useResolvedTheme(mode);
  const brand = useEffectiveBrand();
  const primary = brand?.colors.primary;
  const font = brand?.fonts.primary;
  const theme = useMemo(
    () => withDesignFoundation(name === 'high-contrast' ? forcedColorsTheme(baseTheme) : primary ? buildBrandTheme(name, primary, font).theme : baseTheme),
    [primary, font, name, baseTheme],
  );

  // ページの余白（body）もテーマの色にそろえ、トークンを文書の根にも書き出す（ポータル・画面遷移の擬似要素から参照する）
  useEffect(() => {
    writeThemeVariables(theme);
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