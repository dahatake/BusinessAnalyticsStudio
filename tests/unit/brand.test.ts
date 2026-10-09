// ブランドランプの生成、コントラストの検証と補正、フォントの順（FR-059 / FR-060 / FR-061 / FR-062 / FR-064）の単体テスト。
import { describe, expect, it } from 'vitest';
import {
  MIN_CONTRAST_TEXT, MIN_CONTRAST_UI, RAMP_STEPS, contrastRatio, ensureContrast, generateRamp, hexToRgb, isHexColor, rgbToHsl,
} from '../../src/theme/brand';
import { buildBrandTheme, fontStack } from '../../src/theme/brandTheme';
import { applyOverrides } from '../../src/theme/useBrand';
import { canShowLogo, coCreationLabel, LOGO_PLACEHOLDER_TEXT } from '../../src/components/Brand';
import { BrandProfileSchema } from '../../src/schema';
import fs from 'node:fs';
import path from 'node:path';

const PRIMARIES = ['#5B2A86', '#1F7A5C', '#FFD400', '#00B7C3', '#FFFFFF', '#000000', '#808080'];

describe('FR-059 ブランドランプ', () => {
  // FR-059 AC-072
  it.each(PRIMARIES)('AC-072 %s から 16 段階が明度順に生成され、Primary 色そのものを含む', (hex) => {
    const ramp = generateRamp(hex);
    expect(ramp).toHaveLength(RAMP_STEPS);
    expect(ramp.map((r) => r.step)).toEqual(Array.from({ length: 16 }, (_, i) => (i + 1) * 10));
    expect(ramp.filter((r) => r.primary)).toHaveLength(1);
    expect(ramp.find((r) => r.primary)!.color).toBe(hex.toUpperCase());
    const ls = ramp.map((r) => rgbToHsl(hexToRgb(r.color))[2]);
    for (let i = 1; i < ls.length; i++) expect(ls[i]! + 0.01).toBeGreaterThanOrEqual(ls[i - 1]!);
  });

  // FR-059 AC-073（Light / Dark のテーマへの適用。実効色は補正後の色）
  it.each(['light', 'dark'] as const)('AC-073 %s のテーマの主要なボタンの色が実効色（補正が要らなければ Primary 色そのもの）になる', (mode) => {
    const ok = buildBrandTheme(mode, '#5B2A86');
    expect(ok.effectivePrimary).toBe('#5B2A86');
    expect(ok.theme.colorBrandBackground).toBe('#5B2A86');
    const light = buildBrandTheme(mode, '#FFD400');
    expect(light.effectivePrimary).not.toBe('#FFD400');
    expect(light.theme.colorBrandBackground).toBe(light.effectivePrimary);
    expect(contrastRatio(light.effectivePrimary, light.theme.colorNeutralForegroundOnBrand)).toBeGreaterThanOrEqual(MIN_CONTRAST_TEXT);
  });
});

describe('FR-060 コントラストの補正', () => {
  // FR-060 AC-074
  it('AC-074 比が 4.5 未満の色は、4.5 以上になるまで明度を補正し、補正を記録する（色相は保つ）', () => {
    const r = ensureContrast('#FFD400', '#FFFFFF', MIN_CONTRAST_TEXT);
    expect(r.corrected).toBe(true);
    expect(r.original).toBe('#FFD400');
    expect(r.ratio).toBeGreaterThanOrEqual(MIN_CONTRAST_TEXT);
    expect(contrastRatio(r.color, '#FFFFFF')).toBeGreaterThanOrEqual(MIN_CONTRAST_TEXT);
    const dh = Math.abs(rgbToHsl(hexToRgb(r.color))[0] - rgbToHsl(hexToRgb('#FFD400'))[0]);
    expect(dh).toBeLessThan(12);
  });

  // FR-060 AC-074
  it('AC-074 暗い背景では明るい方へ補正する。満たす色は補正しない', () => {
    const r = ensureContrast('#222222', '#000000', MIN_CONTRAST_TEXT);
    expect(r.corrected).toBe(true);
    expect(r.ratio).toBeGreaterThanOrEqual(MIN_CONTRAST_TEXT);
    const ok = ensureContrast('#5B2A86', '#FFFFFF');
    expect(ok.corrected).toBe(false);
    expect(ok.color).toBe('#5B2A86');
  });

  // FR-060 AC-074（UI 部品は 3.0）
  it('AC-074 UI 部品の基準は 3.0', () => {
    const r = ensureContrast('#CCCCCC', '#FFFFFF', MIN_CONTRAST_UI);
    expect(r.corrected).toBe(true);
    expect(r.ratio).toBeGreaterThanOrEqual(3);
  });

  // FR-060 AC-074（どの Primary でもテーマの色が基準を満たす）
  it.each(PRIMARIES)('AC-074 %s でも Light / Dark のボタンとリンクの色が AA を満たす', (hex) => {
    for (const mode of ['light', 'dark'] as const) {
      const { theme } = buildBrandTheme(mode, hex);
      expect(contrastRatio(theme.colorBrandBackground, theme.colorNeutralForegroundOnBrand)).toBeGreaterThanOrEqual(MIN_CONTRAST_TEXT);
      expect(contrastRatio(theme.colorBrandForegroundLink, theme.colorNeutralBackground1)).toBeGreaterThanOrEqual(MIN_CONTRAST_TEXT);
    }
  });
});

