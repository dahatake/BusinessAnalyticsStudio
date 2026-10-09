// 図・データのファイル出力（FR-040 AC-050、FR-042 AC-053）。ブラウザーのダウンロードとして保存する。
import { sanitizeFilePart, yyyymmdd } from '../discussion/model';

/** 保存の既定のファイル名 `<yyyymmdd>-<顧客名>-<Project名>-<種類>.<拡張子>` */
export function exportFileName(customer: string, project: string, kind: string, ext: string, date: Date = new Date()): string {
  return `${yyyymmdd(date)}-${sanitizeFilePart(customer)}-${sanitizeFilePart(project)}-${kind}.${ext}`;
}

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(name: string, text: string, mime: string): void {
  downloadBlob(name, new Blob([text], { type: mime }));
}

/** SVG の文字列を PNG にする（外部の資源を使わない SVG だけを想定）。 */
export async function svgToPng(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('図を画像に変換できませんでした。'));
  });
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像を作れませんでした。');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG を作れませんでした。'))), 'image/png');
  });
}
