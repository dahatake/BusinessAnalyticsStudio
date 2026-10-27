// 編集の操作部品: 編集モードのスイッチ（FR-047）、変更履歴（FR-046）、サンプルに戻す（FR-046）、データのインポート/エクスポート（FR-046）、
// 詳細パネルの追加・複製・削除（FR-044）。状態はすべて src/store/edit.ts（編集の共通ストア）にある。
import { useRef, useState, type ReactNode } from 'react';
import {
  Button, DialogActions, DialogBody, DialogContent, DialogTitle, DialogTrigger, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, MessageBar, MessageBarBody, MessageBarTitle, Switch, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import {
  ArrowDownload20Regular, ArrowRedo20Regular, ArrowReset20Regular, ArrowUndo20Regular, ArrowUpload20Regular, Copy20Regular, Delete20Regular,
  History20Regular, Add20Regular,
} from '@fluentui/react-icons';
import { downloadTextFile } from '../discussion/FileActions';
import { useSelection } from '../selection/hooks';
import { usePackStore } from '../store/pack';
import { useEditStore, type HistoryEntry } from '../store/edit';
import { exportCsv, exportJson, nameOfId, type EditResult } from './model';
import { useT } from '../i18n';

const useStyles = makeStyles({
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXS },
  grow: { flexGrow: 1 },
  history: { maxWidth: 'min(960px, calc(100vw - 32px))', width: '100%' },
  historyBody: { maxHeight: '60vh', overflow: 'auto' },
  wrap: { overflowWrap: 'anywhere', minWidth: 0 },
  mono: { fontFamily: tokens.fontFamilyMonospace },
  list: { margin: 0, paddingLeft: tokens.spacingHorizontalXL },
});

/** ヘッダーの「編集モード」スイッチ（FR-047）。誤操作を防ぐため既定は OFF */
export function EditModeSwitch() {
  const t = useT();
  const on = useEditStore((s) => s.editMode);
  const setOn = useEditStore((s) => s.setEditMode);
  return <Switch checked={on} onChange={(_, d) => setOn(d.checked)} label={t('編集モード')} />;
}

const pad = (n: number): string => String(n).padStart(2, '0');
/** 日時（端末の時刻）。例: 2026-10-09 19:20:11 */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const OP_LABELS: Record<HistoryEntry['op'], string> = {
  update: '編集', add: '追加', duplicate: '複製', delete: '削除', import: 'インポート', reset: 'サンプルに戻す', undo: '元に戻す', redo: 'やり直し',
};
const ACTOR_LABELS: Record<HistoryEntry['actor'], string> = { human: 'human（人）', ai: 'ai（AI）' };

