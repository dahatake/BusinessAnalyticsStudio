// アプリの外枠: ヘッダー（顧客名・操作）、ナビゲーション、ドック、ワークスペース。
// 広い画面では左にナビゲーション、狭い画面では上に横並びに組み替える（横スクロールを強いない）。
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, Text, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { PanelLeftContract20Regular, PanelLeftExpand20Regular } from '@fluentui/react-icons';
import { useLayout } from '../store/layout';
import { useFoldClass } from '../motion/useFoldMotion';
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
  rootMin: { gridTemplateColumns: '56px 1fr', '@media (max-width: 720px)': { gridTemplateColumns: '1fr' } },
  navMin: { overflowX: 'hidden', alignItems: 'center', paddingInline: tokens.spacingHorizontalS },
  navButton: { justifyContent: 'flex-start', minHeight: '32px' },
  // アイコンだけの列（FR-151）。当たり判定は 24 CSS px 以上
  navButtonMin: { justifyContent: 'center', minWidth: '32px', paddingInline: 0 },
  navToggle: { alignSelf: 'flex-start' },
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
  /** ヘッダーの下段に常時出す業務改善ステッパー（FR-136） */
  stepper?: ReactNode;
}

export function AppShell({ title, screens, activeKey, onSelect, headerExtra, actions, dock, children, brand, stepper }: AppShellProps) {
  const s = useStyles();
  const navMin = useLayout((st) => st.navMin);
  const rootRef = useRef<HTMLDivElement>(null);
  // モーダルのダイアログが開いている間は、背景（アプリ本体）を操作・支援技術の対象から外す（WAI-ARIA のモーダルの作法）。
  // 背景の「KPI/OKR」などのボタンが、ダイアログのボタン（OK など）と取り違えられない
  useEffect(() => {
    const sync = (): void => {
      const open = document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], dialog[open]') !== null;
      const root = rootRef.current;
      if (!root) return;
      root.toggleAttribute('inert', open);
      if (open) root.setAttribute('aria-hidden', 'true'); else root.removeAttribute('aria-hidden');
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); rootRef.current?.removeAttribute('inert'); rootRef.current?.removeAttribute('aria-hidden'); };
  }, []);
  const setNavMin = useLayout((st) => st.setNavMin);
  // 最小化・復元の動き（NFR-UX-008。レイアウトは即座に切り替え、見た目だけを 200ms で整える）
  const navMotion = useFoldClass(navMin);
  // 押した直後は、切替ボタンの名前の表示を閉じる（切り替えた先の画面名の表示と重ならないように）。ボタンから離れるまで出さない
  const [toggleTip, setToggleTip] = useState(false);
  const [toggleHold, setToggleHold] = useState(false);
  // 最小化中に画面名を出しているアイコン（ホバー・フォーカス）
  const [tipKey, setTipKey] = useState<string | null>(null);
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
    <div ref={rootRef} className={mergeClasses(s.root, navMin ? s.rootMin : undefined)} data-nav-min={navMin ? 'true' : undefined}>
      <header className={s.header}>
        <Text as="h1" size={500} weight="semibold">{title}</Text>
        <div className={s.actions}>
          {brand ? <div>{brand}</div> : null}
          {headerExtra}
          {actions}
          {/* 企業と Project の操作行（ProjectsPanel が portal で描く）。ワークスペースの縦の領域を削らないため、ヘッダーの空きに置く */}
          <div id="projects-head-slot" style={{ display: 'contents' }} />
        </div>
        {stepper}
      </header>
      <nav className={mergeClasses(s.nav, navMin ? s.navMin : undefined, navMotion)} aria-label="画面">
        <Tooltip content={navMin ? 'メニューを元の幅に戻す' : 'メニューを最小化'} relationship="label" withArrow visible={toggleTip && !toggleHold} onVisibleChange={(_, d) => setToggleTip(d.visible)}>
          <Button
            data-testid="nav-toggle"
            className={s.navToggle}
            appearance="subtle"
            icon={navMin ? <PanelLeftExpand20Regular aria-hidden /> : <PanelLeftContract20Regular aria-hidden />}
            aria-expanded={!navMin}
            onClick={() => { setToggleHold(true); setNavMin(!navMin); }}
            onBlur={() => setToggleHold(false)}
            onMouseLeave={() => setToggleHold(false)}
          >
            {navMin ? null : 'メニューを最小化'}
          </Button>
        </Tooltip>
        {screens.map((sc) => {
          const Icon = sc.icon;
          const active = sc.key === activeKey;
          const button = (
            <Button
              key={sc.key}
              data-testid={`nav-${sc.key}`}
              className={mergeClasses(s.navButton, navMin ? s.navButtonMin : undefined)}
              aria-label={navMin ? sc.label : undefined}
              appearance={active ? 'secondary' : 'subtle'}
              icon={<Icon aria-hidden />}
              aria-current={active ? 'page' : undefined}
              tabIndex={sc.key === current ? 0 : -1}
              onFocus={() => setRoving(sc.key)}
              onKeyDown={(e) => onNavKey(e, sc.key)}
              onClick={() => onSelect(sc.key)}
            >
              {navMin ? null : sc.label}
            </Button>
          );
          // 最小化中は、ホバー・フォーカスで画面名を出す（支援技術には aria-label で伝わる）
          return (
            <Tooltip key={sc.key} content={sc.label} relationship="description" withArrow visible={navMin && tipKey === sc.key} onVisibleChange={(_, d) => setTipKey((cur) => (d.visible ? sc.key : cur === sc.key ? null : cur))}>
              {button}
            </Tooltip>
          );
        })}
        {dock}
      </nav>
      <main className={s.main} data-testid="workspace">{children}</main>
    </div>
  );
}
