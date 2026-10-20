// ダイアログ（Fluent UI の Dialog・DialogSurface）の共通の包み（NFR-UX-015・NFR-UX-017・NFR-A11Y-009）。
// 影はダイアログの役割の段（64。design.css）、出入りの動きは Fluent 2 のモーションのトークン（Fluent UI の既定）。
// アニメーションの停止中（FR-071）と OS の「視差効果を減らす」（FR-072）のときは、出入りの動きを付けない（所要時間 0。最終の状態を即座に示す）。
// 閉じたとき（Esc を含む）は、フォーカスを開く前の要素に戻す（NFR-A11Y-009 AC-484。開閉を親が描画の有無で決めるダイアログも同じ）。
import {
  Dialog as FluentDialog,
  DialogSurface as FluentDialogSurface,
  type DialogProps,
  type DialogSurfaceProps,
} from '@fluentui/react-components';
import { createContext, forwardRef, useCallback, useContext, useEffect, useRef } from 'react';
import { useMotionAllowed } from '../motion/transitions';

/** フォーカスが行き場を失っている（body にある・どこにもない）なら、開く前の要素へ戻す */
export function returnFocus(opener: HTMLElement | null, doc: Document = document, force = false): boolean {
  const active = doc.activeElement;
  const lost = force || !active || active === doc.body || !active.isConnected || !!active.closest('[inert]');
  if (!lost || !opener || !opener.isConnected || opener.closest('[inert]')) return false;
  opener.focus({ preventScroll: true });
  return doc.activeElement === opener;
}

/** ダイアログの外で最後にフォーカスを受けた要素（開く操作の直前にフォーカスが外れても、開く前の要素を覚えておく） */
let lastFocusedOutside: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t instanceof HTMLElement && !t.closest('[role="dialog"], [role="alertdialog"]')) lastFocusedOutside = t;
  }, true);
}

/** 開いた瞬間のフォーカスの位置（なければ直前にフォーカスのあった要素）を覚え、閉じたとき・外されたときに戻す */
function useFocusReturn(open: boolean | undefined): void {
  const opener = useRef<HTMLElement | null>(null);
  const outer = useRef<HTMLElement | null>(null); // 別のダイアログの中から開いたとき（設定のモーダルの上のコマンドパレットなど）の、ダイアログの外の戻り先
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== 'undefined') {
    const a = document.activeElement;
    outer.current = lastFocusedOutside;
    opener.current = a instanceof HTMLElement && a !== document.body ? a : lastFocusedOutside;
  }
  wasOpen.current = open === true;
  useEffect(() => {
    if (open !== false) return undefined;
    // 閉じる動きの間は、背景（アプリ本体）がまだ操作の対象外（inert）で、フォーカスを戻せないことがある。戻せるまで短い間隔で試す
    let tries = 0;
    let t = 0;
    const attempt = (): void => {
      tries += 1;
      // 閉じる動きの間は、フォーカスがまだ閉じかけのダイアログの中にある。外へ出るまでは戻す対象として扱う
      const active = document.activeElement;
      const closing = !!active?.closest('[role="dialog"], [role="alertdialog"]');
      const lost = !active || active === document.body || !active.isConnected || !!active.closest('[inert]') || closing;
      if (!lost) return;
      if (closing && opener.current?.closest('[inert]')) { t = window.setTimeout(attempt, 25); return; }
      const target = opener.current && opener.current.isConnected && !opener.current.closest('[inert]') ? opener.current : (outer.current ?? opener.current);
      if (returnFocus(target, document, closing) || tries >= 40) return;
      t = window.setTimeout(attempt, 25);
    };
    t = window.setTimeout(attempt, 0);
    return () => window.clearTimeout(t);
  }, [open]);
  useEffect(() => () => {
    const el = opener.current;
    window.setTimeout(() => returnFocus(el), 0);
  }, []);
}

/**
 * 出入りの動きを付けるか。開いた瞬間の設定で決め、閉じ終わるまで変えない（開いたまま設定が変わっても、
 * 動きの部品を差し替えずに閉じられる）。次に開くときは、その時点の設定に従う。
 */
function useDialogMotion(open: boolean | undefined): boolean {
  const allowed = useMotionAllowed();
  const frozen = useRef(allowed);
  const wasOpen = useRef(false);
  if (open === true && !wasOpen.current) frozen.current = allowed;
  wasOpen.current = open === true;
  return open === undefined ? allowed : frozen.current;
}

const DialogMotionContext = createContext<boolean | null>(null);

export function Dialog(props: DialogProps) {
  const motion = useDialogMotion(props.open);
  useFocusReturn(props.open);
  return (
    <DialogMotionContext.Provider value={motion}>
      <FluentDialog {...props} surfaceMotion={motion ? props.surfaceMotion : null} />
    </DialogMotionContext.Provider>
  );
}

/**
 * 開いているダイアログ自身は、支援技術から隠さない。ダイアログどうしが入れ替わる（選択画面を閉じて確認を開く）と、
 * 閉じた側の modalizer の後始末の順序によって、開いた側の面に aria-hidden が残ることがある（確認が読み上げられなくなる）。
 */
function useSurfaceVisible(): (el: HTMLDivElement | null) => void {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((el: HTMLDivElement | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el || typeof MutationObserver === 'undefined') return;
    const show = (): void => {
      if (el.getAttribute('aria-hidden') !== 'true') return;
      const modals = el.ownerDocument.querySelectorAll('[aria-modal="true"]');
      if (modals[modals.length - 1] === el) el.removeAttribute('aria-hidden'); // 上に別のダイアログが重なっているときは隠れてよい
    };
    show();
    const mo = new MutationObserver(show);
    mo.observe(el, { attributes: true, attributeFilter: ['aria-hidden'] });
    // 上に重なっていた別のダイアログが閉じて取り除かれたとき（FR-219 の確認など）、この面に残った aria-hidden も外す
    const body = el.ownerDocument.body;
    const mb = new MutationObserver(show);
    mb.observe(body, { childList: true });
    cleanup.current = () => { mo.disconnect(); mb.disconnect(); };
  }, []);
}

export const DialogSurface = forwardRef<HTMLDivElement, DialogSurfaceProps>(function DialogSurface(props, ref) {
  const fromDialog = useContext(DialogMotionContext);
  const allowed = useMotionAllowed();
  const motion = fromDialog ?? allowed;
  const visible = useSurfaceVisible();
  const setRef = useCallback((el: HTMLDivElement | null) => {
    visible(el);
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as { current: HTMLDivElement | null }).current = el;
  }, [ref, visible]);
  return <FluentDialogSurface ref={setRef} {...props} backdropMotion={motion ? props.backdropMotion : null} />;
});
