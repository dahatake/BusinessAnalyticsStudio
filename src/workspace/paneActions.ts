// コンポーネントの見出しの操作の定義（NFR-UX-018 AC-482）。同じ意味の操作は、すべての画面・コンポーネントで
// この 1 つの定義（Fluent のシステムアイコンと名前）を使う。オンの状態を持つ操作は、オンで Filled、オフで Regular の種類を返す。
// 操作のアイコンは 20px（Fluent 2 のアイコンの段。12px は情報の表示だけに使い、操作の対象にしない）。
import {
  ArrowMinimize20Filled, ArrowMinimize20Regular, EyeOff20Filled, Glasses20Filled, Glasses20Regular, EyeOff20Regular, FullScreenMaximize20Filled, FullScreenMaximize20Regular,
  Pin20Filled, Pin20Regular, TabDesktop20Filled, TabDesktop20Regular, TabDesktopMultiple20Filled, TabDesktopMultiple20Regular,
  Table20Filled, Table20Regular, type FluentIcon,
} from '@fluentui/react-icons';

/** PARAM-073: 見出しに常に表示する操作のボタンの上限（「その他の操作」を開くボタンは数えない） */
export const HEADER_ACTION_LIMIT = 6;
/** 操作のボタンのアイコンの大きさ（CSS px）。12px より大きい（NFR-UX-018） */
export const ACTION_ICON_PX = 20;

export type PaneActionId = 'pin' | 'maximize' | 'minimize' | 'tabs' | 'untab' | 'hide' | 'tableView' | 'view';

export interface PaneActionDef {
  id: PaneActionId;
  /** オフ（既定）の状態の名前（ツールチップと支援技術の名前） */
  label: string;
  /** オンの状態の名前。オンの状態を持たない操作は持たない */
  onLabel?: string;
  regular: FluentIcon;
  filled: FluentIcon;
  /** アイコンの大きさ（CSS px） */
  size: number;
}

export const PANE_ACTIONS: Readonly<Record<PaneActionId, PaneActionDef>> = {
  pin: { id: 'pin', label: 'ピン止めする', onLabel: 'ピン止めを外す', regular: Pin20Regular, filled: Pin20Filled, size: ACTION_ICON_PX },
  maximize: { id: 'maximize', label: '最大化', onLabel: '通常表示', regular: FullScreenMaximize20Regular, filled: FullScreenMaximize20Filled, size: ACTION_ICON_PX },
  minimize: { id: 'minimize', label: '最小化', onLabel: '元に戻す', regular: ArrowMinimize20Regular, filled: ArrowMinimize20Filled, size: ACTION_ICON_PX },
  tabs: { id: 'tabs', label: 'タブにまとめる', regular: TabDesktopMultiple20Regular, filled: TabDesktopMultiple20Filled, size: ACTION_ICON_PX },
  untab: { id: 'untab', label: 'タブから出す', regular: TabDesktop20Regular, filled: TabDesktop20Filled, size: ACTION_ICON_PX },
  hide: { id: 'hide', label: '非表示', regular: EyeOff20Regular, filled: EyeOff20Filled, size: ACTION_ICON_PX },
  // 2D/3D と世界の表示の切替を 1 つにまとめた「ビュー」（FR-217・FR-218。D-01）。ボタンの文字で現在の表示モードを示す
  view: { id: 'view', label: 'ビュー', regular: Glasses20Regular, filled: Glasses20Filled, size: ACTION_ICON_PX },
  tableView: { id: 'tableView', label: '表で見る', onLabel: '元の表示に戻る', regular: Table20Regular, filled: Table20Filled, size: ACTION_ICON_PX },
};

export interface PaneActionView {
  label: string;
  Icon: FluentIcon;
  variant: 'regular' | 'filled';
  size: number;
}

/** 操作の、いまの状態での名前・アイコン・種類。オンの状態を持つ操作だけ、オンで Filled を返す。 */
export function paneAction(id: PaneActionId, on = false): PaneActionView {
  const d = PANE_ACTIONS[id];
  const filled = on && d.onLabel !== undefined;
  return { label: filled ? d.onLabel! : d.label, Icon: filled ? d.filled : d.regular, variant: filled ? 'filled' : 'regular', size: d.size };
}

/** ピン止め中は使えない操作の理由（FR-216） */
export const PIN_MOVE_REASON = 'ピン止めを外すと移動できます';
export const PIN_RESIZE_REASON = 'ピン止めを外すと大きさを変更できます';
export const NO_RESIZE_REASON = 'この画面の幅では、コンポーネントの大きさは変更できません';
export const PIN_TABS_REASON = 'ピン止めを外すとタブにまとめられます';
export const PIN_NO_ROOM_REASON = 'ピン止めしたコンポーネントと重ならない場所がないため、元の位置に戻しました';
