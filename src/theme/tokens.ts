// デザイン基盤: 値を直書きせず、Fluent 2 のトークンから取る（FR-058）。
// 余白は 4px グリッド（spacing トークンは 4px の倍数）。以降の項目は、この体系だけを使う。
import { tokens } from '@fluentui/react-components';

export { tokens };

/** 4px グリッドの余白。`gap(2)` は 8px */
export const GRID_PX = 4;
export const gap = (units: number): string => `${units * GRID_PX}px`;

/** 画面の幅の区切り（これより狭いとナビゲーションを横並びに組み替える） */
export const BREAKPOINT_NARROW_PX = 720;

/** 操作できる要素の最小の大きさ（WCAG 2.2 の 2.5.8 Target Size。24px 以上） */
export const MIN_TARGET_PX = 32;
