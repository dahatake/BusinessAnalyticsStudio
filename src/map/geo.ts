// 地球儀・平面マップの座標と、流れの弧（FR-021）。three に依存しない純粋な関数。
export type Vec3 = [number, number, number];
export interface LatLng { lat: number; lng: number }

const RAD = Math.PI / 180;

/** 地球儀（半径 r）上の位置。+y が北、経度 0・緯度 0 が +z。 */
export function toGlobe(p: LatLng, r = 1): Vec3 {
  const la = p.lat * RAD;
  const lo = p.lng * RAD;
  return [r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)];
}

/** 平面マップ上の位置（等緯度経度。横 4・縦 2。北が奥＝-z）。 */
export function toFlat(p: LatLng): Vec3 {
  return [p.lng / 90, 0, -p.lat / 90];
}

export type MapMode = 'globe' | 'flat';
export const toMap = (mode: MapMode, p: LatLng, r = 1): Vec3 => (mode === 'globe' ? toGlobe(p, r) : toFlat(p));

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

/** 2 点の角距離（ラジアン） */
export function angularDistance(a: LatLng, b: LatLng): number {
  const u = toGlobe(a);
  const v = toGlobe(b);
  return Math.acos(Math.min(1, Math.max(-1, dot(u, v))));
}

/** 位置の重心（地球儀上の単位ベクトルの平均を、緯度経度に戻す）。1 件もなければ null */
export function centroid(points: readonly LatLng[]): LatLng | null {
  if (points.length === 0) return null;
  let x = 0, y = 0, z = 0;
  for (const p of points) { const v = toGlobe(p); x += v[0]; y += v[1]; z += v[2]; }
  const l = Math.hypot(x, y, z);
  if (l < 1e-9) return { lat: 0, lng: 0 };
  return { lat: Math.asin(y / l) / RAD, lng: Math.atan2(x, z) / RAD };
}

/** 重心から最も遠い点までの角距離（ラジアン） */
export function spread(points: readonly LatLng[]): number {
  const c = centroid(points);
  if (!c) return 0;
  return points.reduce((m, p) => Math.max(m, angularDistance(c, p)), 0);
}

/** 弧の点列。地球儀は大円を球面補間して持ち上げ、平面は放物線状に持ち上げる。 */
export function arcPoints(a: LatLng, b: LatLng, mode: MapMode, segments = 48): Vec3[] {
  const out: Vec3[] = [];
  if (mode === 'globe') {
    const u = toGlobe(a);
    const v = toGlobe(b);
    const omega = Math.acos(Math.min(1, Math.max(-1, dot(u, v))));
    const so = Math.sin(omega);
    const lift = Math.min(0.35, 0.04 + 0.22 * (omega / Math.PI));
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const ka = so < 1e-6 ? 1 - t : Math.sin((1 - t) * omega) / so;
      const kb = so < 1e-6 ? t : Math.sin(t * omega) / so;
      const p: Vec3 = [u[0] * ka + v[0] * kb, u[1] * ka + v[1] * kb, u[2] * ka + v[2] * kb];
      const l = len(p) || 1;
      const r = 1.004 + lift * Math.sin(Math.PI * t);
      out.push([(p[0] / l) * r, (p[1] / l) * r, (p[2] / l) * r]);
    }
  } else {
    const u = toFlat(a);
    const v = toFlat(b);
    const d = Math.hypot(v[0] - u[0], v[2] - u[2]);
    const lift = Math.min(0.6, 0.06 + 0.22 * d);
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      out.push([u[0] + (v[0] - u[0]) * t, 0.01 + lift * Math.sin(Math.PI * t), u[2] + (v[2] - u[2]) * t]);
    }
  }
  return out;
}

/** 弧の上の位置（0..1）。点列を線形補間する。 */
export function pointOnArc(arc: readonly Vec3[], u: number, out: Vec3 = [0, 0, 0]): Vec3 {
  const t = Math.min(1, Math.max(0, u)) * (arc.length - 1);
  const i = Math.min(arc.length - 2, Math.floor(t));
  const k = t - i;
  const a = arc[i] as Vec3;
  const b = arc[i + 1] as Vec3;
  out[0] = a[0] + (b[0] - a[0]) * k;
  out[1] = a[1] + (b[1] - a[1]) * k;
  out[2] = a[2] + (b[2] - a[2]) * k;
  return out;
}

/** 地球儀で、点が手前（カメラ側）の半球にあるか */
export function facesCamera(point: Vec3, camera: Vec3): boolean {
  return dot(point, [camera[0] - point[0], camera[1] - point[1], camera[2] - point[2]]) > 0;
}

/** 緯線・経線（graticule）の線分。地球儀または平面。step は度 */
export function graticule(mode: MapMode, step = 15, segments = 48): Vec3[][] {
  const lines: Vec3[][] = [];
  for (let lat = -75; lat <= 75; lat += step) {
    const l: Vec3[] = [];
    for (let i = 0; i <= segments; i++) l.push(toMap(mode, { lat, lng: -180 + (360 * i) / segments }, 1.002));
    lines.push(l);
  }
  for (let lng = -180; lng < 180; lng += step) {
    const l: Vec3[] = [];
    for (let i = 0; i <= segments; i++) l.push(toMap(mode, { lat: -90 + (180 * i) / segments, lng }, 1.002));
    lines.push(l);
  }
  return lines;
}
