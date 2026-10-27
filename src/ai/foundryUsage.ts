// Microsoft Foundry の利用量の記録と課金の安全策（FR-276）。チャット（FR-286）の呼び出しも合算して数える。
// 記録は端末内（日付・回数・トークン数・概算費用だけ）。入力の文章・回答・キーは記録しない（NFR-SEC-005・NFR-SEC-006）。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MAX_OUTPUT_TOKENS } from './foundryChat';
import { tr } from '../i18n';

export interface UsageLimits {
  /** PARAM-113: 1 日の回数の上限 */
  dailyLimit: number;
  /** PARAM-117: 月の予算（円） */
  monthlyBudget: number;
  /** PARAM-118: 警告の割合（%） */
  warnPercent: number;
  /** PARAM-119: 停止の割合（%） */
  stopPercent: number;
  /** 単価（円 / 1000 トークン）。利用者が設定画面で確認・変更できる */
  priceInPer1k: number;
  priceOutPer1k: number;
}

export const DEFAULT_LIMITS: UsageLimits = { dailyLimit: 30, monthlyBudget: 100000, warnPercent: 80, stopPercent: 100, priceInPer1k: 0.4, priceOutPer1k: 1.6 };

export interface UsageRecord {
  /** 端末のローカルの暦日 YYYY-MM-DD */
  day: string;
  dayCount: number;
  /** 端末の暦月 YYYY-MM */
  month: string;
  monthCount: number;
  monthTokensIn: number;
  monthTokensOut: number;
  monthCost: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export const emptyRecord = (now: Date): UsageRecord => ({ day: dayKey(now), dayCount: 0, month: monthKey(now), monthCount: 0, monthTokensIn: 0, monthTokensOut: 0, monthCost: 0 });

/** 日付・月が替わっていたら回数・費用をリセットする（0 時・月初） */
export function rollover(r: UsageRecord, now: Date): UsageRecord {
  let out = r;
  if (out.day !== dayKey(now)) out = { ...out, day: dayKey(now), dayCount: 0 };
  if (out.month !== monthKey(now)) out = { ...out, month: monthKey(now), monthCount: 0, monthTokensIn: 0, monthTokensOut: 0, monthCost: 0 };
  return out;
}

export function estimateCost(tokensIn: number, tokensOut: number, l: UsageLimits): number {
  return (tokensIn / 1000) * l.priceInPer1k + (tokensOut / 1000) * l.priceOutPer1k;
}

export type UsageGate = { allowed: true; warning?: string } | { allowed: false; reason: string };

/** 呼ぶ前の判定。1 日の回数の上限・予算の停止に達していたら呼ばない */
export function checkUsage(r0: UsageRecord, l: UsageLimits, now: Date, provider: 'foundry' | 'copilot' = 'foundry'): UsageGate {
  const r = rollover(r0, now);
  if (r.dayCount >= l.dailyLimit) {
    return { allowed: false, reason: tr('1 日の回数の上限（{n} 回）に達したため、Microsoft Foundry へは送信しません。明日 0 時以降に再開します。', { n: l.dailyLimit }) };
  }
  if (provider === 'copilot') return { allowed: true };
  const pct = l.monthlyBudget > 0 ? (r.monthCost / l.monthlyBudget) * 100 : 100;
  if (pct >= l.stopPercent) {
    return { allowed: false, reason: tr('今月の概算費用が予算（{budget} 円）の上限（{stop}%）に達したため、停止しています。設定画面で予算を引き上げるか、月初に再開します。', { budget: l.monthlyBudget, stop: l.stopPercent }) };
  }
  if (pct >= l.warnPercent) return { allowed: true, warning: tr('今月の概算費用が予算の {pct}% に達しています（警告は {warn}%、停止は {stop}%）。', { pct: Math.floor(pct), warn: l.warnPercent, stop: l.stopPercent }) };
  return { allowed: true };
}

/** 1 回の呼び出しを数える（失敗した呼び出しも数える）。出力は上限で数える */
export function addUsage(r0: UsageRecord, l: UsageLimits, now: Date, tokensIn: number, tokensOut: number = MAX_OUTPUT_TOKENS, provider: 'foundry' | 'copilot' = 'foundry'): UsageRecord {
  const r = rollover(r0, now);
  return {
    ...r,
    dayCount: r.dayCount + 1,
    monthCount: r.monthCount + 1,
    monthTokensIn: r.monthTokensIn + tokensIn,
    monthTokensOut: r.monthTokensOut + tokensOut,
    monthCost: r.monthCost + (provider === 'foundry' ? estimateCost(tokensIn, tokensOut, l) : 0),
  };
}

interface UsageState {
  limits: UsageLimits;
  record: UsageRecord;
  setLimits: (l: UsageLimits) => void;
  /** 呼ぶ前の判定 */
  check: (now?: Date, provider?: 'foundry' | 'copilot') => UsageGate;
  /** 呼んだ後に数える */
  count: (tokensIn: number, now?: Date, provider?: 'foundry' | 'copilot', tokensOut?: number) => void;
}

export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      limits: DEFAULT_LIMITS,
      record: emptyRecord(new Date()),
      setLimits: (limits) => set({ limits }),
      check: (now = new Date(), provider) => checkUsage(get().record, get().limits, now, provider),
      count: (tokensIn, now = new Date(), provider, tokensOut = MAX_OUTPUT_TOKENS) => set((s) => ({ record: addUsage(s.record, s.limits, now, tokensIn, tokensOut, provider) })),
    }),
    { name: 'edb.foundryUsage', version: 1, partialize: (s) => ({ limits: s.limits, record: s.record }) },
  ),
);
