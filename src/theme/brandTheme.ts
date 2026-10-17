// ブランドのテーマ（FR-059、FR-060、FR-062）。ブランドランプから Fluent の Light / Dark のテーマを作り、
// コントラストが足りない色は明度を補正する。補正は記録して、設定パネルに出せるようにする。
import { createDarkTheme, createLightTheme, type BrandVariants, type Theme } from '@fluentui/react-components';
import {
  MIN_CONTRAST_TEXT, MIN_CONTRAST_UI, ensureContrast, generateRamp, rampToBrandVariants,
  type ContrastResult, type RampStep,
} from './brand';

/** フォントの順: ブランド書体 → Segoe UI Variable → Noto Sans JP（FR-062）。 */
export function fontStack(brandFont: string | undefined): string {
  const list = [brandFont, 'Segoe UI Variable', 'Noto Sans JP'].filter((f): f is string => !!f && f.trim() !== '');
  return [...list.map((f) => `"${f.replaceAll('"', '')}"`), 'sans-serif'].join(', ');
}

export interface BrandTheme {
  theme: Theme;
  ramp: RampStep[];
  /** 主要なボタンとアクセントの実効色（Primary 色を、白い文字との比が 4.5 以上になるよう補正したもの） */
  effectivePrimary: string;
  /** 補正した色の記録（補正が起きなかった色は含まない） */
  corrections: ContrastResult[];
}

type TokenKey = keyof Theme;

/** 背景に使うブランドの色（文字は colorNeutralForegroundOnBrand）。値はランプの段 */
const BG_TOKENS: Array<[TokenKey, number | 'primary']> = [
  ['colorBrandBackground', 'primary'],
  ['colorBrandBackgroundHover', 70],
  ['colorBrandBackgroundPressed', 60],
  ['colorBrandBackgroundSelected', 60],
  ['colorCompoundBrandBackground', 'primary'],
  ['colorCompoundBrandBackgroundHover', 70],
  ['colorCompoundBrandBackgroundPressed', 60],
];
/** 背景の上に文字として使うブランドの色（背景は colorNeutralBackground1） */
const FG_TOKENS: TokenKey[] = [
  'colorBrandForeground1', 'colorBrandForeground2', 'colorBrandForegroundLink', 'colorBrandForegroundLinkHover',
  'colorBrandForegroundLinkPressed', 'colorBrandForegroundLinkSelected', 'colorCompoundBrandForeground1',
  'colorCompoundBrandForeground1Hover', 'colorCompoundBrandForeground1Pressed',
  // ボタン・メニューのアイコンの色（ホバー・押下・選択中。NFR-UX-016 AC-477: アイコンは隣の色と 3:1 以上。文字にも使うので 4.5 にそろえる）
  'colorNeutralForeground2BrandHover', 'colorNeutralForeground2BrandPressed', 'colorNeutralForeground2BrandSelected',
  'colorNeutralForeground3BrandHover', 'colorNeutralForeground3BrandPressed', 'colorNeutralForeground3BrandSelected',
];
/** 文字・アイコンの色が載る面（既定の面と、ホバー・押下の面）。どの面の上でも比を満たす */
const FG_BACKGROUNDS: TokenKey[] = [
  'colorNeutralBackground1', 'colorNeutralBackground1Hover', 'colorNeutralBackground1Pressed',
  'colorSubtleBackgroundHover', 'colorSubtleBackgroundPressed',
];
/** 枠線など UI 部品の色（3.0 以上） */
const STROKE_TOKENS: TokenKey[] = ['colorBrandStroke1', 'colorCompoundBrandStroke', 'colorCompoundBrandStrokeHover', 'colorCompoundBrandStrokePressed'];

export function buildBrandTheme(mode: 'light' | 'dark', primaryHex: string, brandFont?: string): BrandTheme {
  const ramp = generateRamp(primaryHex);
  const variants = rampToBrandVariants(ramp) as unknown as BrandVariants;
  const base = mode === 'dark' ? createDarkTheme(variants) : createLightTheme(variants);
  const theme = { ...base } as unknown as Record<string, string>;
  const corrections: ContrastResult[] = [];
  const byStep = new Map(ramp.map((r) => [r.step, r.color]));
  const onBrand = theme.colorNeutralForegroundOnBrand!;
  const bg1 = theme.colorNeutralBackground1!;
  const record = (r: ContrastResult) => { if (r.corrected) corrections.push(r); return r.color; };

  let effectivePrimary = primaryHex.toUpperCase();
  for (const [key, from] of BG_TOKENS) {
    const color = from === 'primary' ? primaryHex : byStep.get(from)!;
    const r = ensureContrast(color, onBrand, MIN_CONTRAST_TEXT);
    theme[key] = record(r);
    if (key === 'colorBrandBackground') effectivePrimary = r.color;
  }
  for (const key of FG_TOKENS) {
    const original = theme[key]!;
    let color = original;
    for (const bg of FG_BACKGROUNDS) color = ensureContrast(color, theme[bg] ?? bg1, MIN_CONTRAST_TEXT).color;
    const worst = Math.min(...FG_BACKGROUNDS.map((bg) => ensureContrast(color, theme[bg] ?? bg1, MIN_CONTRAST_TEXT).ratio));
    theme[key] = record({ color, corrected: color !== original.toUpperCase(), original: original.toUpperCase(), ratio: worst, required: MIN_CONTRAST_TEXT });
  }
  for (const key of STROKE_TOKENS) theme[key] = record(ensureContrast(theme[key]!, bg1, MIN_CONTRAST_UI));
  theme.fontFamilyBase = fontStack(brandFont);
  // 色の切替（上書き・テーマ）で、ボタンの背景が途中の色（遷移中）で止まって見えないよう、短い遷移を即時にする
  theme.durationFaster = '0ms';
  theme.durationUltraFast = '0ms';
  return { theme: theme as unknown as Theme, ramp, effectivePrimary, corrections };
}
