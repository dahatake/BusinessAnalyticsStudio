// PDF を組み立てる低レベルの書き手（FR-092）。ベクターの描画命令・日本語フォントの埋め込み（サブセット）・ページ・目次のための構造を作る。
// 座標は、ページの左上を原点とし、下向きを正とする（PDF の座標系への変換はここで行う）。依存ライブラリなし。
import { parseTtf, type TtfFont } from './ttf';

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString();
const enc = new TextEncoder();

export interface PdfColor { r: number; g: number; b: number }

/** `#rgb` / `#rrggbb` を色にする。解釈できなければ fallback。 */
export function parseColor(c: string | undefined, fallback: PdfColor = { r: 0.14, g: 0.14, b: 0.14 }): PdfColor {
  if (!c) return fallback;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return fallback;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}
const rgb = (c: PdfColor): string => `${fmt(c.r)} ${fmt(c.g)} ${fmt(c.b)}`;

async function deflate(data: Uint8Array): Promise<{ bytes: Uint8Array; filter: boolean }> {
  if (typeof CompressionStream === 'undefined') return { bytes: data, filter: false };
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), filter: true };
}

export interface ShapeStyle { fill?: PdfColor; stroke?: PdfColor; lineWidth?: number; opacity?: number; dash?: number[] }

export class PdfPage {
  readonly ops: string[] = [];
  readonly opacities = new Set<number>();
  constructor(readonly doc: PdfDoc, readonly w: number, readonly h: number) {}

  private y(v: number): number { return this.h - v; }
  private paint(style: ShapeStyle, closeStroke = false): string {
    const fill = !!style.fill, stroke = !!style.stroke;
    if (fill && stroke) return closeStroke ? 'b' : 'B';
    if (fill) return 'f';
    if (stroke) return closeStroke ? 's' : 'S';
    return 'n';
  }
  private begin(style: ShapeStyle): void {
    this.ops.push('q');
    if (style.opacity !== undefined && style.opacity < 1) {
      this.opacities.add(style.opacity);
      this.ops.push(`/GS${Math.round(style.opacity * 100)} gs`);
    }
    if (style.fill) this.ops.push(`${rgb(style.fill)} rg`);
    if (style.stroke) this.ops.push(`${rgb(style.stroke)} RG`);
    if (style.lineWidth !== undefined) this.ops.push(`${fmt(style.lineWidth)} w`);
    this.ops.push('1 J 1 j');
    if (style.dash?.length) this.ops.push(`[${style.dash.map(fmt).join(' ')}] 0 d`);
  }
  private end(): void { this.ops.push('Q'); }

  rect(x: number, y: number, w: number, h: number, style: ShapeStyle): void {
    this.begin(style);
    this.ops.push(`${fmt(x)} ${fmt(this.y(y + h))} ${fmt(w)} ${fmt(h)} re ${this.paint(style)}`);
    this.end();
  }

  /** 折れ線（または多角形）。点が 1 つなら、丸い点を打つ。 */
  polyline(points: ReadonlyArray<{ x: number; y: number }>, style: ShapeStyle, close = false): void {
    if (points.length === 0) return;
    this.begin(style);
    const p0 = points[0]!;
    const parts = [`${fmt(p0.x)} ${fmt(this.y(p0.y))} m`];
    if (points.length === 1) parts.push(`${fmt(p0.x)} ${fmt(this.y(p0.y))} l`);
    for (let i = 1; i < points.length; i++) parts.push(`${fmt(points[i]!.x)} ${fmt(this.y(points[i]!.y))} l`);
    this.ops.push(`${parts.join(' ')} ${this.paint(style, close)}`);
    this.end();
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, style: ShapeStyle): void {
    const k = 0.5522847498;
    const X = (v: number) => fmt(v), Y = (v: number) => fmt(this.y(v));
    this.begin(style);
    this.ops.push(
      `${X(cx + rx)} ${Y(cy)} m`,
      `${X(cx + rx)} ${Y(cy + ry * k)} ${X(cx + rx * k)} ${Y(cy + ry)} ${X(cx)} ${Y(cy + ry)} c`,
      `${X(cx - rx * k)} ${Y(cy + ry)} ${X(cx - rx)} ${Y(cy + ry * k)} ${X(cx - rx)} ${Y(cy)} c`,
      `${X(cx - rx)} ${Y(cy - ry * k)} ${X(cx - rx * k)} ${Y(cy - ry)} ${X(cx)} ${Y(cy - ry)} c`,
      `${X(cx + rx * k)} ${Y(cy - ry)} ${X(cx + rx)} ${Y(cy - ry * k)} ${X(cx + rx)} ${Y(cy)} c`,
      `h ${this.paint(style)}`,
    );
    this.end();
  }

