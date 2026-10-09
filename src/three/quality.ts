// 3D の品質プリセットと、FPS の監視による自動の品質低下。FR-069 / NFR-PERF-002
export const QUALITIES = ['Low', 'Medium', 'High', 'Ultra'] as const;
export type Quality = (typeof QUALITIES)[number];

/** PARAM-027: 品質を自動で下げる FPS のしきい値（fps） */
export const FPS_THRESHOLD = 45;
/** PARAM-028: 品質を自動で下げる判定の継続時間（秒） */
export const FPS_DURATION_SEC = 2;

export interface QualityProfile {
  /** 描画の解像度（devicePixelRatio）の上限 */
  maxDpr: number;
  /** データフローの粒子の数 */
  particles: number;
  shadows: boolean;
  antialias: boolean;
  /** シネマティック表現（FR-067）。品質 Low ではブルームと被写界深度を無効にする */
  bloom: boolean;
  dof: boolean;
}

export const QUALITY_PROFILES: Record<Quality, QualityProfile> = {
  Low: { maxDpr: 0.75, particles: 300, shadows: false, antialias: false, bloom: false, dof: false },
  Medium: { maxDpr: 1, particles: 1200, shadows: false, antialias: true, bloom: true, dof: false },
  High: { maxDpr: 2, particles: 4000, shadows: true, antialias: true, bloom: true, dof: true },
  Ultra: { maxDpr: 3, particles: 9000, shadows: true, antialias: true, bloom: true, dof: true },
};

export function lowerQuality(q: Quality): Quality | null {
  const i = QUALITIES.indexOf(q);
  return i > 0 ? (QUALITIES[i - 1] as Quality) : null;
}

/**
 * FPS の監視。しきい値未満が継続時間続いたら 1 段階だけ下げる。
 * しきい値以上に戻っても自動では上げない（上げるのは利用者の操作だけ）。
 */
export class QualityMonitor {
  private belowSec = 0;
  constructor(
    private readonly threshold: number = FPS_THRESHOLD,
    private readonly durationSec: number = FPS_DURATION_SEC,
  ) {}

  /** fps を dtSec 秒分入力する。下げるべきときだけ、下げた後の品質を返す。 */
  feed(fps: number, dtSec: number, current: Quality): Quality | null {
    if (fps >= this.threshold) {
      this.belowSec = 0;
      return null;
    }
    this.belowSec += dtSec;
    if (this.belowSec + 1e-9 < this.durationSec) return null;
    this.belowSec = 0;
    return lowerQuality(current);
  }

  reset(): void {
    this.belowSec = 0;
  }
}
