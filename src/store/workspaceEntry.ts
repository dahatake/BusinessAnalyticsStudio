// 起動時に分析画面（ワークスペース）から始めるか（FR-298）。
// 起動・再読込のたびにメイン画面から始めるのが既定（FR-144 AC-239）。例外は 2 つだけ:
//  - 別のウィンドウへ移したタスクワークスペース（URL に `workspace=<ID>`）は、そのワークスペースをすぐ見せる（AC-808）。
//  - このタブで、タスクワークスペース・ゾーン・モードを操作したあとの再読込は、操作していた分析画面へ戻る（AC-805・AC-809 の「再読込でも保持」）。
//    メイン画面へ戻る操作で解除する。タブ（sessionStorage）ごとの記録で、新しく開いたタブ・再起動は従来どおりメイン画面から。
const KEY = 'eabk.workspace.entered';
export const WORKSPACE_PARAM = 'workspace';

function search(): URLSearchParams {
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
}

/** URL で指定されたタスクワークスペースの ID（別のウィンドウへ移したもの） */
export function workspaceFromUrl(): string | null {
  return search().get(WORKSPACE_PARAM);
}

/** 起動時に、メイン画面を飛ばして分析画面を出すか */
export function enterAnalysisAtBoot(): boolean {
  if (workspaceFromUrl()) return true;
  try { return window.sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}

/** タスクワークスペースを操作したことを覚える（再読込で分析画面へ戻るため） */
export function rememberEntered(): void {
  try { window.sessionStorage.setItem(KEY, '1'); } catch { /* 保存できなくても操作は続ける */ }
}

/** メイン画面へ戻ったら解除する */
export function forgetEntered(): void {
  try { window.sessionStorage.removeItem(KEY); } catch { /* 無視 */ }
}
