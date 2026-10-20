// 画面のパネルの共通の外枠（見出し・説明）。画面はこれで包み、見た目の体系をそろえる。
// ワークスペースの中では、フォーカス・最大化（Shift+F／ダブルクリック）・非表示（H）・メニューを受け持つ（FR-013/FR-109）。
// 顧客パックにサンプルの項目があるときは、見出しの横に「サンプル」を明記する（FR-008）。
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { Badge, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { hasSampleData } from '../data/sample';
import { usePackStore } from '../store/pack';
import { useFoldClass } from '../motion/useFoldMotion';
import { ComponentActions, usePane } from '../workspace/PaneContext';
import type { Move } from '../workspace/layoutModel';
import { getEntityGraph } from '../selection/hooks';
import { useSelectionStore } from '../store/selection';
import { useComponentView } from '../view/useView';
import { HIDDEN_SELECTION_TEXT, selectionHiddenIn, singleWorldNote } from '../view/viewModel';
import { isEditableTarget, panelKeyAction, runPanelKeyAction, titleDoubleClick, type KeyLike } from './panelKeys';
import { TIER_APPEARANCE, TIER_LABEL } from '../workspace/tiers';

/** これより狭いコンポーネントは、見出しの操作アイコンを出さず「…」メニューに任せる（FR-150 AC-259）。
 *  アイコン 4 個（各 24px 以上）と「…」が見出しの横に収まる幅。既定の配置の列（約 300px）でもアイコンが出る（NFR-UX-015 AC-476 のツールチップ） */
const NARROW_PANE_PX = 240;
/** これより狭いコンポーネントは、見出しを詰める（見出しの文字を 1 段小さい Fluent 2 の段にし、操作アイコンと「…」をまとめて見出しの下の行の右へ置く）。
 *  細い列で見出しが何行にも折れて、画面の上部の情報（FR-041 のサマリーなど）が下へ押し出されるのを防ぐ。
 *  見出しの操作に「ビュー」ボタン（文字で現在の表示を示す。FR-217・FR-218）が加わった分（約 60px）だけ、360px から広げた */
const COMPACT_PANE_PX = 420;

const useStyles = makeStyles({
  // 外枠（ワークスペースの外では従来どおりの幅と余白）
  root: { display: 'flex', flexDirection: 'column', maxWidth: '960px' },
  // 本体（見出し・説明・画面の中身）。ハンドルとは背景色を分ける（FR-183）
  body: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXXL,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
  pane: {
    maxWidth: 'none',
    boxSizing: 'border-box',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
  paneBody: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0, minWidth: 0, overflow: 'auto', boxSizing: 'border-box', rowGap: tokens.spacingVerticalM, padding: `0 ${tokens.spacingHorizontalL} ${tokens.spacingVerticalS}` },
  maximized: { position: 'absolute', inset: 0, zIndex: 10, height: 'auto' },
  // 最小化: 見出しだけを残す。中身は mount したまま隠し、入力中の内容・絞り込みを保つ（FR-151 AC-260）
  minimized: {
    overflow: 'hidden',
    paddingBlock: tokens.spacingVerticalS,
    rowGap: 0,
    '& > *:not(:first-child)': { display: 'none' },
  },
  // コンポーネント上部の掴み場所（ハンドル）。本体と色を変え、掴みの印（色以外の識別手段）を付ける（FR-183）
  handle: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '16px',
    boxSizing: 'border-box',
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    userSelect: 'none',
    touchAction: 'none',
    '@media (forced-colors: active)': { backgroundColor: 'ButtonFace', color: 'ButtonText', borderBottom: `${tokens.strokeWidthThin} solid ButtonText` },
  },
  handleGrab: { cursor: 'grab', ':active': { cursor: 'grabbing' } },
  grip: {
    display: 'block',
    width: '40px',
    height: '8px',
    boxSizing: 'border-box',
    borderTop: `${tokens.strokeWidthThick} solid currentColor`,
    borderBottom: `${tokens.strokeWidthThick} solid currentColor`,
  },
  head: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS },
  headRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXS },
  titleRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalM, flex: '1 1 0', minWidth: 0 },
  // 詰めた見出し: 見出しの文字の行を全幅にし、操作アイコンと「…」は次の行の右へまとめて置く
  titleRowCompact: { flexBasis: '100%' },
  actionGroup: { display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, marginInlineStart: 'auto' },
  // 見出しをつかんで動かす（FR-142）。つかめることをカーソルで示し、動かしている間に文字が選択されないようにする
  grab: { flexGrow: 1, cursor: 'grab', userSelect: 'none', touchAction: 'none', ':active': { cursor: 'grabbing' } },
  sample: { display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
  // 世界の表示の注記（FR-218）
  worldNote: { color: tokens.colorNeutralForeground2 },
});

