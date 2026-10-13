// ワークスペース: レイアウトの木（分割とタブ）を描く。境界はドラッグでもキーボードでも動かせる（FR-109、NFR-A11Y-004）。
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { Tab, TabList, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import type { ScreenDefinition } from '../screens/types';
import { effectiveLayout, useLayout } from '../store/layout';
import { keysOf, type DropZone, type LayoutNode, type Path, type SplitNode } from './layoutModel';
import { applyAutoSize, fitMinWidth } from './autosize';
import { PERSONA_PRIMARY } from './persona';
import { PaneContext, type PaneInfo } from './PaneContext';
import { COMPACT_CELL_HEIGHT, isCompactWidth, stackedLeaves } from './compact';

const useStyles = makeStyles({
  // ドラッグ中に、置ける場所をドロップの前に示す（FR-142）。Fluent 2 のブランドの色トークンと 4px グリッド
  drop: {
    position: 'fixed',
    zIndex: 1000,
    pointerEvents: 'none',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    backgroundColor: tokens.colorBrandBackground2,
    border: `${tokens.strokeWidthThick} dashed ${tokens.colorBrandStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  dropLabel: {
    margin: tokens.spacingVerticalS,
    paddingBlock: tokens.spacingVerticalXXS,
    paddingInline: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
  },
  root: { position: 'relative', display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: 0, minWidth: 0 },
  split: { display: 'flex', flex: '1 1 0', minWidth: 0, minHeight: 0 },
  row: { flexDirection: 'row' },
  col: { flexDirection: 'column' },
  cell: { display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 },
  sep: {
    flex: '0 0 auto',
    backgroundColor: tokens.colorNeutralStroke2,
    ':hover': { backgroundColor: tokens.colorBrandStroke1 },
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` },
    touchAction: 'none',
  },
  sepV: { width: '8px', cursor: 'col-resize' },
  sepH: { height: '8px', cursor: 'row-resize' },
  tabs: { display: 'flex', flexDirection: 'column', flex: '1 1 0', minWidth: 0, minHeight: 0 },
  tabBody: { display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: 0, minWidth: 0 },
  empty: { padding: tokens.spacingHorizontalXXL },
  // 狭い画面・高い拡大率: 分割を縦に積み、全体を縦にスクロールする（NFR-UX-002、NFR-UX-005）
  rootCompact: { flex: '1 0 auto' },
  stack: { display: 'flex', flexDirection: 'column', flex: '0 0 auto', minWidth: 0, rowGap: tokens.spacingVerticalS },
  stackCell: { display: 'flex', flexDirection: 'column', flex: '0 0 auto', minWidth: 0, height: COMPACT_CELL_HEIGHT },
});

const KEY_STEP = 0.02;

const DRAG_THRESHOLD_PX = 4;
/** 分割線の上に放したときに、近くのコンポーネントへ寄せる距離（分割線の太さ 8px より少し大きく） */
const SNAP_PX = 12;

interface DragState {
  key: string;
  target: { key: string; zone: DropZone; rect: DOMRect } | null;
}

/** 置き場所の説明（ドロップ先の表示と、読み上げに使う） */
const ZONE_LABEL: Record<DropZone, string> = { left: '左', right: '右', top: '上', bottom: '下', tabs: 'タブへ移動します' };

/** コンポーネントの中の位置（0〜1）から、置き場所を決める。中央はタブにまとめ、それ以外はいちばん近い辺。 */
export function zoneOf(fx: number, fy: number): DropZone {
  if (fx > 0.3 && fx < 0.7 && fy > 0.3 && fy < 0.7) return 'tabs';
  const d = { left: fx, right: 1 - fx, top: fy, bottom: 1 - fy };
  return (Object.keys(d) as Array<'left' | 'right' | 'top' | 'bottom'>).reduce((a, b) => (d[b] < d[a] ? b : a));
}

/** ドロップ先の表示の位置と大きさ（置く側の半分。タブは全体）。 */
function dropRect(r: DOMRect, zone: DropZone): CSSProperties {
  const half = { w: r.width / 2, h: r.height / 2 };
  switch (zone) {
    case 'left': return { left: r.left, top: r.top, width: half.w, height: r.height };
    case 'right': return { left: r.left + half.w, top: r.top, width: half.w, height: r.height };
    case 'top': return { left: r.left, top: r.top, width: r.width, height: half.h };
    case 'bottom': return { left: r.left, top: r.top + half.h, width: r.width, height: half.h };
    default: return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
}

const FILL: CSSProperties = { display: 'flex', flexDirection: 'column', flex: '1 1 0', minWidth: 0, minHeight: 0 };

/**
 * 画面の描画先。画面ごとに 1 つの「ホスト」要素を持ち、画面はそこへポータルで描く（Workspace が所有）。
 * 木の中の位置（スロット）が変わっても、ホストを差し替えるだけなので、画面は再マウントされず useState の状態が残る。
 */
function Slot({ host, hidden }: { host: HTMLElement; hidden?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && host.parentElement !== el) el.appendChild(host);
  });
  return <div ref={ref} style={hidden ? { display: 'none' } : FILL} />;
}

