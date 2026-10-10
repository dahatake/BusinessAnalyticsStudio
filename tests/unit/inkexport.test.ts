// FR-092 / FR-093 / FR-094: PDF 出力（ベクター・表紙・目次・日本語フォントの埋め込み）、インクの Markdown 出力、Engagement サマリーパックの単体・結合テスト
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createBoard, makeStroke, type Board, type BoardItem } from '../../src/ink/model';
import { assemblePdf, pageSize, pdfSections, rangeRect } from '../../src/export/pdf';
import { parseTtf } from '../../src/export/ttf';
import { boardMarkdown, checklistOf, inkMarkdownEntries } from '../../src/export/inkMarkdown';
import { buildSummaryPack } from '../../src/export/summaryPack';
import { readZip } from '../../src/export/zip';
import type { ExportInput } from '../../src/export/build';
import type { PackData } from '../../src/schema';
import { REPO_ROOT, readPackFiles } from '../../scripts/lib/pack-fs';
import { parseColor } from '../../src/export/pdfdoc';

const mono = JSON.parse(JSON.stringify(readPackFiles(path.join(REPO_ROOT, 'examples', 'mono')))) as unknown as PackData;
const font = new Uint8Array(readFileSync(path.resolve(__dirname, '..', '..', 'public', 'fonts', 'SawarabiGothic-Regular.ttf')));

function sampleBoard(name = '議論ボード'): Board {
  const b = createBoard(name, null);
  b.strokes = [makeStroke('pen', '#c50f1f', 3, [{ x: 10, y: 10, p: 0.5 }, { x: 80, y: 60, p: 0.5 }, { x: 150, y: 20, p: 0.5 }])];
  const sticky: BoardItem = { id: 's1', type: 'sticky', x: 200, y: 40, w: 160, h: 90, text: '日本語の付箋ST', votes: 2 };
  const text: BoardItem = { id: 't1', type: 'text', x: 20, y: 200, w: 200, h: 30, text: '日本語の注記ST' };
  b.items = [sticky, text];
  return b;
}

/** PDF の中の Flate ストリームをすべて展開して、文字列にまとめる（描画命令を調べるため）。 */
function inflatedStreams(pdf: Uint8Array): string {
  const s = Buffer.from(pdf).toString('latin1');
  const out: string[] = [];
  for (const m of s.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    try { out.push(inflateSync(Buffer.from(m[1]!, 'latin1')).toString('latin1')); } catch { /* 非圧縮 */ }
  }
  return out.join('\n');
}

describe('FR-092 AC-112 PDF 出力', () => {
  // FR-092 AC-112
  it('FR-092 AC-112 A4 横・表紙・目次・ボードの 3 ページで、手書きはパス、日本語フォントが埋め込まれる', async () => {
    const b = sampleBoard();
    const pdf = await assemblePdf({
      page: pageSize('A4', 'landscape'), title: '議論ボード', dateText: '2026-10-10',
      sections: pdfSections([b], b.id, 'board'), font,
    });
    const text = Buffer.from(pdf).toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('/Count 3');
    expect(text.match(/\/MediaBox \[0 0 841.89 595.28\]/g)).toHaveLength(3);
    expect(text).toMatch(/\/FontFile2 \d+ 0 R/);
    expect(text).toContain('/CIDFontType2');
    const content = inflatedStreams(pdf);
    // 手書きのパス（m → l → S）と ToUnicode（日本語の文字）
    expect(content).toMatch(/ m [\d. ]+ l [\d. ]+ l S/);
    expect(content).toContain('beginbfchar');
    // 使った文字だけを残したサブセット（元のフォントより十分小さい）
    expect(pdf.length).toBeLessThan(font.length / 4);
    // startxref の位置が xref を指す
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(Buffer.from(pdf).subarray(startxref, startxref + 4).toString('latin1')).toBe('xref');
  });

  // FR-092 AC-112
  it('FR-092 AC-112 用紙は A4 / A3 / 16:9、向きは縦横で、ページの大きさが決まる', () => {
    expect(pageSize('A4', 'landscape')).toEqual({ w: 841.89, h: 595.28 });
    expect(pageSize('A3', 'portrait').h).toBeCloseTo(1190.55, 1);
    expect(pageSize('16:9', 'landscape')).toEqual({ w: 960, h: 540 });
    expect(pageSize('16:9', 'portrait')).toEqual({ w: 540, h: 960 });
  });

  // FR-092 AC-112
  it('FR-092 AC-112 範囲（全体 / ボード / 選択範囲 / 表示範囲）で、出力するボードと範囲が決まる', () => {
    const a = sampleBoard('A'), c = sampleBoard('C'), empty = createBoard('空');
    const all = [a, c, empty];
    expect(pdfSections(all, a.id, 'all').map((s) => s.board.name)).toEqual(['A', 'C']);
    expect(pdfSections(all, c.id, 'board').map((s) => s.board.name)).toEqual(['C']);
    expect(pdfSections(all, empty.id, 'board')).toEqual([]);
    expect(pdfSections(all, a.id, 'selection', [])).toEqual([]);
    const sel = rangeRect(a, 'selection', ['s1'])!;
    expect(sel.x).toBeLessThan(200);
    expect(sel.x + sel.w).toBeGreaterThan(360);
    expect(sel.y + sel.h).toBeLessThan(200);
    a.view = { x: 5, y: 6, zoom: 2 };
    a.size = { w: 800, h: 400 };
    expect(rangeRect(a, 'view')).toEqual({ x: 5, y: 6, w: 400, h: 200 });
  });

  // FR-092 AC-112
  it('FR-092 AC-112 ボードがなくても表紙と目次の PDF を作れる。目次が 1 ページに収まらなければ増やす', async () => {
    const none = await assemblePdf({ page: pageSize('A4', 'landscape'), title: 'T', dateText: 'd', sections: [], font });
    expect(Buffer.from(none).toString('latin1')).toContain('/Count 2');
    const many = Array.from({ length: 40 }, (_, i) => sampleBoard(`ボード${i}`));
    const pdf = await assemblePdf({ page: pageSize('A4', 'landscape'), title: 'T', dateText: 'd', sections: pdfSections(many, many[0]!.id, 'all'), font });
    const pages = Number(/\/Count (\d+)/.exec(Buffer.from(pdf).toString('latin1'))![1]);
    expect(pages).toBeGreaterThan(40 + 2);
  });

  // FR-092 AC-112
  it('FR-092 AC-112 フォントのサブセットは、使うグリフだけを残した TrueType になる', () => {
    const f = parseTtf(font);
    const gid = f.glyphOf('日'.codePointAt(0)!)!;
    expect(gid).toBeGreaterThan(0);
    const sub = f.subset([gid]);
    expect(sub.length).toBeLessThan(font.length / 10);
    expect(Buffer.from(sub).subarray(0, 4).toString('hex')).toBe('00010000');
    expect(f.advanceOf(gid)).toBeGreaterThan(0);
  });

  // FR-092 AC-112
  it('FR-092 AC-112 色は #rgb / #rrggbb を解釈し、解釈できなければ既定の色にする', () => {
    expect(parseColor('#ff0000')).toEqual({ r: 1, g: 0, b: 0 });
    expect(parseColor('#0f0')).toEqual({ r: 0, g: 1, b: 0 });
    expect(parseColor('red', { r: 0, g: 0, b: 1 })).toEqual({ r: 0, g: 0, b: 1 });
  });
});

