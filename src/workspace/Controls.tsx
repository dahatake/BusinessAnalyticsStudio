// ワークスペースの操作: ペルソナの切替、既定のレイアウトに戻す、ドック（FR-014/FR-110）。
import { useMemo } from 'react';
import { Button, Menu, MenuItem, MenuItemRadio, MenuList, MenuPopover, MenuTrigger, Switch, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ArrowReset20Regular, EyeOff20Regular, Person20Regular } from '@fluentui/react-icons';
import type { ScreenDefinition } from '../screens/types';
import { effectiveLayout, personaKeys, useLayout } from '../store/layout';
import { PERSONAS, keysOf, type Persona } from './layoutModel';
import { useT } from '../i18n';

const useStyles = makeStyles({
  dock: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalM,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    '@media (max-width: 720px)': { flexDirection: 'row', flexWrap: 'wrap', marginTop: 0, borderTop: 'none', paddingTop: 0, columnGap: tokens.spacingHorizontalXS },
  },
  dockButton: { justifyContent: 'flex-start', minHeight: '32px' },
});

export function PersonaMenu() {
  const t = useT();
  const persona = useLayout((s) => s.persona);
  const setPersona = useLayout((s) => s.setPersona);
  return (
    <Menu
      checkedValues={{ persona: [persona] }}
      onCheckedValueChange={(_, d) => { const v = d.checkedItems[0]; if (v) setPersona(v as Persona); }}
    >
      <MenuTrigger disableButtonEnhancement>
        <Button icon={<Person20Regular aria-hidden />} aria-label={t('ペルソナ: {persona}', { persona: t(persona) })}>{t('ペルソナ: {persona}', { persona: t(persona) })}</Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {PERSONAS.map((p) => <MenuItemRadio key={p} name="persona" value={p}>{t(p)}</MenuItemRadio>)}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}

export function ResetLayoutButton() {
  const t = useT();
  const reset = useLayout((s) => s.resetLayout);
  return (
    <Button icon={<ArrowReset20Regular aria-hidden />} onClick={reset}>{t('既定のレイアウトに戻す')}</Button>
  );
}

/** 操作中のコンポーネントを大きくする自動のサイズ調整の切替（FR-143 AC-228）。いつでも切り替えられる。 */
export function AutoSizeSwitch() {
  const t = useT();
  const on = useLayout((s) => s.autoSize);
  const set = useLayout((s) => s.setAutoSize);
  return <Switch checked={on} onChange={(_, d) => set(d.checked)} label={t('サイズの自動調整')} />;
}

/** 非表示のコンポーネントを再表示するドック。 */
export function Dock({ screens }: { screens: readonly ScreenDefinition[] }) {
  const s = useStyles();
  const t = useT();
  const persona = useLayout((st) => st.persona);
  const stored = useLayout((st) => st.layouts);
  const tiers = useLayout((st) => st.tiers);
  const autoOff = useLayout((st) => st.autoOff);
  const show = useLayout((st) => st.showComponent);
  const hidden = useMemo(() => {
    const visible = new Set(keysOf(effectiveLayout({ persona, layouts: stored, tiers, autoOff })));
    // このペルソナの構成のコンポーネントを先に並べる（非表示にしたものを、すぐ再表示できる）
    const own = personaKeys(persona);
    const rank = (k: string) => { const i = own.indexOf(k); return i < 0 ? own.length : i; };
    return screens.filter((sc) => !visible.has(sc.key)).map((sc, i) => ({ sc, i })).sort((a, b) => rank(a.sc.key) - rank(b.sc.key) || a.i - b.i).map((x) => x.sc);
  }, [screens, persona, stored, tiers, autoOff]);
  return (
    <div className={s.dock} data-testid="dock" role="group" aria-label={t('ドック（非表示のコンポーネント）')}>
      {/* 非表示のコンポーネントの再表示ボタンを先に並べる（先頭のボタンがそのまま再表示になる）。一覧のメニューはその後ろ */}
      {hidden.length === 0 ? <Text size={200}>{t('なし')}</Text> : null}
      {hidden.map((sc) => {
        const Icon = sc.icon;
        return (
          <Button key={sc.key} className={s.dockButton} appearance="subtle" icon={<Icon aria-hidden />} onClick={() => show(sc.key)}>
            {t('{label}を再表示', { label: t(sc.label) })}
          </Button>
        );
      })}
      <Menu positioning={{ position: 'after', align: 'start', autoSize: 'height', overflowBoundary: undefined, fallbackPositions: ['after-top', 'below-start'] }}>
        <MenuTrigger disableButtonEnhancement>
          <Button className={s.dockButton} appearance="subtle" icon={<EyeOff20Regular aria-hidden />} aria-label={t('非表示のコンポーネント（{n} 件）', { n: hidden.length })}>
            {t('非表示のコンポーネント')}
          </Button>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {hidden.length === 0 ? <MenuItem disabled>{t('なし')}</MenuItem> : null}
            {hidden.map((sc) => <MenuItem key={sc.key} onClick={() => show(sc.key)}>{t('{label}を再表示', { label: t(sc.label) })}</MenuItem>)}
          </MenuList>
        </MenuPopover>
      </Menu>
    </div>
  );
}
