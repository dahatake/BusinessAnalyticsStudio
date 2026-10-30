// Graph の描画面の枠（FR-245〜248）。図（ノード・エッジ・塊など）を、パン・拡大縮小・全画面にできる面に収める共通部品。
// GraphSurface（Graph の描画面）が使うほか、Twin ビュー・空間ビュー・データビュアーは、全体の塊・詳細も含めて同じ面に収める。
// DOM の契約は tests/system/CONTRACT.md §25: `data-zoom-surface="graph"` の面が data-pan-x・data-pan-y（CSS px）・data-scale（全体表示を 1）を持ち、キーボードでフォーカスできる。
// 操作: 空白のドラッグ・Shift＋矢印キー・移動ボタンでパン（NFR-A11Y-010・WCAG 2.5.7 のためドラッグと同じ操作がボタンとキーにもある）、
//       ホイール・ピンチ（Ctrl＋ホイール、2 本指）・ボタン・「+」「-」キーで拡大縮小（PARAM-087 の範囲、1 操作 PARAM-057 倍）、「全画面」ボタン・F キーで図だけの全画面（Esc・「全画面を終了」で戻る）。
// 画面側の「拡大」「縮小」「全体表示に戻す」のボタン（ZoomBar など）が外にあるときは、そのクリックを受けて倍率も同じ操作で変える（external）。
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Badge, Button, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import {
  ArrowDown20Regular, ArrowLeft20Regular, ArrowRight20Regular, ArrowUp20Regular, FullScreenMaximize20Regular, FullScreenMinimize20Regular,
} from '@fluentui/react-icons';
import { MIN_TARGET_PX } from '../theme/tokens';
import { ZOOM_KIND_LABELS, kindOfDepth, stepDepth, zoomAttrs } from '../semanticzoom/model';
import {
  GRAPH_PAN_STEP, GRAPH_SCALE_STEP, GRAPH_VIEW_INIT, clampScale, highlightRowItem, onGraphFocus, useGraphView, useGraphViewStore,
} from './graphViewStore';
import { tr, useT } from '../i18n';

/** ボタンの名前が、日本語・現在の言語のどちらの「name」とも一致するか（画面側のボタンを名前で見つけるため） */
const isName = (actual: string, ja: string): boolean => actual === ja || actual === tr(ja);

const useStyles = makeStyles({
  root: {
    position: 'relative', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden', boxSizing: 'border-box', cursor: 'grab',
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2,
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
  dragging: { cursor: 'grabbing' },
  full: { position: 'fixed', inset: 0, zIndex: 1000, borderRadius: 0, border: 'none', backgroundColor: tokens.colorNeutralBackground1 },
  toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalXS, rowGap: tokens.spacingVerticalXS, padding: tokens.spacingHorizontalS, cursor: 'default' },
  grow: { flexGrow: 1 },
  btn: { minWidth: `${MIN_TARGET_PX}px`, minHeight: `${MIN_TARGET_PX}px` },
  stage: { position: 'relative', overflow: 'hidden', touchAction: 'none', minHeight: '120px', maxHeight: '70vh' },
  stageFull: { flexGrow: 1, minHeight: 0, maxHeight: 'none' },
  content: { transformOrigin: '0 0', width: '100%', boxSizing: 'border-box' },
  anim: { transitionProperty: 'transform', transitionDuration: tokens.durationNormal, transitionTimingFunction: tokens.curveEasyEase },
  // 詳細カードは、図（面）の上に置く。図のどの項目にも重ならない
  cardHost: { maxHeight: '40vh', overflowY: 'auto', flexShrink: 0, padding: tokens.spacingHorizontalS, cursor: 'default', ':empty': { display: 'none' } },
});

