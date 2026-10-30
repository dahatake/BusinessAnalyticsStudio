// インクの Markdown 出力（FR-093）。ボードごとに `.md`（front matter とチェックリスト）を作り、画像は `assets/` に置いて相対リンクで参照する。
// 純粋な関数だけで書く。ZIP にするのは zip.ts の `createZip`。
import { sanitizeFilePart, yyyymmdd } from '../discussion/model';
import { tr } from '../i18n/translate';
import type { Board } from '../ink/model';
import { boardSvg } from './svg';
import type { ZipEntry } from './zip';

const safe = (s: string): string => sanitizeFilePart(s).replace(/[()\s]+/g, '_') || tr('ボード');

/** 重ならないファイル名の幹を作る（同じ名前のボードには連番を付ける）。 */
function uniqueStems(boards: readonly Board[]): string[] {
  const seen = new Map<string, number>();
  return boards.map((b) => {
    const base = safe(b.name);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}

const yamlString = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;

/** チェックリストにする項目（付箋・テキスト・カード・図形の文字）。 */
export function checklistOf(board: Board): string[] {
  const lines: string[] = [];
  for (const it of board.items) {
    const text = (it.type === 'card' ? it.label : it.text)?.trim();
    if (!text || (it.type !== 'sticky' && it.type !== 'text' && it.type !== 'card' && it.type !== 'shape')) continue;
    const first = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' / ');
    const votes = it.type === 'sticky' && it.votes ? `（${tr('{n} 票', { n: it.votes })}）` : '';
    lines.push(`- [ ] ${first}${votes}`);
  }
  return lines.length > 0 ? lines : ['- [ ] ' + tr('このボードの内容を確認する')];
}

/** ボード 1 枚分の Markdown。image は assets からの相対リンク（なければ画像なし）。 */
export function boardMarkdown(board: Board, imageHref: string | null, now: Date): string {
  const strokes = board.strokes.filter((s) => !s.temporary).length;
  const out = [
    '---',
    `title: ${yamlString(board.name)}`,
    `board_id: ${yamlString(board.id)}`,
    `background: ${board.background}`,
    `strokes: ${strokes}`,
    `items: ${board.items.length}`,
    `exported_at: ${yamlString(now.toISOString())}`,
    '---',
    '',
    `# ${board.name}`,
    '',
  ];
  if (imageHref) out.push(`![${board.name.replace(/[\][]/g, '')}](${imageHref})`, '');
  out.push(`## ${tr('チェックリスト')}`, '', ...checklistOf(board), '');
  return out.join('\n');
}

/** ボードごとの `.md` と `assets/` の画像（ZIP の中身）。boards は出力するボード（注釈用のボードは呼び出し側で除く）。 */
export function inkMarkdownEntries(boards: readonly Board[], now: Date = new Date(), dir = ''): ZipEntry[] {
  const prefix = dir ? `${dir.replace(/\/+$/, '')}/` : '';
  const stems = uniqueStems(boards);
  const entries: ZipEntry[] = [];
  boards.forEach((b, i) => {
    const stem = stems[i]!;
    const svg = boardSvg(b);
    if (svg) entries.push({ path: `${prefix}assets/${stem}.svg`, content: svg });
    entries.push({ path: `${prefix}${stem}.md`, content: boardMarkdown(b, svg ? `assets/${encodeURI(stem)}.svg` : null, now) });
  });
  return entries;
}

export const inkMarkdownZipName = (now: Date = new Date()): string => `ink-boards-${yyyymmdd(now)}.zip`;
