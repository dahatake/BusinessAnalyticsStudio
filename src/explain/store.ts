// 「現状の説明」の状態（FR-274・FR-276）。利用量と上限は端末内（localStorage）に残す。残すのは日付・回数・トークン数・概算費用・上限の値だけで、
// 入力の文章・生成結果・キーは残さない（AC-711）。パネルの開閉・説明の本文は残さない（保存しない）。
import { create } from 'zustand';
import type { ExplainOutcome } from './run';
import { DEFAULT_LIMITS, type ExplainLimits } from './params';
import type { UsageState } from './usage';
import { useUsageStore, type UsageLimits, type UsageRecord } from '../ai/foundryUsage';

// 利用量・上限は Foundry 共通の記録（src/ai/foundryUsage.ts。チャットと合算。FR-276）を使う。ここでは「現状の説明」の判定用の形に写すだけ。
export function toExplainLimits(l: UsageLimits): ExplainLimits {
  return {
    ...DEFAULT_LIMITS,
    dailyLimit: l.dailyLimit, budgetYen: l.monthlyBudget, warnPercent: l.warnPercent, stopPercent: l.stopPercent,
    unitYenPerMInput: l.priceInPer1k * 1000, unitYenPerMOutput: l.priceOutPer1k * 1000,
  };
}
export function toExplainUsage(r: UsageRecord): UsageState {
  return { day: r.day, count: r.dayCount, month: r.month, inputTokens: r.monthTokensIn, outputTokens: r.monthTokensOut, costYen: r.monthCost };
}
/** 呼び出し 1 回を数えた直後の状態を共通の記録へ戻す（呼び出しの開始時だけ使う） */
export function fromExplainUsage(u: UsageState, prev: UsageRecord): UsageRecord {
  return { ...prev, day: u.day, dayCount: u.count, month: u.month, monthCount: (prev.month === u.month ? prev.monthCount : 0) + 1, monthTokensIn: u.inputTokens, monthTokensOut: u.outputTokens, monthCost: u.costYen };
}
export const explainLimitsNow = (): ExplainLimits => toExplainLimits(useUsageStore.getState().limits);
export const explainUsageNow = (): UsageState => toExplainUsage(useUsageStore.getState().record);
export function setExplainUsage(u: UsageState): void {
  useUsageStore.setState((s) => ({ record: fromExplainUsage(u, s.record) }));
}
/** いま見ている画面（左メニューの選択・コマンド・フォーカスで更新）。保存しない */
interface CurrentScreen { key: string; set: (key: string) => void }
export const useCurrentScreen = create<CurrentScreen>((set) => ({ key: '', set: (key) => set((s) => (s.key === key ? s : { key })) }));

export interface PanelResult {
  /** この説明を作った画面のキー（いまの画面と違えば、前の画面の説明として出さない。AC-702） */
  screenKey: string;
  outcome: ExplainOutcome;
  /** 待ち時間・生成中の案内（呼び出しをしなかった押下のとき） */
  notice?: string;
}
interface PanelStore {
  open: boolean;
  running: boolean;
  result: PanelResult | null;
  setOpen: (open: boolean) => void;
  setRunning: (running: boolean) => void;
  setResult: (r: PanelResult | null) => void;
}
export const useExplainPanel = create<PanelStore>((set) => ({
  open: false,
  running: false,
  result: null,
  setOpen: (open) => set({ open }),
  setRunning: (running) => set({ running }),
  setResult: (result) => set({ result }),
}));