/**
 * 世界の表示（FR-218）の、コンポーネント共通の扱い。
 *  - 画面の項目がすべて 1 つの世界に属する画面（KPI/OKR など。宣言の world が 'real'／'digital'）は、別の世界を選ぶと中身を隠す（作り直さずに隠し、入力中の内容を保つ）
 *  - 選択中の項目がいまの世界の表示で隠れているときは、選択は変えずに「選択中の項目はこの表示では隠れています」と示す
 */
function useWorldView(key: string): { single: boolean; hideAll: boolean; note: string | null; hiddenNote: boolean } {
  const v = useComponentView(key);
  const selectedIds = useSelectionStore((st) => st.selectedIds);
  const single = v.decl.world === 'real' || v.decl.world === 'digital' ? v.decl.world : null;
  const hideAll = single !== null && v.world !== 'both' && v.world !== single;
  // 選択中の項目がこの画面の項目で、いまの世界の表示で隠れているときだけ示す（項目の種類と世界区分はエンティティ関係グラフから読む）
  const graph = selectedIds.length > 0 && v.world !== 'both' ? getEntityGraph() : null;
  const hidden = graph ? selectionHiddenIn(v.decl, v.world, selectedIds, (id) => graph.node(id)) : false;
  const note = hideAll ? singleWorldNote(v.decl) : null;
  return { single: single !== null, hideAll, note, hiddenNote: hidden };
}


export interface PanelProps {
  testId: string;
  title: string;
  description?: string;
  /** 外枠の最大の幅（既定は 960px）。表や図で広く使う画面が指定する */
  maxWidth?: string;
  children: ReactNode;
}

function toKeyLike(e: KeyboardEvent<HTMLElement>): KeyLike {
  return {
    key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, defaultPrevented: e.defaultPrevented,
    insidePanel: e.currentTarget.contains(e.target as Node), editable: isEditableTarget(e.target),
  };
}

