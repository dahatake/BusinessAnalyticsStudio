// 優先順位分析のスコア計算（FR-039）。画面・ストアを参照しない純粋なモジュール。
// 重み付きスコアは「Σ（重み × 評価値）」。評価値は 1〜5。AI の提案値と顧客の決定値は別の値として持つ（AC-048）。
import type { Issue } from './model';
import { tr } from '../i18n';

/** 評価の観点。axis は 2×2 マトリクスでの軸（y=インパクト側、x=実現性側、size=バブルの大きさに使うコスト） */
export const CRITERIA = [
  { key: 'impact', get label() { return tr('インパクト'); }, axis: 'y' },
  { key: 'roi', label: 'ROI', axis: 'y' },
  { key: 'feasibility', get label() { return tr('実現性'); }, axis: 'x' },
  { key: 'risk', get label() { return tr('リスク低減'); }, axis: 'x' },
  { key: 'costEff', get label() { return tr('コスト効率'); }, axis: 'size' },
] as const;
export type CriterionKey = (typeof CRITERIA)[number]['key'];
export const CRITERION_KEYS: readonly CriterionKey[] = CRITERIA.map((c) => c.key);
export const CRITERION_LABEL: Record<CriterionKey, string> = {
  get impact() { return tr('インパクト'); },
  roi: 'ROI',
  get feasibility() { return tr('実現性'); },
  get risk() { return tr('リスク低減'); },
  get costEff() { return tr('コスト効率'); },
};

export type Weights = Record<CriterionKey, number>;
export const WEIGHT_MIN = 0;
export const WEIGHT_MAX = 10;
/** AI が提案する重みの初期値。利用者が変えた値は「顧客決定」として区別する */
export const AI_WEIGHTS: Readonly<Weights> = { impact: 3, roi: 3, feasibility: 3, risk: 2, costEff: 2 };

export type WeightParse = { ok: true; value: number } | { ok: false; reason: string };

/** 重みの入力を検証する（0〜10 の整数）。範囲外や数値でない入力は反映せず、原因を返す。 */
export function parseWeight(input: string | number): WeightParse {
  const text = typeof input === 'number' ? String(input) : input.trim();
  if (text === '') return { ok: false, reason: tr('重みを入力してください（0〜10 の整数）。') };
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { ok: false, reason: tr('「{text}」は数値ではありません。0〜10 の整数を入力してください。', { text }) };
  const n = Number(text);
  if (!Number.isInteger(n)) return { ok: false, reason: tr('{text} は整数ではありません。0〜10 の整数を入力してください。', { text }) };
  if (n < WEIGHT_MIN || n > WEIGHT_MAX) return { ok: false, reason: tr('{text} は範囲外です。重みは {min}〜{max} の整数です。', { text, min: WEIGHT_MIN, max: WEIGHT_MAX }) };
  return { ok: true, value: n };
}

export type ScoreOrigin = 'ai' | 'customer';

export interface CriterionValue {
  /** 採用する値（顧客の決定値があればそれ、なければ AI の提案値） */
  value: number;
  /** AI の提案値（決定値があっても残す） */
  ai: number;
  /** 顧客の決定値。なければ undefined */
  decided?: number;
  origin: ScoreOrigin;
  /** この値の出典（評価属性の出典の ID） */
  sourceIds: string[];
}

export interface PriorityRow {
  id: string;
  title: string;
  values: Record<CriterionKey, CriterionValue>;
  /** コスト（万円）。なければ undefined */
  cost?: number;
  /** 重み付きスコア Σ（重み × 評価値） */
  score: number;
  /** 順位（1 が最上位） */
  rank: number;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round1 = (n: number): number => Math.round(n * 10) / 10;

function numberOf(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = /-?\d+(\.\d+)?/.exec(v.replace(/,/g, ''));
    if (m) return Number(m[0]);
  }
  return undefined;
}