describe('FR-093 AC-114 インクの Markdown 出力', () => {
  // FR-093 AC-114
  it('FR-093 AC-114 2 枚のボードから 2 つの .md と assets/ の画像ができ、front matter・チェックリスト・実在する相対リンクがある', () => {
    const entries = inkMarkdownEntries([sampleBoard('ボード 1'), sampleBoard('ボード 1')], new Date('2026-10-10T00:00:00Z'));
    const paths = entries.map((e) => e.path);
    const mds = paths.filter((p) => p.endsWith('.md'));
    expect(mds).toHaveLength(2);
    expect(new Set(mds).size).toBe(2);
    expect(paths.filter((p) => /^assets\/.+\.svg$/.test(p))).toHaveLength(2);
    for (const m of mds) {
      const t = String(entries.find((e) => e.path === m)!.content);
      expect(t).toMatch(/^---\n[\s\S]*?\n---/);
      expect(t).toMatch(/^- \[ \] /m);
      const links = [...t.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((x) => decodeURI(x[1]!));
      expect(links.length).toBeGreaterThan(0);
      for (const l of links) expect(paths).toContain(l);
    }
  });

  // FR-093 AC-114
  it('FR-093 AC-114 チェックリストは付箋・テキストから作り、なければ確認の 1 項目を入れる。画像がなければリンクを書かない', () => {
    expect(checklistOf(sampleBoard())).toEqual(['- [ ] 日本語の付箋ST（2 票）', '- [ ] 日本語の注記ST']);
    const e = createBoard('空');
    expect(checklistOf(e)).toHaveLength(1);
    expect(boardMarkdown(e, null, new Date(0))).not.toContain('![');
  });
});

describe('FR-094 AC-115 Engagement サマリーパック', () => {
  // FR-094 AC-115
  it('FR-094 AC-115 PDF と Markdown を含む 1 つの ZIP になる（ボードがなくても作れる）', async () => {
    const input = {
      customerName: mono.customer.name, projectName: mono.customer.projectName, data: mono,
      themes: [], boards: [sampleBoard('ボードX')], now: new Date('2026-10-10T00:00:00Z'),
    } as ExportInput;
    const pack = await buildSummaryPack(input, font);
    expect(pack.fileName).toMatch(/\.zip$/);
    const entries = readZip(pack.bytes);
    const names = entries.map((e) => e.path);
    expect(names.some((n) => n.endsWith('.pdf'))).toBe(true);
    expect(names.some((n) => n.endsWith('.md'))).toBe(true);
    const pdf = entries.find((e) => e.path.endsWith('.pdf'))!.content as Uint8Array;
    expect(Buffer.from(pdf).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(names.some((n) => /ink\/ボードX\.md$/.test(n))).toBe(true);
    const noBoards = await buildSummaryPack({ ...input, boards: [] }, font);
    expect(readZip(noBoards.bytes).some((e) => e.path.endsWith('.pdf'))).toBe(true);
  });
});
