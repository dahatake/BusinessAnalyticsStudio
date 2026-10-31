// 最上段の作業先表示（FR-148・FR-226）。「企業名（ボタン）- Project 名（全作業先メニューのボタン）」を 1 つの表示領域にまとめる。
// 企業名のボタンは、同じ企業の Project だけを一覧し、企業の選択は一覧だけを変え、Project の確定で移動する（AC-251）。
// Project 名のボタンは、デモと全企業の Project を一覧する全作業先メニューを開く。
// 移動の扱い（データの分離・未保存の入力の確認）は FR-138・FR-144 と同じ（呼び出し側の requestOpen を使う）。
// キーボードだけで両方のボタンに到達し、Enter/Space/↓ で開き、Tab・矢印で選び、Enter で確定、Esc で閉じる（AC-253）。
import { useState } from 'react';
import { Button, MenuDivider, MenuGroup, MenuGroupHeader, MenuItem, MenuItemRadio, MenuList, Popover, PopoverSurface, PopoverTrigger, makeStyles, tokens, useArrowNavigationGroup, useId } from '@fluentui/react-components';
import { ChevronDown16Regular } from '@fluentui/react-icons';
import type { Company, Project } from '../store/projects';
import { useT } from '../i18n';
import { DEMO_VALUE, MENU_DEMO_LABEL, menuGroups, parseChoice, workTargetLabel, type TargetChoice } from './workTarget';

const useStyles = makeStyles({
  display: { display: 'flex', alignItems: 'center', minWidth: 0, maxWidth: '100%' },
  company: { minWidth: 0, minHeight: '32px', maxWidth: '40%', flexShrink: 0 },
  trigger: { maxWidth: '100%', minWidth: 0, minHeight: '32px' },
  label: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(40ch, 60vw)' },
  popover: { boxSizing: 'border-box', maxHeight: '70vh', overflowY: 'auto', maxWidth: 'min(480px, 96vw)', padding: tokens.spacingHorizontalXS },
  companies: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalXS, padding: tokens.spacingHorizontalXS },
  companyButton: { minHeight: '32px', minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' },
  item: { whiteSpace: 'normal', overflowWrap: 'anywhere' },
  empty: { color: tokens.colorNeutralForeground2 },
  // 画面には出さず、支援技術にだけ メニューの名前を伝える（Fluent は aria-labelledby にトリガーを指すため）
  sr: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' },
});

