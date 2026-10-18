// エクスポートの常設ボタンと、ダイアログ・ショートカット・通知の置き場所（FR-052）。App の外枠に 1 つだけ置く。
import { useEffect, useState } from 'react';
import { Button, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, makeStyles, tokens } from '@fluentui/react-components';
import { ArrowExport24Regular, Dismiss24Regular, DocumentPdf24Regular } from '@fluentui/react-icons';
import { downloadBlob } from './deliver';
import { collectInput } from './ExportDialog';
import { loadJapaneseFont } from './pdf';
import { buildSummaryPack } from './summaryPack';
import { installDiscussionChangeLog } from './changelog';
import { registerEditChangeLog, registerPackSnapshot } from './snapshot';
import { registerProjectIntegrationsSnapshot } from '../store/projectIntegrations';
import { useExportShortcuts } from './commands';
import { ExportDialog, type ExportScreenRef } from './ExportDialog';
import { PersonConfirmDialog } from '../ai/PersonConfirmDialog';
import { confirmViaUi, consentOf, gatePersonConfirm } from '../ai/personConfirm';
import { useExportUi } from './ui';

const useStyles = makeStyles({
  notice: {
    position: 'fixed', bottom: tokens.spacingVerticalXXL, right: tokens.spacingHorizontalXXL, width: 'min(520px, calc(100vw - 32px))',
    zIndex: 900, boxShadow: tokens.shadow16,
  },
});

/** ヘッダーに常設するボタン。どの画面からでもエクスポートの画面を開く。「Engagement サマリーパック」（FR-094）はワンクリックで PDF + Markdown の ZIP を作る。 */
export function ExportButton() {
  const open = useExportUi((u) => u.openDialog);
  const setNotice = useExportUi((u) => u.setNotice);
  const [busy, setBusy] = useState(false);
  const pack = async () => {
    const input = collectInput();
    if (!input) { setNotice({ kind: 'error', title: 'サマリーパックを作れません', lines: ['データの読み込みが終わってから、もう一度押してください。'] }); return; }
    setBusy(true);
    try {
      // FR-219: 種別「人」を含むときは出力の前に確認を通す（了承の記録がなければ出力しない）
      const gate = await gatePersonConfirm({ destination: 'export', scopeLabel: 'Engagement サマリーパック（PDF と Markdown）', data: input.data, consent: consentOf(input.data), confirm: confirmViaUi });
      if (!gate.allowed) {
        if (gate.reason) setNotice({ kind: 'error', title: 'サマリーパックを出力しませんでした', lines: [gate.reason] });
        return;
      }
      const r = await buildSummaryPack(input, await loadJapaneseFont());
      downloadBlob(r.fileName, new Blob([r.bytes.slice().buffer], { type: 'application/zip' }));
      setNotice({ kind: 'success', title: 'Engagement サマリーパックを出力しました', lines: [r.fileName, 'PDF と Markdown を 1 つの ZIP にまとめました。'] });
    } catch (e) {
      setNotice({ kind: 'error', title: 'サマリーパックを作れませんでした', lines: [e instanceof Error ? e.message : String(e)] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button size="small" icon={<ArrowExport24Regular aria-hidden />} onClick={open}>エクスポート</Button>
      <Button size="small" icon={<DocumentPdf24Regular aria-hidden />} disabled={busy} onClick={() => { void pack(); }}>Engagement サマリーパック</Button>
    </>
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
  useEffect(() => registerProjectIntegrationsSnapshot(), []);
  useEffect(() => registerEditChangeLog(), []);
  return (
    <>
      <ExportDialog screens={screens} />
      <PersonConfirmDialog />
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
