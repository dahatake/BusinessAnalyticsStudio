// 最上段の作業先メニュー（FR-148）。企業の選択は一覧だけを変え、Project の確定で移動する。
// 移動の扱い（データの分離・未保存の入力の確認）は FR-138・FR-144 と同じ（呼び出し側の requestOpen を使う）。
// キーボードだけで開き（Enter/Space/↓）、Tab・矢印で選び、Enter で確定、Esc で閉じる（AC-253）。
import { useState } from 'react';
import { Button, MenuDivider, MenuGroup, MenuGroupHeader, MenuItem, MenuItemRadio, MenuList, Popover, PopoverSurface, PopoverTrigger, makeStyles, tokens, useArrowNavigationGroup, useId } from '@fluentui/react-components';
import { ChevronDown16Regular } from '@fluentui/react-icons';
import type { Company, Project } from '../store/projects';
import { DEMO_VALUE, MENU_DEMO_LABEL, menuGroups, parseChoice, workTargetLabel, type TargetChoice } from './workTarget';

const useStyles = makeStyles({
  trigger: { maxWidth: '100%', minWidth: 0, minHeight: '32px' },
  label: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(40ch, 60vw)' },
  popover: { boxSizing: 'border-box', maxHeight: '70vh', overflowY: 'auto', maxWidth: 'min(480px, 96vw)', padding: tokens.spacingHorizontalXS },
  companies: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalXS, padding: tokens.spacingHorizontalXS },
  company: { minHeight: '32px', minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' },
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
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const labelId = useId('work-target-menu-label');
  const descriptionId = useId('work-target-menu-description');
  const projectsId = useId('work-target-projects');
  // Menu の submenu は別 Menu/MenuTrigger/MenuItem の組合せ。ここは企業ボタンと
  // 一覧を同時に操作するので Popover + standalone MenuList を使い、Tab と矢印を両立する。
  const navigation = useArrowNavigationGroup({ circular: true, tabbable: true });
  const groups = menuGroups(props.projects, props.companies);
  const initialCompanyId = (!props.demoOnly ? props.projects.find((p) => p.id === props.openId)?.companyId : undefined) ?? groups[0]?.company.id;
  const selected = groups.find((g) => g.company.id === (open ? companyId : initialCompanyId)) ?? groups[0];
  const label = props.demoOnly ? 'デモ' : workTargetLabel(props.openId, props.projects, props.companies);
  const current = props.demoOnly || !props.openId ? DEMO_VALUE : `project:${props.openId}`;
  const changeOpen = (next: boolean) => {
    if (next) setCompanyId(initialCompanyId ?? null);
    setOpen(next);
  };
  return (
    <Popover open={open} onOpenChange={(_, d) => changeOpen(d.open)}>
      <PopoverTrigger disableButtonEnhancement>
        <Button data-testid="work-target-menu" className={s.trigger} size="small" icon={<ChevronDown16Regular aria-hidden />} iconPosition="after" aria-haspopup="menu" aria-expanded={open} aria-label={`現在: ${label}（移動先を選ぶメニュー）`} onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); changeOpen(true); }
        }}>
          <span className={s.label}>{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverSurface className={s.popover} role="presentation">
        <span id={labelId} className={s.sr}>作業先</span>
        <span id={descriptionId} className={s.sr}>{selected ? `選択企業: ${selected.company.name}。表示中の Project はこの企業に属します。` : '登録済みの企業はありません。'}</span>
        <MenuList {...navigation} aria-labelledby={labelId} aria-describedby={descriptionId}
          checkedValues={{ target: [current] }}
          onCheckedValueChange={(_, d) => {
            const v = d.checkedItems[0];
            const c = v ? parseChoice(v) : null;
            setOpen(false);
            if (c && v !== current) props.onChoose(c);
          }}>
          {groups.length > 0 ? (
            <div role="group" aria-label="企業を選択" className={s.companies}>
              {groups.map(({ company }) => (
                <Button key={company.id} className={s.company} size="small"
                  appearance={selected?.company.id === company.id ? 'primary' : 'secondary'}
                  aria-pressed={selected?.company.id === company.id} aria-controls={projectsId}
                  onClick={() => setCompanyId(company.id)}>{company.name}</Button>
              ))}
            </div>
          ) : null}
          <MenuItemRadio className={s.item} name="target" value={DEMO_VALUE}>{MENU_DEMO_LABEL}</MenuItemRadio>
          {groups.length > 0 ? <MenuDivider /> : null}
          {selected ? (
            <MenuGroup id={projectsId} aria-label={`${selected.company.name} の Project`}>
              <MenuGroupHeader>{selected.company.name} の Project</MenuGroupHeader>
              {selected.projects.map((p) => (
                <MenuItemRadio className={s.item} key={p.id} name="target" value={`project:${p.id}`}>{selected.company.name} / {p.name}</MenuItemRadio>
              ))}
              {selected.projects.length === 0 ? (
                <MenuItem className={s.empty} onClick={() => { setOpen(false); props.onCreateProject(selected.company); }}>Project がありません（Project を作成）</MenuItem>
              ) : null}
            </MenuGroup>
          ) : null}
        </MenuList>
      </PopoverSurface>
    </Popover>
  );
}
