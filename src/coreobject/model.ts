// 中核オブジェクトの候補・比較の観点・選定理由の読み取り（FR-018）。顧客パックの customer.json の coreObject から作る純粋な関数。
import type { PackData } from '../schema';

export interface CoreCandidate {
  id: string;
  /** 表示名（`name`、なければ `label`） */
  name: string;
  summary?: string;
  /** 比較の観点の ID → 評価 */
  scores: Record<string, string>;
}

export interface CoreCriterion { id: string; label: string }

export interface CoreObjectInfo {
  candidates: CoreCandidate[];
  criteria: CoreCriterion[];
  reason: string;
  /** customer.json が指定した選定済みの候補（候補にないときは undefined） */
  defaultId?: string;
}

export function readCoreObject(customer: PackData['customer'] | undefined): CoreObjectInfo {
  const core = customer?.coreObject;
  const candidates: CoreCandidate[] = (core?.candidates ?? []).map((c) => ({
    id: c.id,
    name: c.name ?? c.label,
    summary: c.summary,
    scores: c.scores ?? {},
  }));
  const defaultId = candidates.some((c) => c.id === core?.selectedId) ? core?.selectedId : undefined;
  return { candidates, criteria: core?.criteria ?? [], reason: core?.reason ?? '', defaultId };
}

/** 利用者が選んだ候補（chosen）を優先し、候補にないとき・未選択のときは customer.json の指定、それもなければ先頭の候補。 */
export function resolveSelectedId(info: CoreObjectInfo, chosen: string | null | undefined): string | undefined {
  if (chosen && info.candidates.some((c) => c.id === chosen)) return chosen;
  return info.defaultId ?? info.candidates[0]?.id;
}
