// 優先順位分析の重み（FR-039）。重みを変えると、ランキング表・2×2 マトリクス・感度分析・サマリーが同じ状態から再計算される。
// 既定の重みは AI の提案値。利用者が変えた重みは「顧客決定」として区別する。localStorage に保存して再読込で復元する。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AI_WEIGHTS, CRITERION_KEYS, WEIGHT_MAX, WEIGHT_MIN, type CriterionKey, type Weights } from '../analysis/priority';

interface PriorityState {
  weights: Weights;
  /** 重みを設定する。範囲外・整数以外は反映せず false */
  setWeight: (key: CriterionKey, value: number) => boolean;
  reset: () => void;
}

export const usePriorityStore = create<PriorityState>()(
  persist(
    (set, get) => ({
      weights: { ...AI_WEIGHTS },
      setWeight: (key, value) => {
        if (!Number.isInteger(value) || value < WEIGHT_MIN || value > WEIGHT_MAX) return false;
        if (get().weights[key] !== value) set({ weights: { ...get().weights, [key]: value } });
        return true;
      },
      reset: () => set({ weights: { ...AI_WEIGHTS } }),
    }),
    {
      name: 'edb.priority',
      version: 1,
      partialize: (s) => ({ weights: s.weights }),
      merge: (persisted, current) => {
        const w = (persisted as { weights?: Partial<Record<string, unknown>> } | undefined)?.weights ?? {};
        const weights = { ...current.weights };
        for (const k of CRITERION_KEYS) {
          const v = w[k];
          if (typeof v === 'number' && Number.isInteger(v) && v >= WEIGHT_MIN && v <= WEIGHT_MAX) weights[k] = v;
        }
        return { ...current, weights };
      },
    },
  ),
);
