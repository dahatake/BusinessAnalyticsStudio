// テーマの決定の単体テスト
import { describe, expect, it } from 'vitest';
import { THEMES, resolveThemeName } from '../../src/theme/resolve';

describe('FR-058 Fluent 2 準拠のテーマ', () => {
  // FR-058 AC-071
  it('FR-058 AC-071 Light と Dark の選択でテーマの背景と文字の色が変わる', () => {
    expect(THEMES[resolveThemeName('light', true, false)].colorNeutralBackground1)
      .not.toBe(THEMES[resolveThemeName('dark', false, false)].colorNeutralBackground1);
    expect(THEMES.light.colorNeutralForeground1).not.toBe(THEMES.dark.colorNeutralForeground1);
  });

  // FR-058 AC-071
  it('FR-058 AC-071 システムの選択は OS のダーク設定に従い、強制カラー（ハイコントラスト）は選択に優先する', () => {
    expect(resolveThemeName('system', true, false)).toBe('dark');
    expect(resolveThemeName('system', false, false)).toBe('light');
    expect(resolveThemeName('light', false, true)).toBe('high-contrast');
    expect(resolveThemeName('dark', true, true)).toBe('high-contrast');
  });
});