/** 「高」「中」「低」で始まる評価の文を 5・3・1 にする（実現性）。リスクは逆（低いほど高評価）。 */
function level(text: unknown, invert: boolean): number {
  const t = typeof text === 'string' ? text.trim() : '';
  const hi = invert ? 1 : 5;
  const lo = invert ? 5 : 1;
  if (t.startsWith('高')) return hi;
  if (t.startsWith('低')) return lo;
  if (t.startsWith('中')) return 3;
  const n = numberOf(text);
  return n === undefined ? 3 : clamp(Math.round(n), 1, 5);
}

const bucket = (v: number | undefined, edges: readonly number[], fallback: number): number => {
  if (v === undefined) return fallback;
  // edges は 5・4・3・2 の下限（降順）。それ未満は 1
  const i = edges.findIndex((e) => v >= e);
  return i < 0 ? 1 : 5 - i;
};

/** 評価属性（優先順位・コスト・ROI・実現性・リスク）から、AI の提案値（1〜5）を導く。 */
export function deriveAiScores(issues: readonly Issue[]): Map<string, Record<CriterionKey, number>> {
  const ranks = issues.map((i) => numberOf(i.evaluation?.priority?.value)).filter((r): r is number => r !== undefined);
  const maxRank = ranks.length > 0 ? Math.max(...ranks) : 1;
  const out = new Map<string, Record<CriterionKey, number>>();
  for (const issue of issues) {
    const ev = issue.evaluation;
    const rank = numberOf(ev?.priority?.value);
    const impact = rank === undefined ? 3 : maxRank <= 1 ? 5 : clamp(Math.round(5 - ((rank - 1) * 4) / (maxRank - 1)), 1, 5);
    out.set(issue.id, {
      impact,
      roi: bucket(numberOf(ev?.roi?.value), [150, 120, 90, 60], 3),
      feasibility: level(ev?.feasibility?.value, false),
      risk: level(ev?.risk?.value, true),
      // コストは小さいほど高評価（万円）
      costEff: (() => {
        const c = numberOf(ev?.cost?.value);
        if (c === undefined) return 3;
        return c <= 300 ? 5 : c <= 600 ? 4 : c <= 1000 ? 3 : c <= 1500 ? 2 : 1;
      })(),
    });
  }
  return out;
}

const SOURCE_OF: Record<CriterionKey, 'priority' | 'roi' | 'feasibility' | 'risk' | 'cost'> = {
  impact: 'priority', roi: 'roi', feasibility: 'feasibility', risk: 'risk', costEff: 'cost',
};

/** Σ（重み × 評価値）。 */
export function weightedScore(values: Record<CriterionKey, { value: number }>, weights: Weights): number {
  let sum = 0;
  for (const k of CRITERION_KEYS) sum += weights[k] * values[k].value;
  return sum;
}

/** 課題ごとの評価値とスコアを作り、スコアの高い順（同点は入力順）に並べる。 */
export function buildPriorityRows(issues: readonly Issue[], weights: Weights): PriorityRow[] {
  const ai = deriveAiScores(issues);
  const rows = issues.map((issue, index) => {
    const derived = ai.get(issue.id) as Record<CriterionKey, number>;
    const stored = issue.evaluation?.scores ?? {};
    const values = {} as Record<CriterionKey, CriterionValue>;
    for (const k of CRITERION_KEYS) {
      const s = stored[k];
      const aiValue = s?.ai ?? derived[k];
      const decided = s?.decided;
      values[k] = {
        value: decided ?? aiValue,
        ai: aiValue,
        ...(decided !== undefined ? { decided } : {}),
        origin: decided !== undefined ? 'customer' : 'ai',
        sourceIds: [...(issue.evaluation?.[SOURCE_OF[k]]?.sourceIds ?? s?.sourceIds ?? issue.sourceIds ?? [])],
      };
    }
    const cost = numberOf(issue.evaluation?.cost?.value);
    return { id: issue.id, title: issue.title, values, ...(cost !== undefined ? { cost } : {}), score: round1(weightedScore(values, weights)), rank: 0, index };
  });
  rows.sort((a, b) => b.score - a.score || a.index - b.index);
  return rows.map(({ index: _i, ...r }, i) => ({ ...r, rank: i + 1 }));
}

