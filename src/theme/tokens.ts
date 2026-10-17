// デザイン基盤（FR-058・NFR-UX-007・NFR-UX-015〜017・NFR-A11Y-009）: Fluent 2 のデザイントークンの定義と、役割ごとの対応付け。
// 色・文字・余白・角丸・線の太さ・影・動きは、ここ（とテーマ）だけで定義し、画面と部品はトークンを参照する（AC-475・AC-479）。
// 値の出典は Fluent 2（SRC-024 の Typography・Layout・Shapes・Elevation・Motion）と Fluent UI React v9 のトークン。
import { tokens, typographyStyles, type Theme } from '@fluentui/react-components';

export { tokens, typographyStyles };

/** Fluent 2 の余白の段（px）。4px を基本単位とし、2・6・10 を含む（NFR-UX-015。spacingHorizontal/Vertical の None〜XXXL） */
export const SPACING_RAMP_PX = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32] as const;

/** Fluent 2 の角丸の段（px。None・Small・Medium・Large・X-Large）と Circle（50%） */
export const RADIUS_RAMP_PX = [0, 2, 4, 8, 12] as const;

/** Fluent 2 の Web の文字の段（Caption 2〜Display）。[名前, 文字の大きさ px, 行の高さ px] */
export const TYPE_RAMP = [
  ['caption2', 10, 14],
  ['caption1', 12, 16],
  ['body1', 14, 20],
  ['body2', 16, 22],
  ['subtitle1', 20, 28],
  ['title3', 24, 32],
  ['title2', 28, 36],
  ['title1', 32, 40],
  ['largeTitle', 40, 52],
  ['display', 68, 92],
] as const;

/** 影の段（Fluent 2 のエレベーション）と、それを使う役割（NFR-UX-015。同じ役割の部品は同じ段） */
export type ElevationLevel = 4 | 8 | 16 | 28 | 64;
export type ElevationRole = 'card' | 'menu' | 'tooltip' | 'callout' | 'hoverCard' | 'nav' | 'sheet' | 'dialog' | 'panel';
export const ELEVATION_LEVEL: Record<ElevationRole, ElevationLevel> = {
  card: 4,
  menu: 8,
  tooltip: 8,
  callout: 16,
  hoverCard: 16,
  nav: 28,
  sheet: 28,
  dialog: 64,
  panel: 64,
};
const SHADOW_TOKEN: Record<ElevationLevel, string> = {
  4: tokens.shadow4,
  8: tokens.shadow8,
  16: tokens.shadow16,
  28: tokens.shadow28,
  64: tokens.shadow64,
};

/** 役割の影（トークンの参照） */
export function shadowOf(role: ElevationRole): string {
  return SHADOW_TOKEN[ELEVATION_LEVEL[role]];
}

/**
 * 役割のエレベーションの makeStyles 用の指定。ハイコントラスト（forced-colors）ではブラウザーが影を描かないため、
 * 影の代わりにシステムの文字色の境界線（線の太さは Thin のトークン）で面の境界を表す（AC-476）。
 */
export function elevationStyles(role: ElevationRole) {
  return {
    boxShadow: shadowOf(role),
    '@media (forced-colors: active)': {
      boxShadow: 'none',
      outlineWidth: tokens.strokeWidthThin,
      outlineStyle: 'solid',
      outlineColor: 'CanvasText',
      outlineOffset: `calc(-1 * ${tokens.strokeWidthThin})`,
    },
  } as const;
}

/** モーション（NFR-UX-017）。出入り・エレベーション・コンテナーの変形の所要時間の上限 {PARAM-074}（ms） */
export const MOTION_MAX_MS = 500;

/** 役割ごとの動き（所要時間とイージングのトークン） */
export const MOTION = {
  /** 画面（最上位の行き先）の切替: フェード */
  screenFade: { duration: tokens.durationNormal, easing: tokens.curveDecelerateMid },
  /** 出る（現れる）動き */
  enter: { duration: tokens.durationNormal, easing: tokens.curveDecelerateMid },
  /** 去る動き */
  exit: { duration: tokens.durationFast, easing: tokens.curveAccelerateMid },
  /** 押下・ドラッグでのエレベーションの変化 */
  elevation: { duration: tokens.durationFaster, easing: tokens.curveEasyEase },
  /** コンテナーの変形（カードから詳細への展開・最小化・移動） */
  container: { duration: tokens.durationNormal, easing: tokens.curveDecelerateMid },
  /** 回転（一定の速さが要る動きだけ。等速） */
  rotate: { easing: tokens.curveLinear },
} as const;

