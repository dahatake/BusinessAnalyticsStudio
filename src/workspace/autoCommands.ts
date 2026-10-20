// 自動配置の実行・停止・取消のコマンド（FR-243 AC-586）。ドラッグなしの手段（メニュー・キーボード・コマンドパレット。NFR-A11Y-004）。
import type { Command } from '../commands/registry';

export const AUTO_DONE = '自動配置を実行しました（ピン止め・手で動かした配置は変えていません）';
export const AUTO_STOPPED = '自動配置を停止しました。以後の追加で、いまの配置は動きません';
export const AUTO_UNDONE = '自動配置を取り消しました';
export const AUTO_NO_UNDO = '取り消せる自動配置がありません';
export const AUTO_NO_ROOM = 'ピン止め・手で動かした配置と重ならない場所がないため、自動配置を取りやめました';

export interface AutoActions {
  run: () => void;
  stop: () => void;
  undo: () => void;
}

export function autoCommands(a: AutoActions): Command[] {
  const kw = ['自動配置', '配置', '情報の階層', 'auto layout'];
  return [
    { id: 'layout.auto.run', label: '自動配置を実行', keywords: kw, run: a.run },
    { id: 'layout.auto.stop', label: '自動配置を停止', keywords: kw, run: a.stop },
    { id: 'layout.auto.undo', label: '自動配置を取り消す', keywords: kw, run: a.undo },
  ];
}