export function Panel({ testId, title, description, maxWidth, children }: PanelProps) {
  const s = useStyles();
  const pane = usePane();
  const state = usePackStore((st) => st.state);
  const sample = state.status === 'ready' && hasSampleData(state.pack.data);
  const ref = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // フォーカス中のコンポーネントだけ、見出しに操作アイコンを出す（FR-150）
  // 見出しの右クリック・Shift+F10 で開く「その他の操作」メニューと、階層の理由の表示（FR-244）
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTier, setShowTier] = useState(false);
  const [focused, setFocused] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [compact, setCompact] = useState(false);
  const minimized = pane?.minimized === true;
  const world = useWorldView(pane?.key ?? testId.replace(/^component-/, ''));
  // 最小化・復元の動き（NFR-UX-008。レイアウトは即座に切り替え、見た目だけを 200ms で整える）
  const foldMotion = useFoldClass(minimized);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    // 最小化・復元でアイコンのボタンが入れ替わっても、フォーカスをコンポーネントに残す。見出しが隠れないよう、中のスクロールは先頭に戻す
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    ref.current?.focus({ preventScroll: true });
  }, [minimized]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      setNarrow(w < NARROW_PANE_PX);
      setCompact(w < COMPACT_PANE_PX);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const onFocus = () => setFocused(true);
  const onBlur = (e: FocusEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    // 見出しのメニューをキーボードで開く（Shift+F10・メニューキー。NFR-A11Y-004）
    if (pane && ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') && !isEditableTarget(e.target)) { e.preventDefault(); setMenuOpen(true); return; }
    if (e.key === 'Escape' && showTier) setShowTier(false);
    const action = panelKeyAction(toKeyLike(e), pane);
    if (action && pane && runPanelKeyAction(action, pane)) { e.preventDefault(); return; }
    // ドラッグの代わりのキー操作: Alt+Shift+矢印キーで、いまのコンポーネントを動かす（FR-142、NFR-A11Y-004）
    const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key] as Move | undefined;
    if (pane && dir && e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.defaultPrevented && !isEditableTarget(e.target)) {
      e.preventDefault();
      pane.move(dir);
    }
  };

  return (
    <section
      data-testid={testId}
      ref={ref}
      onFocus={onFocus}
      onBlur={onBlur}
      className={mergeClasses(s.root, pane ? s.pane : undefined, pane?.maximized ? s.maximized : undefined, foldMotion)}
      style={maxWidth && !pane ? { maxWidth } : pane?.z !== undefined && !pane.maximized ? { position: 'relative', zIndex: pane.z } : undefined}
      aria-label={title}
      tabIndex={pane ? 0 : undefined}
      onKeyDown={onKeyDown}
      data-display={pane ? (pane.maximized ? 'maximized' : 'normal') : undefined}
      data-maximized={pane?.maximized ? 'true' : undefined}
      data-expanded={pane?.expanded ? 'true' : undefined}
      data-minimized={minimized ? 'true' : undefined}
      data-tier={pane?.tier ?? 'supporting'}
      data-role={pane?.role}
      data-group={pane?.group}
    >
      {pane ? (
        // 掴み場所（ハンドル）: ドラッグで移動し、ダブルクリックで 75% 表示にする。本体では行わない（FR-183）
        <div
          data-testid="panel-handle"
          className={mergeClasses(s.handle, !pane.maximized && !pane.expanded ? s.handleGrab : undefined)}
          onDoubleClick={titleDoubleClick(pane)}
          onMouseDown={!pane.maximized && !pane.expanded ? (e: MouseEvent<HTMLElement>) => { if (e.button === 0 && e.detail < 2) e.preventDefault(); } : undefined}
          onPointerDown={!pane.maximized && !pane.expanded ? (e: PointerEvent<HTMLElement>) => { if (e.button === 0) { e.preventDefault(); pane.startDrag(e); } } : undefined}
        >
          <span data-testid="panel-handle-grip" className={s.grip} aria-hidden />
        </div>
      ) : null}
      <div data-testid="panel-body" ref={bodyRef} className={mergeClasses(s.body, pane ? s.paneBody : undefined, minimized ? s.minimized : undefined)}>
      <div className={s.head}>
        <div className={s.headRow}>
          <div className={mergeClasses(s.titleRow, pane && compact ? s.titleRowCompact : undefined)}>
            <Text
              as="h2"
              size={pane && compact ? 500 : 600}
              weight="semibold"
              block
              className={pane && !pane.maximized && !pane.expanded ? s.grab : undefined}
              tabIndex={pane ? 0 : undefined}
              onContextMenu={pane ? (e: MouseEvent<HTMLElement>) => { e.preventDefault(); setMenuOpen(true); } : undefined}
              onDoubleClick={titleDoubleClick(pane)}
              onMouseDown={pane && !pane.maximized && !pane.expanded ? (e: MouseEvent<HTMLElement>) => { if (e.button === 0 && e.detail < 2) e.preventDefault(); } : undefined}
              onPointerDown={pane && !pane.maximized && !pane.expanded ? (e: PointerEvent<HTMLElement>) => { if (e.button === 0) { e.preventDefault(); pane.startDrag(e); } } : undefined}
            >
              {title}
            </Text>
            {pane ? (
              // 階層は、色だけでなく文字と形（塗り・薄い塗り・枠線）でも示す（FR-244 AC-589）
              <Badge data-testid="tier-label" appearance={TIER_APPEARANCE[pane.tier]} color={pane.tier === 'primary' ? 'brand' : 'informative'} shape={pane.tier === 'primary' ? 'rounded' : pane.tier === 'supporting' ? 'circular' : 'square'} size="medium">{TIER_LABEL[pane.tier]}</Badge>
            ) : null}
            {sample ? (
              <span className={s.sample} data-testid="sample-badge">
                <Badge appearance="filled" color="warning" size="large">サンプル</Badge>
                <Text size={200}>架空のサンプルデータを表示しています</Text>
              </span>
            ) : null}
          </div>
          {pane ? <span className={s.actionGroup}><          ComponentActions pane={pane} title={title} active={focused || minimized} narrow={narrow} menu={{ open: menuOpen, onOpenChange: setMenuOpen, onShowTier: () => setShowTier(true) }} /></span> : null}
        </div>
                  {pane && showTier && !minimized ? <Text size={300} role="status" data-testid="tier-reason" className={s.worldNote}>{pane.tierReason}</Text> : null}
        {description && !minimized ? <Text size={300}>{description}</Text> : null}
        {world.note && !minimized ? <Text size={300} className={s.worldNote} data-testid="view-world-note">{world.note}</Text> : null}
        {world.hiddenNote && !minimized ? <Text size={300} role="status" className={s.worldNote} data-testid="view-hidden-selection">{HIDDEN_SELECTION_TEXT}</Text> : null}
      </div>
      {/* 1 つの世界の画面は、いつも同じ包みに入れて表示・非表示だけを変える（中身を作り直さない） */}
      {world.single ? <div data-testid="view-world-body" style={{ display: world.hideAll ? 'none' : 'contents' }}>{children}</div> : children}
      </div>
    </section>
  );
}
