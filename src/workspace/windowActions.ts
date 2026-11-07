// 一覧（WindowList）と左メニュー（AppShell）が共有する、Window の状態遷移（FR-295 AC-797・AC-825）。
// 前面→最小化（没入中は通常表示へ）、表示中→前面、最小化→元の位置・大きさで復元して前面、閉じた→再表示。
import { useLayout } from '../store/layout';
import type { WindowState } from './windowStates';

export function pressWindow(key: string, state: WindowState, inTree: boolean): void {
  const a = useLayout.getState();
  if (state === 'front') {
    if (a.maximized === key) a.setMaximized(null); // 最大化中の前面の項目は最小化せず、最大化を解いて元の位置・大きさへ戻す（FR-297 AC-802・FR-295 AC-887）
    else if (inTree) a.setMinimized(key, true);
  } else if (state === 'behind') {
    // 最大化中の背面の項目: 最大化を解いて元の配置へ戻し、押した項目を前面に出す（AC-887）。ほかのものは最小化しない
    if (a.maximized !== null && a.maximized !== key) { a.setMaximized(null); a.raise(key); return; }
    // 背面は一覧・左メニューからの呼び出しでだけ前面に出る。背面へ回る前の位置・大きさで出し、上限を超えるときは最も長く使っていないものを最小化（FR-295 Q-083 A）
    a.bringFromBehind(key);
  } else if (state === 'visible') {
    // 背面は、一覧からの呼び出しでだけ前面に出て通常の表示中になる（raise が背面の扱いを外す。ほかの配置は動かさない。FR-295 AC-872・873）
    // 前面に出す（重なりの手前へ。雛形の区画に配置されなかった背面の扱いからも外す。FR-305 AC-865）
    if (a.maximized === key) { a.setMaximized(null); return; } // 最大化中の項目（使用記録がなく表示中と求められたものを含む）は、最大化を解くだけ（AC-887）
    a.raise(key);
  } else if (inTree) {
    a.setMinimized(key, false);
    a.touch(key);
  } else {
    a.showComponent(key);
  }
}
