// 最上段の作業先メニュー（FR-148）。デモと、登録済みのすべての企業・Project を企業ごとにまとめて一覧し、選んで移動する。
// 移動の扱い（データの分離・未保存の入力の確認）は FR-138・FR-144 と同じ（呼び出し側の requestOpen を使う）。
// キーボードだけで開き（Enter/Space/↓）、矢印で選び、Enter で確定、Esc で閉じる（Fluent の Menu が提供。AC-253）。
import { Button, Menu, MenuDivider, MenuGroup, MenuGroupHeader, MenuItem, MenuItemRadio, MenuList, MenuPopover, MenuTrigger, makeStyles, tokens, useId } from '@fluentui/react-components';
import { ChevronDown16Regular } from '@fluentui/react-icons';
import type { Company, Project } from '../store/projects';
import { DEMO_VALUE, MENU_DEMO_LABEL, menuGroups, parseChoice, workTargetLabel, type TargetChoice } from './workTarget';

const useStyles = makeStyles({
  trigger: { maxWidth: '100%', minHeight: '32px' },
  label: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40ch' },
  popover: { maxHeight: '70vh', overflowY: 'auto', maxWidth: 'min(480px, 96vw)' },
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
  const labelId = useId('work-target-menu-label');
  const groups = menuGroups(props.projects, props.companies);
  const label = props.demoOnly ? 'デモ' : workTargetLabel(props.openId, props.projects, props.companies);
  const current = props.demoOnly || !props.openId ? DEMO_VALUE : `project:${props.openId}`;
  return (
    <Menu
      checkedValues={{ target: [current] }}
      onCheckedValueChange={(_, d) => {
        const v = d.checkedItems[0];
        const c = v ? parseChoice(v) : null;
        if (c && v !== current) props.onChoose(c);
      }}
    >
      <MenuTrigger disableButtonEnhancement>
        <Button data-testid="work-target-menu" className={s.trigger} size="small" icon={<ChevronDown16Regular aria-hidden />} iconPosition="after" aria-label={`現在: ${label}（移動先を選ぶメニュー）`}>
          <span className={s.label}>{label}</span>
        </Button>
      </MenuTrigger>
      <MenuPopover className={s.popover}>
        <span id={labelId} className={s.sr}>作業先</span>
        <MenuList aria-labelledby={labelId}>
          <MenuItemRadio name="target" value={DEMO_VALUE}>{MENU_DEMO_LABEL}</MenuItemRadio>
          {groups.length > 0 ? <MenuDivider /> : null}
          {groups.map(({ company, projects }) => (
            <MenuGroup key={company.id}>
              <MenuGroupHeader>{company.name}</MenuGroupHeader>
              {projects.map((p) => (
                <MenuItemRadio key={p.id} name="target" value={`project:${p.id}`}>{company.name} / {p.name}</MenuItemRadio>
              ))}
              {projects.length === 0 ? (
                <MenuItem className={s.empty} onClick={() => props.onCreateProject(company)}>Project がありません（Project を作成）</MenuItem>
              ) : null}
            </MenuGroup>
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}