/** 境界の両側のコンポーネント（それぞれの先頭のキー）で、動かす分割を決める。自動の調整・最小の幅でタブにまとめた見た目でも、保存した木の正しい境界を動かす。 */
function Separator({ a, b, dir, size }: { a: string; b: string; dir: 'row' | 'col'; size: number }) {
  const s = useStyles();
  const resizeAt = useLayout((st) => st.resizeByKeys);
  const start = useRef<{ pos: number; total: number; last: number } | null>(null);
  const vertical = dir === 'row';

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const parent = e.currentTarget.parentElement;
    if (!parent) return;
    const r = parent.getBoundingClientRect();
    start.current = { pos: vertical ? e.clientX : e.clientY, total: vertical ? r.width : r.height, last: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const st = start.current;
    if (!st || st.total <= 0) return;
    const moved = ((vertical ? e.clientX : e.clientY) - st.pos) / st.total;
    const delta = moved - st.last;
    st.last = moved;
    if (delta !== 0) resizeAt(a, b, delta);
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    start.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dec = vertical ? 'ArrowLeft' : 'ArrowUp';
    const inc = vertical ? 'ArrowRight' : 'ArrowDown';
    if (e.key === dec) { e.preventDefault(); resizeAt(a, b, -KEY_STEP); }
    else if (e.key === inc) { e.preventDefault(); resizeAt(a, b, KEY_STEP); }
  };

  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label="コンポーネントの境界（矢印キーで大きさを変える）"
      aria-valuemin={10}
      aria-valuemax={90}
      aria-valuenow={Math.round(size * 100)}
      tabIndex={0}
      className={mergeClasses(s.sep, vertical ? s.sepV : s.sepH)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
    />
  );
}

