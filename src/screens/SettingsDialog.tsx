// 設定のモーダル表示（FR-223 AC-519・AC-520）。ほかの画面コンポーネントを暗くし（バックドロップ）、固定の大きさの設定画面を前面に出す。
// Esc・閉じるボタン・バックドロップのクリックで閉じる。焦点は中に閉じ込め、閉じると開く前の焦点に戻す（共通の Dialog の包みが行う）。
// 画面が狭いときは、固定の大きさを画面に収まるまで縮め、内容はスクロールで届く（PARAM-029 の幅でも欠けない）。
import { Button, DialogBody, DialogContent, DialogTitle, makeStyles, tokens } from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import { Dialog, DialogSurface } from '../components/Dialog';
import { useSettingsModal } from '../store/settingsModal';
import { SettingsScreen } from './SettingsScreen';

const useStyles = makeStyles({
  surface: {
    width: 'min(720px, calc(100vw - 16px))',
    maxWidth: 'calc(100vw - 16px)',
    height: 'min(640px, calc(100dvh - 16px))',
    maxHeight: 'calc(100dvh - 16px)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  body: { display: 'flex', flexDirection: 'column', minHeight: 0, flexGrow: 1 },
  content: { overflowY: 'auto', overflowX: 'hidden', minHeight: 0, flexGrow: 1, paddingBlock: tokens.spacingVerticalS },
});

export function SettingsDialog() {
  const s = useStyles();
  const open = useSettingsModal((st) => st.open);
  const setOpen = useSettingsModal((st) => st.setOpen);
  return (
    <Dialog open={open} modalType="modal" onOpenChange={(_, d) => setOpen(d.open)}>
      <DialogSurface aria-label="設定" className={s.surface} data-testid="settings-dialog" backdrop={{ 'data-testid': 'modal-backdrop' } as never}>
        <DialogBody className={s.body}>
          <DialogTitle
            aria-level={1} // NFR-A11Y-009 AC-484: モーダルの最初の見出しは h1（以降の「表示と接続の設定」h2・「ブランド」h3 と段が続く）
            action={<Button appearance="subtle" aria-label="閉じる" icon={<Dismiss24Regular aria-hidden />} onClick={() => setOpen(false)} />}
          >
            設定
          </DialogTitle>
          <DialogContent className={s.content}>
            <SettingsScreen />
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
