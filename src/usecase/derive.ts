// ユースケース候補の導出（FR-158 AC-289〜AC-293。規則は A-40 ⑤）。課題・解決策（FR-001〜FR-005）から決まった規則で作る純関数。
// AI は使わず、保存もしない（登録で初めて保存される）。
import type { Issue, Product, Solution } from '../analysis/model';
import { MAX_STEPS, type UseCaseDraft, type UseCaseSource } from './model';
import { tr } from '../i18n';

export interface Candidate {
  /** 導出元（解決策 × 課題）。登録済みの導出元参照と同じ形 */
  source: UseCaseSource;
  draft: UseCaseDraft;
  /** 手順を先頭の PARAM-046 件に切り詰めたときの、元の手順の件数（切り詰めなし: undefined） */
  truncatedFrom?: number;
}

export interface Derivation {
  candidates: Candidate[];
  /** 解決策がないため候補に出さなかった課題の件数 */
  issuesWithoutSolution: number;
  /** 候補が 0 件の理由（なければ undefined） */
  emptyReason?: string;
}

export const sourceKey = (s: UseCaseSource): string => `${s.solutionId}\u0000${s.issueId}`;

/** 導出の元がないときの理由の文言（画面でも表示する） */
export const NO_SOURCE_REASON = '導出の元がない（顧客パックがない、または課題・解決策が 0 件）ため、候補はありません。';

/** 候補を導出する。registered に導出元がある候補は含めない（登録済みを上書きも重複もしない。AC-290・AC-291）。 */
export function deriveCandidates(
  issues: readonly Issue[] | undefined,
  solutions: readonly Solution[] | undefined,
  products: readonly Product[] | undefined,
  registered: readonly (UseCaseSource | undefined)[] = [],
): Derivation {
  const is = issues ?? [];
  const ss = solutions ?? [];
  if (is.length === 0 || ss.length === 0) {
    return { candidates: [], issuesWithoutSolution: is.length, emptyReason: tr(NO_SOURCE_REASON) };
  }
  const taken = new Set(registered.filter((r): r is UseCaseSource => !!r).map(sourceKey));
  const issueMap = new Map(is.map((i) => [i.id, i]));
  const productMap = new Map((products ?? []).map((p) => [p.id, p]));
  const covered = new Set<string>();
  const out: Candidate[] = [];
  for (const sol of ss) {
    const ids = [sol.issueId, ...(sol.issueIds ?? [])].filter((x, i, a) => a.indexOf(x) === i);
    for (const issueId of ids) {
      const issue = issueMap.get(issueId);
      if (!issue) continue;
      covered.add(issueId);
      const source = { solutionId: sol.id, issueId };
      if (taken.has(sourceKey(source))) continue;
      const productIds = sol.productIds ?? (sol.productFits ?? []).map((f) => f.productId);
      const all = productIds.map((pid) => ({
        title: productMap.get(pid)?.name ?? pid,
        description: (sol.productFits ?? []).find((f) => f.productId === pid)?.reason ?? '',
      }));
      const steps = all.slice(0, MAX_STEPS);
      out.push({
        source,
        draft: {
          name: sol.title,
          summary: issue.hypothesis?.trim() || issue.title,
          persona: (issue.personas ?? []).join('、'),
          steps,
          effect: (sol.effects ?? []).map((e) => e.title).join('、'),
        },
        ...(all.length > MAX_STEPS ? { truncatedFrom: all.length } : {}),
      });
    }
  }
  const issuesWithoutSolution = is.filter((i) => !covered.has(i.id)).length;
  return { candidates: out, issuesWithoutSolution };
}
