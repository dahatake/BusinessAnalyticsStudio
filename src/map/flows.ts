// 流れの量と粒子（FR-021）。時間軸（0〜23 時）に応じて、流れの量・粒子の数・粒子の位置が決まる。three に依存しない純粋な関数。
export const HOURS = 24;

export interface FlowDef {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: string;
  /** 1 時間あたりの最大の量（unit） */
  volume: number;
  unit: string;
  /** 最も多い時刻（0〜23） */
  peakHour: number;
}

/** パックの flows（任意の形）から、描画できる流れの定義を作る。必要な項目がないものは捨てる。 */
export function toFlowDefs(raw: ReadonlyArray<Record<string, unknown>> | undefined): FlowDef[] {
  const out: FlowDef[] = [];
  raw?.forEach((f, i) => {
    if (typeof f.id !== 'string' || typeof f.from !== 'string' || typeof f.to !== 'string') return;
    out.push({
      id: f.id,
      from: f.from,
      to: f.to,
      label: typeof f.label === 'string' ? f.label : f.id,
      kind: typeof f.kind === 'string' ? f.kind : 'data',
      volume: typeof f.volume === 'number' && Number.isFinite(f.volume) && f.volume >= 0 ? f.volume : 100,
      unit: typeof f.unit === 'string' ? f.unit : '',
      peakHour: typeof f.peakHour === 'number' && Number.isFinite(f.peakHour) ? ((f.peakHour % HOURS) + HOURS) % HOURS : (i * 5 + 9) % HOURS,
    });
  });
  return out;
}

/** 時刻 hour の、最大に対する量の割合（0.08〜1）。peakHour を頂点とする山形（1 日で周回し、24 時と 0 時はつながる）。 */
export function intensity(hour: number, peakHour: number): number {
  const raw = Math.abs(((hour - peakHour) % HOURS + HOURS) % HOURS);
  const d = Math.min(raw, HOURS - raw); // 0..12
  const bump = Math.exp(-(d * d) / (2 * 3.5 * 3.5));
  return 0.08 + 0.92 * bump;
}

/** 時刻 hour の流れの量（unit）。整数に丸める */
export function flowRate(f: FlowDef, hour: number): number {
  return Math.round(f.volume * intensity(hour, f.peakHour));
}

/** 時刻 hour に描く粒子の数。最大の流れで maxPerFlow、ほかは量に応じて減らす。 */
export function particleCount(f: FlowDef, hour: number, maxPerFlow: number, maxVolume: number): number {
  const share = maxVolume > 0 ? 0.25 + 0.75 * (f.volume / maxVolume) : 1;
  return Math.max(1, Math.round(maxPerFlow * share * intensity(hour, f.peakHour)));
}

/**
 * 粒子 i の、弧の上の位置（0..1）。時刻（hour）で決まる位相に、アニメーションの経過時間（animT。再生中だけ進む）を足す。
 * 停止中は animT が止まるので、同じ時刻なら同じ位置（静止した表示）になる。
 */
export function particleU(i: number, hour: number, animT: number): number {
  const phase = i * 0.6180339887 + (hour / HOURS) * 3.7 + animT * 0.12;
  return phase - Math.floor(phase);
}

/** 流れの種類ごとの色（粒子・弧）。業種プリセットに依らず、種類が見分けられる固定の色 */
export const FLOW_COLORS: Record<string, string> = {
  data: '#4cc9f0',
  goods: '#ffb454',
  money: '#8ce99a',
};
export const flowColor = (kind: string): string => FLOW_COLORS[kind] ?? '#c4b5fd';
