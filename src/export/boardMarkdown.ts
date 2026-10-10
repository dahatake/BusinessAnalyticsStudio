// ボードの Markdown 出力（FR-093）。ボードごとに `.md` を作り、画像は `assets/` に置いて相対リンクで参照し、ZIP にまとめる。
// 各 `.md` は front matter（title・board・exported など）とチェックリストを持つ。純粋な関数だけで、ブラウザーの API は使わない。
import type { Board } from '../ink/model';
import { boardSvg } from './svg';
import { createZip, type ZipEntry } from './zip';

const safe = (s: string): string => (s.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '') || 'board');
const yamlStr = (s: string): string => JSON.stringify(s);
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

export interface BoardMarkdownFile { mdPath: string; markdown: string; assets: ZipEntry[] }

/** 1 枚のボードの Markdown と画像。index は ZIP 内の名前の重複を避ける通し番号（1 から）。 */
export function boardMarkdown(board: Board, index: number, now: Date): BoardMarkdownFile {
  const nn = String(index).padStart(2, '0');
  const base = `${nn}-${safe(board.name)}`;
  const svg = boardSvg(board);
  const assetPath = `assets/${base}.svg`;
  const stickies = board.items.filter((i) => i.type === 'sticky' && (i.text ?? '').trim() !== '');
  const texts = board.items.filter((i) => i.type === 'text' && (i.text ?? '').trim() !== '');
  const strokes = board.strokes.filter((k) => !k.temporary).length;

  const lines: string[] = [
    '---',
    `title: ${yamlStr(board.name)}`,
    `board: ${yamlStr(board.id)}`,
    `exported: ${yamlStr(now.toISOString())}`,
    `strokes: ${strokes}`,
    `stickies: ${stickies.length}`,
    `texts: ${texts.length}`,
    '---',
    '',
    `# ${oneLine(board.name)}`,
    '',
  ];
  if (svg) lines.push(`![${oneLine(board.name)}](${assetPath})`, '');
  lines.push('## チェックリスト', '', '- [ ] 手書きと図形の内容を見直す', '- [ ] 決定事項と次のアクションを確認する');
  for (const i of stickies) lines.push(`- [ ] ${oneLine(i.text ?? '')}`);
  if (texts.length > 0) {
    lines.push('', '## テキスト', '');
    for (const i of texts) lines.push(`- ${oneLine(i.text ?? '')}`);
  }
  lines.push('');
  return {
    mdPath: `${base}.md`,
    markdown: lines.join('\n'),
    assets: svg ? [{ path: assetPath, content: svg }] : [],
  };
}

/** 複数のボードを、`.md`（ボードごと）と `assets/` を含む ZIP にする。 */
export function boardsMarkdownZip(boards: readonly Board[], now: Date = new Date()): Uint8Array {
  const entries: ZipEntry[] = [];
  boards.forEach((b, i) => {
    const f = boardMarkdown(b, i + 1, now);
    entries.push({ path: f.mdPath, content: f.markdown }, ...f.assets);
  });
  return createZip(entries, now);
}
