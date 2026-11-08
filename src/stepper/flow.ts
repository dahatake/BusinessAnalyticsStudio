// 業務分析ステップのクリックでの関連コンポーネントの再配置（FR-228。純関数）。
// 対応と大きさの比は [ASSUMPTION] A-65: 関連 = ステップの screens、工程の順 = screens の並び、重要 = ステップの作業画面（screen）。
import { STEPS } from './model';
import type { PxRect } from '../workspace/freeLayout';
import { MIN_WINDOW_H, MIN_WINDOW_W, pickOldest } from '../workspace/windowLimits';

export interface StepRelevance { relevant: boolean; rank: number; importance: 'high' | 'normal' }

/** 関連しないコンポーネントの工程の順の起点（関連するものより必ず後） */
export const IRRELEVANT_RANK_BASE = 100;
/** 並べる間隔（px） */
export const FLOW_GAP = 8;
/** 関連しないコンポーネントの最小の大きさ（FR-224 の最小の大きさ＝幅 PARAM-134・高さ PARAM-135。旧 PARAM-085 の 240×120 は廃止。Q-111 A） */
export const FLOW_MIN_H = MIN_WINDOW_H;
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
    if (!it.rel.relevant) return { w: Math.min(b.w, MIN_WINDOW_W), h: FLOW_MIN_H };
    // 重要・通常の大きさが作業領域に対し下限（幅 PARAM-134・高さ PARAM-135）を下回るときは、その下限へ補正する
    const r = it.rel.importance === 'high' ? FLOW_HIGH : FLOW_NORMAL;
    return { w: Math.min(b.w, Math.max(MIN_WINDOW_W, b.w * r.w)), h: Math.max(FLOW_MIN_H, b.h * r.h) };
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
      out[k] = manual[k] ? { ...r, y: Math.min(r.y * f, Math.max(0, b.h - r.h)) } : { ...r, y: r.y * f, h: Math.max(Math.min(FLOW_MIN_H, r.h), r.h * f) };
    }
  }
  return out;
}

/** 領域をはみ出す、または下限で縮めても重なるとき true（収まらない） */
const overflows = (rects: Record<string, PxRect>, bounds: { h: number }): boolean => {
  const rs = Object.values(rects);
  if (rs.some((r) => r.y + r.h > bounds.h + 1)) return true;
  return rs.some((a, i) => rs.some((c, j) => j > i && overlaps(a, c)));
};

/**
 * 下限（幅 PARAM-134・高さ PARAM-135）を保ったまま領域に収まらないときは、縮めず、最も長く使っていない（ピン止め・手で変えた大きさ・重要でないもの優先で、
 * 重要なものは最後）ものを最小化して収める（FR-228・FR-143・FR-296。Q-111 A）。収まるまで 1 つずつ。`minimized` は最小化するキー。
 */
export function planStepFlowFit(input: FlowInput & { usedAt?: Readonly<Record<string, number>> }): { rects: Record<string, PxRect>; minimized: string[] } {
  const minimized: string[] = [];
  let keys = input.keys;
  let rects = planStepFlow({ ...input, keys });
  while (overflows(rects, input.bounds)) {
    const cands = keys.filter((k) => !(k in input.pinned) && !(k in input.manual));
    const rel = (k: string) => stepRelevance(input.step, k, input.keys);
    const low = cands.filter((k) => !rel(k).relevant);
    const mid = cands.filter((k) => rel(k).relevant && rel(k).importance !== 'high');
    const victim = pickOldest(low.length > 0 ? low : mid, input.usedAt ?? {});
    if (victim === undefined) break;
    minimized.push(victim);
    keys = keys.filter((k) => k !== victim);
    rects = planStepFlow({ ...input, keys });
  }
  return { rects, minimized };
}
