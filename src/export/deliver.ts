// 書き出したファイルの渡し先（FR-052、NFR-UX-004）。
// File System Access API があれば、利用者が保存先を指定して書き込む。なければ（または利用者が選べば）ブラウザーのダウンロードにする。
// 失敗は原因（書き込み・権限・キャンセル）を返し、呼び出し側が「ZIP でダウンロード」への切替を案内する。
import { tr } from '../i18n';
export type DeliverResult =
  | { ok: true; method: 'file-system' | 'download'; name: string }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; reason: string };

interface WritableLike { write(data: Blob): Promise<void>; close(): Promise<void>; abort?: () => Promise<void> }
interface FileHandleLike { name?: string; createWritable(): Promise<WritableLike> }
type SavePicker = (opts: { suggestedName: string; types?: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<FileHandleLike>;

export function hasFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';
}

export function mimeOf(name: string): string {
  return /\.zip$/i.test(name) ? 'application/zip' : 'text/markdown;charset=utf-8';
}

/** ブラウザーのダウンロードで保存する。 */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const errMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** File System Access API で、利用者が指定した保存先に書く。 */
async function writeWithPicker(name: string, blob: Blob): Promise<DeliverResult> {
  const picker = (window as unknown as { showSaveFilePicker: SavePicker }).showSaveFilePicker;
  const ext = /\.zip$/i.test(name) ? '.zip' : '.md';
  let handle: FileHandleLike;
  try {
    handle = await picker({
      suggestedName: name,
      types: [{ description: ext === '.zip' ? tr('ZIP ファイル') : 'Markdown', accept: { [mimeOf(name).split(';')[0] ?? 'text/markdown']: [ext] } }],
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { ok: false, cancelled: true };
    return { ok: false, cancelled: false, reason: tr('保存先を選べませんでした（{msg}）。権限を確認してください。', { msg: errMessage(e) }) };
  }
  let writable: WritableLike | undefined;
  try {
    writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { ok: true, method: 'file-system', name: handle.name ?? name };
  } catch (e) {
    try { await writable?.abort?.(); } catch { /* 書き込みの失敗を優先して返す */ }
    return { ok: false, cancelled: false, reason: tr('保存先に書き込めませんでした（{msg}）。保存先の権限や空き容量を確認してください。', { msg: errMessage(e) }) };
  }
}

/** 渡し先を決めて書き出す。`useFileSystem` が false のときは、API があってもダウンロードにする（「ZIP でダウンロード」の切替）。 */
export async function deliver(name: string, bytes: Uint8Array | string, useFileSystem = true): Promise<DeliverResult> {
  const blob = new Blob([bytes as BlobPart], { type: mimeOf(name) });
  if (useFileSystem && hasFileSystemAccess()) return writeWithPicker(name, blob);
  try {
    downloadBlob(name, blob);
    return { ok: true, method: 'download', name };
  } catch (e) {
    return { ok: false, cancelled: false, reason: tr('ダウンロードを開始できませんでした（{msg}）。', { msg: errMessage(e) }) };
  }
}
