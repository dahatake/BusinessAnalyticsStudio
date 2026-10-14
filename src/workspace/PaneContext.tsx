// コンポーネント（パネル）がワークスペースの中にいるときの文脈と、見出しのメニュー（FR-013/FR-109）。
import { createContext, useContext } from 'react';
import { Button, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import {
  ArrowMaximize20Regular, ArrowMinimize20Regular, EyeOff20Regular, FullScreenMaximize20Regular, FullScreenMinimize20Regular,
  MoreHorizontal20Regular, TabDesktop20Regular, TabDesktopMultiple20Regular,
} from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import type { Move } from './layoutModel';
import { SNAP_LABEL, type SnapKind } from './snap';

const useActionStyles = makeStyles({
  actions: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalXXS, flexShrink: 0 },
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
  /** 見出しのポインター操作で移動を始める（FR-142）。キーボードの代わりはメニューと Alt+Shift+矢印キー（NFR-A11Y-004） */
  startDrag: (e: { button: number; clientX: number; clientY: number; pointerId?: number }) => void;
}

export const PaneContext = createContext<PaneInfo | null>(null);
export const usePane = (): PaneInfo | null => useContext(PaneContext);

export function ComponentMenu({ pane, title }: { pane: PaneInfo; title: string }) {
  return (
    <Menu>
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
        <MenuList>
          <MenuItem onClick={pane.toggleMinimize}>{pane.minimized ? '元に戻す' : '最小化'}</MenuItem>
          <MenuItem onClick={() => pane.move('up')}>上へ移動</MenuItem>
          <MenuItem onClick={() => pane.move('down')}>下へ移動</MenuItem>
          <MenuItem onClick={() => pane.move('left')}>左へ移動</MenuItem>
          <MenuItem onClick={() => pane.move('right')}>右へ移動</MenuItem>
          <MenuItem onClick={pane.toggleDirection}>並べる方向を変える（横/縦）</MenuItem>
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
          <MenuItem onClick={pane.toggleMaximize}>{pane.maximized ? '通常表示に戻す' : '最大化'}</MenuItem>
          {pane.peers.length > 0 ? (
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
          {pane.inTabs ? <MenuItem onClick={pane.untab}>タブから出す</MenuItem> : null}
          <MenuItem onClick={pane.hide}>非表示</MenuItem>
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}


function IconButton({ label, icon, onClick, testId }: { label: string; icon: ReactElement; onClick?: () => void; testId?: string }) {
  const s = useActionStyles();
  return (
    <Tooltip content={label} relationship="label" withArrow>
      <Button data-testid={testId} className={s.icon} appearance="subtle" size="small" icon={icon} onClick={onClick} />
    </Tooltip>
  );
}

/**
 * 見出しの操作アイコン（FR-150）。フォーカス中（または最小化中）のコンポーネントだけ、主要な操作をメニューを開かずに押せる形で並べる。
 * 狭いとき（narrow）は、アイコンを出さず「…」メニューに任せる（操作は欠けない。FR-150 AC-259）。
 */
export function ComponentActions({ pane, title, active, narrow }: { pane: PaneInfo; title: string; active: boolean; narrow: boolean }) {
  const s = useActionStyles();
  // アイコンは常に描き、フォーカスのないときは隠す。隠している間は押せず、Tab でも止まらない。
  // 広いときは visibility: hidden で場所を残す（フォーカスが入った瞬間に見出しの折り返しが変わり、押そうとしたボタンが動いてクリックが外れるのを防ぐ）。狭いときは display: none。
  // フォーカスが入ると現れ、操作できる（FR-150）。最小化中は復元のアイコンだけを、フォーカスに関わらず出す
  const shown = (active && !narrow) || pane.minimized;
  return (
    <>
    <div className={s.actions} data-testid="component-actions" data-minimized={pane.minimized ? 'true' : undefined} style={shown ? undefined : narrow ? { display: 'none' } : { visibility: 'hidden' }}>
      {pane.minimized ? (
        // 最小化中は、フォーカスの有無に関わらず復元できる（見出しの操作で元の位置・大きさに戻る。FR-151）
        <IconButton label="元に戻す" icon={<ArrowMaximize20Regular aria-hidden />} onClick={pane.toggleMinimize} />
      ) : null}
      {!pane.minimized ? (
        <>
          <IconButton
            label={pane.maximized ? '通常表示' : '最大化'}
            icon={pane.maximized ? <FullScreenMinimize20Regular aria-hidden /> : <FullScreenMaximize20Regular aria-hidden />}
            onClick={pane.toggleMaximize}
          />
          <IconButton label="最小化" icon={<ArrowMinimize20Regular aria-hidden />} onClick={pane.toggleMinimize} />
          {pane.inTabs ? (
            <IconButton label="タブから出す" icon={<TabDesktop20Regular aria-hidden />} onClick={pane.untab} />
          ) : pane.peers.length > 0 ? (
            <Menu>
              <Tooltip content="タブにまとめる" relationship="label" withArrow>
                <MenuTrigger disableButtonEnhancement>
                  <Button className={s.icon} appearance="subtle" size="small" icon={<TabDesktopMultiple20Regular aria-hidden />} />
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
          <IconButton label="非表示" icon={<EyeOff20Regular aria-hidden />} onClick={pane.hide} />
        </>
      ) : null}
    </div>
    <ComponentMenu pane={pane} title={title} />
    </>
  );
}
