// 階層の LOD（段階的な表示）の計算。FR-030 / FR-031 / FR-032 / FR-033
// 純粋な関数だけで書く（React・three・ストアに依存しない）。同じ入力なら同じ結果になる。
//   - レベルのしきい値: パックの levels（FR-030）か、階層の深さからの既定値。ホーム（全体を見渡す視点）の距離に対する倍率で持つ
//   - 表示と非表示は、しきい値に幅（ヒステリシス）を持たせて切り替える（FR-032。幅は PARAM-023）
//   - 不透明度は、時間をかけて 0↔1 へ動かし、急に切り替わるポッピングを起こさない（FR-031）。停止中（instant）は即座
//   - パンくずリストは、カメラの注視点がある項目から、表示中の階層までの親子の列（FR-033）
import type { HierarchyLevel } from '../schema/files';
import { homePose } from './cameraRig';
import type { TwinLayout, TwinObject, Vec3 } from './entityLayout';

/** LOD のヒステリシスの幅（しきい値に対する割合）。PARAM-023（要求定義書 §パラメータ）の値 10% */
export const HYSTERESIS_RATIO = 0.1;
/** 不透明度が 0 から 1（または逆）へ動くのにかける時間（秒）。見た目の定数 */
export const FADE_SECONDS = 0.4;
/** 上位の台が、下位が現れるときに薄くなる割合（下位が完全に現れたとき、台の不透明度は 1 - この値） */
export const PLATE_DISSOLVE = 0.4;

export interface LodLevelSpec {
  /** 階層の深さ（最上位が 0） */
  depth: number;
  /** ホームの距離に対する倍率（カメラ距離がこの倍率×ホームの距離より近いとき、このレベルを表示する） */
  ratio: number;
  /** カメラ距離のしきい値（ratio × ホームの距離） */
  threshold: number;
  /** パックのメタデータ（FR-030）。なければ undefined */
  meta?: HierarchyLevel;
}

export interface LevelState { visible: boolean; opacity: number }

export const maxDepthOf = (layout: TwinLayout): number => layout.objects.reduce((m, o) => Math.max(m, o.depth), 0);

/**
 * 既定の倍率（パックに levels がないレベル）。最上位は常に表示する。
 * ホームでは、いちばん下の階層を除いて表示する（階層が 1 つしかなければすべて表示）。下の階層ほどカメラが近づいたときに現れる。
 */
export function defaultRatio(depth: number, maxDepth: number): number {
  if (depth <= 0) return Number.POSITIVE_INFINITY;
  const s = Math.max(maxDepth - 1, 1);
  return 1.15 * Math.pow(0.7, depth - s);
}

/** ホーム（全体を見渡す視点）の、注視点からカメラまでの距離 */
export function homeDistance(layout: TwinLayout, aspect: number): number {
  const p = homePose(layout, aspect);
  return Math.hypot(p.position[0] - p.target[0], p.position[1] - p.target[1], p.position[2] - p.target[2]);
}

/** 深さ 0〜最下位の各レベルのしきい値。パックの levels にあればそれを、なければ既定値を使う（FR-030）。 */
export function resolveLevels(layout: TwinLayout, aspect: number, packLevels?: readonly HierarchyLevel[] | null): LodLevelSpec[] {
  const maxDepth = maxDepthOf(layout);
  const home = homeDistance(layout, aspect);
  const out: LodLevelSpec[] = [];
  for (let depth = 0; depth <= maxDepth; depth++) {
    const meta = packLevels?.find((l) => l.depth === depth);
    const ratio = meta ? meta.lodThreshold : defaultRatio(depth, maxDepth);
    out.push({ depth, ratio, threshold: ratio * home, ...(meta ? { meta } : {}) });
  }
  return out;
}

/** 表示に切り替わる距離（これより近い）と、非表示に切り替わる距離（これより遠い）。この間では前の状態を保つ。 */
export function hysteresisBand(threshold: number, ratio: number = HYSTERESIS_RATIO): { show: number; hide: number } {
  return { show: threshold * (1 - ratio / 2), hide: threshold * (1 + ratio / 2) };
}

