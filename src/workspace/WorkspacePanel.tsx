// タスク指向の適応型ワークスペースの操作盤（FR-298）。左のメニューの下に置き、作業領域を削らない。
//  - タスクワークスペースの一覧（タブ）と追加・別のウィンドウへの移動・最近使った作業（AC-808・AC-809）
//  - Workspace Switcher: Focus／Compare／Monitor／Meeting／Research を 1 回の操作で切り替える（AC-807）
//  - ゾーンの一覧（意味名とロール）・結合と解除・割合（AC-805・AC-806）
// 状態は store/taskWorkspaces.ts、ゾーンの計算は workspace/zones.ts、タスク文脈は workspace/taskContext.ts にある。
import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Input, Tab, TabList, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Add20Regular, WindowArrowUp20Regular } from '@fluentui/react-icons';
import { Radio, RadioGroup } from '../components/ChoiceRadio';
import { recentWorkspaces, useActiveWorkspace, useTaskWorkspaces } from '../store/taskWorkspaces';
import { useImmersion } from '../store/immersion';
import { useOs } from '../store/osConvention';
import { chordLabel } from './os';
import { frameSurfaceStyle } from '../theme/frameMaterial';
import { MODES, MODE_LABEL, ZONE_META, ZONE_NAMES, zoneLayout, type Ratios, type ZoneName } from './zones';
import { addWorkspace, openInNewWindow, switchWorkspace } from './taskContext';
import { useT } from '../i18n';

const useStyles = makeStyles({
  root: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalM, paddingTop: tokens.spacingVerticalM,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    '@media (max-width: 720px)': { marginTop: 0, borderTop: 'none', paddingTop: 0, flexBasis: '100%' },
  },
  group: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXXS },
  tabs: { alignItems: 'stretch' },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalXS },
  zone: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalXS, minHeight: '28px' },
  zoneName: { fontWeight: tokens.fontWeightSemibold },
  ratio: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXXS },
  ratioRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', columnGap: tokens.spacingHorizontalXS },
  ratioInput: { width: '88px', minWidth: 0 },
  recent: { listStyleType: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' },
  tight: { justifyContent: 'flex-start', minHeight: '28px' },
  // Workspace Switcher: 枠の面（半透明の素材。FR-300）
  switcher: { ...frameSurfaceStyle, borderRadius: tokens.borderRadiusMedium, padding: tokens.spacingHorizontalXS, boxShadow: tokens.shadow2, color: tokens.colorNeutralForeground1 },
  hint: { color: tokens.colorNeutralForeground2 },
});

const RATIO_ZONES: ReadonlyArray<keyof Ratios> = ['main', 'reference', 'communication'];

