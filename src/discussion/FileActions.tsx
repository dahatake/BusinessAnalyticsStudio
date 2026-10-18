// 議論データの保存と読み込み（FR-051・FR-056）。ヘッダーに常設し、どの画面からでも使える。
// 保存は既定のファイル名（<yyyymmdd>-顧客名-Project名-discussion-memo.md）を提示し、読み込みは Markdown の JSON ブロックから復元する。
import { useRef, useState } from 'react';
import {
  Button, DialogActions, DialogBody, DialogContent, DialogTitle, Field, Input, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, makeStyles, tokens,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { Dismiss24Regular, FolderOpen24Regular, Save24Regular } from '@fluentui/react-icons';
import { defaultMemoFileName } from './model';
import { buildMemoForPack, restoreFromMemo } from './restore';
import { usePackTarget } from './usePackTarget';

const useStyles = makeStyles({
  row: { display: 'flex', columnGap: tokens.spacingHorizontalS, alignItems: 'center' },
  notice: {
    position: 'fixed',
    bottom: tokens.spacingVerticalXXL,
    right: tokens.spacingHorizontalXXL,
    width: 'min(520px, calc(100vw - 32px))',
    zIndex: 900,
    boxShadow: tokens.shadow16,
  },
});

type Notice = { kind: 'error' | 'success' | 'warning'; title: string; lines: string[] };

/** ブラウザーのダウンロードで、Markdown を指定のファイル名で保存する。 */
export function downloadTextFile(name: string, text: string, mime = 'text/markdown;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DiscussionFileActions() {
  const s = useStyles();
  const target = usePackTarget();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);

  if (!target) return null;

  const openSave = () => {
    setFileName(defaultMemoFileName(target.customerName, target.projectName));
    setSaveOpen(true);
  };

  const save = () => {
    const name = fileName.trim() === '' ? defaultMemoFileName(target.customerName, target.projectName) : fileName.trim();
    try {
      downloadTextFile(/\.md$/i.test(name) ? name : `${name}.md`, buildMemoForPack(target));
      setSaveOpen(false);
      setNotice({ kind: 'success', title: '議論データを保存しました', lines: [name] });
    } catch (e) {
      setNotice({ kind: 'error', title: '保存できませんでした', lines: [e instanceof Error ? e.message : String(e)] });
    }
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch (e) {
      setNotice({ kind: 'error', title: 'ファイルを読み込めませんでした', lines: [e instanceof Error ? e.message : String(e)] });
      return;
    }
    const r = restoreFromMemo(text, target);
    if (!r.ok) {
      setNotice({ kind: 'error', title: `「${file.name}」を読み込めませんでした。現在のデータは変わっていません。`, lines: r.errors });
    } else {
      setNotice({
        kind: r.warnings.length > 0 ? 'warning' : 'success',
        title: `「${file.name}」から復元しました（議論テーマ ${r.themeCount} 件）`,
        lines: r.warnings,
      });
    }
  };

  return (
    <>
      <div className={s.row}>
        <Button size="small" icon={<Save24Regular aria-hidden />} onClick={openSave}>保存</Button>
        <Button size="small" icon={<FolderOpen24Regular aria-hidden />} onClick={() => fileRef.current?.click()}>開く</Button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,text/markdown"
          hidden
          data-testid="memo-file-input"
          aria-label="議論メモのファイル"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            void onPick(f);
          }}
        />
      </div>

      <Dialog open={saveOpen} onOpenChange={(_, d) => setSaveOpen(d.open)}>
        <DialogSurface aria-label="議論データを保存">
          <DialogBody>
            <DialogTitle>議論データを保存</DialogTitle>
            <DialogContent>
              <Field label="ファイル名" hint="既定: 日付・顧客名・Project 名から組み立てています。">
                <Input value={fileName} onChange={(_, d) => setFileName(d.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setSaveOpen(false)}>キャンセル</Button>
              <Button appearance="primary" onClick={save}>保存</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {notice ? (
        <div className={s.notice} role={notice.kind === 'error' ? 'alert' : 'status'} data-testid="file-notice">
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