describe('FR-061 ロゴの利用条件', () => {
  const base = { source: 's', retrievedAt: '2026-10-09', confidence: '高' as const };
  // FR-061 AC-076
  it('AC-076 確認済みのローカルファイルだけ表示し、不明・外部 URL はプレースホルダー', () => {
    expect(canShowLogo({ ...base, status: 'confirmed', path: '/assets/brand/logo.svg' })).toBe(true);
    expect(canShowLogo({ ...base, status: 'unknown', path: '/assets/brand/logo.svg' })).toBe(false);
    expect(canShowLogo({ ...base, status: 'confirmed' })).toBe(false);
    expect(canShowLogo({ ...base, status: 'confirmed', path: 'https://example.com/logo.png' })).toBe(false);
    expect(canShowLogo({ ...base, status: 'confirmed', path: '//example.com/logo.png' })).toBe(false);
    expect(LOGO_PLACEHOLDER_TEXT).toBe('LOGO（要許諾確認）');
    expect(coCreationLabel('ミズホ精機')).toBe('ミズホ精機 × Microsoft');
  });
});

describe('FR-062 フォント', () => {
  // FR-062 AC-077
  it('AC-077 ブランド書体 → Segoe UI Variable → Noto Sans JP の順', () => {
    const list = fontStack('Zen Kaku Gothic New').split(',').map((s) => s.trim().replaceAll('"', ''));
    expect(list.slice(0, 3)).toEqual(['Zen Kaku Gothic New', 'Segoe UI Variable', 'Noto Sans JP']);
    expect(fontStack(undefined).startsWith('"Segoe UI Variable"')).toBe(true);
    expect(buildBrandTheme('light', '#5B2A86', 'Zen Kaku Gothic New').theme.fontFamilyBase).toContain('"Zen Kaku Gothic New", "Segoe UI Variable", "Noto Sans JP"');
  });
});

describe('FR-064 ブランドの上書き', () => {
  // FR-064 AC-079
  it('AC-079 Primary 色だけを上書きし、色の形式を検査する', () => {
    const dir = path.resolve(__dirname, '../../examples/mono/public/brand/brand-profile.json');
    const brand = BrandProfileSchema.parse(JSON.parse(fs.readFileSync(dir, 'utf8')));
    const o = applyOverrides(brand, '#2E7D32');
    expect(o.colors.primary).toBe('#2E7D32');
    expect(o.fonts).toEqual(brand.fonts);
    expect(applyOverrides(brand, null)).toBe(brand);
    expect(isHexColor('#2E7D32')).toBe(true);
    expect(isHexColor('みどり')).toBe(false);
    expect(isHexColor('#12345')).toBe(false);
  });

  // FR-064 AC-079（お手本パックのブランドは出典・確認日・確度を持ち、確度が低い値がある）
  it('AC-079 お手本パックのブランドの値は出典・確認日・確度を持ち、確度の低い値がある', () => {
    for (const kind of ['mono', 'koto']) {
      const f = path.resolve(__dirname, `../../examples/${kind}/public/brand/brand-profile.json`);
      const b = BrandProfileSchema.parse(JSON.parse(fs.readFileSync(f, 'utf8')));
      expect([b.colors, b.logo, b.fonts, b.tone].every((v) => v.source && v.retrievedAt && v.confidence)).toBe(true);
      expect([b.colors, b.logo, b.fonts, b.tone].some((v) => v.confidence === '低' || v.confidence === '推定')).toBe(true);
    }
  });
});
