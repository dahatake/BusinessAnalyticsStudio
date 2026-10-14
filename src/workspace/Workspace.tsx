// ワークスペース: レイアウトの木（分割とタブ）を描く。境界はドラッグでもキーボードでも動かせる（FR-109、NFR-A11Y-004）。
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { Button, Tab, TabList, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { useSnapMotion } from '../motion/useFoldMotion';
import { SNAP_LABEL, defaultSnapKind, nearestCorner, snapKindsFor, snapRect, type Edge, type SnapKind, type SnapOpts } from './snap';
import type { ScreenDefinition } from '../screens/types';
import { effectiveLayout, useLayout, clampFloat, type FloatRect } from '../store/layout';
import { EXPAND_RATIO, useSettings, type ExpandPosition } from '../store/settings';
import { keysOf, prune, type DropZone, type LayoutNode, type Path, type SplitNode } from './layoutModel';
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
  // 画面端のスナップの候補（FR-152）。端のすぐ内側に出し、配置後の見た目は snap-preview で示す
  snapPanel: {
    position: 'fixed', zIndex: 1001, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalS, borderRadius: tokens.borderRadiusLarge, boxShadow: tokens.shadow16,
    backgroundColor: tokens.colorNeutralBackground1, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
  },
  snapButton: { justifyContent: 'flex-start', minWidth: '96px', minHeight: '32px' },
  snapPreview: {
    position: 'fixed', zIndex: 1000, pointerEvents: 'none', boxSizing: 'border-box',
    backgroundColor: tokens.colorBrandBackground2, border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`, borderRadius: tokens.borderRadiusMedium,
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
  // 分割の木を入れる箱。拡大表示中は、余白で残りの領域に収める（FR-174）
  treeBox: { display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: 0, minWidth: 0, boxSizing: 'border-box' },
  // 自由配置・拡大表示のコンポーネントの置き場（作業領域に対する絶対配置。重なりを許す。FR-173）
  floatBox: { position: 'absolute', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, boxSizing: 'border-box', boxShadow: tokens.shadow16, borderRadius: tokens.borderRadiusMedium, overflow: 'hidden' },
  freePreview: {
    position: 'fixed', zIndex: 1000, pointerEvents: 'none', boxSizing: 'border-box',
    backgroundColor: tokens.colorBrandBackground2, border: `${tokens.strokeWidthThick} dashed ${tokens.colorBrandStroke1}`, borderRadius: tokens.borderRadiusMedium,
  },
  split: { display: 'flex', flex: '1 1 0', minWidth: 0, minHeight: 0 },
  row: { flexDirection: 'row' },
  col: { flexDirection: 'column' },
  cell: { display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 },
  // 最小化したコンポーネントのセル: 見出しだけの高さ（4px グリッド）。空いた領域はほかのセルが使う（FR-151）
  cellMin: { overflow: 'hidden' },
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

/** 最小化したコンポーネントの見出しだけの高さと、横に並べたときの幅（4px グリッド。FR-151） */
export const MINIMIZED_HEIGHT = 48;
export const MINIMIZED_WIDTH = 240;

const DRAG_THRESHOLD_PX = 4;
/** マウスで押したコンポーネントを「操作中」にするまでの待ち（ダブルクリックの間隔より長く） */
const POINTER_FOCUS_DELAY_MS = 500;
/** 分割線の上に放したときに、近くのコンポーネントへ寄せる距離（分割線の太さ 8px より少し大きく） */
const SNAP_PX = 12;

/** 画面端に近づけたときの、スナップの候補の状態（FR-152） */
interface SnapState {
  edges: Edge[];
  /** 選んでいる（または既定の）候補 */
  kind: SnapKind;
  opts: SnapOpts;
  /** ポインターの位置（候補の出す位置） */
  px: number;
  py: number;
}

interface DragState {
  key: string;
  target: { key: string; zone: DropZone; rect: DOMRect } | null;
  snap?: SnapState | null;
  /** 分割に入れず、置いた位置にそのまま置く（自由配置。FR-173）ときの、置く場所（画面上の座標） */
  free?: { left: number; top: number; width: number; height: number } | null;
}

/** 拡大表示の位置と大きさ（作業領域に対する割合。FR-174・FR-175） */
export function expandRect(pos: ExpandPosition): FloatRect {
  const r = EXPAND_RATIO;
  switch (pos) {
    case 'left': return { x: 0, y: 0, w: r, h: 1 };
    case 'right': return { x: 1 - r, y: 0, w: r, h: 1 };
    case 'bottom': return { x: 0, y: 1 - r, w: 1, h: r };
    default: return { x: 0, y: 0, w: 1, h: r };
  }
}

/** 拡大表示の分だけ、残りのコンポーネントを置く領域を狭める余白（px） */
function expandInset(pos: ExpandPosition, w: number, h: number): CSSProperties {
  const r = EXPAND_RATIO;
  switch (pos) {
    case 'left': return { paddingLeft: w * r };
    case 'right': return { paddingRight: w * r };
    case 'bottom': return { paddingBottom: h * r };
    default: return { paddingTop: h * r };
  }
}

/** 端からこの距離以内でスナップの候補を出す（PARAM-042） */
const SNAP_EDGE_PX = 32;
/** 候補の表示の周りで、候補を出し続ける余白 */
const SNAP_KEEP_PX = 24;

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
  const floatMap = useLayout((st) => st.floats[st.persona]);
  const zOrder = useLayout((st) => st.zOrder);
  const expandedKey = useLayout((st) => st.expanded);
  const expandPos = useSettings((st) => st.expandPosition);
  const autoSize = useLayout((st) => st.autoSize);
  const manualKeys = useLayout((st) => st.manual[st.persona]);
  const maximized = useLayout((st) => st.maximized);
  const snapMotion = useSnapMotion();
  const minimizedKeys = useLayout((st) => st.minimized[st.persona]);
  const minSet = useMemo(() => new Set(minimizedKeys ?? []), [minimizedKeys]);
  const actions = useLayout.getState;
  const byKey = useCallback((k: string) => screens.find((sc) => sc.key === k), [screens]);
  /** 操作中（フォーカスのある）コンポーネント、最後に選んだタブ、ワークスペースの幅 */
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // ナビなどで見せると指示されたコンポーネントは、最小幅でタブにまとめた中でも前面にする（非表示のタブにはフォーカスできないため）
  const revealed = useLayout((st) => st.revealed);
  useEffect(() => { if (revealed) setPicked(revealed.key); }, [revealed]);
  // 既定のレイアウトに戻した直後は、操作中の扱いを解く（次にコンポーネントを操作するまで既定の寸法。FR-110 AC-135 / FR-143）
  const resetCount = useLayout((st) => st.resetCount);
  useEffect(() => { if (resetCount > 0) { setFocusKey(null); setPicked(null); } }, [resetCount]);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  // 幅が狭い（または拡大率が高い）ときは、分割を縦に積む。レイアウトの木は変えず、描き方だけを替える。
  const rootRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  // 木の外に出して描くコンポーネント: 拡大表示中はそれ 1 つだけ（ほかは残りの領域に収める）、それ以外は自由配置したもの（FR-173・FR-174）。
  // 狭い画面（縦積み）では自由配置を使わない。
  const baseKeys = useMemo(() => new Set(keysOf(base)), [base]);
  const expandedOut = expandedKey !== null && baseKeys.has(expandedKey) ? expandedKey : null;
  const floatKeys = useMemo(
    () => (compact || expandedOut ? [] : Object.keys(floatMap ?? {}).filter((k) => baseKeys.has(k) && !!byKey(k)?.component)),
    [compact, expandedOut, floatMap, baseKeys, byKey],
  );
  const outKeys = useMemo(() => (expandedOut ? [expandedOut] : floatKeys), [expandedOut, floatKeys]);
  const treeBase = useMemo(() => (outKeys.length === 0 ? base : prune(base, new Set([...baseKeys].filter((k) => !outKeys.includes(k))))), [base, baseKeys, outKeys]);
  const inset = expandedOut ? expandInset(expandPos, width, height) : undefined;
  // 拡大表示中は「操作中」の更新を止める（復帰したとき、拡大前と同じ大きさに戻すため。FR-174）
  const expandedRef = useRef<string | null>(null);
  expandedRef.current = expandedOut;
  const treeWidth = expandedOut ? (expandPos === 'left' || expandPos === 'right' ? width * (1 - EXPAND_RATIO) : width) : width;
  // 自動のサイズ調整と最小の幅を、描くときだけ適用する。保存するレイアウト（base）は変えない（FR-143、AC-227）。拡大表示中は自動の調整を止める（A-41）。
  const layout = useMemo(() => {
    if (compact) return treeBase;
    const sized = applyAutoSize(treeBase, {
      enabled: autoSize && !expandedOut, focus: focusKey, primary: PERSONA_PRIMARY[persona], manual: new Set(manualKeys ?? []), width: treeWidth,
    });
    return fitMinWidth(sized, treeWidth, [picked, focusKey]);
  }, [treeBase, compact, autoSize, expandedOut, focusKey, persona, manualKeys, treeWidth, picked]);

  const pane = (key: string, group: string[], active: string): PaneInfo => {
    const a = actions();
    const isMax = maximized === key;
    const isFloat = floatKeys.includes(key);
    const zRank = zOrder.indexOf(key);
    return {
      key,
      maximized: isMax,
      expanded: expandedOut === key,
      toggleExpand: () => actions().toggleExpanded(key),
      floating: isFloat,
      toggleFloat: () => {
        if (isFloat || (floatMap && key in floatMap)) { actions().unfloat(key); return; }
        const r = rectOfKey(key);
        if (r) actions().setFloat(key, r);
      },
      z: zRank >= 0 ? 2 + zRank : undefined,
      minimized: minSet.has(key),
      toggleMinimize: () => a.setMinimized(key, !minSet.has(key)),
      visible: group.length === 1 || active === key,
      inTabs: group.length > 1,
      peers: keysOf(layout).filter((k) => !group.includes(k)).map((k) => ({ key: k, label: byKey(k)?.label ?? k })),
      toggleMaximize: () => actions().setMaximized(actions().maximized === key ? null : key),
      restore: () => actions().setMaximized(null),
      hide: () => a.hideComponent(key),
      move: (d) => {
        // 自由配置のコンポーネントは、同じ向きに作業領域の 5% ずつ動かす（ドラッグなしの手段。FR-173 AC-349）
        const cur = isFloat ? floatMap?.[key] : undefined;
        if (!cur) { a.moveComponent(key, d); return; }
        const step = 0.05;
        a.setFloat(key, { ...cur, x: cur.x + (d === 'right' ? step : d === 'left' ? -step : 0), y: cur.y + (d === 'down' ? step : d === 'up' ? -step : 0) });
      },
      toggleDirection: () => a.toggleDirection(key),
      snapTo: (kind) => a.snapTo(key, kind, { tabTarget: keysOf(layout).find((k) => !group.includes(k)) }),
      snapKinds: snapKindsFor(compact),
      mergeInto: (t) => a.mergeTabs(key, t),
      untab: () => a.untab(key),
      startDrag: (e) => startDrag(key, e),
    };
  };

  /** 画面上のコンポーネントの、作業領域に対する位置と大きさ（0〜1）。見つからなければ null */
  const rectOfKey = (key: string): FloatRect | null => {
    const root = rootRef.current;
    const el = root?.querySelector(`[data-testid="component-${key}"]`);
    if (!root || !el) return null;
    const a = root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (a.width <= 0 || a.height <= 0 || r.width <= 0 || r.height <= 0) return null;
    return clampFloat({ x: (r.left - a.left) / a.width, y: (r.top - a.top) / a.height, w: r.width / a.width, h: r.height / a.height });
  };

  const hosts = useRef(new Map<string, HTMLElement>());
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); setWidth(r.width); setHeight(r.height); setCompact(isCompactWidth(r.width)); };
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
  outKeys.forEach((k) => groups.set(k, { tabs: [k], active: k }));

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

  const renderSplit = (node: SplitNode, path: Path): JSX.Element => {
    const isFolded = (child: LayoutNode): boolean => keysOf(child).every((k) => minSet.has(k)) && maximized === null;
    // 畳んだセルがあるとき、残りのセルの伸びる割合の合計を 1 にそろえる（合計が 1 未満だと、空いた領域を使い切らない）
    const open = node.children.reduce((sum, c, i) => (isFolded(c) ? sum : sum + (node.sizes[i] ?? 0)), 0);
    const anyFolded = node.children.some(isFolded);
    return (
    <div className={mergeClasses(s.split, node.dir === 'row' ? s.row : s.col)} key={path.join('.')}>
      {node.children.flatMap((child, i) => {
        const folded = isFolded(child);
        const cellStyle: CSSProperties = folded
          ? (node.dir === 'row'
            ? { flex: `0 0 ${MINIMIZED_WIDTH}px`, alignSelf: 'flex-start', height: MINIMIZED_HEIGHT }
            : { flex: `0 0 ${MINIMIZED_HEIGHT}px` })
          : { flex: `${anyFolded && open > 0 ? (node.sizes[i] ?? 0) / open : node.sizes[i]} 1 0` };
        const cell = (
          <div key={`c${i}`} className={mergeClasses(s.cell, folded ? s.cellMin : undefined)} style={cellStyle} data-folded={folded ? 'true' : undefined}>
            {render(child, [...path, i])}
          </div>
        );
        return i < node.children.length - 1
          ? [cell, <Separator key={`s${i}`} a={keysOf(child)[0]!} b={keysOf(node.children[i + 1]!)[0]!} dir={node.dir} size={node.sizes[i]!} />]
          : [cell];
      })}
    </div>
    );
  };

  const renderStack = (root: LayoutNode): JSX.Element => (
    <div className={s.stack}>
      {stackedLeaves(root).map((leafNode, i) => (
        <div key={`k${leafNode.tabs.join('+')}`} className={s.stackCell} data-stacked={i} style={leafNode.tabs.every((k) => minSet.has(k)) && maximized === null ? { height: MINIMIZED_HEIGHT } : undefined}>
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

  /** 作業領域の端（PARAM-042 以内）に近づけたときのスナップの候補。候補の上にいる間は、その候補を選ぶ（FR-152） */
  const snapAt = (x: number, y: number, key: string, hitKey: string | null): SnapState | null => {
    const root = rootRef.current;
    if (!root) return null;
    const area = root.getBoundingClientRect();
    if (area.width <= 0 || area.height <= 0) return null;
    const prev = dragRef.current?.snap ?? null;
    const edges: Edge[] = [];
    if (x >= area.left && x <= area.right && y >= area.top && y <= area.bottom) {
      if (x - area.left <= SNAP_EDGE_PX) edges.push('left');
      else if (area.right - x <= SNAP_EDGE_PX) edges.push('right');
      if (y - area.top <= SNAP_EDGE_PX) edges.push('top');
      else if (area.bottom - y <= SNAP_EDGE_PX) edges.push('bottom');
    }
    const panel = document.querySelector('[data-testid="snap-candidates"]')?.getBoundingClientRect();
    const inPanel = !!panel && x >= panel.left - SNAP_KEEP_PX && x <= panel.right + SNAP_KEEP_PX && y >= panel.top - SNAP_KEEP_PX && y <= panel.bottom + SNAP_KEEP_PX;
    if (edges.length === 0 && !(prev && inPanel)) return null;
    const useEdges = edges.length > 0 ? edges : prev!.edges;
    const kinds = snapKindsFor(compact);
    const over = document.elementsFromPoint(x, y).find((el) => el.hasAttribute('data-snap-kind'))?.getAttribute('data-snap-kind') as SnapKind | null | undefined;
    const kind = over && kinds.includes(over) ? over : edges.length > 0 ? defaultSnapKind(useEdges, compact) : prev!.kind;
    const horizontal = useEdges.find((e) => e === 'left' || e === 'right');
    const vertical = useEdges.find((e) => e === 'top' || e === 'bottom');
    const opts: SnapOpts = {
      edge: horizontal ?? vertical,
      corner: edges.length > 0
        ? (horizontal && vertical ? (`${vertical === 'top' ? 't' : 'b'}${horizontal === 'left' ? 'l' : 'r'}` as SnapOpts['corner']) : nearestCorner((x - area.left) / area.width, (y - area.top) / area.height))
        : prev!.opts.corner,
      tabTarget: (edges.length > 0 ? hitKey : null) ?? prev?.opts.tabTarget ?? keysOf(layout).find((k) => k !== key),
    };
    if (opts.tabTarget === key) opts.tabTarget = keysOf(layout).find((k) => k !== key);
    return { edges: useEdges, kind, opts, px: edges.length > 0 ? x : prev!.px, py: edges.length > 0 ? y : prev!.py };
  };

  /** 見出しのドラッグでコンポーネントを動かす。置ける場所を移動中に示し、Esc で中止する（FR-142 AC-224）。 */
  const startDrag = (key: string, e: { button: number; clientX: number; clientY: number }) => {
    if (e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let active = false;
    // つかんだ位置（コンポーネントの左上からの差）と大きさ。置いた位置の計算に使う（FR-173）
    const grabRect = rootRef.current?.querySelector(`[data-testid="component-${key}"]`)?.getBoundingClientRect() ?? null;
    const offX = grabRect ? sx - grabRect.left : 0;
    const offY = grabRect ? sy - grabRect.top : 0;
    useLayout.getState().raise(key);
    /** ポインターの位置から、自由配置の置き場所（画面上の座標。作業領域の中に収める）を決める */
    const freeAt = (px: number, py: number): DragState['free'] => {
      const area = rootRef.current?.getBoundingClientRect();
      if (compact || !area || !grabRect || area.width <= 0 || area.height <= 0) return null;
      const width = Math.min(grabRect.width, area.width);
      const height = Math.min(grabRect.height, area.height);
      const left = Math.min(Math.max(px - offX, area.left), area.right - width);
      const top = Math.min(Math.max(py - offY, area.top), area.bottom - height);
      return { left, top, width, height };
    };
    let lastFree: DragState['free'] = null;
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
      const snap = snapAt(ev.clientX, ev.clientY, key, hit?.key ?? null);
      // 分割へ入れる置き場所（上下左右の辺）でも、端のスナップでもなければ、置いた位置にそのまま置く（自由配置。重なってもよい。FR-173）
      const docking = !!snap || (hit !== null && (hit.zone !== 'tabs' || compact));
      lastFree = docking ? null : freeAt(ev.clientX, ev.clientY);
      setDrag({ key, target: hit && !snap && docking ? { key: hit.key, zone: hit.zone, rect: hit.rect } : null, snap, free: lastFree });
    };
    const onUp = () => {
      const d = dragRef.current;
      stop();
      setDrag(null);
      const area = rootRef.current?.getBoundingClientRect();
      if (active && d?.snap) useLayout.getState().snapTo(key, d.snap.kind, d.snap.opts);
      else if (active && d?.target) useLayout.getState().dropMove(key, d.target.key, d.target.zone);
      else if (active && lastFree && area && grabRect) {
        useLayout.getState().setFloat(key, { x: (lastFree.left - area.left) / area.width, y: (lastFree.top - area.top) / area.height, w: lastFree.width / area.width, h: lastFree.height / area.height });
      }
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
  const refocusing = useRef(false);
  useLayoutEffect(() => {
    const el = lastFocused.current;
    if (!el || !el.isConnected) return;
    const a = document.activeElement;
    if (a && a !== document.body) return;
    if (!rootRef.current?.contains(el) || el.getClientRects().length === 0) return;
    refocusing.current = true;
    el.focus({ preventScroll: true });
    refocusing.current = false;
  }, [layout]);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const down = () => { pointerDown.current = true; };
    const up = () => {
      pointerDown.current = false;
      const k = pendingFocus.current;
      pendingFocus.current = null;
      // click は pointerup の直後に届くので、その後で反映する
      // ダブルクリック（ヘッダーの拡大表示・復帰など）の途中で、1 回目のクリックのあとにレイアウトが動いて 2 回目が外れたり、
      // 拡大・復帰の前後で大きさが変わったりしないよう、マウスで操作した場合は、ダブルクリックの間隔が過ぎてから反映する（FR-174）。
      if (k) setTimeout(() => { if (!expandedRef.current) setFocusKey(k); }, POINTER_FOCUS_DELAY_MS);
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
    if (dragRef.current || expandedRef.current || refocusing.current) return;
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

  /** 操作した（押した）コンポーネントを手前に出す（FR-173。重なったときは直近に操作したものが手前） */
  const onPointerDownRaise = (e: PointerEvent<HTMLDivElement>) => {
    for (let n: Element | null = e.target as Element; n && n !== e.currentTarget; n = n.parentElement) {
      const id = n.getAttribute('data-testid') ?? '';
      if (id.startsWith('component-') && id !== 'component-menu' && id !== 'component-actions') { actions().raise(id.slice('component-'.length)); return; }
    }
  };

  return (
    <div
      ref={rootRef}
      onFocusCapture={onFocusCapture}
      onPointerDownCapture={onPointerDownRaise}
      className={mergeClasses(s.root, compact ? s.rootCompact : undefined)}
      data-layout={compact ? 'stacked' : 'split'}
    >
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
      {drag?.snap ? (() => {
        const sn = drag.snap;
        const area = rootRef.current?.getBoundingClientRect();
        if (!area) return null;
        const tabEl = sn.opts.tabTarget ? rootRef.current?.querySelector(`[data-testid="component-${sn.opts.tabTarget}"]`) : null;
        const pr = snapRect(area, sn.kind, sn.opts, tabEl?.getBoundingClientRect() ?? null);
        const h = sn.edges.find((e) => e === 'left' || e === 'right');
        const panelPos: CSSProperties = h
          ? { top: Math.min(Math.max(sn.py, area.top + 120), area.bottom - 120), transform: 'translateY(-50%)', ...(h === 'left' ? { left: area.left + 40 } : { right: window.innerWidth - area.right + 40 }) }
          : { left: Math.min(Math.max(sn.px, area.left + 80), area.right - 80), transform: 'translateX(-50%)', ...(sn.edges[0] === 'top' ? { top: area.top + 40 } : { bottom: window.innerHeight - area.bottom + 40 }) };
        return (
          <>
            <div data-testid="snap-preview" aria-hidden className={mergeClasses(s.snapPreview, snapMotion.follow)} style={{ left: pr.left, top: pr.top, width: pr.width, height: pr.height }} />
            <div data-testid="snap-candidates" role="group" aria-label="配置の候補" className={mergeClasses(s.snapPanel, snapMotion.appear)} style={panelPos}>
              {snapKindsFor(compact).map((k) => (
                <Button
                  key={k}
                  data-snap-kind={k}
                  className={s.snapButton}
                  size="small"
                  appearance={k === sn.kind ? 'primary' : 'secondary'}
                  aria-pressed={k === sn.kind}
                >
                  {SNAP_LABEL[k]}
                </Button>
              ))}
            </div>
          </>
        );
      })() : null}
      {drag?.free ? (
        <div data-testid="free-indicator" aria-hidden className={s.freePreview} style={{ left: drag.free.left, top: drag.free.top, width: drag.free.width, height: drag.free.height }} />
      ) : null}
      <div className={s.treeBox} style={inset}>
        {layout ? (compact ? renderStack(layout) : render(layout, [])) : (
          <Text className={s.empty} size={400}>{outKeys.length > 0 ? '' : '表示中のコンポーネントがありません。左のドックから再表示してください。'}</Text>
        )}
      </div>
      {outKeys.map((k) => {
        const r = expandedOut === k ? expandRect(expandPos) : floatMap?.[k];
        if (!r || !byKey(k)?.component) return null;
        const rank = zOrder.indexOf(k);
        return (
          <div
            key={`float-${k}`}
            className={s.floatBox}
            data-float={k}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, zIndex: expandedOut === k ? 500 : 2 + Math.max(rank, 0) }}
          >
            <Slot host={hostOf(k)} />
          </div>
        );
      })}
      {[...groups.entries()].map(([key, g]) => {
        const Screen = byKey(key)?.component;
        if (!Screen) return null;
        return createPortal(<PaneContext.Provider value={pane(key, g.tabs, g.active)}><Screen /></PaneContext.Provider>, hostOf(key), key);
      })}
    </div>
  );
}