/** ヒステリシスつきの表示状態。show より近ければ表示、hide より遠ければ非表示、その間は前の状態のまま。 */
export function nextVisible(prev: boolean, distance: number, threshold: number, ratio: number = HYSTERESIS_RATIO): boolean {
  const b = hysteresisBand(threshold, ratio);
  if (distance < b.show) return true;
  if (distance > b.hide) return false;
  return prev;
}

/** 最初の状態（履歴がないので、しきい値そのもので決め、不透明度もすぐに合わせる） */
export function initialLevel(distance: number, threshold: number): LevelState {
  const visible = distance < threshold;
  return { visible, opacity: visible ? 1 : 0 };
}

export interface StepOptions {
  /** 前の更新からの秒数 */
  dt: number;
  /** true なら不透明度を即座に目標へ（アニメーション停止中。FR-034） */
  instant?: boolean;
  hysteresis?: number;
  fadeSeconds?: number;
}

/** 1 回の更新。表示状態をヒステリシスで決め、不透明度をその目標（表示=1・非表示=0）へ、時間に比例して動かす。 */
export function stepLevel(prev: LevelState, distance: number, threshold: number, opts: StepOptions): LevelState {
  const visible = nextVisible(prev.visible, distance, threshold, opts.hysteresis);
  const target = visible ? 1 : 0;
  if (opts.instant) return { visible, opacity: target };
  const fade = Math.max(1e-6, opts.fadeSeconds ?? FADE_SECONDS);
  const delta = Math.max(0, opts.dt) / fade;
  const opacity = prev.opacity < target ? Math.min(target, prev.opacity + delta) : Math.max(target, prev.opacity - delta);
  return { visible, opacity };
}

/** 描画する（生成する）レベルか。表示中、またはフェードアウトの途中 */
export const isRendered = (s: LevelState | undefined): boolean => s !== undefined && (s.visible || s.opacity > 0.001);

/** 表示中（フェードアウトの途中を除く）のいちばん深いレベル。1 つもなければ 0 */
export function renderedDepth(levels: readonly LevelState[]): number {
  let d = 0;
  levels.forEach((l, i) => { if (l.visible) d = i; });
  return d;
}

/** 台の不透明度。下位のレベルが現れるほど薄くなる（上位の外装は透過。FR-031） */
export function plateOpacity(childLevelOpacity: number): number {
  return 1 - PLATE_DISSOLVE * Math.min(1, Math.max(0, childLevelOpacity));
}

export const cameraDistance = (position: Vec3, target: Vec3): number =>
  Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]);

// ---- パンくずリスト（FR-033） ----

/** 注視点（水平）から、項目の外形（水平）までの距離。内側なら 0 */
function footprintDistance(o: TwinObject, x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x - o.position[0]) - o.size[0] / 2);
  const dz = Math.max(0, Math.abs(z - o.position[2]) - o.size[2] / 2);
  return Math.hypot(dx, dz);
}

/**
 * 今の視点で「いる」場所の、最上位から順の親子の列。
 *   - 対象は、表示中のレベルまでの項目。ただし子を持つ項目は、その子が表示中のとき（その項目の階層に入っているとき）だけ対象にする
 *   - 注視点の下にある対象のうち、いちばん深いもの。どれにも当たらなければ、いちばん近い最上位の項目
 */
export function focusChain(layout: TwinLayout, target: Vec3, shownDepth: number): TwinObject[] {
  const eligible = layout.objects.filter((o) => o.depth <= shownDepth && (o.childIds.length === 0 || o.depth < shownDepth || o.depth === 0));
  const eps = 1e-6;
  let best: TwinObject | undefined;
  for (const o of eligible) {
    if (footprintDistance(o, target[0], target[2]) > eps) continue;
    if (!best || o.depth > best.depth) best = o;
  }
  if (!best) {
    let bestD = Number.POSITIVE_INFINITY;
    for (const o of eligible) {
      const d = footprintDistance(o, target[0], target[2]);
      if (d < bestD - eps || (Math.abs(d - bestD) <= eps && best !== undefined && o.depth < best.depth)) { best = o; bestD = d; }
    }
  }
  const chain: TwinObject[] = [];
  const seen = new Set<string>();
  for (let cur: TwinObject | undefined = best; cur && !seen.has(cur.entityId); cur = cur.parentId ? layout.byId.get(cur.parentId) : undefined) {
    seen.add(cur.entityId);
    chain.unshift(cur);
  }
  return chain;
}

