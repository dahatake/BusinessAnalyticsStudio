// 見出しの「ビュー」ボタン（FR-217・FR-218・NFR-UX-018 D-01）。2D/3D と、現実世界／デジタル世界／両方の切替を 1 つのメニューにまとめ、
// ボタンの文字で現在の表示モードと世界の表示を示す。選べない項目は無効にし、理由を文字で示す（AC-500・AC-502）。
//  - ComponentViewButton: コンポーネントの見出し（そのコンポーネントだけに効く）
//  - ComponentViewSubmenu: 「その他の操作」メニューの中の同じ切替（狭いときもメニューから操作できる。FR-150 AC-259）
//  - ScreenViewButton: 画面の見出し（画面の全コンポーネントにまとめて効く。表現を固定したコンポーネントは対象外。AC-507）
import { useId } from 'react';
import {
  Button, Menu, MenuDivider, MenuGroup, MenuGroupHeader, MenuItem, MenuItemRadio, MenuList, MenuPopover, MenuTrigger, Tooltip, makeStyles, tokens,
  type MenuProps,
} from '@fluentui/react-components';
import { paneAction } from '../workspace/paneActions';
import { applyScreenView, useComponentView, useScreenView } from './useView';
import {
  FALLBACK_DECL, modeOptions, viewDeclKeys, viewDeclOf, viewText, worldOptions, type ViewMode, type ViewOption, type WorldView,
} from './viewModel';
import { detect3D } from './render3d';

const useStyles = makeStyles({
  // 当たり判定は 24 CSS px 以上（PARAM-040）
  button: { minWidth: '24px', minHeight: '24px', whiteSpace: 'nowrap', paddingInline: tokens.spacingHorizontalXS },
  heading: { display: 'inline-flex', alignItems: 'center' },
  reason: { color: tokens.colorNeutralForeground3 },
});

type Checked = Record<string, string[]>;

// 既定の移動（10px の滑り込み）をなくす。開いた直後に項目が動き続けると、操作（クリック）の位置が定まるまで待たされる
const NO_SLIDE = { distance: 0 } as never;

function Options<T extends string>({ name, options }: { name: string; options: ViewOption<T>[] }) {
  const s = useStyles();
  const base = useId();
  return (
    <>
      {options.map((o) => {
        const rid = `${base}-${o.value}`;
        return (
          <MenuItemRadio
            key={o.value}
            name={name}
            value={o.value}
            // 名前は選択肢の文字だけ（理由は説明として読み上げる）
            aria-label={o.label}
            aria-describedby={o.reason ? rid : undefined}
            disabled={!o.enabled}
            secondaryContent={o.reason ? <span id={rid} className={s.reason}>{o.reason}</span> : undefined}
          >
            {o.label}
          </MenuItemRadio>
        );
      })}
    </>
  );
}

function ViewMenuList({ modes, worlds }: { modes: ViewOption<ViewMode>[]; worlds: ViewOption<WorldView>[] }) {
  return (
    <MenuList>
      <MenuGroup>
        <MenuGroupHeader>表示形式</MenuGroupHeader>
        <Options name="mode" options={modes} />
      </MenuGroup>
      <MenuDivider />
      <MenuGroup>
        <MenuGroupHeader>世界の表示</MenuGroupHeader>
        <Options name="world" options={worlds} />
      </MenuGroup>
    </MenuList>
  );
}

function onChecked(setMode: (m: ViewMode) => void, setWorld: (w: WorldView) => void): MenuProps['onCheckedValueChange'] {
  return (_, d) => {
    const v = d.checkedItems[0];
    if (!v) return;
    if (d.name === 'mode') setMode(v as ViewMode);
    else if (d.name === 'world') setWorld(v as WorldView);
  };
}

