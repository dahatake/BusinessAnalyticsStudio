// ブランドランプの生成とコントラストの検証・補正（FR-059、FR-060）。
// 純粋な関数だけで構成する（画面や状態に依存しない）。値の根拠は要求定義書の PARAM-017（16 段階）、PARAM-018（本文 4.5）、PARAM-019（大きな文字・UI 部品 3.0）。

/** ブランドランプの段階数（PARAM-017） */
export const RAMP_STEPS = 16;
/** 本文のコントラスト比の下限（PARAM-018、WCAG 2.2 AA） */
export const MIN_CONTRAST_TEXT = 4.5;
/** 大きな文字と UI 部品のコントラスト比の下限（PARAM-019、WCAG 2.2 AA） */
export const MIN_CONTRAST_UI = 3;
/** Primary 色を置くランプの段（Fluent の BrandVariants の 80。Light の主要なボタンの色にあたる） */
export const PRIMARY_STEP = 80;

export type Rgb = [number, number, number];

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHexColor = (v: string): boolean => HEX.test(v);

export function hexToRgb(hex: string): Rgb {
  if (!isHexColor(hex)) throw new Error(`色は #RRGGBB で指定してください: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

export function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** 任意の CSS の `rgb(...)` / `#RRGGBB` を Rgb にする（Fluent のトークンは #RRGGBB） */
export function parseColor(v: string): Rgb {
  if (isHexColor(v)) return hexToRgb(v);
  const m = v.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) throw new Error(`色を読めません: ${v}`);
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

/** 相対輝度（WCAG 2.x） */
export function luminance([r, g, b]: Rgb): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = luminance(typeof a === 'string' ? parseColor(a) : a);
  const lb = luminance(typeof b === 'string' ? parseColor(b) : b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type Hsl = [number, number, number]; // h: 0-360, s/l: 0-1

export function rgbToHsl([r, g, b]: Rgb): Hsl {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

export function hslToRgb([h, s, l]: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export interface RampStep {
  /** Fluent の BrandVariants のキー（10, 20, … 160）。小さいほど暗い */
  step: number;
  color: string;
  /** Primary 色そのもの */
  primary: boolean;
}

/**
 * Primary 色から 16 段階のブランドランプを作る（FR-059）。明度の順に並び、{@link PRIMARY_STEP} の段が Primary 色そのもの。
 * 色相と彩度は保ち、明度だけを段ごとに変える。
 */
export function generateRamp(primaryHex: string): RampStep[] {
  const [h, s, lp] = rgbToHsl(hexToRgb(primaryHex));
  const idx = PRIMARY_STEP / 10 - 1; // 0 始まりの位置
  const dark = Math.min(0.06, lp);
  const light = Math.max(0.96, lp);
  return Array.from({ length: RAMP_STEPS }, (_, i) => {
    const step = (i + 1) * 10;
    if (i === idx) return { step, color: primaryHex.toUpperCase(), primary: true };
    const l = i < idx ? dark + ((lp - dark) * i) / idx : lp + ((light - lp) * (i - idx)) / (RAMP_STEPS - 1 - idx);
    return { step, color: rgbToHex(hslToRgb([h, s, l])), primary: false };
  });
}

/** Fluent の `createLightTheme` / `createDarkTheme` に渡す BrandVariants（10〜160） */
export function rampToBrandVariants(ramp: readonly RampStep[]): Record<number, string> {
  return Object.fromEntries(ramp.map((r) => [r.step, r.color]));
}

export interface ContrastResult {
  /** 補正後の色（補正が要らなければ入力のまま） */
  color: string;
  /** 補正した（明度を変えた）か。補正したことの記録 */
  corrected: boolean;
  original: string;
  ratio: number;
  required: number;
}

/**
 * 背景との比が required 未満の色を、色相と彩度を保ったまま明度だけ動かして、required 以上にする（FR-060）。
 * 背景が明るいときは暗く、暗いときは明るく動かす。
 */
export function ensureContrast(color: string, background: string, required: number = MIN_CONTRAST_TEXT): ContrastResult {
  const original = color.toUpperCase();
  const ratio0 = contrastRatio(color, background);
  if (ratio0 >= required) return { color: original, corrected: false, original, ratio: ratio0, required };
  const [h, s, l0] = rgbToHsl(parseColor(color));
  const bgDark = luminance(parseColor(background)) < 0.18;
  const dir = bgDark ? 1 : -1;
  let best: string | undefined;
  for (let i = 1; i <= 200; i++) {
    const l = l0 + (dir * i) / 200;
    if (l < 0 || l > 1) break;
    const hex = rgbToHex(hslToRgb([h, s, l]));
    if (contrastRatio(hex, background) >= required) { best = hex; break; }
  }
  // 彩度が高く明度だけでは足りないときは、彩度も落とす（最終手段）
  if (!best) {
    for (let i = 0; i <= 100 && !best; i++) {
      const hex = rgbToHex(hslToRgb([h, Math.max(0, s - i / 100), dir > 0 ? 1 : 0]));
      if (contrastRatio(hex, background) >= required) best = hex;
    }
  }
  const out = best ?? (dir > 0 ? '#FFFFFF' : '#000000');
  return { color: out, corrected: true, original, ratio: contrastRatio(out, background), required };
}
