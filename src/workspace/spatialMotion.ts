// 空間的な遷移（モード・タスクワークスペース・ゾーンの切替、Snap）の動きの定数（FR-300・NFR-UX-017）。
// 所要時間とイージングは Fluent 2 のモーションのトークン（durationSlow = 300ms、curveDecelerateMid）に合わせる。
// 動きの軽減（prefers-reduced-motion）・アニメーション停止中は、動きを付けずに最終の配置を示す（FR-071。呼び出し側が判断する）。
export const SPATIAL_MOTION_MS = 300;
export const SPATIAL_MOTION_EASING = 'cubic-bezier(0.1, 0.9, 0.2, 1)';
/** 切替の直前に、いまの位置・大きさを記録させる通知（作業領域が受ける） */
export const FLIP_PREPARE_EVENT = 'eabk:flip-prepare';
