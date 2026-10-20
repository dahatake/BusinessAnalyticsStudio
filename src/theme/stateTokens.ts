// FR-225（AC-523・AC-524）: Fluent 2 の状態色とコントラストの対応表。
// 状態（通常・ホバー・押下・選択・フォーカス・無効・成功・警告・エラー）ごとに、前景・背景・境界のトークンと、
// 色以外の手がかり（形・アイコン・文字。WCAG 2.2 の 1.4.1）を 1 か所で定義する。部品は直書きの色を使わず、ここのトークン名を参照する。
import { tokens } from '@fluentui/react-components';

export type UiState = 'rest' | 'hover' | 'pressed' | 'selected' | 'focus' | 'disabled' | 'success' | 'warning' | 'error';

export interface StateStyle {
  /** 前景（文字・アイコン）のトークン */
  fg: keyof typeof tokens;
  /** 背景のトークン */
  bg: keyof typeof tokens;
  /** 境界（UI 部品の輪郭・フォーカスの輪）のトークン */
  stroke: keyof typeof tokens;
  /** 色以外の手がかり: 記号（アイコンの代わりになる文字）と、状態を表す文字（読み上げ・凡例） */
  cue: { glyph: string; label: string; shape: 'plain' | 'underline' | 'thick-outline' | 'dashed' | 'filled-marker' };
}

export const STATE_STYLES: Record<UiState, StateStyle> = {
  rest: { fg: 'colorNeutralForeground1', bg: 'colorNeutralBackground1', stroke: 'colorNeutralStrokeAccessible', cue: { glyph: '', label: '通常', shape: 'plain' } },
  hover: { fg: 'colorNeutralForeground1Hover', bg: 'colorNeutralBackground1Hover', stroke: 'colorNeutralStrokeAccessibleHover', cue: { glyph: '', label: 'ホバー', shape: 'underline' } },
  pressed: { fg: 'colorNeutralForeground1Pressed', bg: 'colorNeutralBackground1Pressed', stroke: 'colorNeutralStrokeAccessiblePressed', cue: { glyph: '', label: '押下', shape: 'thick-outline' } },
  selected: { fg: 'colorNeutralForeground1Selected', bg: 'colorNeutralBackground1Selected', stroke: 'colorNeutralStrokeAccessibleSelected', cue: { glyph: '✓', label: '選択中', shape: 'filled-marker' } },
  focus: { fg: 'colorNeutralForeground1', bg: 'colorNeutralBackground1', stroke: 'colorStrokeFocus2', cue: { glyph: '', label: 'フォーカス', shape: 'thick-outline' } },
  disabled: { fg: 'colorNeutralForegroundDisabled', bg: 'colorNeutralBackgroundDisabled', stroke: 'colorNeutralStrokeDisabled', cue: { glyph: '', label: '無効', shape: 'dashed' } },
  success: { fg: 'colorStatusSuccessForeground1', bg: 'colorStatusSuccessBackground1', stroke: 'colorStatusSuccessBorder2', cue: { glyph: '✓', label: '成功', shape: 'filled-marker' } },
  warning: { fg: 'colorStatusWarningForeground1', bg: 'colorStatusWarningBackground1', stroke: 'colorStatusWarningBorder2', cue: { glyph: '!', label: '警告', shape: 'filled-marker' } },
  error: { fg: 'colorStatusDangerForeground1', bg: 'colorStatusDangerBackground1', stroke: 'colorStatusDangerBorder2', cue: { glyph: '×', label: 'エラー', shape: 'filled-marker' } },
};

/** 状態の前景・背景・境界を CSS の値（トークンの CSS 変数）で返す */
export function stateCss(state: UiState): { color: string; backgroundColor: string; borderColor: string } {
  const s = STATE_STYLES[state];
  return { color: tokens[s.fg], backgroundColor: tokens[s.bg], borderColor: tokens[s.stroke] };
}

/** コントラストの検証対象の組。kind: text=4.5:1、ui=3:1（境界・アイコン・フォーカス。WCAG 2.2 の 1.4.3・1.4.11） */
export interface ContrastPair { name: string; fg: string; bg: string; kind: 'text' | 'ui' }

/** 画面の主な面（見出し・左メニュー・設定・ステップ・減光・モーダル）の前景と背景の組（トークン名） */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { name: '本文', fg: 'colorNeutralForeground1', bg: 'colorNeutralBackground1', kind: 'text' },
  { name: '見出し（面 2）', fg: 'colorNeutralForeground1', bg: 'colorNeutralBackground2', kind: 'text' },
  { name: '補助の文字', fg: 'colorNeutralForeground2', bg: 'colorNeutralBackground1', kind: 'text' },
  { name: '左メニュー（面 3）', fg: 'colorNeutralForeground2', bg: 'colorNeutralBackground3', kind: 'text' },
  { name: '左メニュー（選択）', fg: 'colorNeutralForeground1Selected', bg: 'colorNeutralBackground1Selected', kind: 'text' },
  { name: '三次の文字', fg: 'colorNeutralForeground3', bg: 'colorNeutralBackground1', kind: 'text' },
  { name: 'ブランドの文字', fg: 'colorBrandForeground1', bg: 'colorNeutralBackground1', kind: 'text' },
  { name: 'リンク', fg: 'colorBrandForegroundLink', bg: 'colorNeutralBackground1', kind: 'text' },
  { name: 'ブランドの面の文字', fg: 'colorNeutralForegroundOnBrand', bg: 'colorBrandBackground', kind: 'text' },
  { name: '成功の文字', fg: 'colorStatusSuccessForeground1', bg: 'colorStatusSuccessBackground1', kind: 'text' },
  { name: '警告の文字', fg: 'colorStatusWarningForeground1', bg: 'colorStatusWarningBackground1', kind: 'text' },
  { name: 'エラーの文字', fg: 'colorStatusDangerForeground1', bg: 'colorStatusDangerBackground1', kind: 'text' },
  { name: 'リサイズつまみ（ホバー）', fg: 'colorNeutralStrokeAccessible', bg: 'colorNeutralBackground1', kind: 'ui' },
  { name: 'ペイン見出しの操作アイコン', fg: 'colorNeutralForegroundOnBrand', bg: 'colorBrandBackground', kind: 'ui' },
  { name: '設定モーダルの文字', fg: 'colorNeutralForeground1', bg: 'colorNeutralBackground1', kind: 'text' },
  { name: '入力欄の境界', fg: 'colorNeutralStrokeAccessible', bg: 'colorNeutralBackground1', kind: 'ui' },
  { name: 'フォーカスの輪', fg: 'colorStrokeFocus2', bg: 'colorNeutralBackground1', kind: 'ui' },
  { name: 'ブランドのアイコン', fg: 'colorBrandForeground1', bg: 'colorNeutralBackground1', kind: 'ui' },
  { name: '成功の境界', fg: 'colorStatusSuccessBorder2', bg: 'colorStatusSuccessBackground1', kind: 'ui' },
  { name: '警告の境界', fg: 'colorStatusWarningBorder2', bg: 'colorStatusWarningBackground1', kind: 'ui' },
  { name: 'エラーの境界', fg: 'colorStatusDangerBorder2', bg: 'colorStatusDangerBackground1', kind: 'ui' },
];
