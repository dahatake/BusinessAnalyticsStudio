// アプリの外枠: ヘッダー（顧客名・操作）、ナビゲーション、ドック、ワークスペース。
// 広い画面では左にナビゲーション、狭い画面では上に横並びに組み替える（横スクロールを強いない）。
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import type { ScreenDefinition } from '../screens/types';
import { rovingTarget } from './roving';

const useStyles = makeStyles({
  root: {
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    gridTemplateColumns: 'minmax(180px, 220px) 1fr',
    height: '100vh',
    '@media (max-width: 720px)': { gridTemplateColumns: '1fr', gridTemplateRows: 'auto auto 1fr', height: 'auto', minHeight: '100vh' },
  },
  header: {
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXL}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  actions: { marginLeft: 'auto', display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalS },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalM,
    overflowY: 'auto',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRight: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    '@media (max-width: 720px)': {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: tokens.spacingHorizontalXS,
      borderRight: 'none',
      borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    },
  },
  navButton: { justifyContent: 'flex-start', minHeight: '32px' },
  main: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    overflowX: 'hidden',
    overflowY: 'auto',
    minWidth: 0,
    '@media (max-width: 720px)': { minHeight: '80vh' },
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
});

export interface AppShellProps {
  title: string;
  screens: readonly ScreenDefinition[];
  activeKey?: string;
  onSelect: (key: string) => void;
  /** ヘッダーの右側に常時出す要素（AI 接続状態など） */
  headerExtra?: ReactNode;
  /** ヘッダー右側の操作（ペルソナの切替、既定のレイアウトに戻す など） */
  actions?: ReactNode;
  /** ナビゲーションの下のドック（非表示のコンポーネントの再表示） */
  dock?: ReactNode;
  children: ReactNode;
  /** ヘッダーの右側に出すブランド表示（ロゴ・共創表現） */
  brand?: ReactNode;
}

export function AppShell({ title, screens, activeKey, onSelect, headerExtra, actions, dock, children, brand }: AppShellProps) {
  const s = useStyles();
  // ナビゲーションは、Tab の停止位置を 1 つにする（roving tabindex）。矢印キーで項目を移り、Tab で、その項目のコンポーネントへ入る。
  // （WAI-ARIA のタブの作法。17 個の項目と非表示のドックを Tab で通り抜けなくても、選んだ画面へすぐ届く）
  const [roving, setRoving] = useState<string | undefined>(activeKey);
  const current = screens.some((sc) => sc.key === roving) ? roving : screens.some((sc) => sc.key === activeKey) ? activeKey : screens[0]?.key;
  const onNavKey = (e: KeyboardEvent<HTMLElement>, key: string): void => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const keys = screens.map((sc) => sc.key);
    const next = rovingTarget(e.key, keys.indexOf(key), keys.length);
    if (next !== null) {
      e.preventDefault();
      const nextKey = keys[next];
      if (nextKey === undefined) return;
      setRoving(nextKey);
      e.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-testid="nav-${nextKey}"]`)?.focus();
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey) {
      // 表示中のコンポーネントがあれば、そこへ（なければ、通常の Tab の順）
      const target = document.querySelector<HTMLElement>(`[data-testid="component-${key}"]`);
      if (target) { e.preventDefault(); target.focus(); }
    }
  };
  return (
    <div className={s.root}>
      <header className={s.header}>
        <Text as="h1" size={500} weight="semibold">{title}</Text>
        <div className={s.actions}>
          {brand ? <div>{brand}</div> : null}
          {headerExtra}
          {actions}
        </div>
      </header>
      <nav className={s.nav} aria-label="画面">
        {screens.map((sc) => {
          const Icon = sc.icon;
          const active = sc.key === activeKey;
          return (
            <Button
              key={sc.key}
              data-testid={`nav-${sc.key}`}
              className={mergeClasses(s.navButton)}
              appearance={active ? 'secondary' : 'subtle'}
              icon={<Icon aria-hidden />}
              aria-current={active ? 'page' : undefined}
              tabIndex={sc.key === current ? 0 : -1}
              onFocus={() => setRoving(sc.key)}
              onKeyDown={(e) => onNavKey(e, sc.key)}
              onClick={() => onSelect(sc.key)}
            >
              {sc.label}
            </Button>
          );
        })}
        {dock}
      </nav>
      <main className={s.main} data-testid="workspace">{children}</main>
    </div>
  );
}
