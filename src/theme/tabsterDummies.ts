// Fluent UI（Tabster）がツールバー・タブの両端に置く「見えない 1px の Tab の受け口」（data-tabster-dummy）の読み上げ上の扱い（NFR-A11Y-001 AC-169）。
// 受け口は aria-hidden="true" なのに tabindex=0 で、WCAG の「aria-hidden な要素にフォーカスできない」（axe: aria-hidden-focus）に当たる。
// 受け口は、Tab で外から入ったときの転送用。tabindex=-1 にしても、中の項目へはそのまま Tab・矢印キーで届く（Tabster は転送の直前に受け口を tabindex=0 にして使う）。
const SELECTOR = '[data-tabster-dummy][aria-hidden="true"]';

function fix(el: Element): void {
  // Tabster が転送のために一時的に tabindex=0 にして、フォーカスを持っている間は触らない
  if (el !== document.activeElement && el.getAttribute('tabindex') !== '-1') el.setAttribute('tabindex', '-1');
}

function scan(root: ParentNode): void {
  root.querySelectorAll(SELECTOR).forEach(fix);
}

/** 受け口が作られるたび（ツールバー・タブの表示のたび）に、Tab の停止位置から外す。アプリの起動時に 1 回だけ呼ぶ。 */
export function installTabsterDummyFix(): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  scan(document);
  new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (!(n instanceof Element)) return;
        if (n.matches(SELECTOR)) fix(n);
        scan(n);
      });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}
