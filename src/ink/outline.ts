// ストロークの輪郭（筆圧で太さが変わる線）。純粋な計算。FR-087（筆圧の値が太さに反映される）
import { widthAt } from './input';
import type { InkPoint } from './model';

export interface Pt { x: number; y: number }

/** 近すぎる点を間引く（輪郭のぎざぎざを防ぐ）。先頭と末尾は残す。 */
export function thin(points: ReadonlyArray<InkPoint>, minDist: number): InkPoint[] {
  if (points.length <= 2) return points.slice();
  const out: InkPoint[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1]!, b = points[i]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) >= minDist) out.push(b);
  }
  out.push(points[points.length - 1]!);
  return out;
}

function circle(c: InkPoint, r: number, n: number): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const a = (Math.PI * 2 * k) / n;
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return out;
}

/** 点列と基本の太さから、塗りつぶす多角形の頂点を返す。太さは各点の筆圧で決まる。 */
export function strokeOutline(points: ReadonlyArray<InkPoint>, size: number): Pt[] {
  const pts = thin(points, Math.max(size * 0.15, 0.25));
  if (pts.length === 0) return [];
  if (pts.length === 1) return circle(pts[0]!, widthAt(size, pts[0]!.p) / 2, 14);
  const left: Pt[] = [], right: Pt[] = [];
  const n = pts.length;
  let firstNormal = 0, lastNormal = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(n - 1, i + 1)]!;
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const nx = -dy, ny = dx;
    const r = widthAt(size, pts[i]!.p) / 2;
    const p = pts[i]!;
    left.push({ x: p.x + nx * r, y: p.y + ny * r });
    right.push({ x: p.x - nx * r, y: p.y - ny * r });
    const ang = Math.atan2(ny, nx);
    if (i === 0) firstNormal = ang;
    if (i === n - 1) lastNormal = ang;
  }
  const out: Pt[] = [...left];
  const end = pts[n - 1]!, start = pts[0]!;
  const rEnd = widthAt(size, end.p) / 2, rStart = widthAt(size, start.p) / 2;
  for (let k = 1; k < 6; k++) {
    const a = lastNormal - (Math.PI * k) / 6;
    out.push({ x: end.x + Math.cos(a) * rEnd, y: end.y + Math.sin(a) * rEnd });
  }
  for (let i = n - 1; i >= 0; i--) out.push(right[i]!);
  for (let k = 1; k < 6; k++) {
    const a = firstNormal + Math.PI - (Math.PI * k) / 6;
    out.push({ x: start.x + Math.cos(a) * rStart, y: start.y + Math.sin(a) * rStart });
  }
  return out;
}
