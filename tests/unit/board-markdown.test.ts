// FR-093 AC-114: ボードごとの .md（front matter・チェックリスト）と assets/ の画像を ZIP にし、画像リンクが ZIP 内に実在する。
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { boardMarkdown, boardsMarkdownZip } from '../../src/export/boardMarkdown';
import { readZip } from '../../src/export/zip';
import type { Board } from '../../src/ink/model';

const board = (id: string, name: string, extra: Partial<Board> = {}): Board => ({
  id, name, topicId: null, kind: 'board', background: 'plain',
  strokes: [{ id: `${id}-s1`, tool: 'pen', color: '#000', size: 2, points: [{ x: 0, y: 0, p: 0.5 }, { x: 80, y: 40, p: 0.5 }], bounds: { x: 0, y: 0, w: 80, h: 40 } } as unknown as Board['strokes'][number]],
  items: [], view: { x: 0, y: 0, zoom: 1 }, size: { w: 800, h: 600 }, ...extra,
});

describe('FR-093 AC-114 ボードの Markdown 出力', () => {
  it('2 枚のボードで 2 つの .md と assets/ の画像が ZIP に入り、front matter・チェックリスト・実在する相対リンクがある', () => {
    const files = readZip(boardsMarkdownZip([board('b1', 'ボード 1'), board('b2', 'ボード 2')], new Date('2026-10-10T00:00:00Z')));
    const names = files.map((f) => f.path);
    const mds = names.filter((n) => n.endsWith('.md'));
    expect(mds).toHaveLength(2);
    expect(names.some((n) => /^assets\/.+\.svg$/.test(n))).toBe(true);
    for (const m of mds) {
      const t = new TextDecoder().decode(files.find((f) => f.path === m)!.content as Uint8Array);
      expect(t).toMatch(/^---\n[\s\S]*?\n---/);
      expect(t).toMatch(/^- \[ \] /m);
      const links = [...t.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((x) => x[1]!);
      expect(links.length).toBeGreaterThan(0);
      for (const href of links) expect(names).toContain(path.posix.join(path.posix.dirname(m), href));
    }
  });

  it('付箋の文字はチェックリストの項目になり、内容のないボードは画像リンクを持たない', () => {
    const withSticky = boardMarkdown(board('b1', 'メモ', { items: [{ id: 'i1', type: 'sticky', x: 0, y: 0, w: 50, h: 50, text: '見積を確認' }] }), 1, new Date());
    expect(withSticky.markdown).toContain('- [ ] 見積を確認');
    const empty = boardMarkdown(board('b2', '空', { strokes: [] }), 2, new Date());
    expect(empty.assets).toHaveLength(0);
    expect(empty.markdown).not.toMatch(/!\[/);
  });
});
