// フリーハンドの図形の整形（FR-089）。点列が直線・矩形・円（楕円）に近いかを判定する純粋なロジック。
// どれにも近くなければ null を返し、呼び出し側はフリーハンドのまま残す。
export interface RecognizedShape {
  kind: 'line' | 'rect' | 'ellipse';
  /** line は始点と終点。rect / ellipse は外接矩形の対角の 2 点 */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type P = { x: number; y: number };

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(pts: ReadonlyArray<P>): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1]!, pts[i]!);
  return l;
}

/** 弧長で等間隔に n 点へ取り直す（描いた速さの偏りを消す）。 */
function resample(pts: ReadonlyArray<P>, n: number): P[] {
  const total = pathLength(pts);
  if (total === 0) return [];
  const step = total / (n - 1);
  const out: P[] = [pts[0]!];
  let acc = 0;
  let prev = pts[0]!;
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i]!;
    let d = dist(prev, cur);
    while (d > 0 && acc + d >= step) {
      const t = (step - acc) / d;
      prev = { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t };
      out.push(prev);
      d = dist(prev, cur);
      acc = 0;
    }
    acc += d;
    prev = cur;
  }
  while (out.length < n) out.push(pts[pts.length - 1]!);
  return out.slice(0, n);
}

export interface RecognizeOptions {
  /** 直線とみなす、弦の長さに対する最大のずれの割合 */
  lineTolerance?: number;
  /** 矩形・楕円とみなす、平均の誤差（外接矩形の半幅に対する割合） */
  fitTolerance?: number;
  /** 認識の対象にする最小の大きさ（ワールド座標の単位） */
  minSize?: number;
}

export function recognizeShape(points: ReadonlyArray<P>, opts: RecognizeOptions = {}): RecognizedShape | null {
  const lineTol = opts.lineTolerance ?? 0.08;
  const fitTol = opts.fitTolerance ?? 0.09;
  const minSize = opts.minSize ?? 12;
  if (points.length < 3) return null;

  const first = points[0]!, last = points[points.length - 1]!;
  const len = pathLength(points);
  const chord = dist(first, last);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX, h = maxY - minY;
  if (Math.hypot(w, h) < minSize || len === 0) return null;

  // 直線: 始点と終点を結ぶ線からのずれが小さい
  if (chord > 0 && chord / len > 0.85) {
    let maxDev = 0;
    for (const p of points) {
      const dev = Math.abs((last.x - first.x) * (first.y - p.y) - (first.x - p.x) * (last.y - first.y)) / chord;
      if (dev > maxDev) maxDev = dev;
    }
    if (maxDev / chord <= lineTol) return { kind: 'line', x1: first.x, y1: first.y, x2: last.x, y2: last.y };
    return null;
  }

  // 閉じた図形: 始点と終点がほぼ重なる
  if (chord > len * 0.3) return null;
  if (Math.min(w, h) < Math.max(w, h) * 0.15) return null; // 細すぎる（つぶれた輪）

  const a = w / 2, b = h / 2, cx = minX + a, cy = minY + b;
  const samples = resample(points, 96);
  if (samples.length === 0) return null;
  let ellipseErr = 0, rectErr = 0;
  for (const p of samples) {
    const u = (p.x - cx) / a, v = (p.y - cy) / b;
    ellipseErr += Math.abs(Math.hypot(u, v) - 1);
    rectErr += Math.min(Math.abs(1 - Math.abs(u)), Math.abs(1 - Math.abs(v)));
  }
  ellipseErr /= samples.length;
  rectErr /= samples.length;

  const box = { x1: minX, y1: minY, x2: maxX, y2: maxY };
  if (ellipseErr <= fitTol && ellipseErr < rectErr) return { kind: 'ellipse', ...box };
  if (rectErr <= fitTol && rectErr < ellipseErr) return { kind: 'rect', ...box };
  return null;
}
