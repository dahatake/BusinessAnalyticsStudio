// Snap・Group・Switch・Expand・Move の 5 つの操作と、Focus の切替（FR-299・FR-300）。
// キーボード（Ctrl+Alt+キー。macOS の表示は ⌃⌥）とコマンドパレットの両方が、ここの runZoneOp を呼ぶ（同じ操作。NFR-UX-018）。
//  - Snap: 操作中のコンポーネントを、いるゾーンへ吸着させる（FR-152 の候補の選択と同じ配置先）
//  - Group: 同じグループ（情報の階層の分類。FR-244）のコンポーネントを、操作中のものと同じゾーンへまとめる
//  - Switch: 最近使った Task Context（タスクワークスペース）の次へ切り替える
//  - Expand: 操作中のコンポーネントを拡大する（FR-174）
//  - Move: 操作中のコンポーネントを、次（逆向きは前）のゾーンへ移す。ゾーンの選択とフォーカスは保つ
import type { Command } from '../commands/registry';
import type { PaneInfo } from './PaneContext';
import { chordLabel, type ZoneOp } from './os';
import { getOs } from '../store/osConvention';
import { toggleFocus, switchToNextRecent } from './immersive';
import { tr } from '../i18n';

export const NO_PANE_MESSAGE = 'コンポーネントを選んでから実行してください';

/** 操作を実行する。コンポーネントが対象の操作で、対象がなければ理由を通知する */
export function runZoneOp(op: ZoneOp, p: PaneInfo | null, notify: (text: string) => void): void {
  if (op === 'focus') { notify(toggleFocus() === 'entered' ? tr('Focus モードにしました') : tr('Focus モードを解除しました')); return; }
  if (op === 'switch') {
    const name = switchToNextRecent();
    notify(name ? tr('{name} に切り替えました', { name }) : tr('切り替える最近使った作業がありません'));
    return;
  }
  if (!p) { notify(tr(NO_PANE_MESSAGE)); return; }
  if (op === 'expand') { p.toggleExpand(); return; }
  if (op === 'move') { p.moveZone?.(1); return; }
  if (op === 'moveBack') { p.moveZone?.(-1); return; }
  if (op === 'snap') { p.snapZone?.(); return; }
  if (op === 'group') { p.groupZone?.(); }
}

const SUFFIX = () => tr('（操作中のコンポーネント）');

/** コマンドパレットの 5 つの操作と Focus の切替。ショートカットの表記は、その時点の OS の慣習で作る */
export function zoneOpCommands(current: () => PaneInfo | null, notify: (text: string) => void): Command[] {
  const os = getOs();
  const kw = ['ゾーン', 'ワークスペース', 'zone', 'workspace'];
  const mk = (id: string, op: ZoneOp, label: string, keywords: string[], withTarget: boolean): Command => ({
    id,
    label: withTarget ? `${tr(label)}${SUFFIX()}` : tr(label),
    keywords: [...kw, ...keywords],
    shortcut: chordLabel(os, op),
    run: () => runZoneOp(op, current(), notify),
  });
  return [
    mk('zone.snap', 'snap', 'スナップ: ゾーンへ吸着する', ['スナップ', '吸着', 'snap'], true),
    mk('zone.group', 'group', 'グループ: 関連するコンポーネントを同じゾーンへまとめる', ['グループ', 'まとめる', 'group'], true),
    mk('zone.switch', 'switch', '切替: 最近使った作業へ切り替える', ['切替', '切り替え', '最近', 'switch', 'task context'], false),
    mk('zone.expand', 'expand', '拡大: ゾーンの中で拡大する', ['拡大', 'expand'], true),
    mk('zone.move', 'move', '移動: 次のゾーンへ移す', ['移動', 'move'], true),
    mk('zone.move.back', 'moveBack', '移動: 前のゾーンへ移す', ['移動', 'move'], true),
    mk('zone.focus', 'focus', 'Focus モードの切替', ['Focus', '集中', '没入', 'immersive'], false),
  ];
}
