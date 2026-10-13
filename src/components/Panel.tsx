// 画面のパネルの共通の外枠（見出し・説明）。画面はこれで包み、見た目の体系をそろえる。
// ワークスペースの中では、フォーカス・最大化（Shift+F／ダブルクリック）・非表示（H）・メニューを受け持つ（FR-013/FR-109）。
// 顧客パックにサンプルの項目があるときは、見出しの横に「サンプル」を明記する（FR-008）。
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from 'react';
import { Badge, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { hasSampleData } from '../data/sample';
import { usePackStore } from '../store/pack';
import { ComponentMenu, usePane } from '../workspace/PaneContext';
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
      className={mergeClasses(s.root, pane ? s.pane : undefined, pane?.maximized ? s.maximized : undefined)}
      style={maxWidth && !pane ? { maxWidth } : undefined}
      aria-label={title}
      tabIndex={pane ? 0 : undefined}
      onKeyDown={onKeyDown}
      data-display={pane ? (pane.maximized ? 'maximized' : 'normal') : undefined}
    >
      <div className={s.head}>
        <div className={s.headRow}>
          <div className={s.titleRow}>
            <Text
              as="h2"
              size={600}
              weight="semibold"
              block
              className={pane && !pane.maximized ? s.grab : undefined}
              onDoubleClick={titleDoubleClick(pane)}
              onMouseDown={pane && !pane.maximized ? (e: MouseEvent<HTMLElement>) => { if (e.button === 0 && e.detail < 2) e.preventDefault(); } : undefined}
              onPointerDown={pane && !pane.maximized ? (e: PointerEvent<HTMLElement>) => { if (e.button === 0) { e.preventDefault(); pane.startDrag(e); } } : undefined}
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
          {pane ? <ComponentMenu pane={pane} title={title} /> : null}
        </div>
        {description ? <Text size={300}>{description}</Text> : null}
      </div>
      {children}
    </section>
  );
}
