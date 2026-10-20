// コンポーネント（パネル）がワークスペースの中にいるときの文脈と、見出しのメニュー（FR-013/FR-109）。
import { createContext, useContext } from 'react';
import { Button, Menu, MenuDivider, MenuItem, MenuItemRadio, MenuList, MenuPopover, MenuTrigger, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { MoreHorizontal20Regular } from '@fluentui/react-icons';
import type { Move } from './layoutModel';
import { TIERS, TIER_LABEL, type Role, type Tier } from './tiers';
import { SNAP_LABEL, type SnapKind } from './snap';
import { PIN_MOVE_REASON, PIN_RESIZE_REASON, PIN_TABS_REASON, paneAction, type PaneActionId } from './paneActions';
import { ComponentViewButton, ComponentViewSubmenu } from '../view/ViewMenu';

const useActionStyles = makeStyles({
  actions: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalXXS, flexShrink: 0 },
  group: { display: 'contents' },
  // 当たり判定は 24 CSS px 以上（WCAG 2.2 の 2.5.8。PARAM-040）
  icon: { minWidth: '24px', minHeight: '24px' },
});

export interface PaneInfo {
  key: string;
  maximized: boolean;
  /** 最小化しているか（見出しだけを残して畳む。FR-151） */
  minimized: boolean;
  toggleMinimize: () => void;
  /** 画面に見えているか（タブのまとまりで前面でないタブは false。描画は保つが隠している） */
  visible: boolean;
  /** 同じタブのまとまりに入っているか */
  inTabs: boolean;
  /** タブにまとめられる相手（表示中の別のコンポーネント） */
  peers: ReadonlyArray<{ key: string; label: string }>;
  toggleMaximize: () => void;
  /** ヘッダーのダブルクリックなどで拡大表示しているか（FR-174。最大化とは別） */
  expanded: boolean;
  toggleExpand: () => void;
  /** 自由に動かせる配置（浮動）にしているか（FR-173） */
  floating: boolean;
  /** 浮動にする／分割の配置へ戻す（ドラッグなしの手段。FR-173 AC-349） */
  toggleFloat: () => void;
  /** 手前に出す順の重なり（z-index）。操作したことのあるコンポーネントだけ持つ（FR-173） */
  z?: number;
  restore: () => void;
  hide: () => void;
  move: (dir: Move) => void;
  toggleDirection: () => void;
  /** 画面端のスナップの候補から配置する（ドラッグなしの手段。FR-152 AC-266） */
  snapTo: (kind: SnapKind) => void;
  /** いま成り立つ候補（狭い画面では縦積み・タブ化だけ） */
  snapKinds: readonly SnapKind[];
  mergeInto: (target: string) => void;
  untab: () => void;
  /** ピン止めしているか（FR-215） */
  pinned: boolean;
  /** 情報の階層（主役→補助→詳細）と、その理由・役割・グループ（FR-244）。役割のないものは補助 */
  tier: Tier;
  tierReason: string;
  /** 利用者が階層を変えたか */
  tierOverridden: boolean;
  role?: Role;
  group?: string;
  /** 階層を変える（null で既定に戻す）。レイアウトとして保存される */
  setTier: (tier: Tier | null) => void;
  /** 自動配置が働いているか（FR-243）。止めていると、追加しても既存の配置は動かない */
  autoOn: boolean;
  /** 取り消せる自動配置があるか */
  canUndoAuto: boolean;
  autoRun: () => void;
  autoStop: () => void;
  /** 自動配置を取り消す（FR-243） */
  autoUndo: () => void;
  /** いまのステップから見た関連・工程の順・重要度（FR-228。data-step-* に出す） */
  step?: { relevant: boolean; rank: number; importance: 'high' | 'normal' };
  /** ピン止めする／外す（FR-215） */
  togglePin: () => void;
  /** 見出しのポインター操作で移動を始める（FR-142）。キーボードの代わりはメニューと Alt+Shift+矢印キー（NFR-A11Y-004） */
  startDrag: (e: { button: number; clientX: number; clientY: number; pointerId?: number }) => void;
  /** 縦・横を独立に大きさを変える（キーボード・コマンド。FR-224 AC-522）。dir は +1 で大きく、-1 で小さく */
  resizeBy: (axis: 'w' | 'h', dir: 1 | -1) => void;
  /** 縁・角のドラッグで大きさを変え始める（FR-224 AC-521） */
  startResize: (edge: 'e' | 's' | 'se', e: { button: number; clientX: number; clientY: number }) => void;
}

