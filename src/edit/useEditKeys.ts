// 元に戻す／やり直しのキー操作（FR-046）: Ctrl+Z（⌘+Z）で元に戻し、Ctrl+Y（⌘+Y、Ctrl+Shift+Z）でやり直す。
// 入力欄の中では入力欄自身の取り消しに任せ、ほかの部品（ホワイトボードなど）が先に処理したキーは使わない。編集モードが OFF のときは何もしない。
import { isEditableTarget } from '../components/panelKeys';
import { useEditStore } from '../store/edit';

export type EditKeyAction = 'undo' | 'redo';

export interface EditKeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  editable: boolean;
}

/** キー入力が元に戻す／やり直しか。そうでなければ null */
export function editKeyAction(e: EditKeyLike): EditKeyAction | null {
  if (e.defaultPrevented || e.editable || e.altKey || !(e.ctrlKey || e.metaKey)) return null;
  const k = e.key.toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y' && !e.shiftKey) return 'redo';
  return null;
}

/** window に、元に戻す／やり直しのキーを結び付ける。戻り値で解除（アプリで 1 回だけ呼ぶ） */
export function installEditKeys(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onKey = (e: KeyboardEvent) => {
    const action = editKeyAction({
      key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey,
      defaultPrevented: e.defaultPrevented, editable: isEditableTarget(e.target),
    });
    if (!action) return;
    const store = useEditStore.getState();
    if (action === 'undo' ? store.undo() : store.redo()) e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