/** 2×2 マトリクスの軸の値（1〜5）。その軸に属する観点の重み付き平均。重みがすべて 0 のときは単純平均。 */
export function axisValue(row: Pick<PriorityRow, 'values'>, axis: 'x' | 'y', weights: Weights): number {
  const keys = CRITERIA.filter((c) => c.axis === axis).map((c) => c.key);
  const total = keys.reduce((a, k) => a + weights[k], 0);
  if (total <= 0) return keys.reduce((a, k) => a + row.values[k].value, 0) / keys.length;
  return keys.reduce((a, k) => a + weights[k] * row.values[k].value, 0) / total;
}

export interface MatrixPoint {
  id: string;
  title: string;
  /** 実現性側の軸（1〜5） */
  x: number;
  /** インパクト側の軸（1〜5） */
  y: number;
  /** バブルの大きさ（コスト、万円）。不明なら 0 */
  cost: number;
  quadrant: Quadrant;
}

export type Quadrant = 'now' | 'plan' | 'quick' | 'hold';
export const QUADRANT_LABEL: Record<Quadrant, string> = {
  get now() { return tr('今すぐ実行（高インパクト・高実現性）'); },
  get plan() { return tr('計画して実行（高インパクト・低実現性）'); },
  get quick() { return tr('手早く実行（低インパクト・高実現性）'); },
  get hold() { return tr('保留（低インパクト・低実現性）'); },
};

export function quadrantOf(x: number, y: number): Quadrant {
  return y >= 3 ? (x >= 3 ? 'now' : 'plan') : x >= 3 ? 'quick' : 'hold';
}

export function buildMatrixPoints(rows: readonly PriorityRow[], weights: Weights): MatrixPoint[] {
  return rows.map((r) => {
    const x = axisValue(r, 'x', weights);
    const y = axisValue(r, 'y', weights);
    return { id: r.id, title: r.title, x, y, cost: r.cost ?? 0, quadrant: quadrantOf(x, y) };
  });
}

export interface RankChange { id: string; title: string; from: number; to: number }
export interface SensitivityRow {
  criterion: CriterionKey;
  /** 重みの増減（+1 / -1） */
  delta: 1 | -1;
  /** 増減したあとの重み。範囲の端で動かせないときは元の重み */
  weight: number;
  changes: RankChange[];
  /** 1 位が入れ替わるか */
  topChanged: boolean;
}

/** 感度分析: 各重みを ±1 したときの順位の変化。範囲の端で動かせない方向は変化なしとして返す（AC-048）。 */
export function sensitivity(issues: readonly Issue[], weights: Weights): SensitivityRow[] {
  const base = buildPriorityRows(issues, weights);
  const baseRank = new Map(base.map((r) => [r.id, r.rank]));
  const out: SensitivityRow[] = [];
  for (const criterion of CRITERION_KEYS) {
    for (const delta of [-1, 1] as const) {
      const w = clamp(weights[criterion] + delta, WEIGHT_MIN, WEIGHT_MAX);
      if (w === weights[criterion]) { out.push({ criterion, delta, weight: w, changes: [], topChanged: false }); continue; }
      const next = buildPriorityRows(issues, { ...weights, [criterion]: w });
      const changes = next
        .filter((r) => baseRank.get(r.id) !== r.rank)
        .map((r) => ({ id: r.id, title: r.title, from: baseRank.get(r.id) as number, to: r.rank }));
      out.push({ criterion, delta, weight: w, changes, topChanged: base[0]?.id !== next[0]?.id });
    }
  }
  return out;
}