export interface GraphViewportCtx {
  origin: string;
  /** 自分でズームのボタン・階層を持つ面か */
  standalone: boolean;
  depth: number;
  /** 表の行から移動したノードの ID（PARAM-089 の間） */
  hl: string | null;
  full: boolean;
  stageRef: MutableRefObject<HTMLDivElement | null>;
  cardHost: HTMLElement | null;
  /** 詳細カードを閉じる（開いていれば閉じて true）。GraphSurface が登録し、Esc が使う */
  closerRef: MutableRefObject<(() => boolean) | null>;
  /** 図の自然な大きさを知らせる（全体表示で全体が収まる倍率の計算に使う）。null で取り消す */
  setContentSize: (size: { w: number; h: number } | null) => void;
  setDepth: (d: number) => void;
}

const Ctx = createContext<GraphViewportCtx | null>(null);
export const useGraphViewport = (): GraphViewportCtx | null => useContext(Ctx);

const HOST_SEL = '[data-testid^="component-"]:not([data-testid="component-data"]), [data-testid="data-viewer"]';
const IGNORE_DRAG = 'button, a, input, select, textarea, table, [data-zoom-node], [data-zoom-cluster], [data-testid="graph-edge"], [data-testid="detail-card"], [role="table"], [role="listbox"]';
const prefersReduced = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** 面の中で display:none の祖先の下にあるか（全体の階層で隠したノード） */
function hiddenIn(el: HTMLElement, stage: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n && n !== stage; n = n.parentElement) if (n.style.display === 'none') return true;
  return false;
}
const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * 要素の位置が落ち着いてから（動きのトランジションが終わり、2 フレーム続けて位置が変わらなくなってから）cb を呼ぶ（FR-248）。
 * 落ち着かないときも maxFrames（既定 60 フレーム ≒ 1 秒）で打ち切って呼ぶ。
 */
export function whenSettled(el: HTMLElement, cb: () => void, maxFrames = 60): void {
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f: FrameRequestCallback) => setTimeout(() => f(Date.now()), 16);
  let last: DOMRect | null = null;
  let stable = 0;
  const moving = (): boolean => {
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      const a = typeof n.getAnimations === 'function' ? n.getAnimations() : [];
      if (a.some((x) => x.playState === 'running' || x.pending)) return true;
      if (n.hasAttribute('data-zoom-surface')) break;
    }
    return false;
  };
  const tick = (frame: number): void => {
    const r = el.getBoundingClientRect();
    const same = last !== null && Math.abs(r.left - last.left) < 0.5 && Math.abs(r.top - last.top) < 0.5 && Math.abs(r.width - last.width) < 0.5;
    stable = same && !moving() ? stable + 1 : 0;
    last = r;
    if (stable >= 2 || frame >= maxFrames) { cb(); return; }
    raf(() => tick(frame + 1));
  };
  raf(() => tick(0));
}
const mounted = new Map<string, number>();

export interface GraphScopeProps { active: boolean; origin: string; label: string; children: ReactNode }

/** Graph の表示のときだけ、全体・要素・詳細の内容をパン・拡大縮小できる面（GraphViewport）に収める。それ以外は縦に並べるだけ */
export function GraphScope({ active, origin, label, children }: GraphScopeProps) {
  const body = <div style={{ display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM }}>{children}</div>;
  return active ? <GraphViewport origin={origin} label={label}>{body}</GraphViewport> : body;
}

export interface GraphViewportProps {
  /** 面の名前（選択を起こすビューの名前と同じ。表の行からの移動・状態の保持に使う） */
  origin: string;
  label: string;
  /** true: 自分で「拡大」「縮小」「全体表示に戻す」のボタンと階層（全体・要素・詳細）を持つ。false: 画面側のボタンの操作を受ける */
  standalone?: boolean;
  className?: string;
  /** 面の要素に足す属性 */
  attrs?: Record<string, string | number>;
  children: ReactNode;
}

