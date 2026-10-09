// エクスポートのプレビュー（FR-054）。Markdown を、見出し・表・箇条書き・引用・コードの最小限の要素にして表示する。
// 見出しは実際の見出し要素（h1〜h6）にして、支援技術と自動テストが節を辿れるようにする。画像は文言だけを出す（プレビューは軽く保つ）。
import { Fragment, useMemo, type ReactNode } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';

type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'quote'; text: string }
  | { t: 'code'; lang: string; text: string }
  | { t: 'table'; head: string[]; rows: string[][] };

const splitRow = (line: string): string[] =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

export function parsePreview(src: string): Block[] {
  const lines = src.split(/\r?\n/);
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? '')) { body.push(lines[i] ?? ''); i++; }
      i++;
      out.push({ t: 'code', lang: fence[1] ?? '', text: body.join('\n') });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { out.push({ t: 'h', level: h[1]!.length, text: h[2] ?? '' }); i++; continue; }
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i] ?? '')) { rows.push(splitRow(lines[i] ?? '')); i++; }
      out.push({ t: 'table', head, rows });
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i] ?? '')) { items.push((lines[i] ?? '').replace(/^\s*([-*]|\d+\.)\s+/, '')); i++; }
      out.push({ t: 'ul', items });
      continue;
    }
    if (/^>/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^>/.test(lines[i] ?? '')) { q.push((lines[i] ?? '').replace(/^>\s?/, '')); i++; }
      out.push({ t: 'quote', text: q.join('\n') });
      continue;
    }
    if (line.trim() === '' || /^-{3,}$/.test(line.trim())) { i++; continue; }
    const p: string[] = [];
    while (i < lines.length && (lines[i] ?? '').trim() !== '' && !/^(#{1,6}\s|```|>|\s*\|)/.test(lines[i] ?? '') && !/^\s*([-*]|\d+\.)\s+/.test(lines[i] ?? '')) { p.push(lines[i] ?? ''); i++; }
    if (p.length === 0) { i++; continue; }
    out.push({ t: 'p', text: p.join('\n') });
  }
  return out;
}

/** 画像の記法は文言にする。強調の記号は外す。 */
const inline = (s: string): string => s.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, '［図: $1］').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, minWidth: 0, overflowWrap: 'anywhere' },
  h: { margin: 0, color: tokens.colorNeutralForeground1, fontWeight: tokens.fontWeightSemibold },
  h1: { fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500 },
  h2: { fontSize: tokens.fontSizeBase400, lineHeight: tokens.lineHeightBase400, paddingTop: tokens.spacingVerticalS, borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  h3: { fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300 },
  p: { margin: 0, fontSize: tokens.fontSizeBase300, whiteSpace: 'pre-wrap' },
  ul: { margin: 0, paddingInlineStart: tokens.spacingHorizontalXXL, fontSize: tokens.fontSizeBase300 },
  quote: {
    margin: 0, paddingInlineStart: tokens.spacingHorizontalM, borderInlineStartWidth: tokens.strokeWidthThick, borderInlineStartStyle: 'solid', borderInlineStartColor: tokens.colorNeutralStroke1,
    color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase300, whiteSpace: 'pre-wrap',
  },
  code: {
    margin: 0, padding: tokens.spacingHorizontalS, backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium,
    fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, overflowX: 'auto', whiteSpace: 'pre-wrap',
  },
  tableWrap: { overflowX: 'auto', maxWidth: '100%' },
  table: { borderCollapse: 'collapse', fontSize: tokens.fontSizeBase200, width: '100%' },
  th: { textAlign: 'start', padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, backgroundColor: tokens.colorNeutralBackground3, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  td: { padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, verticalAlign: 'top' },
});

export function MarkdownPreview({ source }: { source: string }) {
  const s = useStyles();
  const blocks = useMemo(() => parsePreview(source), [source]);
  const render = (b: Block, i: number): ReactNode => {
    switch (b.t) {
      case 'h': {
        const level = Math.min(6, b.level);
        const cls = `${s.h} ${level === 1 ? s.h1 : level === 2 ? s.h2 : s.h3}`;
        const Tag = `h${level}` as 'h1';
        return <Tag key={i} className={cls}>{inline(b.text)}</Tag>;
      }
      case 'p': return <p key={i} className={s.p}>{inline(b.text)}</p>;
      case 'ul': return <ul key={i} className={s.ul}>{b.items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ul>;
      case 'quote': return <blockquote key={i} className={s.quote}>{inline(b.text)}</blockquote>;
      case 'code': return <pre key={i} className={s.code} data-lang={b.lang}>{b.text}</pre>;
      case 'table':
        return (
          <div key={i} className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr>{b.head.map((h, k) => <th key={k} className={s.th} scope="col">{inline(h)}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className={s.td}>{inline(c)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
    }
  };
  return <div className={s.root}>{blocks.map((b, i) => <Fragment key={i}>{render(b, i)}</Fragment>)}</div>;
}
