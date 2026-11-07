// 一覧（WindowList）と左メニュー（AppShell）が共有する、Window の状態遷移（FR-295 AC-797・AC-825）。
// 前面→最小化（没入中は通常表示へ）、表示中→前面、最小化→元の位置・大きさで復元して前面、閉じた→再表示。
import { useLayout } from '../store/layout';
import type { WindowState } from './windowStates';

export function pressWindow(key: string, state: WindowState, inTree: boolean): void {
  const a = useLayout.getState();
  if (state === 'front') {
    if (a.maximized === key) a.setMaximized(null); // 没入表示からの復帰（FR-297 AC-802）
    else if (inTree) a.setMinimized(key, true);
  } else if (state === 'visible' || state === 'behind') {
    // 背面は、一覧からの呼び出しでだけ前面に出て通常の表示中になる（raise が背面の扱いを外す。ほかの配置は動かさない。FR-295 AC-872・873）
    // 前面に出す（重なりの手前へ。雛形の区画に配置されなかった背面の扱いからも外す。FR-305 AC-865）
    a.raise(key);
  } else if (inTree) {
    a.setMinimized(key, false);
    a.touch(key);
  } else {
    a.showComponent(key);
  }
}