/** 割合の入力。Enter か、入力欄を離れたときに確定する（入力の途中では配置を動かさない） */
function RatioInput({ zone, value, onCommit }: { zone: keyof Ratios; value: number; onCommit: (v: number) => void }) {
  const s = useStyles();
  const t = useT();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const label = ZONE_META[zone].label;
  const commit = (): void => {
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(n)) { setDraft(String(value)); return; }
    onCommit(n);
  };
  return (
    <div className={s.ratioRow}>
      <Text size={200}>{label}</Text>
      <Input
        className={s.ratioInput}
        size="small"
        type="number"
        min={1}
        max={98}
        value={draft}
        aria-label={t('{zone} の割合', { zone: label })}
        contentAfter={<Text size={200}>%</Text>}
        onChange={(_, d) => setDraft(d.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
      />
    </div>
  );
}

export function WorkspacePanel() {
  const s = useStyles();
  const t = useT();
  const items = useTaskWorkspaces((st) => st.items);
  const active = useActiveWorkspace();
  const setMode = useTaskWorkspaces((st) => st.setMode);
  const setRatio = useTaskWorkspaces((st) => st.setRatio);
  const merge = useTaskWorkspaces((st) => st.merge);
  const unmerge = useTaskWorkspaces((st) => st.unmerge);
  const [picked, setPicked] = useState<ReadonlySet<ZoneName>>(new Set());
  const os = useOs();
  const recalled = useImmersion((st) => st.recalled);
  const toggleRecall = useImmersion((st) => st.toggleRecall);
  const layout = useMemo(() => zoneLayout(active.mode, active.ratios, active.merged, recalled), [active.mode, active.ratios, active.merged, recalled]);
  const recent = useMemo(() => recentWorkspaces(items), [items]);
  const mergedNow = active.merged.length >= 2;
  const toggle = (n: ZoneName, on: boolean): void => setPicked((cur) => { const next = new Set(cur); if (on) next.add(n); else next.delete(n); return next; });
  return (
    <section className={s.root} data-testid="workspace-panel" aria-label={t('適応型ワークスペース')}>
      <div className={s.group}>
        <Text size={200} weight="semibold">{t('タスクワークスペース')}</Text>
        <TabList
          vertical
          size="small"
          className={s.tabs}
          aria-label={t('タスクワークスペース')}
          selectedValue={active.id}
          onTabSelect={(_, d) => switchWorkspace(String(d.value))}
        >
          {items.map((w) => <Tab key={w.id} value={w.id}>{w.name}</Tab>)}
        </TabList>
        <div className={s.row}>
          <Button size="small" appearance="subtle" icon={<Add20Regular aria-hidden />} onClick={() => addWorkspace()}>{t('タスクワークスペースを追加')}</Button>
          <Button size="small" appearance="subtle" icon={<WindowArrowUp20Regular aria-hidden />} onClick={() => openInNewWindow()}>{t('別のウィンドウへ移動')}</Button>
        </div>
        <div data-testid="recent-task-contexts" role="group" aria-label={t('最近使った作業')}>
          <Text size={200} weight="semibold">{t('最近使った作業')}</Text>
          <ul className={s.recent}>
            {recent.map((w) => (
              <li key={w.id}>
                <Button size="small" appearance="subtle" className={s.tight} aria-current={w.id === active.id ? 'true' : undefined} onClick={() => switchWorkspace(w.id)}>{w.name}</Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className={s.group}>
        <Text size={200} weight="semibold">Workspace Switcher</Text>
        <div data-testid="workspace-switcher" className={s.switcher}>
          <RadioGroup
            aria-label="Workspace Switcher"
            value={active.mode}
            onChange={(_, d) => setMode(d.value as (typeof MODES)[number])}
          >
            {MODES.map((m) => <Radio key={m} value={m} label={MODE_LABEL[m]} />)}
          </RadioGroup>
        </div>
        <Text size={200} className={s.hint} data-shortcut={chordLabel(os, 'focus')}>{t('Focus の切替: {key}（Esc では解除しない）', { key: chordLabel(os, 'focus') })}</Text>
        {active.mode === 'focus' ? (
          <div className={s.row} role="group" aria-label={t('減光したゾーンを呼び出す')}>
            {ZONE_NAMES.filter((n) => layout[n].rect && n !== 'main').map((n) => (
              <Button key={n} size="small" data-testid={`zone-recall-${n}`} aria-pressed={recalled.includes(n)} onClick={() => toggleRecall(n)}>
                {recalled.includes(n) ? t('{zone} を戻す', { zone: ZONE_META[n].label }) : t('{zone} を呼び出す', { zone: ZONE_META[n].label })}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      <section className={s.group} data-testid="zone-list" aria-label={t('ゾーン')}>
        <Text size={200} weight="semibold">{t('ゾーン')}</Text>
        {ZONE_NAMES.map((n) => (
          <div key={n} className={s.zone} data-testid={`zone-item-${n}`} data-shown={layout[n].rect ? 'true' : 'false'}>
            <Text size={200} className={s.zoneName}>{ZONE_META[n].label}</Text>
            <Text size={200}>（{t(ZONE_META[n].role)}）</Text>
            <Checkbox size="medium" label={t('結合に含める')} checked={picked.has(n)} onChange={(_, d) => toggle(n, d.checked === true)} />
          </div>
        ))}
        <div className={s.row}>
          <Button size="small" disabled={picked.size < 2} onClick={() => { merge([...picked]); setPicked(new Set()); }}>{t('ゾーンを結合')}</Button>
          <Button size="small" disabled={!mergedNow} onClick={() => { unmerge(); setPicked(new Set()); }}>{t('結合を解除')}</Button>
        </div>
      </section>
      <div className={s.ratio} data-testid="zone-ratio" role="group" aria-label={t('ゾーンの割合')}>
        <Text size={200} weight="semibold">{t('ゾーンの割合')}</Text>
        {RATIO_ZONES.map((z) => <RatioInput key={z} zone={z} value={active.ratios[z]} onCommit={(v) => setRatio(z, v)} />)}
      </div>
    </section>
  );
}
