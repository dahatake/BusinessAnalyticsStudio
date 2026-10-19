// Esc で選択を解除する判定（FR-027。優先順は要求定義書 §10.3 の [ASSUMPTION] A-04）。
// 優先順: 開いているダイアログ・メニューを閉じる → オープニングのスキップ → 最大化の解除 → 選択の解除。
// ダイアログ・メニュー・オープニングは自分で Esc を処理するので、ここでは「開いているなら何もしない」だけを受け持つ。
import { isEditableTarget } from '../components/panelKeys';
import { useSelectionStore } from '../store/selection';

export interface EscapeContext {
  key: string;
  /** 先に処理した側（パネルの最大化の解除など）が既に使ったか */
  defaultPrevented: boolean;
  /** Esc の押下の時点で、ダイアログ・メニュー（オープニングを含む）が開いていたか */
  overlayOpen: boolean;
  /** 入力欄にフォーカスがあるか（入力の取り消しに使われる） */
  editable: boolean;
  hasSelection: boolean;
}

/** Esc で選択を解除してよいか */
export function shouldClearSelectionOnEscape(c: EscapeContext): boolean {
  return c.key === 'Escape' && c.hasSelection && !c.defaultPrevented && !c.overlayOpen && !c.editable;
}

// 開いているダイアログ・メニューに加え、展開中の combobox（Dropdown・Combobox は、開いている間 aria-expanded="true"。コマンドパレットも）を数える。
// これらは Esc で自分を閉じるので、選択の解除は起こさない。常時表示の listbox（キャンバスの議題の一覧など）は、開いているポップアップではないので数えない。
const OVERLAY = '[role="dialog"],[role="alertdialog"],[role="menu"],[role="combobox"][aria-expanded="true"],[aria-haspopup][aria-expanded="true"]';

/** 開いているダイアログ・メニューがあるか（オープニングは role="dialog"） */
export function isOverlayOpen(root: ParentNode = document): boolean {
  return root.querySelector(OVERLAY) !== null;
}

/**
 * window の Esc に、選択の解除を結び付ける。戻り値で解除（アプリで 1 回だけ呼ぶ）。
 * 捕捉の段階で「ダイアログ・メニューが開いていたか」を記録する（React が閉じた後の DOM では判定できないため）。
 * 解除の判断は、パネルなどが先に処理した後（バブルの段階）に行う。
 */
export function installEscapeClear(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const open = new WeakSet<Event>();
  const onCapture = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOverlayOpen()) open.add(e); };
  const onBubble = (e: KeyboardEvent) => {
    const clear = shouldClearSelectionOnEscape({
      key: e.key,
      defaultPrevented: e.defaultPrevented,
      overlayOpen: open.has(e),
      editable: isEditableTarget(e.target),
      hasSelection: useSelectionStore.getState().selectedIds.length > 0,
    });
    if (clear) {
      useSelectionStore.getState().clear({ origin: 'keyboard' });
      useSelectionStore.getState().setHover(null); // FR-227: 解除で、強調（ホバー含む）を全部元に戻す
    }
  };
  window.addEventListener('keydown', onCapture, true);
  window.addEventListener('keydown', onBubble);
  return () => {
    window.removeEventListener('keydown', onCapture, true);
    window.removeEventListener('keydown', onBubble);
  };
}
