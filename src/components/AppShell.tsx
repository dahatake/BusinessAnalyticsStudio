// アプリの外枠: ヘッダー（顧客名）、ナビゲーション、ワークスペース。
// 広い画面では左にナビゲーション、狭い画面では上に横並びに組み替える（横スクロールを強いない）。
import type { ReactNode } from 'react';
import { Button, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import type { ScreenDefinition } from '../screens/types';

const useStyles = makeStyles({
  root: {
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    gridTemplateColumns: 'minmax(180px, 220px) 1fr',
    minHeight: '100vh',
    '@media (max-width: 720px)': { gridTemplateColumns: '1fr', gridTemplateRows: 'auto auto 1fr' },
  },
  header: {
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXL}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  brand: { marginLeft: 'auto' },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalM,
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
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    minWidth: 0,
  },
});

export interface AppShellProps {
  title: string;
  screens: readonly ScreenDefinition[];
  activeKey: string;
  onSelect: (key: string) => void;
  children: ReactNode;
  /** ヘッダーの右側に出すブランド表示（ロゴ・共創表現） */
  brand?: ReactNode;
}

export function AppShell({ title, screens, activeKey, onSelect, children, brand }: AppShellProps) {
  const s = useStyles();
  return (
    <div className={s.root}>
      <header className={s.header}>
        <Text as="h1" size={500} weight="semibold">{title}</Text>
        {brand ? <div className={s.brand}>{brand}</div> : null}
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
              onClick={() => onSelect(sc.key)}
            >
              {sc.label}
            </Button>
          );
        })}
      </nav>
      <main className={s.main} data-testid="workspace">{children}</main>
    </div>
  );
}
