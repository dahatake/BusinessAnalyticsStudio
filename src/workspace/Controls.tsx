// ワークスペースの操作: ペルソナの切替、既定のレイアウトに戻す、ドック（FR-014/FR-110）。
import { useMemo } from 'react';
import { Button, Menu, MenuItem, MenuItemRadio, MenuList, MenuPopover, MenuTrigger, Switch, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ArrowReset20Regular, EyeOff20Regular, Person20Regular } from '@fluentui/react-icons';
import type { ScreenDefinition } from '../screens/types';
import { effectiveLayout, useLayout } from '../store/layout';
import { PERSONAS, keysOf, type Persona } from './layoutModel';

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
  const persona = useLayout((s) => s.persona);
  const setPersona = useLayout((s) => s.setPersona);
  return (
    <Menu
      checkedValues={{ persona: [persona] }}
      onCheckedValueChange={(_, d) => { const v = d.checkedItems[0]; if (v) setPersona(v as Persona); }}
    >
      <MenuTrigger disableButtonEnhancement>
        <Button icon={<Person20Regular aria-hidden />} aria-label={`ペルソナ: ${persona}`}>ペルソナ: {persona}</Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {PERSONAS.map((p) => <MenuItemRadio key={p} name="persona" value={p}>{p}</MenuItemRadio>)}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}

export function ResetLayoutButton() {
  const reset = useLayout((s) => s.resetLayout);
  return (
    <Button icon={<ArrowReset20Regular aria-hidden />} onClick={reset}>既定のレイアウトに戻す</Button>
  );
}

/** 操作中のコンポーネントを大きくする自動のサイズ調整の切替（FR-143 AC-228）。いつでも切り替えられる。 */
export function AutoSizeSwitch() {
  const on = useLayout((s) => s.autoSize);
  const set = useLayout((s) => s.setAutoSize);
  return <Switch checked={on} onChange={(_, d) => set(d.checked)} label="サイズの自動調整" />;
}

/** 非表示のコンポーネントを再表示するドック。 */
export function Dock({ screens }: { screens: readonly ScreenDefinition[] }) {
  const s = useStyles();
  const persona = useLayout((st) => st.persona);
  const stored = useLayout((st) => st.layouts);
  const show = useLayout((st) => st.showComponent);
  const hidden = useMemo(() => {
    const visible = new Set(keysOf(effectiveLayout({ persona, layouts: stored })));
    return screens.filter((sc) => !visible.has(sc.key));
  }, [screens, persona, stored]);
  return (
    <div className={s.dock} data-testid="dock" role="group" aria-label="ドック（非表示のコンポーネント）">
      <Menu positioning={{ position: 'after', align: 'start', autoSize: 'height', overflowBoundary: undefined, fallbackPositions: ['after-top', 'below-start'] }}>
        <MenuTrigger disableButtonEnhancement>
          <Button className={s.dockButton} appearance="subtle" icon={<EyeOff20Regular aria-hidden />} aria-label={`非表示のコンポーネント（${hidden.length} 件）`}>
            非表示のコンポーネント
          </Button>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {hidden.length === 0 ? <MenuItem disabled>なし</MenuItem> : null}
            {hidden.map((sc) => <MenuItem key={sc.key} onClick={() => show(sc.key)}>{sc.label}を再表示</MenuItem>)}
          </MenuList>
        </MenuPopover>
      </Menu>
      {hidden.length === 0 ? <Text size={200}>なし</Text> : null}
      {hidden.map((sc) => {
        const Icon = sc.icon;
        return (
          <Button key={sc.key} className={s.dockButton} appearance="subtle" icon={<Icon aria-hidden />} onClick={() => show(sc.key)}>
            {sc.label}を再表示
          </Button>
        );
      })}
    </div>
  );
}
