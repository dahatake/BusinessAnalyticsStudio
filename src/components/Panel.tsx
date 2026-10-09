// 画面のパネルの共通の外枠（見出し・説明）。画面はこれで包み、見た目の体系をそろえる。
// ワークスペースの中では、フォーカス・最大化（Shift+F／ダブルクリック）・非表示（H）・メニューを受け持つ（FR-013/FR-109）。
import type { KeyboardEvent, ReactNode } from 'react';
import { Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { ComponentMenu, usePane } from '../workspace/PaneContext';

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
});

export interface PanelProps {
  testId: string;
  title: string;
  description?: string;
  children: ReactNode;
}

function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const role = el.getAttribute('role');
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || role === 'textbox' || role === 'searchbox';
}

export function Panel({ testId, title, description, children }: PanelProps) {
  const s = useStyles();
  const pane = usePane();

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!pane || e.defaultPrevented || !e.currentTarget.contains(e.target as Node) || isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'F' && e.shiftKey) { e.preventDefault(); pane.toggleMaximize(); return; }
    if (e.key === 'Escape' && pane.maximized) { e.preventDefault(); pane.restore(); return; }
    if ((e.key === 'h' || e.key === 'H') && !e.shiftKey) { e.preventDefault(); pane.hide(); }
  };

  return (
    <section
      data-testid={testId}
      className={mergeClasses(s.root, pane ? s.pane : undefined, pane?.maximized ? s.maximized : undefined)}
      aria-label={title}
      tabIndex={pane ? 0 : undefined}
      onKeyDown={onKeyDown}
      data-display={pane ? (pane.maximized ? 'maximized' : 'normal') : undefined}
    >
      <div className={s.head}>
        <div className={s.headRow}>
          <Text as="h2" size={600} weight="semibold" block onDoubleClick={pane ? pane.toggleMaximize : undefined}>
            {title}
          </Text>
          {pane ? <ComponentMenu pane={pane} title={title} /> : null}
        </div>
        {description ? <Text size={300}>{description}</Text> : null}
      </div>
      {children}
    </section>
  );
}
