// 一覧（WindowList）と左メニュー（AppShell）が共有する、Window の状態遷移（FR-295 AC-797・AC-825）。
// 前面→最小化（没入中は通常表示へ）、表示中→前面、最小化→元の位置・大きさで復元して前面、閉じた→再表示。
import { useLayout } from '../store/layout';
import type { WindowState } from './windowStates';

export function pressWindow(key: string, state: WindowState, inTree: boolean): void {
  const a = useLayout.getState();
  if (state === 'front') {
    if (a.maximized === key) a.setMaximized(null); // 最大化中の前面の項目は最小化せず、最大化を解いて元の位置・大きさへ戻す（FR-297 AC-802・FR-295 AC-887）
    else if (inTree) a.setMinimized(key, true);
    return;
  }
  // 最大化中に、最大化の前から最小化中・非表示・背面（雛形由来を含む）だった項目、または最大化由来の背面の項目を押したときは、先に最大化を解いて
  // 背面だったものを元の配置へ戻し、そのあと押した項目を通常の遷移で前面に出す（AC-887 ②⑧・Q-100 A・Q-103 A）。最大化は残さない
  const wasMaximized = a.maximized !== null && a.maximized !== key;
  if (wasMaximized) a.setMaximized(null);
  if (state === 'behind') {
    // 背面は一覧・左メニューからの呼び出しでだけ前面に出る。背面へ回る前の位置・大きさで出し、上限を超えるときは最も長く使っていないものを最小化（FR-295 Q-083 A）
    // 最大化由来の背面は、最大化を解いた時点で元の配置へ戻っているので、前面に出す（raise）だけになる
    a.bringFromBehind(key);
  } else if (state === 'visible') {
    // 背面は、一覧からの呼び出しでだけ前面に出て通常の表示中になる（raise が背面の扱いを外す。ほかの配置は動かさない。FR-295 AC-872・873）
    if (a.maximized === key) { a.setMaximized(null); return; } // 最大化中の項目（使用記録がなく表示中と求められたものを含む）は、最大化を解くだけ（AC-887）
    a.raise(key);
  } else if (inTree) {
    a.setMinimized(key, false);
    a.touch(key);
    if (wasMaximized) useLayout.getState().trimOverLimit(key); // 最大化中からの前面化は、上限を超えるとき FR-296 の規則に従う（AC-887 ⑧）
  } else {
    // 最大化中に閉じた項目を再表示するときは、AC-886 の取り消しの対象にせず、上限超過を許す（AC-887 ⑧・Q-107 A）
    a.showComponent(key, wasMaximized ? { noCancel: true } : undefined);
    if (wasMaximized) useLayout.getState().trimOverLimit(key);
  }
}