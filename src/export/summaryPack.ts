// Engagement サマリーパック（FR-094）。PDF（表紙・目次・サマリー・ボード）と Markdown（全量の Markdown・ボードごとの Markdown）を 1 つの ZIP にする。
import { buildExport, countInternal, type ExportInput } from './build';
import { inkMarkdownEntries } from './inkMarkdown';
import { assemblePdf, pageSize, pdfSections, todayText } from './pdf';
import { createZip } from './zip';
import { sanitizeFilePart, yyyymmdd } from '../discussion/model';

export interface SummaryPack { fileName: string; bytes: Uint8Array }

/** サマリーのページに出す行。 */
export function summaryLines(input: ExportInput, anonymized: boolean): string[] {
  const boards = (input.boards ?? []).filter((b) => b.kind === 'board');
  const strokes = boards.reduce((n, b) => n + b.strokes.filter((s) => !s.temporary).length, 0);
  const notes = boards.reduce((n, b) => n + b.items.filter((i) => i.type === 'sticky').length, 0);
  return [
    `顧客: ${input.customerName}`,
    `案件: ${input.projectName}`,
    `議論のテーマ: ${input.themes.length} 件`,
    `ホワイトボード: ${boards.length} 枚（手書き ${strokes} 本・付箋 ${notes} 枚）`,
    `機密区分 internal の項目の匿名化: ${anonymized ? 'する' : '対象なし'}`,
    'このパックには、PDF（表紙・目次・サマリー・ボード）と、Markdown（全量の Markdown とボードごとの Markdown）が入っています。',
  ];
}

/** 「Engagement サマリーパック」の ZIP を作る。font は埋め込む日本語フォント（TrueType）。 */
export async function buildSummaryPack(input: ExportInput, font: Uint8Array): Promise<SummaryPack> {
  const now = input.now ?? new Date();
  const anonymize = countInternal(input.data) > 0;
  const full = buildExport(input, { scope: 'all', anonymize, format: 'zip', followUp: false });
  const boards = (input.boards ?? []).filter((b) => b.kind === 'board');
  const title = `${input.customerName} ${input.projectName} Engagement サマリー`.trim();
  const pdf = await assemblePdf({
    page: pageSize('A4', 'landscape'),
    title,
    subtitle: 'ビジネス議論の分析ボード',
    dateText: todayText(now),
    sections: pdfSections(boards, boards[0]?.id ?? '', 'all'),
    summary: { title: 'サマリー', lines: summaryLines(input, anonymize) },
    font,
  });
  const base = `${yyyymmdd(now)}-${sanitizeFilePart(input.customerName)}-${sanitizeFilePart(input.projectName)}-engagement-summary`;
  const bytes = createZip([
    { path: `${base}.pdf`, content: pdf },
    ...full.files.map((f) => ({ path: `markdown/${f.path}`, content: f.content })),
    ...inkMarkdownEntries(boards, now, 'markdown/ink'),
  ], now);
  return { fileName: `${base}.zip`, bytes };
}