export function GraphViewport({ origin, label, standalone = false, className, attrs, children }: GraphViewportProps) {
  const s = useStyles();
  const t = useT();
  const view = useGraphView(origin);
  const patch = useGraphViewStore((st) => st.patch);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const closerRef = useRef<(() => boolean) | null>(null);
  const levelClick = useRef(false);
  const fsRef = useRef<HTMLButtonElement>(null);
  const exitRef = useRef<HTMLButtonElement>(null);
  const [cardHost, setCardHost] = useState<HTMLElement | null>(null);
  // 図の自然な大きさ（GraphSurface が知らせる。なければ倍率の基準は面そのまま）
  const [content, setContentSize] = useState<{ w: number; h: number } | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [anim, setAnim] = useState(false);
  const [dragging, setDragging] = useState(false);
  const animTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stageHeightFull = view.full;

  // 全体表示（倍率 1）で全体が収まる倍率。拡大はしない（上限 1）。1 操作（1.25 倍）の拡大でも端の項目が面の外に出ないよう、面の 8 割に収める
  const fit = content && stageSize.w > 0 && stageSize.h > 0 ? Math.min(1, (0.8 * stageSize.w) / content.w, (0.8 * stageSize.h) / content.h) : 1;

  const get = (): typeof GRAPH_VIEW_INIT => useGraphViewStore.getState().views[origin] ?? GRAPH_VIEW_INIT;
  // パン（data-pan-x・y）は、図の中心が面の中心からどれだけずれているか。倍率は図の中心を基準に変わる。c は面の中心からの位置（既定は中心）
  const zoomBy = (factor: number, c: { x: number; y: number } = { x: 0, y: 0 }, depthStep = 0): void => {
    const v = get();
    const ns = clampScale(v.s * factor);
    const ratio = ns / v.s;
    patch(origin, { s: ns, x: c.x - (c.x - v.x) * ratio, y: c.y - (c.y - v.y) * ratio, ...(standalone && depthStep !== 0 ? { depth: stepDepth(v.depth, depthStep as 1 | -1, 1) } : {}) });
  };
  const home = (): void => patch(origin, { x: 0, y: 0, s: 1, ...(standalone ? { depth: 0 } : {}) });
  // 「全体に戻す」は即時に全体表示の位置と倍率にする（FR-245 AC-594: 操作の直後に全ノードが面に収まる。動きの途中の位置を残さない）
  const homeNow = (): void => { clearTimeout(animTimer.current); setAnim(false); home(); };
  const panBy = (dx: number, dy: number): void => patch(origin, (v) => ({ x: v.x + dx, y: v.y + dy }));
  // 全画面に入る・出るときは、詳細カードを閉じる（カードの位置が変わるため。パン・倍率・選択は保つ）
  const toggleFull = (): void => { closerRef.current?.(); patch(origin, (v) => ({ full: !v.full })); };
  const animate = (): void => {
    if (prefersReduced()) return;
    setAnim(true);
    clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => setAnim(false), 350);
  };

  // 面の大きさ（全体表示の倍率の計算）
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const measure = (): void => setStageSize((p) => (p.w === el.clientWidth && p.h === el.clientHeight ? p : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view.full]);

  // 全画面は、この面がなくなったら戻す（別の画面に残さない）
  useEffect(() => {
    mounted.set(origin, (mounted.get(origin) ?? 0) + 1);
    return () => {
      mounted.set(origin, (mounted.get(origin) ?? 1) - 1);
      setTimeout(() => { if ((mounted.get(origin) ?? 0) <= 0 && get().full) patch(origin, { full: false }); }, 0);
    };
  }, [origin]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自分で階層を持つ面は、画面の根（component-<key>）に階層の属性（CONTRACT §23）を付ける
  const za = zoomAttrs(view.depth, 1);
  useEffect(() => {
    if (!standalone) return undefined;
    const host = rootRef.current?.closest<HTMLElement>(HOST_SEL);
    if (!host) return undefined;
    for (const [k, v] of Object.entries(za)) host.setAttribute(k, String(v));
    return () => { for (const k of Object.keys(za)) host.removeAttribute(k); };
  }, [standalone, za['data-zoom-level'], za['data-depth']]); // eslint-disable-line react-hooks/exhaustive-deps

  // 画面側のボタン（拡大・縮小・全体表示に戻す）のクリックを受けて、倍率も同じ操作で変える
  useEffect(() => {
    if (standalone) return undefined;
    const h = (e: MouseEvent): void => {
      const btn = (e.target as Element | null)?.closest?.('button');
      const root = rootRef.current;
      if (!btn || !root || root.contains(btn) || levelClick.current) return;
      const host = root.closest(HOST_SEL);
      if (!host || !host.contains(btn)) return;
      const name = btn.getAttribute('aria-label') || (btn.textContent ?? '').trim();
      if (isName(name, '拡大')) { animate(); zoomBy(GRAPH_SCALE_STEP); } else if (isName(name, '縮小')) { animate(); zoomBy(1 / GRAPH_SCALE_STEP); } else if (isName(name, '全体表示に戻す')) { homeNow(); }
    };
    document.addEventListener('click', h, true);
    return () => document.removeEventListener('click', h, true);
  }, [standalone, origin]); // eslint-disable-line react-hooks/exhaustive-deps

  // 表の行から図のノードへ移動する（FR-248）。見えない階層なら、見える階層へ切り替えてから移動する
  useEffect(() => {
    const ensureLevel = (): void => {
      if (standalone) { if (get().depth === 0) patch(origin, { depth: 1 }); return; }
      const host = rootRef.current?.closest<HTMLElement>('[data-zoom-level]');
      if (!host) return;
      const want = host.getAttribute('data-zoom-level') === 'detail' ? '縮小' : '拡大';
      [...host.querySelectorAll('button')].find((b) => isName(b.getAttribute('aria-label') || (b.textContent ?? '').trim(), want) && !b.disabled)?.click();
    };
    const run = (id: string, attempt: number): void => {
      const stage = stageRef.current;
      if (!stage) return;
      const el = stage.querySelector<HTMLElement>(`[data-testid="graph-node"][data-entity-id="${id.replace(/["\\]/g, '\\$&')}"]`);
      if (!el || hiddenIn(el, stage)) { // ない・隠れている（全体の階層）

        if (attempt < 8) { ensureLevel(); setTimeout(() => run(id, attempt + 1), 60); }
        return;
      }
      highlightRowItem(origin, id);
      // 階層の切替・拡大縮小の動き（transform のトランジション）や図の大きさの変化による配置の更新の途中で測ると、
      // 動いている途中の位置からパンの量を決めてしまい、対象が範囲に入らない。位置が落ち着いてから測る
      whenSettled(el, () => {
        const st = stageRef.current;
        if (!st || !el.isConnected) return;
        const sr = st.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        const m = 12;
        if (er.left >= sr.left + m && er.right <= sr.right - m && er.top >= sr.top + m && er.bottom <= sr.bottom - m) return;
        animate();
        panBy(sr.left + sr.width / 2 - (er.left + er.width / 2), sr.top + sr.height / 2 - (er.top + er.height / 2));
      });
    };
    // 表の行のクリックで起きた選択が画面に反映されてから動く（画面側の階層の切替が、古い選択を見ないように）
    return onGraphFocus(origin, (id) => { setTimeout(() => run(id, 0), 0); });
  }, [origin, standalone]); // eslint-disable-line react-hooks/exhaustive-deps

  // ホイール・ピンチ（Ctrl＋ホイール）で拡大縮小（ページのスクロールにしない）
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const h = (e: WheelEvent): void => {
      if ((e.target as Element | null)?.closest?.('[data-testid="detail-card"]')) return;
      e.preventDefault(); e.stopPropagation();
      const r = el.getBoundingClientRect();
      const band = (sc: number): number => (sc >= 2.5 ? 2 : sc >= 1.5 ? 1 : 0);
      const before = band(get().s);
      zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 });
      // 画面側が階層を持つ面は、倍率のしきい値を越えたとき、画面の拡大・縮小ボタンと同じ操作で階層を切り替える（パンくずも変わる）
      const after = band(get().s);
      if (!standalone && after !== before) {
        const host = rootRef.current?.closest<HTMLElement>(HOST_SEL);
        const name = after > before ? '拡大' : '縮小';
        const btn = [...(host?.querySelectorAll('button') ?? [])].find((b) => !rootRef.current?.contains(b) && isName(b.getAttribute('aria-label') || (b.textContent ?? '').trim(), name) && !b.disabled);
        if (btn) { levelClick.current = true; try { btn.click(); } finally { levelClick.current = false; } }
      }
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [origin, standalone, view.full]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc: 詳細カードが開いていればカードだけ閉じ、なければ全画面を終える（FR-246）
  const escape = (): boolean => {
    if (closerRef.current?.()) return true;
    if (get().full) { patch(origin, { full: false }); return true; }
    return false;
  };
  useEffect(() => {
    if (!view.full) return undefined;
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !e.defaultPrevented && escape()) e.preventDefault(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [view.full, origin]); // eslint-disable-line react-hooks/exhaustive-deps

  // 全画面の間は、図以外（ほかの部品）を操作の対象から外す（支援技術にも見せない）
  useEffect(() => {
    if (!view.full) return undefined;
    const changed: Array<{ el: Element; hidden: string | null }> = [];
    for (let n: Element | null = rootRef.current; n && n.parentElement && n !== document.body; n = n.parentElement) {
      for (const sib of Array.from(n.parentElement.children)) {
        if (sib === n || sib.tagName === 'SCRIPT' || sib.hasAttribute('data-graph-keep')) continue;
        changed.push({ el: sib, hidden: sib.getAttribute('aria-hidden') });
        sib.setAttribute('aria-hidden', 'true');
        (sib as HTMLElement).inert = true;
      }
    }
    return () => { for (const c of changed) { if (c.hidden === null) c.el.removeAttribute('aria-hidden'); else c.el.setAttribute('aria-hidden', c.hidden); (c.el as HTMLElement).inert = false; } };
  }, [view.full]);

  // 全画面に入る・出るとき、フォーカスを操作の対象（「全画面を終了」「全画面」）に置く
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    (view.full ? exitRef.current : fsRef.current)?.focus();
  }, [view.full]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const dist = (): number => { const [a, b] = [...pointers.current.values()]; return Math.hypot(a!.x - b!.x, a!.y - b!.y); };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || (e.target as Element).closest(IGNORE_DRAG)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 合成のイベントなど */ }
    if (pointers.current.size === 2) { pinch.current = { d: dist() || 1, s: get().s }; drag.current = null; return; }
    const v = get();
    drag.current = { x: e.clientX, y: e.clientY, ox: v.x, oy: v.y };
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const v = get();
      const ratio = clampScale(pinch.current.s * (dist() / pinch.current.d)) / v.s;
      if (ratio !== 1) zoomBy(ratio);
      return;
    }
    const d = drag.current;
    if (d) patch(origin, { x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) { drag.current = null; setDragging(false); }
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
    const done = (): void => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'Escape') { if (escape()) done(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      done();
      panBy(e.key === 'ArrowLeft' ? -GRAPH_PAN_STEP : e.key === 'ArrowRight' ? GRAPH_PAN_STEP : 0, e.key === 'ArrowUp' ? -GRAPH_PAN_STEP : e.key === 'ArrowDown' ? GRAPH_PAN_STEP : 0);
      return;
    }
    if (e.key === 'f' || e.key === 'F') { done(); toggleFull(); return; }
    if (!standalone) return; // 画面側にキーの操作がある面は、画面に任せる
    if (e.key === '+' || e.key === '=') { done(); zoomBy(GRAPH_SCALE_STEP, undefined, 1); } else if (e.key === '-' || e.key === '_') { done(); zoomBy(1 / GRAPH_SCALE_STEP, undefined, -1); } else if (e.key === '0') { done(); homeNow(); }
  };

  const setDepth = useCallback((d: number) => patch(origin, { depth: d }), [origin, patch]);
  const ctx = useMemo<GraphViewportCtx>(() => ({
    origin, standalone, depth: view.depth, hl: view.hl, full: view.full, stageRef, cardHost, closerRef, setContentSize, setDepth,
  }), [origin, standalone, view.depth, view.hl, view.full, cardHost, setDepth]);

  const kind = kindOfDepth(view.depth, 1);
  const k = view.s * fit;
  const cw = content?.w ?? stageSize.w; const ch = content?.h ?? stageSize.h;
  const tx = stageSize.w / 2 + view.x - (cw * k) / 2; const ty = stageSize.h / 2 + view.y - (ch * k) / 2;
  const move = (name: string, icon: JSX.Element, dx: number, dy: number) => (
    <Button size="small" className={s.btn} icon={icon} aria-label={t(name)} title={t(name)} onClick={() => panBy(dx, dy)} />
  );
  return (
    <Ctx.Provider value={ctx}>
      <div
        ref={rootRef} className={mergeClasses(s.root, view.full && s.full, dragging && s.dragging, className)} role="group" aria-label={t('{label}の図（ドラッグ・Shift＋矢印キーで移動、ホイールで拡大縮小、F キーで全画面）', { label })} tabIndex={0}
        data-zoom-surface="graph" data-pan-x={r2(view.x)} data-pan-y={r2(view.y)} data-scale={r2(view.s)} data-fullscreen={view.full ? 'true' : undefined} {...attrs}
        onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      >
        <div className={s.toolbar} role="toolbar" aria-label={t('{label}の図の操作', { label })}>
          {standalone ? (
            <>
              <Button size="small" className={s.btn} onClick={() => { animate(); zoomBy(GRAPH_SCALE_STEP, undefined, 1); }}>{t('拡大')}</Button>
              <Button size="small" className={s.btn} onClick={() => { animate(); zoomBy(1 / GRAPH_SCALE_STEP, undefined, -1); }}>{t('縮小')}</Button>
              <Button size="small" className={s.btn} onClick={() => { homeNow(); }}>{t('全体表示に戻す')}</Button>
              <span data-testid="zoom-level" data-depth={view.depth} data-depth-count={3}><Badge appearance="tint">{t(ZOOM_KIND_LABELS[kind])}</Badge></span>
            </>
          ) : null}
          {move('図を上へ移動', <ArrowUp20Regular />, 0, -GRAPH_PAN_STEP)}
          {move('図を下へ移動', <ArrowDown20Regular />, 0, GRAPH_PAN_STEP)}
          {move('図を左へ移動', <ArrowLeft20Regular />, -GRAPH_PAN_STEP, 0)}
          {move('図を右へ移動', <ArrowRight20Regular />, GRAPH_PAN_STEP, 0)}
          <span className={s.grow} />
          {view.full ? (
            <Button key="exit" ref={exitRef} size="small" className={s.btn} icon={<FullScreenMinimize20Regular />} onClick={toggleFull}>{t('全画面を終了')}</Button>
          ) : (
            <Button key="enter" ref={fsRef} size="small" className={s.btn} icon={<FullScreenMaximize20Regular />} onClick={toggleFull}>{t('全画面')}</Button>
          )}
        </div>
        <div ref={setCardHost} className={s.cardHost} />
        <div ref={stageRef} className={mergeClasses(s.stage, stageHeightFull && s.stageFull)}>
          <div className={mergeClasses(s.content, anim && s.anim)} style={{ transform: `translate(${tx}px, ${ty}px) scale(${k})` }}>{children}</div>
        </div>
      </div>
    </Ctx.Provider>
  );
}