/** コンポーネントの見出しの「ビュー」ボタン。名前は「ビュー」で始まり、見える文字に現在の表示モードと世界の表示を含む（CONTRACT.md §21） */
export function ComponentViewButton({ paneKey }: { paneKey: string }) {
  const s = useStyles();
  const v = useComponentView(paneKey);
  const a = paneAction('view');
  const checked: Checked = { mode: [v.mode], world: [v.world] };
  const text = viewText(v.mode, v.world);
  return (
    <Menu surfaceMotion={NO_SLIDE} positioning={{ autoSize: 'height', overflowBoundary: 'window', flipBoundary: 'window' } as never} checkedValues={checked} onCheckedValueChange={onChecked(v.setMode, v.setWorld)}>
      <Tooltip content="ビュー（このコンポーネントの表示モードと世界の表示）" relationship="description" withArrow>
        <MenuTrigger disableButtonEnhancement>
          {/* 見出しの幅を取りすぎないよう、アイコンは付けず文字（現在の表示モード・世界の表示）だけで示す */}
          <Button className={s.button} appearance="subtle" size="small" data-action="view" data-icon-variant={a.variant} aria-label={`ビュー: ${text}`}>
            {text}
          </Button>
        </MenuTrigger>
      </Tooltip>
      <MenuPopover>
        <ViewMenuList modes={modeOptions(v.decl, v.can3D)} worlds={worldOptions(v.decl)} />
      </MenuPopover>
    </Menu>
  );
}

/** 「その他の操作」メニューの中のビューの切替（入れ子のメニュー） */
export function ComponentViewSubmenu({ paneKey }: { paneKey: string }) {
  const v = useComponentView(paneKey);
  const checked: Checked = { mode: [v.mode], world: [v.world] };
  return (
    <Menu surfaceMotion={NO_SLIDE} checkedValues={checked} onCheckedValueChange={onChecked(v.setMode, v.setWorld)}>
      <MenuTrigger disableButtonEnhancement>
        <MenuItem>{`ビュー（${viewText(v.mode, v.world)}）`}</MenuItem>
      </MenuTrigger>
      <MenuPopover>
        <ViewMenuList modes={modeOptions(v.decl, v.can3D)} worlds={worldOptions(v.decl)} />
      </MenuPopover>
    </Menu>
  );
}

/** 画面の見出しの「ビュー」ボタン。選んだ値を画面の全コンポーネントにまとめて入れる（表現を固定したもの・その表現を持たないものは変えない） */
export function ScreenViewButton() {
  const s = useStyles();
  const cur = useScreenView();
  const Icon = paneAction('view').Icon;
  const checked: Checked = { mode: [cur.mode], world: [cur.world] };
  const text = viewText(cur.mode, cur.world);
  // 画面全体の切替は、どれかのコンポーネントが持つ表現を選べる。3D は描画できない環境では選べない
  // 描画できない環境でも、canvas 2D で描ける 3D 相当の表現（ガントの 2.5D）を持つ画面があれば 3D を選べる
  const cpu3D = viewDeclKeys().some((k) => { const d = viewDeclOf(k); return d.has3D && d.cpu3D === true && !d.fixed; });
  const modes = modeOptions({ ...FALLBACK_DECL, has3D: true, cpu3D, world: 'items' }, detect3D());
  const worlds = worldOptions({ ...FALLBACK_DECL, world: 'items' });
  return (
    <Menu
      surfaceMotion={NO_SLIDE}
      checkedValues={checked}
      onCheckedValueChange={onChecked((m) => applyScreenView({ mode: m }), (w) => applyScreenView({ world: w }))}
    >
      {/* 画面の見出し（FR-220 AC-515）。名前は「ビュー」で始まり、コンポーネントの見出しの「ビュー」と同じメニュー。左メニューには切替を置かない */}
      <span data-testid="screen-heading" className={s.heading}>
        <MenuTrigger disableButtonEnhancement>
          <Button className={s.button} icon={<Icon aria-hidden />} aria-label={`ビュー: ${text}`} data-testid="screen-view">
            ビュー: {text}
          </Button>
        </MenuTrigger>
      </span>
      <MenuPopover>
        <ViewMenuList modes={modes} worlds={worlds} />
      </MenuPopover>
    </Menu>
  );
}
