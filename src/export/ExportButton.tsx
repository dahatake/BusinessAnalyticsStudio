// エクスポートの常設ボタンと、ダイアログ・ショートカット・通知の置き場所（FR-052）。App の外枠に 1 つだけ置く。
import { useEffect } from 'react';
import { Button, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, makeStyles, tokens } from '@fluentui/react-components';
import { ArrowExport24Regular, Dismiss24Regular } from '@fluentui/react-icons';
import { installDiscussionChangeLog } from './changelog';
import { registerEditChangeLog, registerPackSnapshot } from './snapshot';
import { useExportShortcuts } from './commands';
import { ExportDialog, type ExportScreenRef } from './ExportDialog';
import { useExportUi } from './ui';

const useStyles = makeStyles({
  notice: {
    position: 'fixed', top: tokens.spacingVerticalXXL, right: tokens.spacingHorizontalXXL, width: 'min(520px, calc(100vw - 32px))',
    zIndex: 900, boxShadow: tokens.shadow16,
  },
});

/** ヘッダーに常設するボタン。どの画面からでもエクスポートの画面を開く。 */
export function ExportButton() {
  const open = useExportUi((u) => u.openDialog);
  return (
    <Button size="small" icon={<ArrowExport24Regular aria-hidden />} onClick={open}>エクスポート</Button>
  );
}

/** ダイアログ・ショートカット・変更履歴の記録・通知。 */
export function ExportHost({ screens }: { screens: readonly ExportScreenRef[] }) {
  const s = useStyles();
  const notice = useExportUi((u) => u.notice);
  const setNotice = useExportUi((u) => u.setNotice);
  useExportShortcuts();
  useEffect(() => installDiscussionChangeLog(), []);
  useEffect(() => registerPackSnapshot(), []);
  useEffect(() => registerEditChangeLog(), []);
  return (
    <>
      <ExportDialog screens={screens} />
      {notice ? (
        <div className={s.notice} role={notice.kind === 'error' ? 'alert' : 'status'} data-testid="export-notice">
          <MessageBar intent={notice.kind} layout="multiline">
            <MessageBarBody>
              <MessageBarTitle>{notice.title}</MessageBarTitle>
              {notice.lines.map((l, i) => <div key={i}>{l}</div>)}
            </MessageBarBody>
            <MessageBarActions
              containerAction={<Button aria-label="閉じる" appearance="transparent" icon={<Dismiss24Regular aria-hidden />} onClick={() => setNotice(null)} />}
            />
          </MessageBar>
        </div>
      ) : null}
    </>
  );
}
