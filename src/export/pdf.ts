// ボードの PDF 出力の部品（FR-096。プレビューと出力の入口）。
// 用紙と向き・ボードの画像（SVG）を 1 ページの PDF にまとめる純粋な関数と、ブラウザーで SVG を JPEG にする関数。
// ベクター出力・表紙・目次・日本語フォントの埋め込み（FR-092）は、この `assemblePdf` を置き換える形で足す。
import { boardSvg } from './svg';
import type { Board } from '../ink/model';

export type PaperSize = 'A4' | 'A3';
export type Orientation = 'landscape' | 'portrait';
export type PdfRange = 'board' | 'view';

/** 用紙の大きさ（pt。1pt = 1/72 インチ）。 */
const PAPER_PT: Record<PaperSize, { w: number; h: number }> = { A4: { w: 595.28, h: 841.89 }, A3: { w: 841.89, h: 1190.55 } };

export function pageSize(paper: PaperSize, orientation: Orientation): { w: number; h: number } {
  const p = PAPER_PT[paper];
  return orientation === 'landscape' ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

export interface PdfImage { jpeg: Uint8Array; width: number; height: number }

const MARGIN_PT = 28;
const fmt = (n: number): string => (Math.round(n * 100) / 100).toString();

/** 画像を余白つきで用紙の中央に収める位置と大きさ（pt）。拡大はしない（縮小だけ）。 */
export function fitImage(page: { w: number; h: number }, img: { width: number; height: number }): { x: number; y: number; w: number; h: number } {
  const maxW = page.w - MARGIN_PT * 2, maxH = page.h - MARGIN_PT * 2;
  const k = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * k, h = img.height * k;
  return { x: (page.w - w) / 2, y: (page.h - h) / 2, w, h };
}

/** JPEG 1 枚を用紙 1 ページに置いた PDF（1.4）を作る。 */
export function assemblePdf(page: { w: number; h: number }, image: PdfImage): Uint8Array {
  const enc = new TextEncoder();
  const place = fitImage(page, image);
  const content = `q ${fmt(place.w)} 0 0 ${fmt(place.h)} ${fmt(place.x)} ${fmt(place.y)} cm /Im0 Do Q`;
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const push = (b: Uint8Array | string) => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length; };
  const obj = (n: number, body: string, stream?: Uint8Array) => {
    offsets[n] = len;
    push(`${n} 0 obj\n${body}`);
    if (stream) { push('\nstream\n'); push(stream); push('\nendstream'); }
    push('\nendobj\n');
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(page.w)} ${fmt(page.h)}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
  const contentBytes = enc.encode(content);
  obj(4, `<< /Length ${contentBytes.length} >>`, contentBytes);
  obj(5, `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.jpeg.length} >>`, image.jpeg);
  const xref = len;
  let table = `xref\n0 6\n0000000000 65535 f \n`;
  for (let n = 1; n <= 5; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(`${table}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** 出力する範囲のワールド座標。'view' は、いまボードに見えている範囲。 */
export function rangeRect(board: Board, range: PdfRange): { x: number; y: number; w: number; h: number } | undefined {
  if (range !== 'view') return undefined;
  const z = board.view.zoom || 1;
  return { x: board.view.x, y: board.view.y, w: Math.max(1, board.size.w / z), h: Math.max(1, board.size.h / z) };
}

/** プレビューと出力に使う画像（SVG）。範囲に何もなければ null。 */
export function pdfSource(board: Board, range: PdfRange): string | null {
  return boardSvg(board, rangeRect(board, range));
}

export interface PdfContents { stickies: number; texts: number; shapes: number; strokes: number }

/** プレビューに「何が入るか」を数えて示す。range が 'view' のときは、その範囲に（一部でも）かかるものだけを数える。 */
export function countContents(board: Board, range: PdfRange = 'board'): PdfContents {
  const r = rangeRect(board, range);
  const inside = (b: { x: number; y: number; w: number; h: number }): boolean =>
    !r || (b.x <= r.x + r.w && b.x + b.w >= r.x && b.y <= r.y + r.h && b.y + b.h >= r.y);
  const strokes = board.strokes.filter((k) => !k.temporary && inside(k.bounds)).length;
  const c: PdfContents = { stickies: 0, texts: 0, shapes: 0, strokes };
  for (const i of board.items) {
    if (!inside(i)) continue;
    if (i.type === 'sticky') c.stickies += 1;
    else if (i.type === 'text') c.texts += 1;
    else if (i.type === 'shape') c.shapes += 1;
  }
  return c;
}

/** SVG を白地の JPEG にする（ブラウザーのみ）。長辺は 3000px までに収める。 */
export async function svgToJpeg(svg: string): Promise<PdfImage> {
  const m = /<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/.exec(svg);
  const w0 = m ? Number(m[1]) : 800, h0 = m ? Number(m[2]) : 480;
  const k = Math.min(2, 3000 / Math.max(w0, h0, 1));
  const width = Math.max(1, Math.round(w0 * k)), height = Math.max(1, Math.round(h0 * k));
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('ボードの画像を作れませんでした'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像を作れません（Canvas が使えません）');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('画像を作れませんでした');
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width, height };
}

export interface BoardPdfOptions { paper: PaperSize; orientation: Orientation; range: PdfRange }

/** ボードを PDF にする（ブラウザー）。範囲に何もなければ null。 */
export async function buildBoardPdf(board: Board, o: BoardPdfOptions): Promise<Uint8Array | null> {
  const svg = pdfSource(board, o.range);
  if (!svg) return null;
  return assemblePdf(pageSize(o.paper, o.orientation), await svgToJpeg(svg));
}