/** 「変更履歴」ボタンと、その一覧（誰が・いつ・何を・AI か人か）。元に戻す・やり直しもここから */
export function HistoryButton() {
  const s = useStyles();
  const t = useT();
  const log = useEditStore((st) => st.log);
  const canUndo = useEditStore((st) => st.editMode && st.past.length > 0);
  const canRedo = useEditStore((st) => st.editMode && st.future.length > 0);
  const undo = useEditStore((st) => st.undo);
  const redo = useEditStore((st) => st.redo);
  const rows = [...log].reverse();
  return (
    <Dialog modalType="non-modal">
      <DialogTrigger disableButtonEnhancement>
        <Button icon={<History20Regular aria-hidden />}>{t('変更履歴')}</Button>
      </DialogTrigger>
      <DialogSurface className={s.history} data-testid="change-history" aria-label={t('変更履歴')}>
        <DialogBody>
          <DialogTitle
            action={<DialogTrigger action="close"><Button appearance="subtle" aria-label={t('変更履歴を閉じる')}>{t('閉じる')}</Button></DialogTrigger>}
          >
            {t('変更履歴')}
          </DialogTitle>
          <DialogContent>
            <div className={s.row}>
              <Button size="small" icon={<ArrowUndo20Regular aria-hidden />} disabled={!canUndo} onClick={() => { undo(); }}>{t('元に戻す')}</Button>
              <Button size="small" icon={<ArrowRedo20Regular aria-hidden />} disabled={!canRedo} onClick={() => { redo(); }}>{t('やり直し')}</Button>
              <Text size={200}>{t('{n} 件', { n: log.length })}</Text>
            </div>
            {rows.length === 0 ? (
              <Text block>{t('まだ変更はありません。')}</Text>
            ) : (
              <div className={s.historyBody}>
                <Table aria-label={t('変更履歴の一覧')} size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>{t('日時')}</TableHeaderCell>
                      <TableHeaderCell>{t('作成者の種別')}</TableHeaderCell>
                      <TableHeaderCell>{t('対象')}</TableHeaderCell>
                      <TableHeaderCell>{t('項目')}</TableHeaderCell>
                      <TableHeaderCell>{t('変更前')}</TableHeaderCell>
                      <TableHeaderCell>{t('変更後')}</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((e) => (
                      <TableRow key={e.seq}>
                        <TableCell>{formatTimestamp(e.at)}</TableCell>
                        <TableCell>{t(ACTOR_LABELS[e.actor])}</TableCell>
                        <TableCell className={s.wrap}>{e.entityLabel}</TableCell>
                        <TableCell className={s.wrap}>{e.op === 'update' ? t(e.fieldLabel) : `${t(OP_LABELS[e.op])}: ${t(e.fieldLabel)}`}</TableCell>
                        <TableCell className={s.wrap}>{e.before}</TableCell>
                        <TableCell className={s.wrap}>{e.after}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** 確認の付いたアラートダイアログ */
function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  const t = useT();
  return (
    <Dialog open={open} modalType="alert" onOpenChange={(_, d) => { if (!d.open) onCancel(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>{children}</DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onCancel}>{t('キャンセル')}</Button>
            <Button appearance="primary" onClick={onConfirm}>{confirmLabel}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** 「サンプルに戻す」: 顧客パックの初期値に戻す（元に戻すで取り消せる） */
export function ResetSampleButton() {
  const t = useT();
  const editMode = useEditStore((s) => s.editMode);
  const reset = useEditStore((s) => s.resetToSample);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  return (
    <>
      <Button icon={<ArrowReset20Regular aria-hidden />} disabled={!editMode} onClick={() => { setError(undefined); setOpen(true); }}>{t('サンプルに戻す')}</Button>
      <ConfirmDialog
        open={open}
        title={t('サンプルに戻しますか？')}
        confirmLabel={t('戻す')}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          const r = reset();
          if (r.ok) setOpen(false); else setError(r.message);
        }}
      >
        <Text block>{t('これまでの編集をすべて、顧客パックの初期値に戻します。「元に戻す」で取り消せます。')}</Text>
        {error ? <div role="alert"><Text>{error}</Text></div> : null}
      </ConfirmDialog>
    </>
  );
}

function fileStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** データのエクスポート（JSON・CSV）とインポート。インポートは取り込む前に内容を確かめ、不正があれば取り込まずに理由を出す */
export function DataTransferButtons() {
  const s = useStyles();
  const t = useT();
  const editMode = useEditStore((st) => st.editMode);
  const previewCsv = useEditStore((st) => st.previewCsv);
  const previewJson = useEditStore((st) => st.previewJson);
  const commit = useEditStore((st) => st.commit);
  const pack = usePackStore((st) => st.state);
  const fileRef = useRef<HTMLInputElement>(null);
  const [failure, setFailure] = useState<{ file: string; message: string; details: string[] } | undefined>();
  const [pending, setPending] = useState<{ file: string; result: Extract<EditResult, { ok: true }> } | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  if (pack.status !== 'ready') return null;
  const data = pack.pack.data;
  const base = `${fileStamp()}-${pack.pack.data.customer.name}-${pack.pack.data.customer.projectName}`.replace(/[\\/:*?"<>|\s]+/g, '-');

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setNotice(undefined);
    let text: string;
    try {
      text = await file.text();
    } catch (e) {
      setFailure({ file: file.name, message: t('ファイルを読み込めませんでした。'), details: [e instanceof Error ? e.message : String(e)] });
      return;
    }
    const isCsv = /\.csv$/i.test(file.name) || (!/\.json$/i.test(file.name) && !text.trimStart().startsWith('{'));
    const r = isCsv ? previewCsv(text) : previewJson(text);
    if (!r.ok) { setPending(undefined); setFailure({ file: file.name, message: r.message, details: r.details ?? [] }); return; }
    setFailure(undefined);
    setPending({ file: file.name, result: r });
  };

  return (
    <div className={s.row}>
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <Button icon={<ArrowDownload20Regular aria-hidden />}>{t('データのエクスポート')}</Button>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            <MenuItem onClick={() => downloadTextFile(`${base}-data.json`, exportJson(data), 'application/json;charset=utf-8')}>JSON</MenuItem>
            <MenuItem onClick={() => downloadTextFile(`${base}-data.csv`, exportCsv(data), 'text/csv;charset=utf-8')}>CSV</MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>
      <Button
        icon={<ArrowUpload20Regular aria-hidden />}
        disabled={!editMode}
        title={editMode ? undefined : t('編集モードを ON にすると取り込めます')}
        onClick={() => fileRef.current?.click()}
      >
        {t('データのインポート')}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.csv,application/json,text/csv"
        hidden
        aria-hidden
        tabIndex={-1}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void onPick(f); }}
      />
      {failure ? (
        <div role="alert" className={s.grow}>
          <MessageBar intent="error" layout="multiline">
            <MessageBarBody>
              <MessageBarTitle>{t('「{file}」: {message}', { file: failure.file, message: failure.message })}</MessageBarTitle>
              <ul className={s.list}>{failure.details.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </MessageBarBody>
          </MessageBar>
        </div>
      ) : null}
      {notice ? <div role="status" className={s.grow}><Text>{notice}</Text></div> : null}
      <ConfirmDialog
        open={pending !== undefined}
        title={t('現在のデータを置き換えますか？')}
        confirmLabel={t('置き換える')}
        onCancel={() => setPending(undefined)}
        onConfirm={() => {
          if (!pending) return;
          const r = commit(pending.result);
          setPending(undefined);
          if (r.ok) setNotice(t('「{file}」の内容に置き換えました。「元に戻す」で取り消せます。', { file: pending.file }));
          else setFailure({ file: pending.file, message: r.message, details: r.details ?? [] });
        }}
      >
        <Text block>{t('「{file}」の内容で、現在のデータを置き換えます（{n} 件の変更）。「元に戻す」で取り消せます。', { file: pending?.file ?? '', n: pending?.result.changes.length ?? 0 })}</Text>
        {pending?.result.warnings && pending.result.warnings.length > 0 ? (
          <>
            <Text block weight="semibold">{t('問題のある項目は無効にして取り込みます:')}</Text>
            <ul className={s.list}>{pending.result.warnings.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

/** 詳細パネルの追加・複製・削除（FR-044）。選んでいる項目と同じ種類の項目を追加する。編集モードが OFF のときは無効 */
export function EditToolbar() {
  const s = useStyles();
  const t = useT();
  const editMode = useEditStore((st) => st.editMode);
  const add = useEditStore((st) => st.add);
  const duplicate = useEditStore((st) => st.duplicate);
  const remove = useEditStore((st) => st.remove);
  const { primaryId } = useSelection();
  const pack = usePackStore((st) => st.state);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const name = pack.status === 'ready' && primaryId ? nameOfId(pack.pack.data, primaryId) : undefined;
  const report = (r: EditResult) => setError(r.ok ? undefined : r.message);
  return (
    <div className={s.row} role="group" aria-label={t('項目の編集')}>
      <Button size="small" icon={<Add20Regular aria-hidden />} disabled={!editMode} onClick={() => report(add(primaryId))}>{t('追加')}</Button>
      <Button size="small" icon={<Copy20Regular aria-hidden />} disabled={!editMode || !primaryId} onClick={() => report(duplicate(primaryId!))}>{t('複製')}</Button>
      <Button size="small" icon={<Delete20Regular aria-hidden />} disabled={!editMode || !primaryId} onClick={() => setConfirm(true)}>{t('削除')}</Button>
      {!editMode ? <Text size={200}>{t('編集するには、ヘッダーの「編集モード」を ON にします。')}</Text> : null}
      {error ? <div role="alert"><Text size={200}>{error}</Text></div> : null}
      <ConfirmDialog
        open={confirm}
        title={t('項目を削除しますか？')}
        confirmLabel={t('削除する')}
        onCancel={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); if (primaryId) report(remove(primaryId)); }}
      >
        <Text block>{t('「{name}」を削除します。ほかの項目からの参照は外れます。「元に戻す」で取り消せます。', { name: name ?? primaryId ?? '' })}</Text>
      </ConfirmDialog>
    </div>
  );
}
