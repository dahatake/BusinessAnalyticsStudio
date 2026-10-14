// パネルのキー操作の判定（FR-013 AC-016）。Panel から使う純粋な関数で、DOM なしで単体テストできる。
import type { PaneInfo } from '../workspace/PaneContext';

export interface KeyLike {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  /** 押されたとき、パネルの中の要素か */
  insidePanel: boolean;
  /** 入力欄（input・textarea・select・contenteditable・textbox/searchbox ロール）にフォーカスがあるか */
  editable: boolean;
}

export type PanelKeyAction = 'toggle-maximize' | 'toggle-expand' | 'restore' | 'hide' | null;

/** どの操作にあたるか。Shift+F=最大化/通常、Shift+E=拡大/復帰、Esc=最大化の解除、H=非表示。入力欄・修飾キー付きでは何もしない。 */
export function panelKeyAction(e: KeyLike, pane: Pick<PaneInfo, 'maximized'> | null): PanelKeyAction {
  if (!pane || e.defaultPrevented || !e.insidePanel || e.editable || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === 'F' && e.shiftKey) return 'toggle-maximize';
  // FR-174 AC-351: ダブルクリックを使わない拡大表示。Shift+E で拡大/復帰
  if (e.key === 'E' && e.shiftKey) return 'toggle-expand';
  if (e.key === 'Escape' && pane.maximized) return 'restore';
  if ((e.key === 'h' || e.key === 'H') && !e.shiftKey) return 'hide';
  return null;
}

/** 判定した操作を実行する。実行したら true。 */
export function runPanelKeyAction(action: PanelKeyAction, pane: Pick<PaneInfo, 'toggleMaximize' | 'toggleExpand' | 'restore' | 'hide'>): boolean {
  if (action === 'toggle-maximize') pane.toggleMaximize();
  else if (action === 'toggle-expand') pane.toggleExpand();
  else if (action === 'restore') pane.restore();
  else if (action === 'hide') pane.hide();
  else return false;
  return true;
}

/** 見出しのダブルクリックで拡大表示/復帰を切り替える関数（ワークスペースの外では付けない。最大化ではない。FR-174 AC-350）。 */
export function titleDoubleClick(pane: Pick<PaneInfo, 'toggleExpand'> | null): (() => void) | undefined {
  return pane ? pane.toggleExpand : undefined;
}

export function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const role = el.getAttribute('role');
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || role === 'textbox' || role === 'searchbox';
}
