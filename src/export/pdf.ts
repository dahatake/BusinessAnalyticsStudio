// ボードの PDF 出力（FR-092、FR-096 のプレビューと出力の入口）。
// 手書き・図形・文字を PDF のベクター（パスとテキスト）として描き、1 ページ目に表紙・2 ページ目に目次を付け、日本語フォントを埋め込む。
// 範囲（全体 / ボード / 選択範囲 / 表示範囲）・用紙（A4 / A3 / 16:9）・向きを選べる。出力できる範囲は `pdfSections` で決める純粋な関数。
import { boardSvg } from './svg';
import { PdfDoc, parseColor, type PdfPage } from './pdfdoc';
import { unionBounds, type Board, type BoardItem, type Bounds } from '../ink/model';

export type PaperSize = 'A4' | 'A3' | '16:9';
export type Orientation = 'landscape' | 'portrait';
/** all: すべてのボード / board: このボード全体 / selection: 選んだもの / view: いま見えている範囲 */
export type PdfRange = 'all' | 'board' | 'selection' | 'view';

/** 用紙の大きさ（pt。1pt = 1/72 インチ）。縦向きの値。16:9 はスライド（960×540pt）。 */
const PAPER_PT: Record<PaperSize, { w: number; h: number }> = { A4: { w: 595.28, h: 841.89 }, A3: { w: 841.89, h: 1190.55 }, '16:9': { w: 540, h: 960 } };