  /** 以降の描画を矩形に切り抜く。`restore()` で戻す。 */
  clip(x: number, y: number, w: number, h: number): void {
    this.ops.push('q', `${fmt(x)} ${fmt(this.y(y + h))} ${fmt(w)} ${fmt(h)} re W n`);
  }
  restore(): void { this.ops.push('Q'); }

  /** 文字列の幅（pt） */
  measure(text: string, size: number): number { return this.doc.measure(text, size); }

  /** 文字列を描く。(x, baseline) は左端とベースラインの位置。 */
  text(text: string, x: number, baseline: number, size: number, color: PdfColor, opacity?: number): void {
    const hex = this.doc.encode(text);
    if (hex === '') return;
    this.ops.push('q');
    if (opacity !== undefined && opacity < 1) { this.opacities.add(opacity); this.ops.push(`/GS${Math.round(opacity * 100)} gs`); }
    this.ops.push(`${rgb(color)} rg BT /F1 ${fmt(size)} Tf 1 0 0 1 ${fmt(x)} ${fmt(this.y(baseline))} Tm <${hex}> Tj ET`, 'Q');
  }

  /** 幅 maxW に収まるように折り返した行にする（改行は保つ）。 */
  wrap(text: string, size: number, maxW: number): string[] {
    const lines: string[] = [];
    for (const para of text.split(/\r?\n/)) {
      let cur = '';
      for (const ch of para) {
        if (cur !== '' && this.measure(cur + ch, size) > maxW) { lines.push(cur); cur = ch; } else cur += ch;
      }
      lines.push(cur);
    }
    return lines;
  }
}

export class PdfDoc {
  private readonly font: TtfFont;
  private readonly used = new Map<number, number>();
  readonly pages: PdfPage[] = [];

  constructor(fontBytes: Uint8Array) {
    this.font = parseTtf(fontBytes);
  }

  addPage(w: number, h: number): PdfPage {
    const p = new PdfPage(this, w, h);
    this.pages.push(p);
    return p;
  }

  private gidOf(cp: number): number | undefined {
    if (cp < 0x20 || cp === 0x7f) return undefined;
    return this.font.glyphOf(cp) ?? this.font.glyphOf(0x20) ?? 0;
  }

