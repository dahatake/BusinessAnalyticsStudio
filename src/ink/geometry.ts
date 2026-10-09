// インクの幾何計算（当たり判定・投げ縄・消しゴム）。純粋な関数だけ。
import type { Board, BoardItem, Bounds, InkPoint, Stroke } from './model';
import { boundsOfPoints, newId } from './model';
import { FRAME_TITLE, isNode } from '../whiteboard/ops';

export interface Pt { x: number; y: number }

/** 点 p の下にある、いちばん手前の「つなげる項目」（付箋・データのカード・文字・画像）。 */
export function nodeAt(board: Pick<Board, 'items'>, p: Pt, tol = 0): BoardItem | null {
  for (let k = board.items.length - 1; k >= 0; k--) {
    const i = board.items[k]!;
    if (isNode(i) && pointInBounds(p, i, tol)) return i;
  }
  return null;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function pointInPolygon(p: Pt, poly: ReadonlyArray<Pt>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export const pointInBounds = (p: Pt, b: Bounds, pad = 0): boolean =>
  p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;

export const boundsIntersect = (a: Bounds, b: Bounds): boolean =>
  a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;

/** ストロークが点 p から tol 以内を通るか。 */
export function strokeHit(s: Stroke, p: Pt, tol: number): boolean {
  if (!pointInBounds(p, s.bounds, tol + s.size * 2)) return false;
  const pts = s.points;
  if (pts.length === 1) return Math.hypot(p.x - pts[0]!.x, p.y - pts[0]!.y) <= tol + s.size / 2;
  const reach = tol + (s.tool === 'highlighter' ? s.size * 2 : s.size / 2);
  for (let i = 1; i < pts.length; i++) {
    if (distToSegment(p, pts[i - 1]!, pts[i]!) <= reach) return true;
  }
  return false;
}

export function itemHit(i: BoardItem, p: Pt, tol: number): boolean {
  if (i.type === 'connector') {
    return distToSegment(p, { x: i.x1 ?? 0, y: i.y1 ?? 0 }, { x: i.x2 ?? 0, y: i.y2 ?? 0 }) <= tol + (i.size ?? 2);
  }
  if (i.type === 'frame') {
    // 見出しの帯と枠線の近くだけ（中は付箋などを置くので、中をクリックしても反応しない）
    const inner = pointInBounds(p, { x: i.x + 8, y: i.y + FRAME_TITLE, w: i.w - 16, h: i.h - FRAME_TITLE - 8 });
    return pointInBounds(p, i, tol) && !inner;
  }
  if (i.type === 'shape' && (i.shape === 'line' || i.shape === 'arrow')) {
    return distToSegment(p, { x: i.x1 ?? 0, y: i.y1 ?? 0 }, { x: i.x2 ?? 0, y: i.y2 ?? 0 }) <= tol + (i.size ?? 2);
  }
  if (i.type === 'shape') {
    // 枠線の近くだけを対象にする（中は透明なので、中をクリックしても反応しない）
    const inner = pointInBounds(p, { x: i.x + tol * 2, y: i.y + tol * 2, w: i.w - tol * 4, h: i.h - tol * 4 });
    return pointInBounds(p, i, tol) && !inner;
  }
  return pointInBounds(p, i, tol);
}

/** 点 p の下にある、いちばん手前のもの（図形・付箋などが先、ストロークが後）。 */
export function hitTest(board: Pick<Board, 'strokes' | 'items'>, p: Pt, tol: number): { kind: 'item' | 'stroke'; id: string } | null {
  for (let k = board.items.length - 1; k >= 0; k--) {
    const i = board.items[k]!;
    if (itemHit(i, p, tol)) return { kind: 'item', id: i.id };
  }
  for (let k = board.strokes.length - 1; k >= 0; k--) {
    const s = board.strokes[k]!;
    if (strokeHit(s, p, tol)) return { kind: 'stroke', id: s.id };
  }
  return null;
}

/** 投げ縄で囲まれた要素の ID。ストロークは点の半分以上、そのほかは中心が輪の中にあれば選ぶ。 */
export function lassoSelect(board: Pick<Board, 'strokes' | 'items'>, polygon: ReadonlyArray<Pt>): string[] {
  if (polygon.length < 3) return [];
  const box = boundsOfPoints(polygon);
  const ids: string[] = [];
  for (const s of board.strokes) {
    if (!boundsIntersect(s.bounds, box)) continue;
    let inside = 0;
    for (const p of s.points) if (pointInPolygon(p, polygon)) inside += 1;
    if (inside * 2 >= s.points.length) ids.push(s.id);
  }
  for (const i of board.items) {
    if (pointInPolygon({ x: i.x + i.w / 2, y: i.y + i.h / 2 }, polygon)) ids.push(i.id);
  }
  return ids;
}

export function selectionBounds(board: Pick<Board, 'strokes' | 'items'>, ids: ReadonlySet<string>): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (b: Bounds) => {
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
  };
  for (const s of board.strokes) if (ids.has(s.id)) add(s.bounds);
  for (const i of board.items) if (ids.has(i.id)) add(i);
  return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}

/** 点列の隣り合う点の間隔が maxGap 以下になるよう、中間の点を足す。 */
export function densify(points: ReadonlyArray<InkPoint>, maxGap: number): InkPoint[] {
  const out: InkPoint[] = [];
  for (const b of points) {
    const a = out[out.length - 1];
    if (a) {
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.ceil(d / maxGap);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: a.p + (b.p - a.p) * t });
      }
    }
    out.push(b);
  }
  return out;
}

/**
 * ピクセル単位の消しゴム。中心 c・半径 r の円に入る点を取り除き、残りを別々のストロークに分ける。
 * 当たらなかったストロークは同じオブジェクトのまま返す（呼び出し側が変化を検出できる）。
 */
export function erasePixels(strokes: ReadonlyArray<Stroke>, c: Pt, r: number): Stroke[] {
  const out: Stroke[] = [];
  const box: Bounds = { x: c.x - r, y: c.y - r, w: r * 2, h: r * 2 };
  for (const s of strokes) {
    const pad = s.size;
    if (!boundsIntersect({ x: s.bounds.x - pad, y: s.bounds.y - pad, w: s.bounds.w + pad * 2, h: s.bounds.h + pad * 2 }, box)) {
      out.push(s);
      continue;
    }
    const dense = densify(s.points, Math.max(r / 2, 0.5));
    if (!dense.some((p) => Math.hypot(p.x - c.x, p.y - c.y) <= r)) { out.push(s); continue; }
    let piece: InkPoint[] = [];
    let first = true;
    const flush = () => {
      if (piece.length >= 2) {
        out.push({ ...s, id: first ? s.id : newId('stroke'), points: piece, bounds: boundsOfPoints(piece) });
        first = false;
      }
      piece = [];
    };
    for (const p of dense) {
      if (Math.hypot(p.x - c.x, p.y - c.y) <= r) flush();
      else piece.push(p);
    }
    flush();
  }
  return out;
}
