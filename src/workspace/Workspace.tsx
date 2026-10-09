// ワークスペース: レイアウトの木（分割とタブ）を描く。境界はドラッグでもキーボードでも動かせる（FR-109、NFR-A11Y-004）。
import { createPortal } from 'react-dom';
import { useCallback, useLayoutEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Tab, TabList, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import type { ScreenDefinition } from '../screens/types';
import { effectiveLayout, useLayout } from '../store/layout';
import { keysOf, type LayoutNode, type Path, type SplitNode } from './layoutModel';
import { PaneContext, type PaneInfo } from './PaneContext';

const useStyles = makeStyles({
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
});

const KEY_STEP = 0.02;

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

function Separator({ path, index, dir, size }: { path: Path; index: number; dir: 'row' | 'col'; size: number }) {
  const s = useStyles();
  const resizeAt = useLayout((st) => st.resizeAt);
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
    if (delta !== 0) resizeAt(path, index, delta);
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    start.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dec = vertical ? 'ArrowLeft' : 'ArrowUp';
    const inc = vertical ? 'ArrowRight' : 'ArrowDown';
    if (e.key === dec) { e.preventDefault(); resizeAt(path, index, -KEY_STEP); }
    else if (e.key === inc) { e.preventDefault(); resizeAt(path, index, KEY_STEP); }
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
  const layout = useMemo(() => effectiveLayout({ persona, layouts: stored }), [persona, stored]);
  const maximized = useLayout((st) => st.maximized);
  const actions = useLayout.getState;
  const byKey = useCallback((k: string) => screens.find((sc) => sc.key === k), [screens]);

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
    };
  };

  const hosts = useRef(new Map<string, HTMLElement>());
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
            onTabSelect={(_, d) => useLayout.getState().activateTab(String(d.value))}
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
          ? [cell, <Separator key={`s${i}`} path={path} index={i} dir={node.dir} size={node.sizes[i]!} />]
          : [cell];
      })}
    </div>
  );

  return (
    <div className={s.root}>
      {layout ? render(layout, []) : (
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
