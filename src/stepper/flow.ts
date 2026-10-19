// 業務分析ステップのクリックでの関連コンポーネントの再配置（FR-228。純関数）。
// 対応と大きさの比は [ASSUMPTION] A-65: 関連 = ステップの screens、工程の順 = screens の並び、重要 = ステップの作業画面（screen）。
import { STEPS } from './model';
import type { PxRect } from '../workspace/freeLayout';
import { MIN_COMPONENT_WIDTH } from '../workspace/autosize';

export interface StepRelevance { relevant: boolean; rank: number; importance: 'high' | 'normal' }

/** 関連しないコンポーネントの工程の順の起点（関連するものより必ず後） */
export const IRRELEVANT_RANK_BASE = 100;
/** 並べる間隔（px） */
export const FLOW_GAP = 8;
/** 関連しないコンポーネントの最小の大きさ（幅は最小の幅 PARAM-034 と同じ） */
export const FLOW_MIN_H = 120;
/** 重要なものの幅・高さの比（作業領域に対する）と、そのほかの関連するものの比 */
export const FLOW_HIGH = { w: 0.5, h: 0.5 } as const;
export const FLOW_NORMAL = { w: 0.3, h: 0.4 } as const;

/** そのステップから見たコンポーネントの関連・工程の順・重要度。`order` は関連しないものの並びの基準（画面の登録順など） */
export function stepRelevance(step: number, key: string, order: readonly string[] = []): StepRelevance {
  const def = STEPS[step];
  const at = def ? def.screens.indexOf(key) : -1;
  if (!def || at < 0) {
    const o = order.indexOf(key);
    return { relevant: false, rank: IRRELEVANT_RANK_BASE + (o < 0 ? order.length : o), importance: 'normal' };
  }
  return { relevant: true, rank: at, importance: key === def.screen ? 'high' : 'normal' };
}

export interface FlowInput {
  step: number;
  /** 再配置の対象（ピン止めしたものを含む。現在の見た目の並び） */
  keys: readonly string[];
  bounds: { w: number; h: number };
  /** ピン止めしたものの位置と大きさ（動かさない。避けて並べる） */
  pinned: Readonly<Record<string, PxRect>>;
  /** 手で変えた大きさ（上書きしない） */
  manual: Readonly<Record<string, { w: number; h: number }>>;
}

const overlaps = (a: PxRect, b: PxRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** 関連するものを工程の順に左上から右下へ、関連しないものをその後ろに最小の大きさで並べる。ピン止めしたものは結果に含めない。 */
export function planStepFlow(input: FlowInput): Record<string, PxRect> {
  const { step, bounds: b, pinned, manual } = input;
  const items = input.keys
    .filter((k) => !(k in pinned))
    .map((k, i) => ({ key: k, i, rel: stepRelevance(step, k, input.keys) }))
    .sort((p, q) => p.rel.rank - q.rel.rank || p.i - q.i);
  const obstacles = Object.values(pinned);
  const out: Record<string, PxRect> = {};
  let x = 0;
  let y = 0;
  let rowH = 0;
  const sizeOf = (it: (typeof items)[number]): { w: number; h: number } => {
    const m = manual[it.key];
    if (m) return { w: Math.min(b.w, m.w), h: Math.min(b.h, m.h) };
    if (!it.rel.relevant) return { w: Math.min(b.w, MIN_COMPONENT_WIDTH), h: FLOW_MIN_H };
    const r = it.rel.importance === 'high' ? FLOW_HIGH : FLOW_NORMAL;
    return { w: Math.min(b.w, Math.max(MIN_COMPONENT_WIDTH, b.w * r.w)), h: Math.max(FLOW_MIN_H + 40, b.h * r.h) };
  };
  for (const it of items) {
    const { w, h } = sizeOf(it);
    for (let guard = 0; guard < 200; guard++) {
      if (x > 0 && x + w > b.w + 1) { x = 0; y += rowH + FLOW_GAP; rowH = 0; }
      const hit = obstacles.find((o) => overlaps({ x, y, w, h }, o));
      if (!hit) break;
      x = hit.x + hit.w + FLOW_GAP;
      if (x + w > b.w + 1) { x = 0; y = Math.max(y + FLOW_GAP, hit.y + hit.h + FLOW_GAP); rowH = 0; }
    }
    out[it.key] = { x, y, w, h };
    x += w + FLOW_GAP;
    rowH = Math.max(rowH, h);
  }
  // 縦にはみ出すときは、手で変えていないものの高さと位置を縮めて収める（順と大きさの比は保つ）
  const total = y + rowH;
  if (total > b.h && total > 0) {
    const f = b.h / total;
    for (const [k, r] of Object.entries(out)) {
      out[k] = manual[k] ? { ...r, y: Math.min(r.y * f, Math.max(0, b.h - r.h)) } : { ...r, y: r.y * f, h: Math.max(48, r.h * f) };
    }
  }
  return out;
}