  /** 文字列をグリフ ID（4 桁の 16 進）の並びにする。使った文字を記録する。 */
  encode(text: string): string {
    let hex = '';
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      const gid = this.gidOf(cp);
      if (gid === undefined) continue;
      if (!this.used.has(gid)) this.used.set(gid, cp);
      hex += gid.toString(16).padStart(4, '0');
    }
    return hex;
  }

  measure(text: string, size: number): number {
    let w = 0;
    for (const ch of text) {
      const gid = this.gidOf(ch.codePointAt(0)!);
      if (gid !== undefined) w += this.font.advanceOf(gid);
    }
    return (w / this.font.unitsPerEm) * size;
  }

  /** PDF（1.5）のバイト列にする。 */
  async build(info: { title: string }): Promise<Uint8Array> {
    const upm = this.font.unitsPerEm;
    const scale = (n: number): number => Math.round((n * 1000) / upm);
    const gids = [...this.used.keys()].sort((a, b) => a - b);
    const subset = this.font.subset(gids);

    const chunks: Uint8Array[] = [];
    const offsets: number[] = [];
    let len = 0;
    const push = (b: Uint8Array | string): void => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); len += u.length; };
    const obj = (n: number, body: string, stream?: { bytes: Uint8Array; filter: boolean; extra?: string }): void => {
      offsets[n] = len;
      const dict = stream ? body.replace(/>>\s*$/, `/Length ${stream.bytes.length}${stream.filter ? ' /Filter /FlateDecode' : ''}${stream.extra ?? ''} >>`) : body;
      push(`${n} 0 obj\n${dict}`);
      if (stream) { push('\nstream\n'); push(stream.bytes); push('\nendstream'); }
      push('\nendobj\n');
    };

    // 1 Catalog, 2 Pages, 3 Type0, 4 CIDFont, 5 FontDescriptor, 6 FontFile2, 7 ToUnicode, 8 Info, 以降ページ（ページ・内容の順）
    const pageObj = (i: number): number => 9 + i * 2;
    const total = 8 + this.pages.length * 2;
    push('%PDF-1.5\n%\xE2\xE3\xCF\xD3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Kids [${this.pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] /Count ${this.pages.length} >>`);
    const base = 'AAAAAA+SawarabiGothic';
    obj(3, `<< /Type /Font /Subtype /Type0 /BaseFont /${base} /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 7 0 R >>`);
    const widths = gids.map((g) => `${g} [${scale(this.font.advanceOf(g))}]`).join(' ');
    obj(4, `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${base} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 5 0 R /DW 1000 /W [${widths}] /CIDToGIDMap /Identity >>`);
    const bb = this.font.bbox.map(scale);
    obj(5, `<< /Type /FontDescriptor /FontName /${base} /Flags 4 /FontBBox [${bb.join(' ')}] /ItalicAngle 0 /Ascent ${scale(this.font.ascent)} /Descent ${scale(this.font.descent)} /CapHeight ${scale(this.font.ascent * 0.8)} /StemV 80 /FontFile2 6 0 R >>`);
    obj(6, '<< >>', { ...(await deflate(subset)), extra: ` /Length1 ${subset.length}` });
    let cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
    for (let i = 0; i < gids.length; i += 100) {
      const part = gids.slice(i, i + 100);
      cmap += `${part.length} beginbfchar\n`;
      for (const g of part) {
        const cp = this.used.get(g)!;
        let u: string;
        if (cp > 0xffff) { const c = cp - 0x10000; u = (0xd800 + (c >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (c & 0x3ff)).toString(16).padStart(4, '0'); } else u = cp.toString(16).padStart(4, '0');
        cmap += `<${g.toString(16).padStart(4, '0')}> <${u}>\n`;
      }
      cmap += 'endbfchar\n';
    }
    cmap += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
    obj(7, '<< >>', await deflate(enc.encode(cmap)));
    const hexTitle = [...info.title].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
    obj(8, `<< /Title <FEFF${hexTitle}> /Producer (Enterprise Discussion Board) >>`);
    for (let i = 0; i < this.pages.length; i++) {
      const p = this.pages[i]!;
      const gs = [...p.opacities].map((o) => `/GS${Math.round(o * 100)} << /CA ${fmt(o)} /ca ${fmt(o)} >>`).join(' ');
      obj(pageObj(i), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(p.w)} ${fmt(p.h)}] /Resources << /Font << /F1 3 0 R >> ${gs ? `/ExtGState << ${gs} >>` : ''} >> /Contents ${pageObj(i) + 1} 0 R >>`);
      obj(pageObj(i) + 1, '<< >>', await deflate(enc.encode(p.ops.join('\n'))));
    }
    const xref = len;
    let table = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= total; n++) table += `${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`;
    push(`${table}trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 8 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(len);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
  }
}
