// 「現状の説明」の利用量と課金の安全策の判定（FR-276）。純粋な関数だけ。端末内に残すのは日付・回数・トークン数・概算費用だけで、
// 入力の文章・生成結果・キーは持たない（AC-711）。「1 日」は端末のローカルの暦日、月の予算は端末の暦月。
import type { ExplainLimits } from './params';

export interface UsageState {
  /** 回数を数えている暦日（YYYY-MM-DD。端末のローカル） */
  day: string;
  /** 当日の呼び出しの回数（失敗も数える） */
  count: number;
  /** 費用を数えている暦月（YYYY-MM） */
  month: string;
  inputTokens: number;
  outputTokens: number;
  /** 今月の概算費用（円） */
  costYen: number;
}

const p2 = (n: number): string => String(n).padStart(2, '0');
export const localDay = (d: Date): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const localMonth = (d: Date): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;

export function emptyUsage(now: Date): UsageState {
  return { day: localDay(now), count: 0, month: localMonth(now), inputTokens: 0, outputTokens: 0, costYen: 0 };
}

/** 日付が替われば回数を、月が替われば費用をリセットする（端末のローカルの 0 時） */
export function rollover(s: UsageState, now: Date): UsageState {
  let r = s;
  if (r.day !== localDay(now)) r = { ...r, day: localDay(now), count: 0 };
  if (r.month !== localMonth(now)) r = { ...r, month: localMonth(now), inputTokens: 0, outputTokens: 0, costYen: 0 };
  return r;
}

/** 入力トークンの概算（文字数 ÷ 4 を切り上げ） */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export function estimateCostYen(inputTokens: number, outputTokens: number, l: ExplainLimits): number {
  return (inputTokens / 1_000_000) * l.unitYenPerMInput + (outputTokens / 1_000_000) * l.unitYenPerMOutput;
}

/** 呼び出しの開始時に数える（失敗した呼び出しも数える安全側。出力は上限で数える） */
export function recordCall(s: UsageState, inputTokens: number, l: ExplainLimits, now: Date, provider: 'foundry' | 'copilot' = 'foundry'): UsageState {
  const r = rollover(s, now);
  const out = l.outputMaxTokens;
  return {
    ...r,
    count: r.count + 1,
    inputTokens: r.inputTokens + inputTokens,
    outputTokens: r.outputTokens + out,
    costYen: r.costYen + (provider === 'foundry' ? estimateCostYen(inputTokens, out, l) : 0),
  };
}

export type BudgetLevel = 'ok' | 'warn' | 'stop';
export function budgetLevel(s: UsageState, l: ExplainLimits): BudgetLevel {
  const ratio = l.budgetYen > 0 ? (s.costYen / l.budgetYen) * 100 : 100;
  if (ratio >= l.stopPercent) return 'stop';
  if (ratio >= l.warnPercent) return 'warn';
  return 'ok';
}

export const nextMidnight = (now: Date): Date => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
export const nextMonthStart = (now: Date): Date => new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);

export const formatAt = (d: Date): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;

export type GateResult =
  | { ok: true }
  | { ok: false; kind: 'daily-limit'; resumeAt: Date }
  | { ok: false; kind: 'budget'; resumeAt: Date };

/** 回数と予算の判定（呼び出しの前）。間隔と二重の呼び出しは intervalWait で判定する */
export function gate(s: UsageState, l: ExplainLimits, now: Date, provider: 'foundry' | 'copilot' = 'foundry'): GateResult {
  const r = rollover(s, now);
  if (r.count >= l.dailyLimit) return { ok: false, kind: 'daily-limit', resumeAt: nextMidnight(now) };
  if (provider === 'foundry' && budgetLevel(r, l) === 'stop') return { ok: false, kind: 'budget', resumeAt: nextMonthStart(now) };
  return { ok: true };
}

/** 前回の呼び出しの開始から最小の間隔に満たないときの待ち時間（秒。切り上げ）。満たしていれば 0 */
export function intervalWait(lastStartMs: number | null, nowMs: number, l: ExplainLimits): number {
  if (lastStartMs === null) return 0;
  const left = l.minIntervalSec * 1000 - (nowMs - lastStartMs);
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** 設定の変更が「上げる変更」か（上限・予算・割合・大きさを上げる。確認を求める。FR-276） */
export function isRaise(prev: ExplainLimits, next: ExplainLimits): boolean {
  return next.dailyLimit > prev.dailyLimit || next.budgetYen > prev.budgetYen || next.stopPercent > prev.stopPercent
    || next.warnPercent > prev.warnPercent || next.inputMaxTokens > prev.inputMaxTokens || next.outputMaxTokens > prev.outputMaxTokens;
}
