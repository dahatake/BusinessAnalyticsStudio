// 画面上部のツールバーのボタン「設定」。左メニューには設定の項目を置かず、ここから設定のモーダル（AC-519）を開く。
// アイコンは Fluent System Icons。名前は見える文字「設定」で、狭い画面でも上部の段に残り、Tab で到達できる。
import type { ReactNode } from 'react';
import { Button, makeStyles, tokens } from '@fluentui/react-components';
import { Settings24Regular } from '@fluentui/react-icons';
import { useSettingsModal } from '../store/settingsModal';

const useStyles = makeStyles({
  // AI の状態表示と「設定」を同じ上部の段に並べ、折り返しで離れないようにする。狭い画面では中で折り返して横にはみ出さない
  group: { display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXXS, maxWidth: '100%', minWidth: 0 },
});

/** 上部の AI の状態表示と「設定」ボタンをまとめる段 */
export function StatusAndSettings({ children }: { children: ReactNode }) {
  const s = useStyles();
  return <div className={s.group}>{children}</div>;
}

export function SettingsButton() {
  const setOpen = useSettingsModal((s) => s.setOpen);
  return (
    <Button
      data-testid="settings-button"
      appearance="subtle"
      icon={<Settings24Regular aria-hidden />}
      onClick={() => setOpen(true)}
    >
      設定
    </Button>
  );
}