export function pageSize(paper: PaperSize, orientation: Orientation): { w: number; h: number } {
  const p = PAPER_PT[paper];
  return orientation === 'landscape' ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

export interface Rect { x: number; y: number; w: number; h: number }

const CONTENT_MARGIN = 24;
const grow = (b: Bounds, m: number): Rect => ({ x: b.x - m, y: b.y - m, w: Math.max(1, b.w + m * 2), h: Math.max(1, b.h + m * 2) });

/** 選んだもの（ストロークと項目）の外接矩形。なければ undefined。 */
export function selectionBounds(board: Board, ids: ReadonlyArray<string>): Bounds | undefined {
  const set = new Set(ids);
  const list: Bounds[] = [
    ...board.strokes.filter((s) => set.has(s.id) && !s.temporary).map((s) => s.bounds),
    ...board.items.filter((i) => set.has(i.id)).map((i) => ({ x: i.x, y: i.y, w: i.w, h: i.h })),
  ];
  return unionBounds(list) ?? undefined;
}

/** 出力する範囲のワールド座標。'board' / 'all' は内容の外接矩形（なければ undefined）。 */
export function rangeRect(board: Board, range: PdfRange, selectedIds: ReadonlyArray<string> = []): Rect | undefined {
  if (range === 'view') {
    const z = board.view.zoom || 1;
    return { x: board.view.x, y: board.view.y, w: Math.max(1, board.size.w / z), h: Math.max(1, board.size.h / z) };
  }
  if (range === 'selection') {
    const b = selectionBounds(board, selectedIds);
    return b ? grow(b, 16) : undefined;
  }
  const strokes = board.strokes.filter((s) => !s.temporary).map((s) => s.bounds);
  const b = unionBounds([...strokes, ...board.items.map((i) => ({ x: i.x, y: i.y, w: i.w, h: i.h }))]);
  return b ? grow(b, CONTENT_MARGIN) : undefined;
}

/** プレビューに使う画像（SVG）。範囲に何もなければ null。'all' はいま選んでいるボードを見せる。 */
export function pdfSource(board: Board, range: PdfRange, selectedIds: ReadonlyArray<string> = []): string | null {
  if (range === 'selection' || range === 'view') {
    const r = rangeRect(board, range, selectedIds);
    return r ? boardSvg(board, r) : null;
  }
  return boardSvg(board);
}

export interface PdfContents { stickies: number; texts: number; shapes: number; strokes: number }

/** プレビューに「何が入るか」を数えて示す。range が 'view' / 'selection' のときは、その範囲に（一部でも）かかるものだけを数える。 */
export function countContents(board: Board, range: PdfRange = 'board', selectedIds: ReadonlyArray<string> = []): PdfContents {
  const r = range === 'view' || range === 'selection' ? rangeRect(board, range, selectedIds) : undefined;
  const inside = (b: Bounds): boolean => !r || (b.x <= r.x + r.w && b.x + b.w >= r.x && b.y <= r.y + r.h && b.y + b.h >= r.y);
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

export interface PdfSection { board: Board; rect: Rect }

/** 範囲に応じて、PDF に入れるボードと切り出す範囲を決める。'all' / 'board' は内容のないボードを入れない。 */
export function pdfSections(boards: readonly Board[], activeId: string, range: PdfRange, selectedIds: ReadonlyArray<string> = []): PdfSection[] {
  const targets = range === 'all' ? boards.filter((b) => b.kind === 'board') : boards.filter((b) => b.id === activeId);
  const out: PdfSection[] = [];
  for (const b of targets) {
    const rect = rangeRect(b, range === 'all' ? 'board' : range, selectedIds);
    if (rect) out.push({ board: b, rect });
  }
  return out;
}

export interface PdfDocSpec {
  page: { w: number; h: number };
  title: string;
  subtitle?: string;
  /** 表紙に出す日付（例: 2026-10-10） */
  dateText: string;
  sections: readonly PdfSection[];
  /** ボードの前に付けるサマリーのページ（Engagement サマリーパック） */
  summary?: { title: string; lines: readonly string[] };
  /** 埋め込む日本語フォント（TrueType） */
  font: Uint8Array;
}

const INK = parseColor('#242424');
const LINE = parseColor('#616161');
const MUTED = parseColor('#605e5c');
const MARGIN = 40;

function drawArrowHead(page: PdfPage, x1: number, y1: number, x2: number, y2: number, size: number, color: ReturnType<typeof parseColor>): void {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const L = size, W = size * 0.45;
  const bx = x2 - Math.cos(a) * L, by = y2 - Math.sin(a) * L;
  page.polyline([{ x: x2, y: y2 }, { x: bx + Math.sin(a) * W, y: by - Math.cos(a) * W }, { x: bx - Math.sin(a) * W, y: by + Math.cos(a) * W }], { fill: color }, true);
}

/** ボードの内容（手書き・図形・文字）を、area の中にベクターで描く。 */
export function drawBoard(page: PdfPage, board: Board, rect: Rect, area: Rect): void {
  const k = Math.min(area.w / rect.w, area.h / rect.h, 4);
  const ox = area.x + (area.w - rect.w * k) / 2, oy = area.y + (area.h - rect.h * k) / 2;
  const X = (x: number): number => ox + (x - rect.x) * k;
  const Y = (y: number): number => oy + (y - rect.y) * k;
  const colorOf = (c?: string) => (!c || c === 'auto' ? INK : parseColor(c, INK));
  page.clip(ox, oy, rect.w * k, rect.h * k);
  const lw = (n: number | undefined, d: number): number => Math.max(0.3, (n ?? d) * k);
  const label = (it: BoardItem, text: string, dx: number, dy: number, size: number, color = INK): void => {
    text.split(/\r?\n/).forEach((ln, i) => page.text(ln, X(it.x + dx), Y(it.y + dy + size * 1.35 * i), size * k, color));
  };
  for (const it of board.items) {
    const c = colorOf(it.color);
    if (it.type === 'sticky') {
      page.rect(X(it.x), Y(it.y), it.w * k, it.h * k, { fill: it.color && it.color !== 'auto' ? parseColor(it.color, parseColor('#fff4ce')) : parseColor('#fff4ce'), stroke: LINE, lineWidth: 0.6 });
      if (it.text) {
        page.clip(X(it.x), Y(it.y), it.w * k, it.h * k);
        page.wrap(it.text, 14 * k, Math.max(10, it.w - 16) * k).forEach((ln, i) => page.text(ln, X(it.x + 8), Y(it.y + 20 + i * 19), 14 * k, INK));
        page.restore();
      }
    } else if (it.type === 'text') {
      label(it, it.text ?? '', 0, it.size ?? 16, it.size ?? 16, c);
    } else if (it.type === 'shape') {
      const st = { stroke: c, lineWidth: lw(it.size, 2) };
      if (it.shape === 'rect' || it.shape === 'callout') page.rect(X(it.x), Y(it.y), it.w * k, it.h * k, st);
      else if (it.shape === 'ellipse') page.ellipse(X(it.x + it.w / 2), Y(it.y + it.h / 2), (it.w / 2) * k, (it.h / 2) * k, st);
      else {
        const x1 = X(it.x1 ?? it.x), y1 = Y(it.y1 ?? it.y), x2 = X(it.x2 ?? it.x + it.w), y2 = Y(it.y2 ?? it.y + it.h);
        page.polyline([{ x: x1, y: y1 }, { x: x2, y: y2 }], st);
        if (it.shape === 'arrow') drawArrowHead(page, x1, y1, x2, y2, 10 * k, c);
      }
      if (it.text) label(it, it.text, 6, 18, 13, c);
    } else if (it.type === 'frame') {
      page.rect(X(it.x), Y(it.y), it.w * k, it.h * k, { stroke: LINE, lineWidth: 1, dash: [4 * k, 3 * k] });
      if (it.label) page.text(it.label, X(it.x), Y(it.y) - 4 * k, 12 * k, MUTED);
    } else if (it.type === 'card') {
      page.rect(X(it.x), Y(it.y), it.w * k, it.h * k, { fill: parseColor('#eef3fb'), stroke: LINE, lineWidth: 0.6 });
      if (it.label) label(it, it.label, 8, 20, 13);
      if (it.sub) label(it, it.sub, 8, it.h - 8, 10, MUTED);
    } else if (it.type === 'connector') {
      if (it.x1 !== undefined && it.y1 !== undefined && it.x2 !== undefined && it.y2 !== undefined) {
        const x1 = X(it.x1), y1 = Y(it.y1), x2 = X(it.x2), y2 = Y(it.y2);
        page.polyline([{ x: x1, y: y1 }, { x: x2, y: y2 }], { stroke: LINE, lineWidth: lw(it.size, 2) });
        drawArrowHead(page, x1, y1, x2, y2, 10 * k, LINE);
      }
    } else if (it.type === 'image') {
      page.rect(X(it.x), Y(it.y), it.w * k, it.h * k, { stroke: LINE, lineWidth: 0.6, dash: [3 * k, 3 * k] });
      page.text('画像', X(it.x + 6), Y(it.y + 16), 12 * k, MUTED);
    }
  }
  for (const s of board.strokes) {
    if (s.temporary || s.points.length === 0) continue;
    const hi = s.tool === 'highlighter';
    page.polyline(s.points.map((p) => ({ x: X(p.x), y: Y(p.y) })), { stroke: colorOf(s.color), lineWidth: lw(s.size, 3), ...(hi ? { opacity: 0.4 } : {}) });
  }
  page.restore();
}

/** 目次の 1 ページに入る行数 */
const tocPerPage = (h: number): number => Math.max(1, Math.floor((h - MARGIN * 2 - 70) / 24));

/** 表紙・目次・ボードのページからなる PDF を作る。手書きはパス、文字はテキスト（日本語フォントを埋め込み）。 */
export async function assemblePdf(spec: PdfDocSpec): Promise<Uint8Array> {
  const doc = new PdfDoc(spec.font);
  const { w, h } = spec.page;
  const cover = doc.addPage(w, h);
  cover.rect(0, 0, 14, h, { fill: parseColor('#0f6cbd') });
  const titleSize = Math.min(30, w / 14);
  cover.wrap(spec.title, titleSize, w - MARGIN * 2 - 30).forEach((ln, i) => cover.text(ln, MARGIN + 30, h * 0.36 + i * titleSize * 1.4, titleSize, INK));
  if (spec.subtitle) cover.text(spec.subtitle, MARGIN + 30, h * 0.36 + titleSize * 2.6, 14, MUTED);
  cover.text(spec.dateText, MARGIN + 30, h - MARGIN - 20, 12, MUTED);

  // 目次に載せるページ（サマリー → ボードの順）
  const entries: Array<{ name: string; draw: (p: PdfPage) => void }> = [];
  if (spec.summary) {
    const sum = spec.summary;
    entries.push({
      name: sum.title,
      draw: (p) => {
        p.text(sum.title, MARGIN, MARGIN + 6, 15, INK);
        let y = MARGIN + 44;
        for (const ln of sum.lines) {
          for (const row of p.wrap(ln, 12, w - MARGIN * 2)) { if (y > h - MARGIN) return; p.text(row, MARGIN, y, 12, INK); y += 20; }
        }
      },
    });
  }
  for (const s of spec.sections) {
    entries.push({
      name: s.board.name,
      draw: (p) => {
        p.text(s.board.name, MARGIN, MARGIN + 6, 15, INK);
        drawBoard(p, s.board, s.rect, { x: MARGIN, y: MARGIN + 24, w: w - MARGIN * 2, h: h - MARGIN * 2 - 40 });
      },
    });
  }
  const n = entries.length;
  const per = tocPerPage(h);
  const tocPages = Math.max(1, Math.ceil(n / per));
  const firstBoardPage = 2 + tocPages + 1;
  for (let t = 0; t < tocPages; t++) {
    const p = doc.addPage(w, h);
    p.text('目次', MARGIN, MARGIN + 24, 22, INK);
    if (n === 0) p.text('（出力するボードがありません）', MARGIN, MARGIN + 70, 12, MUTED);
    entries.slice(t * per, (t + 1) * per).forEach((s, i) => {
      const y = MARGIN + 70 + i * 24;
      const no = String(firstBoardPage + t * per + i);
      const head = `${t * per + i + 1}. ${s.name}`;
      p.text(head, MARGIN, y, 13, INK);
      p.text(no, w - MARGIN - p.measure(no, 13), y, 13, INK);
      const x0 = MARGIN + p.measure(head, 13) + 8, x1 = w - MARGIN - p.measure(no, 13) - 8;
      if (x1 > x0) p.polyline([{ x: x0, y: y - 3 }, { x: x1, y: y - 3 }], { stroke: LINE, lineWidth: 0.4, dash: [1, 3] });
    });
  }
  for (const e of entries) {
    const p = doc.addPage(w, h);
    e.draw(p);
    const no = String(doc.pages.length);
    p.text(no, w / 2 - p.measure(no, 10) / 2, h - MARGIN / 2, 10, MUTED);
  }  return doc.build({ title: spec.title });
}

let fontCache: Promise<Uint8Array> | null = null;

/** 同梱の日本語フォント（Sawarabi Gothic。SIL OFL 1.1）を読み込む。オフラインでも、同じ配信元から取れる。 */
export function loadJapaneseFont(): Promise<Uint8Array> {
  fontCache ??= (async () => {
    const res = await fetch(new URL('fonts/SawarabiGothic-Regular.ttf', document.baseURI).toString());
    if (!res.ok) throw new Error('日本語フォントを読み込めませんでした');
    return new Uint8Array(await res.arrayBuffer());
  })().catch((e) => { fontCache = null; throw e; });
  return fontCache;
}

export interface BoardPdfOptions {
  paper: PaperSize;
  orientation: Orientation;
  range: PdfRange;
  /** range が 'selection' のとき、選んだ項目・ストロークの ID */
  selectedIds?: ReadonlyArray<string>;
  /** 表紙の題名と副題 */
  title?: string;
  subtitle?: string;
}

export const todayText = (d: Date = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** ボードを PDF にする（ブラウザー）。範囲に何もなければ null。 */
export async function buildBoardPdf(boards: readonly Board[], activeId: string, o: BoardPdfOptions, font?: Uint8Array): Promise<Uint8Array | null> {
  const sections = pdfSections(boards, activeId, o.range, o.selectedIds ?? []);
  if (sections.length === 0) return null;
  const active = boards.find((b) => b.id === activeId);
  return assemblePdf({
    page: pageSize(o.paper, o.orientation),
    title: o.title ?? (o.range === 'all' ? 'ホワイトボード' : (active?.name ?? 'ホワイトボード')),
    ...(o.subtitle ? { subtitle: o.subtitle } : {}),
    dateText: todayText(),
    sections,
    font: font ?? (await loadJapaneseFont()),
  });
}
