// 3D の図（drei の Html）に重ねる DOM のラベルの見た目（NFR-UX-015・NFR-UX-016）。色・文字・余白・角丸・線はデザイントークンで指定する。
// 3D シーンの材質・光源の色は対象外（A-51）。ラベルは DOM の文字なので、トークンを使う。
import type { CSSProperties } from 'react';
import { TEXT, tokens } from '../theme/tokens';

/** 3D の上の小さなラベル（反転色の面に文字。シーンの色に左右されずに読める） */
export const sceneLabelStyle: CSSProperties = {
  color: tokens.colorNeutralForegroundInverted,
  backgroundColor: tokens.colorNeutralBackgroundInverted,
  border: `${tokens.strokeWidthThin} solid ${tokens.colorTransparentStroke}`,
  padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
  borderRadius: tokens.borderRadiusMedium,
  ...TEXT.caption1,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
};

/** 3D の上のカード（データビュアーの塊・エンティティ。押せる） */
export const sceneCardStyle: CSSProperties = {
  backgroundColor: tokens.colorNeutralBackground1,
  color: tokens.colorNeutralForeground1,
  border: `${tokens.strokeWidthThick} solid ${tokens.colorNeutralStrokeAccessible}`,
  borderRadius: tokens.borderRadiusLarge,
  padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
  minWidth: 110,
  maxWidth: 200,
  ...TEXT.caption1,
  textAlign: 'left',
  cursor: 'pointer',
  boxSizing: 'border-box',
};

/** 選択中のカード（ブランドの色の境界線は選択中の表示だけに使う。NFR-UX-016） */
export const sceneCardSelectedStyle: CSSProperties = {
  ...sceneCardStyle,
  border: `${tokens.strokeWidthThicker} solid ${tokens.colorBrandStroke1}`,
};

/** 関係の線のラベル */
export const sceneRelationLabelStyle: CSSProperties = {
  backgroundColor: tokens.colorNeutralBackground1,
  color: tokens.colorNeutralForeground1,
  border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStrokeAccessible}`,
  borderRadius: tokens.borderRadiusMedium,
  padding: `0 ${tokens.spacingHorizontalXS}`,
  ...TEXT.caption1,
};
