// エクスポートの画面（FR-052〜FR-055）。出力範囲・形式・機密確認（匿名化）・フォローアップ文書を選び、プレビューを見てから書き出す。
// 書き出しは File System Access API（保存先を利用者が指定）か、非対応の環境では ZIP のダウンロード（NFR-UX-004: 失敗しても設定と編集中のデータは残る）。
import { useEffect, useMemo, useState } from 'react';
import {
  Button, Checkbox, DialogActions, DialogBody, DialogContent, DialogTitle, Field, MessageBar, MessageBarBody, MessageBarTitle, Select, Spinner, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { confirmViaUi, consentOf, gatePersonConfirm } from '../ai/personConfirm';
import { Radio, RadioGroup } from '../components/ChoiceRadio';
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
import { tr, useT } from '../i18n';
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
export function collectInput(): ExportInput | null {
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

/**
 * Ctrl+S: 画面を開かずに、全量の Markdown をその場でダウンロードとして保存する（FR-052 AC-064 の「いつでもエクスポート」）。
 * 機密区分 internal の項目があるときは、安全側で匿名化する。出力範囲や匿名化を選びたいときは Ctrl+Shift+E の画面を使う。
 */
export async function quickSaveAll(): Promise<void> {
  const input = collectInput();
  const setNotice = useExportUi.getState().setNotice;
  if (!input) return;
  try {
    const anonymize = countInternal(input.data) > 0;
    // FR-219: 種別「人」を含むときは、出力の前に確認を通す（了承の記録がなければ出力しない）
    const gate = await gatePersonConfirm({ destination: 'export', scopeLabel: tr(SCOPE_LABELS.all), data: input.data, consent: consentOf(input.data), confirm: confirmViaUi });
    if (!gate.allowed) {
      if (gate.reason) setNotice({ kind: 'error', title: tr('エクスポートしませんでした'), lines: [gate.reason] });
      return;
    }
    const r = buildExport(input, { scope: 'all', screenKey: '', themeId: '', anonymize, format: 'md', followUp: false });
    const res = await deliver(r.fileName, r.markdown, false);
    if (res.ok) setNotice({ kind: 'success', title: tr('エクスポートしました'), lines: [res.name, tr('ブラウザーのダウンロードとして保存しました。')] });
    else if (!res.cancelled) setNotice({ kind: 'error', title: tr('エクスポートできませんでした'), lines: [res.reason] });
  } catch (e) {
    setNotice({ kind: 'error', title: tr('エクスポートできませんでした'), lines: [e instanceof Error ? e.message : String(e)] });
  }
}

export function ExportDialog({ screens }: { screens: readonly ExportScreenRef[] }) {
  const s = useStyles();
  const t = useT();
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
      // FR-219: 種別「人」を含むときは、プレビューの後・出力の前に確認を通す。了承の記録がなければ出力しない
      const gate = await gatePersonConfirm({ destination: 'export', scopeLabel: t(SCOPE_LABELS[scope]), data: input.data, consent: consentOf(input.data), confirm: confirmViaUi });
      if (!gate.allowed) { setBusy(false); return; }
      const r = buildExport(input, { ...options, format: asZip ? 'zip' : format });
      const bytes = asZip || format === 'zip' ? createZip(r.files, input.now) : r.markdown;
      const fileName = asZip ? r.fileName.replace(/\.md$/, '.zip') : r.fileName;
      const res = await deliver(fileName, bytes, useFileSystem);
      if (res.ok) {
        setNotice({
          kind: 'success', title: t('エクスポートしました'),
          lines: [res.name, ...(res.method === 'download' ? [t('ブラウザーのダウンロードとして保存しました。')] : [])],
        });
        close();
      } else if (!res.cancelled) {
        setError(res.reason);
      }
    } catch (e) {
      setError(t('書き出しに失敗しました（{msg}）。', { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) close(); }}>
      <DialogSurface aria-label={t('エクスポート')} className={s.surface}>
        <DialogBody>
          <DialogTitle>{t('エクスポート')}</DialogTitle>
          <DialogContent>
            {!input ? <Spinner label={t('データを読み込み中')} /> : (
              <div className={s.content}>
                <div className={s.options}>
                  <Field label={t('出力範囲')}>
                    <RadioGroup value={scope} onChange={(_, d) => setScope(d.value as ExportScope)}>
                      {SCOPES.map((k) => <Radio key={k} value={k} label={t(SCOPE_LABELS[k])} />)}
                    </RadioGroup>
                  </Field>
                  {scope === 'screen' ? (
                    <Field label={t('画面')}>
                      <Select value={effScreen} onChange={(_, d) => setScreenKey(d.value)}>
                        {screens.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </Select>
                    </Field>
                  ) : null}
                  {scope === 'theme' ? (
                    <Field label={t('テーマ')} hint={themes.length === 0 ? t('議論テーマがまだありません。') : undefined}>
                      <Select value={effTheme} onChange={(_, d) => setThemeId(d.value)} disabled={themes.length === 0}>
                        {themes.map((th) => <option key={th.id} value={th.id}>{th.title}</option>)}
                      </Select>
                    </Field>
                  ) : null}
                  <Field label={t('形式')} hint={fsa ? t('保存先は、保存のダイアログで指定します。') : t('このブラウザーは保存先の指定に対応していないため、ダウンロードで保存します。')}>
                    <RadioGroup layout="horizontal" value={format} onChange={(_, d) => setFormat(d.value as ExportFormat)}>
                      <Radio value="md" label=".md" />
                      <Radio value="zip" label=".zip" />
                    </RadioGroup>
                  </Field>
                  <Text size={200} className={s.hint}>{t('.zip は Markdown と、図の画像（assets/）をまとめます。.md は 1 ファイルです。')}</Text>
                  <Checkbox
                    checked={anonymize}
                    onChange={(_, d) => { setAnonymize(!!d.checked); setRawConfirmed(false); }}
                    label={t('WorkIQ 由来の社内情報を匿名化する')}
                  />
                  {internalCount > 0 && anonymize ? (
                    <Text size={200} className={s.hint}>{t('機密区分 internal の項目 {n} 件を「{label}」に置き換えます。', { n: internalCount, label: ANONYMIZED_LABEL })}</Text>
                  ) : null}
                  {needsRawConfirm ? (
                    <MessageBar intent="warning" layout="multiline">
                      <MessageBarBody>
                        <MessageBarTitle>{t('社内限定の情報を含みます')}</MessageBarTitle>
                        {t('機密区分 internal の項目が {n} 件あります。そのまま出力すると、社外に渡す資料に社内限定の情報が入ります。', { n: internalCount })}
                        <Checkbox checked={rawConfirmed} onChange={(_, d) => setRawConfirmed(!!d.checked)} label={t('社内限定の情報をそのまま出力することを確認しました')} />
                      </MessageBarBody>
                    </MessageBar>
                  ) : null}
                  <Checkbox checked={followUp} onChange={(_, d) => setFollowUp(!!d.checked)} label={t('フォローアップ文書も生成する（次回アジェンダ・確認依頼事項・合意事項サマリー）')} />
                </div>
                <div className={s.previewPane}>
                  <Text weight="semibold">{t('プレビュー')}</Text>
                  <div className={s.preview} data-testid="export-preview" tabIndex={0} role="region" aria-label={t('エクスポートのプレビュー')}>
                    {built ? <MarkdownPreview source={built.preview} /> : null}
                  </div>
                  {built ? <Text size={200} className={s.hint}>{t('出力ファイル: {name}', { name: built.fileName })}</Text> : null}
                </div>
              </div>
            )}
            {busy ? (
              <div role="status" aria-live="polite" aria-busy="true" data-testid="export-progress">
                <Spinner size="tiny" label={t('書き出し中…（保存先の指定を取り消すこともできます）')} />
              </div>
            ) : null}
            {error ? (
              <div role="alert" data-testid="export-error">
                <MessageBar intent="error" layout="multiline">
                  <MessageBarBody>
                    <MessageBarTitle>{t('エクスポートに失敗しました')}</MessageBarTitle>
                    {error} {t('設定と編集中のデータは変わっていません。ZIP でダウンロードすると、保存先を使わずに書き出せます。')}
                  </MessageBarBody>
                </MessageBar>
                <Button icon={<ArrowDownload24Regular aria-hidden />} onClick={() => void run(true, false)} disabled={busy}>{t('ZIP でダウンロード')}</Button>
              </div>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" icon={<Dismiss24Regular aria-hidden />} onClick={close}>{t('閉じる')}</Button>
            <Button appearance="primary" icon={<ArrowExport24Regular aria-hidden />} disabled={!canExport} onClick={() => void run(false, true)}>{t('エクスポート')}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