// ---- ミニマップ（FR-033） ----

export interface MinimapRect { entityId: string; depth: number; x: number; y: number; w: number; h: number }
export interface MinimapModel {
  width: number;
  height: number;
  rects: MinimapRect[];
  /** 現在の表示範囲（地面に投影したカメラの視野）の多角形。ミニマップの座標 */
  viewport: Array<[number, number]>;
  /** ミニマップの座標から世界の水平座標（x, z）へ */
  toWorld: (px: number, py: number) => [number, number];
}

/**
 * 真上から見た配置図と、現在の表示範囲。幅 width（px）で、縦は配置の縦横比に合わせる。
 * 表示範囲は、画面の四隅から出る視線を地面（y=0）に当てた四角形。地平線より上を向く視線は、遠くの点として扱う。
 */
export function minimapModel(
  layout: TwinLayout,
  pose: { position: Vec3; target: Vec3 },
  opts: { aspect: number; fovDeg: number; width?: number; maxDepth?: number },
): MinimapModel {
  const width = opts.width ?? 180;
  const pad = 0.6;
  const minX = layout.min[0] - pad;
  const maxX = layout.max[0] + pad;
  const minZ = layout.min[2] - pad;
  const maxZ = layout.max[2] + pad;
  const sw = Math.max(1e-6, maxX - minX);
  const sd = Math.max(1e-6, maxZ - minZ);
  const k = width / sw;
  const height = Math.max(48, Math.min(width, Math.round(sd * k)));
  const kz = height / sd;
  const px = (x: number): number => (x - minX) * k;
  const py = (z: number): number => (z - minZ) * kz;

  const rects = layout.objects
    .filter((o) => opts.maxDepth === undefined || o.depth <= opts.maxDepth)
    .map((o) => ({ entityId: o.entityId, depth: o.depth, x: px(o.position[0] - o.size[0] / 2), y: py(o.position[2] - o.size[2] / 2), w: o.size[0] * k, h: o.size[2] * kz }));

  // カメラの向きの基底
  const p = pose.position;
  const f = norm3([pose.target[0] - p[0], pose.target[1] - p[1], pose.target[2] - p[2]]);
  let r = cross(f, [0, 1, 0]);
  if (Math.hypot(...r) < 1e-6) r = [1, 0, 0];
  r = norm3(r);
  const u = cross(r, f);
  const t = Math.tan((opts.fovDeg / 2) * (Math.PI / 180));
  const reach = Math.max(sw, sd) * 3;
  const viewport: Array<[number, number]> = ([[-1, 1], [1, 1], [1, -1], [-1, -1]] as const).map(([sx, sy]) => {
    const d: Vec3 = [
      f[0] + r[0] * sx * t * opts.aspect + u[0] * sy * t,
      f[1] + r[1] * sx * t * opts.aspect + u[1] * sy * t,
      f[2] + r[2] * sx * t * opts.aspect + u[2] * sy * t,
    ];
    let s: number;
    if (d[1] < -1e-6) s = Math.min(-p[1] / d[1], reach / Math.max(1e-6, Math.hypot(d[0], d[2])));
    else s = reach / Math.max(1e-6, Math.hypot(d[0], d[2]));
    return [px(p[0] + d[0] * s), py(p[2] + d[2] * s)] as [number, number];
  });
  return { width, height, rects, viewport, toWorld: (qx, qy) => [qx / k + minX, qy / kz + minZ] };
}

function norm3(a: readonly number[]): Vec3 {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1;
  return [a[0]! / l, a[1]! / l, a[2]! / l];
}
function cross(a: readonly number[], b: readonly number[]): Vec3 {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}