export const PaneContext = createContext<PaneInfo | null>(null);
export const usePane = (): PaneInfo | null => useContext(PaneContext);

export function ComponentMenu({ pane, title, open, onOpenChange, onShowTier }: {
  pane: PaneInfo; title: string;
  /** 見出しの右クリック・Shift+F10 で開くため、開閉を呼び出し側から制御できる（FR-244） */
  open?: boolean; onOpenChange?: (open: boolean) => void;
  /** 「情報の階層」を選んだとき（階層と理由を見出しの下に示す） */
  onShowTier?: () => void;
}) {
  const pinNote = pane.pinned ? PIN_MOVE_REASON : undefined;
  return (
    <Menu {...(open !== undefined ? { open, onOpenChange: (_: unknown, d: { open: boolean }) => onOpenChange?.(d.open) } : {})}>
      <MenuTrigger disableButtonEnhancement>
        <Button
          data-testid="component-menu"
          appearance="subtle"
          size="small"
          icon={<MoreHorizontal20Regular aria-hidden />}
          aria-label={`その他の操作（${title}のメニュー）`}
        />
      </MenuTrigger>
      <MenuPopover>
        <MenuList checkedValues={{ tier: [pane.tier] }} onCheckedValueChange={(_, d) => { if (d.name === 'tier') { const t = d.checkedItems[0] as Tier | undefined; if (t && (TIERS as readonly string[]).includes(t)) pane.setTier(t); } }}>
          <MenuItem onClick={pane.togglePin}>{paneAction('pin', pane.pinned).label}</MenuItem>
          <MenuItem onClick={pane.toggleMinimize}>{paneAction('minimize', pane.minimized).label}</MenuItem>
          {/* ピン止め中は動かす操作を無効にし、理由を示す（FR-216 AC-496） */}
          <MenuItem disabled={pane.pinned} secondaryContent={pinNote} onClick={() => pane.move('up')}>上へ移動</MenuItem>
          <MenuItem disabled={pane.pinned} secondaryContent={pinNote} onClick={() => pane.move('down')}>下へ移動</MenuItem>
          <MenuItem disabled={pane.pinned} secondaryContent={pinNote} onClick={() => pane.move('left')}>左へ移動</MenuItem>
          <MenuItem disabled={pane.pinned} secondaryContent={pinNote} onClick={() => pane.move('right')}>右へ移動</MenuItem>
          <MenuItem disabled={pane.pinned} secondaryContent={pinNote} onClick={pane.toggleDirection}>並べる方向を変える（横/縦）</MenuItem>
          {pane.pinned ? <MenuItem disabled secondaryContent={PIN_MOVE_REASON}>画面に配置</MenuItem> : (
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <MenuItem>画面に配置</MenuItem>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {pane.snapKinds.filter((k) => k !== 'tabs' || pane.peers.length > 0).map((k) => (
                  <MenuItem key={k} onClick={() => pane.snapTo(k)}>{SNAP_LABEL[k]}</MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          )}
          <MenuItem disabled={pane.pinned} secondaryContent={pane.pinned ? PIN_RESIZE_REASON : undefined} onClick={() => pane.resizeBy('w', 1)}>幅を広げる</MenuItem>
          <MenuItem disabled={pane.pinned} secondaryContent={pane.pinned ? PIN_RESIZE_REASON : undefined} onClick={() => pane.resizeBy('w', -1)}>幅を狭める</MenuItem>
          <MenuItem disabled={pane.pinned} secondaryContent={pane.pinned ? PIN_RESIZE_REASON : undefined} onClick={() => pane.resizeBy('h', 1)}>高さを広げる</MenuItem>
          <MenuItem disabled={pane.pinned} secondaryContent={pane.pinned ? PIN_RESIZE_REASON : undefined} onClick={() => pane.resizeBy('h', -1)}>高さを狭める</MenuItem>
          <MenuItem onClick={pane.toggleMaximize}>{paneAction('maximize', pane.maximized).label}</MenuItem>
          <MenuItem onClick={pane.toggleExpand}>{pane.expanded ? '拡大表示を戻す' : '拡大表示（75%）'}</MenuItem>
          <MenuItem disabled={pane.pinned} secondaryContent={pinNote} onClick={pane.toggleFloat}>{pane.floating ? '分割の配置に戻す' : '自由に動かせる配置にする'}</MenuItem>
          {pane.pinned ? <MenuItem disabled secondaryContent={PIN_TABS_REASON}>{paneAction('tabs').label}</MenuItem> : pane.peers.length > 0 ? (
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <MenuItem>タブにまとめる</MenuItem>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  {pane.peers.map((p) => (
                    <MenuItem key={p.key} onClick={() => pane.mergeInto(p.key)}>{p.label}</MenuItem>
                  ))}
                </MenuList>
              </MenuPopover>
            </Menu>
          ) : null}
          {pane.inTabs && !pane.pinned ? <MenuItem onClick={pane.untab}>{paneAction('untab').label}</MenuItem> : null}
          <MenuItem onClick={pane.hide}>{paneAction('hide').label}</MenuItem>
          {/* 情報の階層（主役→補助→詳細）の確認と変更（FR-244）。階層の違いは名前（文字）で示す */}
          <MenuDivider />
          <MenuItem onClick={onShowTier}>情報の階層</MenuItem>
          {TIERS.map((t) => (
            <MenuItemRadio key={t} name="tier" value={t}>{TIER_LABEL[t]}</MenuItemRadio>
          ))}
          {pane.tierOverridden ? <MenuItem onClick={() => pane.setTier(null)}>階層を既定に戻す</MenuItem> : null}
          {/* 自動配置（FR-243）。ドラッグなしで、実行・停止・取消ができる（NFR-A11Y-004） */}
          <MenuDivider />
          <MenuItem onClick={pane.autoRun}>自動配置を実行</MenuItem>
          <MenuItem disabled={!pane.autoOn} onClick={pane.autoStop}>自動配置を停止</MenuItem>
          <MenuItem disabled={!pane.canUndoAuto} onClick={pane.autoUndo}>自動配置を取り消す</MenuItem>
          <MenuDivider />
          {/* ビューの切替（FR-217・FR-218）。見出しのボタンが隠れるときも、ここから操作できる */}
          <ComponentViewSubmenu paneKey={pane.key} />
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}


/**
 * 見出しの操作のボタン。名前・アイコンは操作の定義（paneActions）から取る（NFR-UX-018 AC-482）。
 * `pressed` を渡すと切替のボタンになり、押下の状態（aria-pressed）を持つ。アイコンの種類（Regular／Filled）は data-icon-variant で示す。
 */
function ActionButton({ action, on = false, pressed, onClick, disabledReason }: { action: PaneActionId; on?: boolean; pressed?: boolean; onClick?: () => void; disabledReason?: string }) {
  const s = useActionStyles();
  const v = paneAction(action, on);
  const Icon = v.Icon;
  return (
    <Tooltip content={disabledReason ? `${v.label}（${disabledReason}）` : v.label} relationship="label" withArrow>
      <Button
        className={s.icon}
        appearance="subtle"
        size="small"
        icon={<Icon aria-hidden />}
        data-action={action}
        data-icon-variant={v.variant}
        aria-pressed={pressed}
        disabledFocusable={!!disabledReason}
        onClick={disabledReason ? undefined : onClick}
      />
    </Tooltip>
  );
}

/**
 * 見出しの操作アイコン（FR-150）。フォーカス中（または最小化中）のコンポーネントだけ、主要な操作をメニューを開かずに押せる形で並べる。
 * 狭いとき（narrow）は、アイコンを出さず「…」メニューに任せる（操作は欠けない。FR-150 AC-259）。
 */
export function ComponentActions({ pane, title, active, narrow, menu }: { pane: PaneInfo; title: string; active: boolean; narrow: boolean; menu?: { open: boolean; onOpenChange: (open: boolean) => void; onShowTier: () => void } }) {
  const s = useActionStyles();
  // アイコンは常に描き、フォーカスのないときは隠す。隠している間は押せず、Tab でも止まらない。
  // 広いときは visibility: hidden で場所を残す（フォーカスが入った瞬間に見出しの折り返しが変わり、押そうとしたボタンが動いてクリックが外れるのを防ぐ）。狭いときは display: none。
  // フォーカスが入ると現れ、操作できる（FR-150）。最小化中は復元のアイコンだけを、フォーカスに関わらず出す
  const shown = (active && !narrow) || pane.minimized;
  // 狭いときも、最小化・最大化（元に戻す）は見出しに残す（FR-222）。ピン止め・タブ化・非表示・ビューは「…」メニューに畳む（NFR-UX-018）
  const coreStyle = shown || narrow ? undefined : { visibility: 'hidden' as const };
  const extraStyle = shown && !narrow ? undefined : narrow ? { display: 'none' } : { visibility: 'hidden' as const };
  const TabsIcon = paneAction('tabs').Icon;
  return (
    <div className={s.actions} data-testid="component-actions" data-minimized={pane.minimized ? 'true' : undefined}>
      <span className={s.group} style={extraStyle}>
      {/* ピン止めの切替（FR-215）: 現在の状態に応じたアイコンを 1 つだけ出す。固定なし＝「ピン止めする」Regular、固定中＝「ピン止めを外す」Filled */}
      <ActionButton action="pin" on={pane.pinned} pressed={pane.pinned} onClick={pane.togglePin} />
      </span>
      <span className={s.group} style={coreStyle}>
      {pane.minimized ? (
        // 最小化中は、フォーカスの有無に関わらず復元できる（見出しの操作で元の位置・大きさに戻る。FR-151）
        <ActionButton action="minimize" on onClick={pane.toggleMinimize} />
      ) : null}
      {!pane.minimized ? (
        <>
          <ActionButton action="maximize" on={pane.maximized} onClick={pane.toggleMaximize} />
          <ActionButton action="minimize" onClick={pane.toggleMinimize} />
        </>
      ) : null}
      </span>
      <span className={s.group} style={extraStyle}>
      {!pane.minimized ? (
        <>
          {pane.pinned ? (
            // ピン止め中はタブにまとめない（FR-216 AC-505）。理由をツールチップと名前で示す
            <ActionButton action="tabs" disabledReason={PIN_TABS_REASON} />
          ) : pane.inTabs ? (
            <ActionButton action="untab" onClick={pane.untab} />
          ) : pane.peers.length > 0 ? (
            <Menu>
              <Tooltip content={paneAction('tabs').label} relationship="label" withArrow>
                <MenuTrigger disableButtonEnhancement>
                  <Button className={s.icon} appearance="subtle" size="small" data-action="tabs" data-icon-variant="regular" icon={<TabsIcon aria-hidden />} />
                </MenuTrigger>
              </Tooltip>
              <MenuPopover>
                <MenuList>
                  {pane.peers.map((p) => (
                    <MenuItem key={p.key} onClick={() => pane.mergeInto(p.key)}>{p.label}</MenuItem>
                  ))}
                </MenuList>
              </MenuPopover>
            </Menu>
          ) : null}
          <ActionButton action="hide" onClick={pane.hide} />
          {/* 2D/3D と世界の表示の切替を 1 つにまとめた「ビュー」（FR-217・FR-218。PARAM-073 の 6 個目） */}
          <ComponentViewButton paneKey={pane.key} />
        </>
      ) : null}
      </span>
      <ComponentMenu pane={pane} title={title} open={menu?.open} onOpenChange={menu?.onOpenChange} onShowTier={menu?.onShowTier} />
    </div>
  );
}
