// エクスポートに入れる画像（SVG）を作る純粋な関数（FR-053 のアーキテクチャの画像、ホワイトボードの画像）。
// ブラウザーでも Node でも同じ結果になる。文字・線の色は固定の中立色（ZIP の中の画像は、アプリのテーマに依存しない）。
import { boardContentBounds, type Board } from '../ink/model';

const INK = '#242424';
const LINE = '#616161';
const FILL = '#f5f5f5';

export const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface ArchNode { id: string; label: string; layer?: string }
export interface ArchEdge { from: string; to: string; label?: string }

const FONT = 'font-family="Segoe UI, Yu Gothic UI, Meiryo, sans-serif"';

/** 層ごとに列を作り、節を縦に並べたアーキテクチャ図。節がなければ null。 */
export function architectureSvg(nodes: readonly ArchNode[], edges: readonly ArchEdge[], title: string): string | null {
  if (nodes.length === 0) return null;
  const layers: string[] = [];
  for (const n of nodes) { const l = n.layer ?? ''; if (!layers.includes(l)) layers.push(l); }
  const W = 180, H = 48, GX = 72, GY = 24, PAD = 24, HEAD = 40;
  const pos = new Map<string, { x: number; y: number }>();
  const rows = new Map<string, number>();
  for (const n of nodes) {
    const l = n.layer ?? '';
    const r = rows.get(l) ?? 0;
    rows.set(l, r + 1);
    pos.set(n.id, { x: PAD + layers.indexOf(l) * (W + GX), y: PAD + HEAD + r * (H + GY) });
  }
  const maxRows = Math.max(...rows.values());
  const width = PAD * 2 + layers.length * W + (layers.length - 1) * GX;
  const height = PAD * 2 + HEAD + maxRows * H + (maxRows - 1) * GY;
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${xmlEscape(title)}">`,
    `<title>${xmlEscape(title)}</title>`,
    '<defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="' + LINE + '"/></marker></defs>',
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
  ];
  layers.forEach((l, i) => {
    out.push(`<text x="${PAD + i * (W + GX) + W / 2}" y="${PAD + 20}" text-anchor="middle" font-size="14" font-weight="600" fill="${INK}" ${FONT}>${xmlEscape(l || '（層なし）')}</text>`);
  });
  for (const e of edges) {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) continue;
    const forward = b.x >= a.x;
    const x1 = a.x + (forward ? W : 0), y1 = a.y + H / 2;
    const x2 = b.x + (forward ? 0 : W), y2 = b.y + H / 2;
    out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${LINE}" stroke-width="1.5" marker-end="url(#arrow)"/>`);
    if (e.label) out.push(`<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 4}" text-anchor="middle" font-size="11" fill="${LINE}" ${FONT}>${xmlEscape(e.label)}</text>`);
  }
  for (const n of nodes) {
    const p = pos.get(n.id)!;
    out.push(`<rect x="${p.x}" y="${p.y}" width="${W}" height="${H}" rx="6" fill="${FILL}" stroke="${LINE}"/>`);
    out.push(`<text x="${p.x + W / 2}" y="${p.y + H / 2 + 5}" text-anchor="middle" font-size="13" fill="${INK}" ${FONT}>${xmlEscape(n.label.length > 16 ? `${n.label.slice(0, 15)}…` : n.label)}</text>`);
  }
  out.push('</svg>');
  return out.join('\n');
}

const num = (n: number): string => String(Math.round(n * 10) / 10);

/** ホワイトボード 1 枚の画像。内容（線・図形・文字）がなければ null。rect を渡すと、その範囲（ワールド座標）だけを切り出す（内容がなくても返す）。 */
export function boardSvg(board: Board, rect?: { x: number; y: number; w: number; h: number }): string | null {
  const bounds = rect ?? boardContentBounds(board);
  if (!bounds) return null;
  const m = rect ? 0 : 24;
  const x = bounds.x - m, y = bounds.y - m;
  const w = Math.max(1, bounds.w + m * 2), h = Math.max(1, bounds.h + m * 2);
  const colorOf = (c?: string) => (!c || c === 'auto' ? INK : c);
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(w)}" height="${num(h)}" viewBox="${num(x)} ${num(y)} ${num(w)} ${num(h)}" role="img" aria-label="${xmlEscape(board.name)}">`,
    `<title>${xmlEscape(board.name)}</title>`,
    '<defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="context-stroke"/></marker></defs>',
    `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="#ffffff"/>`,
  ];
  for (const it of board.items) {
    const c = colorOf(it.color);
    if (it.type === 'sticky') {
      out.push(`<rect x="${num(it.x)}" y="${num(it.y)}" width="${num(it.w)}" height="${num(it.h)}" fill="${it.color && it.color !== 'auto' ? it.color : '#fff4ce'}" stroke="${LINE}"/>`);
      if (it.text) out.push(`<text x="${num(it.x + 8)}" y="${num(it.y + 20)}" font-size="14" fill="${INK}" ${FONT}>${xmlEscape(it.text.split(/\r?\n/)[0] ?? '')}</text>`);
    } else if (it.type === 'text') {
      out.push(`<text x="${num(it.x)}" y="${num(it.y + 16)}" font-size="${it.size ?? 16}" fill="${c}" ${FONT}>${xmlEscape((it.text ?? '').split(/\r?\n/)[0] ?? '')}</text>`);
    } else if (it.type === 'shape') {
      const stroke = `stroke="${c}" stroke-width="${it.size ?? 2}" fill="none"`;
      if (it.shape === 'rect' || it.shape === 'callout') out.push(`<rect x="${num(it.x)}" y="${num(it.y)}" width="${num(it.w)}" height="${num(it.h)}" ${stroke}/>`);
      else if (it.shape === 'ellipse') out.push(`<ellipse cx="${num(it.x + it.w / 2)}" cy="${num(it.y + it.h / 2)}" rx="${num(it.w / 2)}" ry="${num(it.h / 2)}" ${stroke}/>`);
      else out.push(`<line x1="${num(it.x1 ?? it.x)}" y1="${num(it.y1 ?? it.y)}" x2="${num(it.x2 ?? it.x + it.w)}" y2="${num(it.y2 ?? it.y + it.h)}" ${stroke}${it.shape === 'arrow' ? ' marker-end="url(#arrow)"' : ''}/>`);
      if (it.text) out.push(`<text x="${num(it.x + 6)}" y="${num(it.y + 18)}" font-size="13" fill="${c}" ${FONT}>${xmlEscape(it.text.split(/\r?\n/)[0] ?? '')}</text>`);
    }
  }
  for (const s of board.strokes) {
    if (s.temporary || s.points.length === 0) continue;
    const pts = s.points.map((p) => `${num(p.x)},${num(p.y)}`).join(' ');
    out.push(`<polyline points="${pts}" fill="none" stroke="${colorOf(s.color)}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round"${s.tool === 'highlighter' ? ' stroke-opacity="0.4"' : ''}/>`);
  }
  out.push('</svg>');
  return out.join('\n');
}
