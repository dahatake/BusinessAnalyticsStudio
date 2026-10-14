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
import { isEditableTarget, panelKeyAction, runPanelKeyAction, titleDoubleClick, type KeyLike } from './panelKeys';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXXL,
    maxWidth: '960px',
  },
  pane: {
    maxWidth: 'none',
    boxSizing: 'border-box',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    overflow: 'auto',
    rowGap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
  maximized: { position: 'absolute', inset: 0, zIndex: 10, height: 'auto' },
  // 最小化: 見出しだけを残す。中身は mount したまま隠し、入力中の内容・絞り込みを保つ（FR-151 AC-260）
  minimized: {
    overflow: 'hidden',
    paddingBlock: tokens.spacingVerticalS,
    rowGap: 0,
    '& > *:not(:first-child)': { display: 'none' },
  },
  head: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS },
  headRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', columnGap: tokens.spacingHorizontalS },
  titleRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalM, flexGrow: 1, minWidth: 0 },
  // 見出しをつかんで動かす（FR-142）。つかめることをカーソルで示し、動かしている間に文字が選択されないようにする
  grab: { flexGrow: 1, cursor: 'grab', userSelect: 'none', touchAction: 'none', ':active': { cursor: 'grabbing' } },
  sample: { display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
});

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
  // フォーカス中のコンポーネントだけ、見出しに操作アイコンを出す（FR-150）
  const [focused, setFocused] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const minimized = pane?.minimized === true;
  // 最小化・復元の動き（NFR-UX-008。レイアウトは即座に切り替え、見た目だけを 200ms で整える）
  const foldMotion = useFoldClass(minimized);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    // 最小化・復元でアイコンのボタンが入れ替わっても、フォーカスをコンポーネントに残す。見出しが隠れないよう、中のスクロールは先頭に戻す
    if (ref.current) ref.current.scrollTop = 0;
    ref.current?.focus({ preventScroll: true });
  }, [minimized]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setNarrow(el.getBoundingClientRect().width < 360));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const onFocus = () => setFocused(true);
  const onBlur = (e: FocusEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
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
      className={mergeClasses(s.root, pane ? s.pane : undefined, pane?.maximized ? s.maximized : undefined, minimized ? s.minimized : undefined, foldMotion)}
      style={maxWidth && !pane ? { maxWidth } : pane?.z !== undefined && !pane.maximized ? { position: 'relative', zIndex: pane.z } : undefined}
      aria-label={title}
      tabIndex={pane ? 0 : undefined}
      onKeyDown={onKeyDown}
      data-display={pane ? (pane.maximized ? 'maximized' : 'normal') : undefined}
      data-maximized={pane?.maximized ? 'true' : undefined}
      data-expanded={pane?.expanded ? 'true' : undefined}
      data-minimized={minimized ? 'true' : undefined}
    >
      <div className={s.head}>
        <div className={s.headRow}>
          <div className={s.titleRow}>
            <Text
              as="h2"
              size={600}
              weight="semibold"
              block
              className={pane && !pane.maximized && !pane.expanded ? s.grab : undefined}
              onDoubleClick={titleDoubleClick(pane)}
              onMouseDown={pane && !pane.maximized && !pane.expanded ? (e: MouseEvent<HTMLElement>) => { if (e.button === 0 && e.detail < 2) e.preventDefault(); } : undefined}
              onPointerDown={pane && !pane.maximized && !pane.expanded ? (e: PointerEvent<HTMLElement>) => { if (e.button === 0) { e.preventDefault(); pane.startDrag(e); } } : undefined}
            >
              {title}
            </Text>
            {sample ? (
              <span className={s.sample} data-testid="sample-badge">
                <Badge appearance="filled" color="warning" size="large">サンプル</Badge>
                <Text size={200}>架空のサンプルデータを表示しています</Text>
              </span>
            ) : null}
          </div>
          {pane ? <ComponentActions pane={pane} title={title} active={focused || minimized} narrow={narrow} /> : null}
        </div>
        {description && !minimized ? <Text size={300}>{description}</Text> : null}
      </div>
      {children}
    </section>
  );
}