/** Fluent 2 の角丸の段の値（SRC-024 Shapes）。Fluent UI React v9 の既定（Large 6・X-Large 8）を Fluent 2 の段（Large 8・X-Large 12）に合わせる */
export const FLUENT2_RADIUS = {
  borderRadiusNone: '0',
  borderRadiusSmall: '2px',
  borderRadiusMedium: '4px',
  borderRadiusLarge: '8px',
  borderRadiusXLarge: '12px',
} as const;

/**
 * デザイン基盤のテーマの調整（NFR-UX-015）。角丸を Fluent 2 の段にそろえ、丸い端の部品（バッジ・切替・つまみ）の角丸
 * （Circular）を X-Large の段で表す（高さ 24px 以下の部品では丸い端として描かれる）。
 */
export function withDesignFoundation(theme: Theme): Theme {
  const out = { ...theme, ...FLUENT2_RADIUS, borderRadiusCircular: FLUENT2_RADIUS.borderRadiusXLarge } as Record<string, unknown>;
  // Fluent 2 の段は X-Large（12px）まで。それより大きい段（2XLarge 以上）も X-Large にそろえる
  for (const k of Object.keys(out)) if (/^borderRadius\dXLarge$/.test(k)) out[k] = FLUENT2_RADIUS.borderRadiusXLarge;
  return out as unknown as Theme;
}

/**
 * ハイコントラスト（forced-colors）のテーマ（NFR-UX-016 AC-477）。色のトークンを OS のシステム色に置き換える。
 * 強制カラーでは、ブラウザーが文字・背景をシステム色で描くが、アイコンの fill="currentColor" は強制される前の色で解決される。
 * トークンの値をシステム色にしておくと、アイコンも周りの文字と同じシステム色で描かれる（背景と同じ色になって消えない）。
 */
export function forcedColorsTheme(theme: Theme): Theme {
  const out = { ...theme } as Record<string, unknown>;
  for (const [k, v] of Object.entries(theme)) {
    if (!k.startsWith('color') || typeof v !== 'string' || v === 'transparent' || /Shadow/.test(k)) continue;
    if (/Background/.test(k)) out[k] = /Inverted/.test(k) ? 'CanvasText' : 'Canvas';
    else if (/Disabled/.test(k)) out[k] = 'GrayText';
    else if (/Link/.test(k)) out[k] = 'LinkText';
    else if (/Foreground|Stroke|Border/.test(k)) out[k] = /Inverted/.test(k) ? 'Canvas' : 'CanvasText';
  }
  return out as unknown as Theme;
}

/** Fluent 2 の Web の文字の段のトークン（大きさと行の高さの組）。部品は文字の大きさをこの組で指定する */
export const TEXT = {
  caption2: { fontSize: tokens.fontSizeBase100, lineHeight: tokens.lineHeightBase100 },
  caption1: { fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200 },
  body1: { fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300 },
  body2: { fontSize: tokens.fontSizeBase400, lineHeight: tokens.lineHeightBase400 },
  subtitle1: { fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500 },
  title3: { fontSize: tokens.fontSizeBase600, lineHeight: tokens.lineHeightBase600 },
  title2: { fontSize: tokens.fontSizeHero700, lineHeight: tokens.lineHeightHero700 },
  title1: { fontSize: tokens.fontSizeHero800, lineHeight: tokens.lineHeightHero800 },
  largeTitle: { fontSize: tokens.fontSizeHero900, lineHeight: tokens.lineHeightHero900 },
  display: { fontSize: tokens.fontSizeHero1000, lineHeight: tokens.lineHeightHero1000 },
} as const;

/**
 * テーマのトークンを CSS 変数として文書の根（:root）にも書き出す。
 * ポータル・body・画面遷移の擬似要素（::view-transition-*）のように FluentProvider の外にある面も、同じトークンを参照できる。
 */
export function writeThemeVariables(theme: Theme, el: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(theme)) {
    if (typeof v === 'string' || typeof v === 'number') el.style.setProperty(`--${k}`, String(v));
  }
}

/** 計算済みの値が Fluent 2 の文字の段か（拡大・縮小の面の外の文字の判定に使う） */
export function isTypeRamp(fontSizePx: number, lineHeightPx: number): boolean {
  return TYPE_RAMP.some(([, f, l]) => Math.abs(f - fontSizePx) <= 0.5 && Math.abs(l - lineHeightPx) <= 0.5);
}

/** 余白の px が Fluent 2 の余白の段か */
export function isSpacingRamp(px: number): boolean {
  return (SPACING_RAMP_PX as readonly number[]).includes(px);
}

/** 画面の幅の区切り（これより狭いとナビゲーションを横並びに組み替える） */
export const BREAKPOINT_NARROW_PX = 720;

/** 操作できる要素の最小の大きさ（WCAG 2.2 の 2.5.8 Target Size。PARAM-040 は 24px。部品はこれ以上にする） */
export const MIN_TARGET_PX = 24;