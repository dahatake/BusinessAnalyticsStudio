// コンポーネント（パネル）がワークスペースの中にいるときの文脈と、見出しのメニュー（FR-013/FR-109）。
import { createContext, useContext } from 'react';
import { Button, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger } from '@fluentui/react-components';
import { MoreHorizontal20Regular } from '@fluentui/react-icons';
import type { Move } from './layoutModel';

export interface PaneInfo {
  key: string;
  maximized: boolean;
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
          aria-label={`${title}のメニュー`}
        />
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuItem onClick={() => pane.move('up')}>上へ移動</MenuItem>
          <MenuItem onClick={() => pane.move('down')}>下へ移動</MenuItem>
          <MenuItem onClick={() => pane.move('left')}>左へ移動</MenuItem>
          <MenuItem onClick={() => pane.move('right')}>右へ移動</MenuItem>
          <MenuItem onClick={pane.toggleDirection}>並べる方向を変える（横/縦）</MenuItem>
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