export function WorkTargetMenu(props: {
  projects: readonly Project[];
  companies: readonly Company[];
  openId: string | null;
  /** デモを作業先にしているか（デモ中は、開いている Project があっても作業先はデモ） */
  demoOnly: boolean;
  onChoose: (c: TargetChoice) => void;
  /** Project が 0 件の企業から Project の作成（FR-137）へ案内する */
  onCreateProject: (company: Company) => void;
}) {
  const s = useStyles();
  const t = useT();
  const [companyOpen, setCompanyOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const companyLabelId = useId('company-project-menu-label');
  const companyDescId = useId('company-project-menu-description');
  const companyProjectsId = useId('company-project-list');
  const allLabelId = useId('work-target-menu-label');
  // Menu の submenu は別 Menu/MenuTrigger/MenuItem の組合せ。企業ボタンと一覧を同時に操作するので
  // Popover + standalone MenuList を使い、Tab と矢印を両立する。
  const navigation = useArrowNavigationGroup({ circular: true, tabbable: true });
  // 企業メニューは Home/End/↑↓ を下の onKeyDown で扱う（企業のボタンから Project 項目へ移すため、既定の移動と競合させない）。
  const companyNavigation = useArrowNavigationGroup({ circular: true, tabbable: true, ignoreDefaultKeydown: { Home: true, End: true, ArrowDown: true, ArrowUp: true } });
  const groups = menuGroups(props.projects, props.companies);
  const label = props.demoOnly ? t('デモ') : workTargetLabel(props.openId, props.projects, props.companies);
  const current = props.demoOnly || !props.openId ? DEMO_VALUE : `project:${props.openId}`;
  const project = !props.demoOnly ? props.projects.find((p) => p.id === props.openId) : undefined;
  const currentGroup = project ? groups.find((g) => g.company.id === project.companyId) : undefined;
  const selected = groups.find((g) => g.company.id === companyId) ?? currentGroup;
  const choose = (value: string | undefined) => {
    const choice = value ? parseChoice(value) : null;
    setCompanyOpen(false); setAllOpen(false);
    if (choice && value !== current) props.onChoose(choice);
  };
  return (
    <div data-testid="work-target-display" role="group" aria-label={t('現在の作業先: {label}', { label })} className={s.display}>
      {currentGroup ? (
        <Popover open={companyOpen} onOpenChange={(_, d) => { if (d.open) setCompanyId(currentGroup.company.id); setCompanyOpen(d.open); }}>
          <PopoverTrigger disableButtonEnhancement>
            <Button data-testid="current-company-menu" className={s.company} size="small" appearance="subtle" aria-haspopup="menu" aria-expanded={companyOpen}
              aria-label={t('{name} の Project 一覧（現在: {label}）', { name: currentGroup.company.name, label })}
              onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setCompanyId(currentGroup.company.id); setCompanyOpen(true); } }}>
              <span className={s.label}>{currentGroup.company.name}</span>
            </Button>
          </PopoverTrigger>
          <PopoverSurface className={s.popover} role="presentation">
            <span id={companyLabelId} className={s.sr}>{t('同じ企業の Project')}</span>
            <span id={companyDescId} className={s.sr}>{selected ? t('選択企業: {name}。表示中の Project はこの企業に属します。', { name: selected.company.name }) : ''}</span>
            <MenuList {...companyNavigation} aria-labelledby={companyLabelId} aria-describedby={companyDescId}
              checkedValues={{ target: [current] }} onCheckedValueChange={(_, d) => choose(d.checkedItems[0])}
              onKeyDown={(e) => {
                // 企業のボタンにフォーカスがあっても、Home/End/↑↓ で Project 項目へ移れる（AC-253）
                const modified = e.altKey || e.ctrlKey || e.metaKey; // 修飾キーを伴う操作は、ここでは扱わない
                if (!['Home', 'End', 'ArrowDown', 'ArrowUp'].includes(e.key) || modified) return;
                const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
                if (!items.length) return;
                const index = items.indexOf(e.currentTarget.ownerDocument.activeElement as HTMLElement);
                const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
                  : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                e.preventDefault();
                e.stopPropagation();
                items[next]?.focus();
              }}>
              <div role="group" aria-label={t('企業を選択')} className={s.companies}>
                {groups.map(({ company }) => (
                  <Button key={company.id} className={s.companyButton} size="small"
                    appearance={selected?.company.id === company.id ? 'primary' : 'secondary'}
                    aria-pressed={selected?.company.id === company.id} aria-controls={companyProjectsId}
                    onClick={() => setCompanyId(company.id)}>{company.name}</Button>
                ))}
              </div>
              {selected ? (
                <MenuGroup id={companyProjectsId} aria-label={t('{name} の Project', { name: selected.company.name })}>
                  <MenuGroupHeader>{t('{name} の Project', { name: selected.company.name })}</MenuGroupHeader>
                  {selected.projects.map((p) => (
                    <MenuItemRadio className={s.item} key={p.id} name="target" value={`project:${p.id}`}>{selected.company.name} / {p.name}</MenuItemRadio>
                  ))}
                  {selected.projects.length === 0 ? (
                    <MenuItem className={s.empty} onClick={() => { setCompanyOpen(false); props.onCreateProject(selected.company); }}>{t('Project がありません（Project を作成）')}</MenuItem>
                  ) : null}
                </MenuGroup>
              ) : null}
            </MenuList>
          </PopoverSurface>
        </Popover>
      ) : null}
      <Popover open={allOpen} onOpenChange={(_, d) => setAllOpen(d.open)}>
        <PopoverTrigger disableButtonEnhancement>
          <Button data-testid="work-target-menu" className={s.trigger} size="small" icon={<ChevronDown16Regular aria-hidden />} iconPosition="after" aria-haspopup="menu" aria-expanded={allOpen}
            aria-label={t('現在: {label}（移動先を選ぶメニュー）', { label })}
            onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setAllOpen(true); } }}>
            <span className={s.label}>{currentGroup && project ? `- ${project.name}` : label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverSurface className={s.popover} role="presentation">
          <span id={allLabelId} className={s.sr}>{t('作業先')}</span>
          <MenuList {...navigation} aria-labelledby={allLabelId}
            checkedValues={{ target: [current] }} onCheckedValueChange={(_, d) => choose(d.checkedItems[0])}>
            <MenuItemRadio className={s.item} name="target" value={DEMO_VALUE}>{t(MENU_DEMO_LABEL)}</MenuItemRadio>
            {groups.length > 0 ? <MenuDivider /> : null}
            {groups.map(({ company, projects }) => (
              <MenuGroup key={company.id}>
                <MenuGroupHeader>{company.name}</MenuGroupHeader>
                {projects.map((p) => (
                  <MenuItemRadio className={s.item} key={p.id} name="target" value={`project:${p.id}`}>{company.name} / {p.name}</MenuItemRadio>
                ))}
                {projects.length === 0 ? (
                  <MenuItem className={s.empty} onClick={() => { setAllOpen(false); props.onCreateProject(company); }}>{t('Project がありません（Project を作成）')}</MenuItem>
                ) : null}
              </MenuGroup>
            ))}
          </MenuList>
        </PopoverSurface>
      </Popover>
    </div>
  );
}
