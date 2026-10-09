// エクスポートの画面（FR-052〜FR-055）。出力範囲・形式・機密確認（匿名化）・フォローアップ文書を選び、プレビューを見てから書き出す。
// 書き出しは File System Access API（保存先を利用者が指定）か、非対応の環境では ZIP のダウンロード（NFR-UX-004: 失敗しても設定と編集中のデータは残る）。
import { useEffect, useMemo, useState } from 'react';
import {
  Button, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, MessageBar, MessageBarBody, MessageBarTitle,
  Radio, RadioGroup, Select, Spinner, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import { ArrowDownload24Regular, ArrowExport24Regular, Dismiss24Regular } from '@fluentui/react-icons';
import { packKeyOf } from '../discussion/model';
import { captureSnapshotData } from '../discussion/restore';
import { useInk } from '../ink/store';
import { ANONYMIZED_LABEL } from '../schema';
import { useDiscussionStore } from '../store/discussion';
import { usePackStore } from '../store/pack';
import { buildExport, countInternal, SCOPE_LABELS, type ExportFormat, type ExportInput, type ExportOptions, type ExportScope } from './build';
import { getChangeLog } from './changelog';
import { deliver, hasFileSystemAccess } from './deliver';
import { MarkdownPreview } from './MarkdownPreview';
import { useExportUi } from './ui';
import { createZip } from './zip';

const useStyles = makeStyles({
  surface: { width: 'min(960px, calc(100vw - 32px))', maxWidth: 'calc(100vw - 32px)' },
  content: {
    display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)', columnGap: tokens.spacingHorizontalXL, rowGap: tokens.spacingVerticalL,
    '@media (max-width: 720px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
  options: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, minWidth: 0 },
  previewPane: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, minWidth: 0 },
  preview: {
    maxHeight: '52vh', overflowY: 'auto', padding: tokens.spacingHorizontalM, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1,
  },
  hint: { color: tokens.colorNeutralForeground3 },
});

const SCOPES: ExportScope[] = ['all', 'screen', 'theme', 'decisions'];

export interface ExportScreenRef { key: string; label: string }

/** 書き出しの入力を、いまの状態から集める。 */
function collectInput(): ExportInput | null {
  const st = usePackStore.getState().state;
  if (st.status !== 'ready') return null;
  const cu = st.pack.data.customer;
  const key = packKeyOf(cu.name, cu.projectName);
  return {
    customerName: cu.name,
    projectName: cu.projectName,
    data: st.pack.data,
    themes: useDiscussionStore.getState().byPack[key]?.themes ?? [],
    boards: useInk.getState().boards,
    changes: getChangeLog(),
    snapshotData: captureSnapshotData(),
    now: new Date(),
  };
}