export function Workspace({ screens }: { screens: readonly ScreenDefinition[] }) {
  const s = useStyles();
  const persona = useLayout((st) => st.persona);
  const stored = useLayout((st) => st.layouts);
  const base = useMemo(() => effectiveLayout({ persona, layouts: stored }), [persona, stored]);
  const autoSize = useLayout((st) => st.autoSize);
  const manualKeys = useLayout((st) => st.manual[st.persona]);
  const maximized = useLayout((st) => st.maximized);
  const actions = useLayout.getState;
  const byKey = useCallback((k: string) => screens.find((sc) => sc.key === k), [screens]);
  /** 操作中（フォーカスのある）コンポーネント、最後に選んだタブ、ワークスペースの幅 */
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // ナビなどで見せると指示されたコンポーネントは、最小幅でタブにまとめた中でも前面にする（非表示のタブにはフォーカスできないため）
  const revealed = useLayout((st) => st.revealed);
  useEffect(() => { if (revealed) setPicked(revealed.key); }, [revealed]);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  // 幅が狭い（または拡大率が高い）ときは、分割を縦に積む。レイアウトの木は変えず、描き方だけを替える。
  const rootRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  // 自動のサイズ調整と最小の幅を、描くときだけ適用する。保存するレイアウト（base）は変えない（FR-143、AC-227）。
  const layout = useMemo(() => {
    if (compact) return base;
    const sized = applyAutoSize(base, {
      enabled: autoSize, focus: focusKey, primary: PERSONA_PRIMARY[persona], manual: new Set(manualKeys ?? []), width,
    });
    return fitMinWidth(sized, width, [picked, focusKey]);
  }, [base, compact, autoSize, focusKey, persona, manualKeys, width, picked]);

  const pane = (key: string, group: string[], active: string): PaneInfo => {
    const a = actions();
    const isMax = maximized === key;
    return {
      key,
      maximized: isMax,
      visible: group.length === 1 || active === key,
      inTabs: group.length > 1,
      peers: keysOf(layout).filter((k) => !group.includes(k)).map((k) => ({ key: k, label: byKey(k)?.label ?? k })),
      toggleMaximize: () => actions().setMaximized(actions().maximized === key ? null : key),
      restore: () => actions().setMaximized(null),
      hide: () => a.hideComponent(key),
      move: (d) => a.moveComponent(key, d),
      toggleDirection: () => a.toggleDirection(key),
      mergeInto: (t) => a.mergeTabs(key, t),
      untab: () => a.untab(key),
      startDrag: (e) => startDrag(key, e),
    };
  };

  const hosts = useRef(new Map<string, HTMLElement>());
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => { const w = el.getBoundingClientRect().width; setWidth(w); setCompact(isCompactWidth(w)); };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const hostOf = (key: string): HTMLElement => {
    let h = hosts.current.get(key);
    if (!h) {
      h = document.createElement('div');
      h.dataset.host = key;
      Object.assign(h.style, { display: 'flex', flexDirection: 'column', flex: '1 1 0', minWidth: '0', minHeight: '0' });
      hosts.current.set(key, h);
    }
    return h;
  };
  /** 画面のキー → 同じタブのまとまり（portal に渡す文脈用） */
  const groups = new Map<string, { tabs: string[]; active: string }>();
  const collect = (n: LayoutNode): void => {
    if (n.kind === 'tabs') n.tabs.forEach((k) => groups.set(k, { tabs: n.tabs, active: n.active }));
    else n.children.forEach(collect);
  };
  if (layout) collect(layout);

  const renderLeaf = (key: string, hidden = false) => {
    if (!byKey(key)?.component) return null;
    return <Slot key={key} host={hostOf(key)} hidden={hidden} />;
  };

  const render = (node: LayoutNode, path: Path): JSX.Element => {
    if (node.kind === 'tabs') {
      if (node.tabs.length === 1) return <div className={s.tabs} key={path.join('.')}>{renderLeaf(node.tabs[0]!)}</div>;
      return (
        <div className={s.tabs} key={path.join('.')}>
          <TabList
            size="small"
            selectedValue={node.active}
            onTabSelect={(_, d) => { setPicked(String(d.value)); useLayout.getState().activateTab(String(d.value)); }}
          >
            {node.tabs.map((k) => <Tab key={k} value={k}>{byKey(k)?.label ?? k}</Tab>)}
          </TabList>
          {/* 非表示のタブも描画したまま display で隠し、タブを切り替えても状態を保つ */}
          <div className={s.tabBody}>{node.tabs.map((k) => renderLeaf(k, k !== node.active))}</div>
        </div>
      );
    }
    return renderSplit(node, path);
  };

  const renderSplit = (node: SplitNode, path: Path): JSX.Element => (
    <div className={mergeClasses(s.split, node.dir === 'row' ? s.row : s.col)} key={path.join('.')}>
      {node.children.flatMap((child, i) => {
        const cell = (
          <div key={`c${i}`} className={s.cell} style={{ flex: `${node.sizes[i]} 1 0` }}>
            {render(child, [...path, i])}
          </div>
        );
        return i < node.children.length - 1
          ? [cell, <Separator key={`s${i}`} a={keysOf(child)[0]!} b={keysOf(node.children[i + 1]!)[0]!} dir={node.dir} size={node.sizes[i]!} />]
          : [cell];
      })}
    </div>
  );

  const renderStack = (root: LayoutNode): JSX.Element => (
    <div className={s.stack}>
      {stackedLeaves(root).map((leafNode, i) => (
        <div key={`k${leafNode.tabs.join('+')}`} className={s.stackCell} data-stacked={i}>
          {render(leafNode, [i])}
        </div>
      ))}
    </div>
  );

  /** 画面上の位置にあるコンポーネント（表示中のもの。`except` を除く）と、その中のどこに当たるか */
  const hitTest = (x: number, y: number, except: string): { key: string; zone: DropZone; rect: DOMRect } | null => {
    const root = rootRef.current;
    if (!root) return null;
    const visible = new Set(keysOf(layout));
    for (const el of document.elementsFromPoint(x, y)) {
      if (!root.contains(el)) continue;
      for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
        const id = n.getAttribute('data-testid') ?? '';
        const k = id.startsWith('component-') ? id.slice('component-'.length) : '';
        if (k && visible.has(k)) {
          if (k === except) return null;
          const rect = n.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return null;
          return { key: k, zone: zoneOf((x - rect.left) / rect.width, (y - rect.top) / rect.height), rect };
        }
      }
    }
    // 境界（分割線）の上など、コンポーネントの外でも、すぐ近く（分割線の太さ程度）なら、いちばん近いコンポーネントに寄せる
    let best: { key: string; rect: DOMRect; dist: number } | null = null;
    for (const k of visible) {
      const el = root.querySelector(`[data-testid="component-${k}"]`);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const dist = Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom));
      if (!best || dist < best.dist) best = { key: k, rect, dist };
    }
    if (!best || best.dist > SNAP_PX || best.key === except) return null;
    const cx = Math.min(Math.max(x, best.rect.left), best.rect.right);
    const cy = Math.min(Math.max(y, best.rect.top), best.rect.bottom);
    return { key: best.key, zone: zoneOf((cx - best.rect.left) / best.rect.width, (cy - best.rect.top) / best.rect.height), rect: best.rect };
  };

  /** 見出しのドラッグでコンポーネントを動かす。置ける場所を移動中に示し、Esc で中止する（FR-142 AC-224）。 */
  const startDrag = (key: string, e: { button: number; clientX: number; clientY: number }) => {
    if (e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let active = false;
    const stop = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('keydown', onKey, true);
      document.body.style.userSelect = '';
    };
    const onMove = (ev: globalThis.PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD_PX) return;
        active = true;
        document.body.style.userSelect = 'none';
      }
      const hit = hitTest(ev.clientX, ev.clientY, key);
      setDrag({ key, target: hit ? { key: hit.key, zone: hit.zone, rect: hit.rect } : null });
    };
    const onUp = () => {
      const d = dragRef.current;
      stop();
      setDrag(null);
      if (active && d?.target) useLayout.getState().dropMove(key, d.target.key, d.target.zone);
    };
    const onCancel = () => { stop(); setDrag(null); };
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      stop();
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    window.addEventListener('keydown', onKey, true);
  };

  /** フォーカスが入ったコンポーネントを「操作中」にする（FR-143）。ドラッグ中は変えない。
   * マウスで押している間は大きさを変えない: 押した位置のボタンが動いて、クリックが成立しなくなるため。放したときに反映する。 */
  const pointerDown = useRef(false);
  /** 直前にフォーカスのあった要素。自動のサイズ調整でコンポーネントの置き場所（DOM の親）が変わると、フォーカスが body に落ちるので戻す */
  const lastFocused = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const el = lastFocused.current;
    if (!el || !el.isConnected) return;
    const a = document.activeElement;
    if (a && a !== document.body) return;
    if (!rootRef.current?.contains(el) || el.getClientRects().length === 0) return;
    el.focus({ preventScroll: true });
  }, [layout]);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const down = () => { pointerDown.current = true; };
    const up = () => {
      pointerDown.current = false;
      const k = pendingFocus.current;
      pendingFocus.current = null;
      // click は pointerup の直後に届くので、その後で反映する
      if (k) setTimeout(() => setFocusKey(k), 0);
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, []);
  const onFocusCapture = (e: FocusEvent<HTMLDivElement>) => {
    lastFocused.current = e.target as HTMLElement;
    if (dragRef.current) return;
    const visible = new Set(keysOf(base));
    for (let n: Element | null = e.target as Element; n && n !== e.currentTarget; n = n.parentElement) {
      const id = n.getAttribute('data-testid') ?? '';
      const k = id.startsWith('component-') ? id.slice('component-'.length) : '';
      if (k && visible.has(k)) {
        if (pointerDown.current) pendingFocus.current = k;
        else setFocusKey(k);
        return;
      }
    }
  };

  return (
    <div ref={rootRef} onFocusCapture={onFocusCapture} className={mergeClasses(s.root, compact ? s.rootCompact : undefined)} data-layout={compact ? 'stacked' : 'split'}>
      {drag?.target ? (
        <div
          data-testid="drop-indicator"
          aria-hidden
          className={s.drop}
          style={dropRect(drag.target.rect, drag.target.zone)}
        >
          <Text size={200} weight="semibold" className={s.dropLabel}>
            {`${byKey(drag.key)?.label ?? drag.key}を${byKey(drag.target.key)?.label ?? drag.target.key}の${ZONE_LABEL[drag.target.zone]}`}
          </Text>
        </div>
      ) : null}
      {layout ? (compact ? renderStack(layout) : render(layout, [])) : (
        <Text className={s.empty} size={400}>表示中のコンポーネントがありません。左のドックから再表示してください。</Text>
      )}
      {[...groups.entries()].map(([key, g]) => {
        const Screen = byKey(key)?.component;
        if (!Screen) return null;
        return createPortal(<PaneContext.Provider value={pane(key, g.tabs, g.active)}><Screen /></PaneContext.Provider>, hostOf(key), key);
      })}
    </div>
  );
}
