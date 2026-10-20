// 意味的ズームの共通モデル（FR-237）。全体 → 要素（D 段）→ 詳細 の D+2 階層を、画面に依存せずに扱う。
// 倍率の連続的な変化の判定は three/lod.ts のヒステリシス（nextVisible）を再利用する。
import { nextVisible } from '../three/lod';

export type ZoomLevelKind = 'overview' | 'element' | 'detail';

export const ZOOM_KIND_LABELS: Record<ZoomLevelKind, string> = { overview: '全体', element: '要素', detail: '詳細' };

/** 要素の段の数 D（1 以上の整数）に直す */
export const normalizeElementDepth = (d: number): number => (Number.isFinite(d) ? Math.max(1, Math.floor(d)) : 1);

/** 階層の数 = D + 2（全体 1 段と詳細 1 段に、要素の段 D を足す） */
export const zoomDepthCount = (d: number): number => normalizeElementDepth(d) + 2;

/** 0..D+1 に収める */
export const clampDepth = (depth: number, d: number): number => Math.min(zoomDepthCount(d) - 1, Math.max(0, Math.trunc(depth) || 0));

/** 階層の番号から種別へ（0=全体、最後=詳細、中間=要素） */
export function kindOfDepth(depth: number, d: number): ZoomLevelKind {
  const k = clampDepth(depth, d);
  return k === 0 ? 'overview' : k === zoomDepthCount(d) - 1 ? 'detail' : 'element';
}

/** ズームイン・アウトの段を 1 つ進める（段は飛ばさない。端では動かない） */
export const stepDepth = (depth: number, dir: 1 | -1, d: number): number => clampDepth(clampDepth(depth, d) + dir, d);
export const canZoomIn = (depth: number, d: number): boolean => clampDepth(depth, d) < zoomDepthCount(d) - 1;
export const canZoomOut = (depth: number): boolean => depth > 0;

/** 倍率のしきい値。階層 k（k>=1）に入る倍率。base から ratio 倍ずつ増える */
export function scaleThresholds(d: number, base = 1.5, ratio = 2): number[] {
  return Array.from({ length: zoomDepthCount(d) - 1 }, (_, i) => base * ratio ** i);
}

/** 倍率から階層を決める。境界付近ではヒステリシスで行き来を防ぐ（prev は直前の階層） */
export function depthOfScale(scale: number, d: number, prev?: number, thresholds: readonly number[] = scaleThresholds(d)): number {
  const dist = 1 / Math.max(scale, 1e-6);
  let depth = 0;
  for (let i = 0; i < thresholds.length; i++) {
    const was = prev !== undefined && prev > i;
    if (!nextVisible(was, dist, 1 / thresholds[i]!)) break;
    depth = i + 1;
  }
  return clampDepth(depth, d);
}

/** 階層に入る倍率（ボタンなどで段を進めたときに、倍率を合わせる） */
export function scaleOfDepth(depth: number, d: number, thresholds: readonly number[] = scaleThresholds(d)): number {
  const k = clampDepth(depth, d);
  return k === 0 ? 1 : (thresholds[k - 1] ?? 1) * 1.2;
}

export interface Crumb { depth: number; label: string; kind: ZoomLevelKind; current: boolean }

/** パンくず（現在地までの道筋）。elementLabels は要素の段ごとの表示名（選んだ要素の名前など） */
export function breadcrumbs(depth: number, d: number, elementLabels: readonly string[] = [], detailLabel?: string): Crumb[] {
  const k = clampDepth(depth, d);
  const out: Crumb[] = [];
  for (let i = 0; i <= k; i++) {
    const kind = kindOfDepth(i, d);
    const base = ZOOM_KIND_LABELS[kind];
    const name = kind === 'element' ? elementLabels[i - 1] : kind === 'detail' ? detailLabel : undefined;
    out.push({ depth: i, kind, label: name ? `${base}: ${name}` : base, current: i === k });
  }
  return out;
}

/** ズームの対象の面に付ける属性（CONTRACT §23）。data-depth は `zoom-level` の要素にも付ける */
export function zoomAttrs(depth: number, d: number): { 'data-zoom-level': ZoomLevelKind; 'data-depth': number; 'data-depth-count': number } {
  return { 'data-zoom-level': kindOfDepth(depth, d), 'data-depth': clampDepth(depth, d), 'data-depth-count': zoomDepthCount(d) };
}
