// デモ（お手本パック）の作業先に備えるユースケースの読み出し（FR-180）と、ストーリー（FR-177・FR-179）が使う解決策と KPI/OKR の結び付き。
// 値は顧客パックのデータだけから作り、足りない値を補わない（FR-179）。端末内で完結し、AI にも外部にも接続しない。
// デモの値は読み込み専用で、実際の Project の保存（store/usecases.ts）には書き込まない（FR-138）。
import type { UseCase } from './model';

/** ペルソナごとに備えるユースケースの下限（PARAM-060） */
export const MIN_USECASES_PER_PERSONA = 2;
export const DEMO_PERSONAS = ['経営層', '事業部門', 'IT', '現場'] as const;
export type DemoPersona = (typeof DEMO_PERSONAS)[number];

/** 顧客パックの customer.json のうち、この module が読む部分（schema/files.ts の CustomerSchema の一部） */
export interface DemoCustomerLike {
  okr?: { objectives: ReadonlyArray<{ objective: string; keyResults: ReadonlyArray<{ name: string; solutionIds?: readonly string[]; kpi: { name: string; unit: string; baseline: number; current: number; target: number } }> }> };
  useCases?: ReadonlyArray<{ id: string; name: string; summary: string; persona: string; steps: ReadonlyArray<{ title: string; description?: string }>; effect: string; solutionId: string; kpiNames: readonly string[] }>;
  fictionalNote?: string;
}
export interface SolutionLike { id: string; title: string }

/** 画面・ストーリー用のデモのユースケース。通常のユースケースに、結び付く解決策と KPI の名前を足したもの */
export interface DemoUseCase extends UseCase {
  solutionId: string;
  /** 結び付く解決策の名称（パックに解決策がなければ undefined。補わない） */
  solutionTitle?: string;
  kpiNames: string[];
}

/** パックのユースケースを、読み込み専用の一覧にする。パックにない場合は空 */
export function demoUseCases(customer: DemoCustomerLike | undefined, solutions: readonly SolutionLike[] | undefined): DemoUseCase[] {
  return (customer?.useCases ?? []).map((u) => {
    const title = solutions?.find((s) => s.id === u.solutionId)?.title;
    return {
      id: u.id, name: u.name, summary: u.summary, persona: u.persona, effect: u.effect,
      steps: u.steps.map((s) => ({ title: s.title, description: s.description ?? '' })),
      solutionId: u.solutionId, ...(title ? { solutionTitle: title } : {}), kpiNames: [...u.kpiNames],
    };
  });
}

/** ペルソナごとの件数 */
export function countByPersona(items: readonly { persona: string }[]): Record<DemoPersona, number> {
  const out: Record<DemoPersona, number> = { 経営層: 0, 事業部門: 0, IT: 0, 現場: 0 };
  for (const u of items) if ((DEMO_PERSONAS as readonly string[]).includes(u.persona)) out[u.persona as DemoPersona]++;
  return out;
}

/** 下限（PARAM-060）に満たないペルソナ。空なら十分 */
export function personasBelowMinimum(items: readonly { persona: string }[], min = MIN_USECASES_PER_PERSONA): DemoPersona[] {
  const c = countByPersona(items);
  return DEMO_PERSONAS.filter((p) => c[p] < min);
}

export interface SolutionKpi { objective: string; keyResult: string; kpi: string; unit: string; baseline: number; current: number; target: number }

/** 解決策に結び付く KPI/OKR（Key Result の solutionIds が参照するもの）。ない場合は空（ストーリーは「データなし」と示す。FR-179） */
export function kpisForSolution(customer: DemoCustomerLike | undefined, solutionId: string): SolutionKpi[] {
  const out: SolutionKpi[] = [];
  for (const o of customer?.okr?.objectives ?? []) {
    for (const kr of o.keyResults) {
      if (kr.solutionIds?.includes(solutionId)) out.push({ objective: o.objective, keyResult: kr.name, kpi: kr.kpi.name, unit: kr.kpi.unit, baseline: kr.kpi.baseline, current: kr.kpi.current, target: kr.kpi.target });
    }
  }
  return out;
}

/** 解決策に結び付くユースケース */
export function useCasesForSolution<T extends { solutionId: string }>(items: readonly T[], solutionId: string): T[] {
  return items.filter((u) => u.solutionId === solutionId);
}