export function ExportDialog({ screens }: { screens: readonly ExportScreenRef[] }) {
  const s = useStyles();
  const open = useExportUi((u) => u.open);
  const close = useExportUi((u) => u.closeDialog);
  const setNotice = useExportUi((u) => u.setNotice);
  const input = useMemo(() => (open ? collectInput() : null), [open]);
  const fsa = useMemo(() => hasFileSystemAccess(), []);
  const internalCount = useMemo(() => (input ? countInternal(input.data) : 0), [input]);

  const [scope, setScope] = useState<ExportScope>('all');
  const [screenKey, setScreenKey] = useState('');
  const [themeId, setThemeId] = useState('');
  const [anonymize, setAnonymize] = useState(true);
  const [rawConfirmed, setRawConfirmed] = useState(false);
  const [format, setFormat] = useState<ExportFormat>(fsa ? 'md' : 'zip');
  const [followUp, setFollowUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 開くたびに、機密区分 internal の項目があれば匿名化を既定で ON にする（安全側）。ほかの選択は、閉じても残す。
  useEffect(() => {
    if (!open) return;
    setAnonymize(internalCount > 0);
    setRawConfirmed(false);
    setError(null);
  }, [open, internalCount]);

  const themes = input?.themes ?? [];
  const effScreen = screenKey || screens[0]?.key || '';
  const effTheme = themeId || themes[0]?.id || '';
  const options: ExportOptions = { scope, screenKey: effScreen, themeId: effTheme, anonymize, format, followUp };

  const built = useMemo(() => (input ? buildExport(input, { scope, screenKey: effScreen, themeId: effTheme, anonymize, format, followUp }) : null),
    [input, scope, effScreen, effTheme, anonymize, format, followUp]);

  const needsRawConfirm = internalCount > 0 && !anonymize;
  const canExport = !!built && !busy && (!needsRawConfirm || rawConfirmed);

  const run = async (asZip: boolean, useFileSystem: boolean) => {
    if (!input) return;
    setBusy(true);
    setError(null);
    try {
      const r = buildExport(input, { ...options, format: asZip ? 'zip' : format });
      const bytes = asZip || format === 'zip' ? createZip(r.files, input.now) : r.markdown;
      const fileName = asZip ? r.fileName.replace(/\.md$/, '.zip') : r.fileName;
      const res = await deliver(fileName, bytes, useFileSystem);
      if (res.ok) {
        setNotice({
          kind: 'success', title: 'エクスポートしました',
          lines: [res.name, ...(res.method === 'download' ? ['ブラウザーのダウンロードとして保存しました。'] : [])],
        });
        close();
      } else if (!res.cancelled) {
        setError(res.reason);
      }
    } catch (e) {
      setError(`書き出しに失敗しました（${e instanceof Error ? e.message : String(e)}）。`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) close(); }}>
      <DialogSurface aria-label="エクスポート" className={s.surface}>
        <DialogBody>
          <DialogTitle>エクスポート</DialogTitle>
          <DialogContent>
            {!input ? <Spinner label="データを読み込み中" /> : (
              <div className={s.content}>
                <div className={s.options}>
                  <Field label="出力範囲">
                    <RadioGroup value={scope} onChange={(_, d) => setScope(d.value as ExportScope)}>
                      {SCOPES.map((k) => <Radio key={k} value={k} label={SCOPE_LABELS[k]} />)}
                    </RadioGroup>
                  </Field>
                  {scope === 'screen' ? (
                    <Field label="画面">
                      <Select value={effScreen} onChange={(_, d) => setScreenKey(d.value)}>
                        {screens.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </Select>
                    </Field>
                  ) : null}
                  {scope === 'theme' ? (
                    <Field label="テーマ" hint={themes.length === 0 ? '議論テーマがまだありません。' : undefined}>
                      <Select value={effTheme} onChange={(_, d) => setThemeId(d.value)} disabled={themes.length === 0}>
                        {themes.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </Select>
                    </Field>
                  ) : null}
                  <Field label="形式" hint={fsa ? '保存先は、保存のダイアログで指定します。' : 'このブラウザーは保存先の指定に対応していないため、ダウンロードで保存します。'}>
                    <RadioGroup layout="horizontal" value={format} onChange={(_, d) => setFormat(d.value as ExportFormat)}>
                      <Radio value="md" label=".md" />
                      <Radio value="zip" label=".zip" />
                    </RadioGroup>
                  </Field>
                  <Text size={200} className={s.hint}>.zip は Markdown と、図の画像（assets/）をまとめます。.md は 1 ファイルです。</Text>
                  <Checkbox
                    checked={anonymize}
                    onChange={(_, d) => { setAnonymize(!!d.checked); setRawConfirmed(false); }}
                    label="WorkIQ 由来の社内情報を匿名化する"
                  />
                  {internalCount > 0 && anonymize ? (
                    <Text size={200} className={s.hint}>機密区分 internal の項目 {internalCount} 件を「{ANONYMIZED_LABEL}」に置き換えます。</Text>
                  ) : null}
                  {needsRawConfirm ? (
                    <MessageBar intent="warning" layout="multiline">
                      <MessageBarBody>
                        <MessageBarTitle>社内限定の情報を含みます</MessageBarTitle>
                        機密区分 internal の項目が {internalCount} 件あります。そのまま出力すると、社外に渡す資料に社内限定の情報が入ります。
                        <Checkbox checked={rawConfirmed} onChange={(_, d) => setRawConfirmed(!!d.checked)} label="社内限定の情報をそのまま出力することを確認しました" />
                      </MessageBarBody>
                    </MessageBar>
                  ) : null}
                  <Checkbox checked={followUp} onChange={(_, d) => setFollowUp(!!d.checked)} label="フォローアップ文書も生成する（次回アジェンダ・確認依頼事項・合意事項サマリー）" />
                </div>
                <div className={s.previewPane}>
                  <Text weight="semibold">プレビュー</Text>
                  <div className={s.preview} data-testid="export-preview" tabIndex={0} role="region" aria-label="エクスポートのプレビュー">
                    {built ? <MarkdownPreview source={built.preview} /> : null}
                  </div>
                  {built ? <Text size={200} className={s.hint}>出力ファイル: {built.fileName}</Text> : null}
                </div>
              </div>
            )}
            {busy ? (
              <div role="status" aria-live="polite" aria-busy="true" data-testid="export-progress">
                <Spinner size="tiny" label="書き出し中…（保存先の指定を取り消すこともできます）" />
              </div>
            ) : null}
            {error ? (
              <div role="alert" data-testid="export-error">
                <MessageBar intent="error" layout="multiline">
                  <MessageBarBody>
                    <MessageBarTitle>エクスポートに失敗しました</MessageBarTitle>
                    {error} 設定と編集中のデータは変わっていません。ZIP でダウンロードすると、保存先を使わずに書き出せます。
                  </MessageBarBody>
                </MessageBar>
                <Button icon={<ArrowDownload24Regular aria-hidden />} onClick={() => void run(true, false)} disabled={busy}>ZIP でダウンロード</Button>
              </div>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" icon={<Dismiss24Regular aria-hidden />} onClick={close}>閉じる</Button>
            <Button appearance="primary" icon={<ArrowExport24Regular aria-hidden />} disabled={!canExport} onClick={() => void run(false, true)}>エクスポート</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
