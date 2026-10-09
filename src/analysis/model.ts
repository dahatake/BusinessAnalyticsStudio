// 課題-解決策分析の純粋なロジック（FR-001〜FR-005）。画面の部品を参照しない。
// 課題の絞り込み（区分）、イシューツリーの行への展開、評価属性・製品の適合の取り出しを行う。
import { EVALUATION_KEYS, type Audience, type EvaluationKey, type PackData } from '../schema';

export type Issue = PackData['issues']['issues'][number];
export type Solution = PackData['issues']['solutions'][number];
export type Product = PackData['products']['products'][number];
export type Source = PackData['sources']['sources'][number];

export type AudienceFilter = 'all' | Audience;

export const AUDIENCE_LABELS: Record<Audience, string> = { internal: '社内向け', external: '社外向け' };

export const EVALUATION_LABELS: Record<EvaluationKey, string> = {
  priority: '優先順位',
  cost: 'コスト',
  roi: 'ROI',
  feasibility: '実現性',
  risk: 'リスク',
};

/** 区分（社内向け／社外向け）で課題を絞り込む（FR-002） */
export function filterIssues(issues: readonly Issue[], filter: AudienceFilter): Issue[] {
  return filter === 'all' ? [...issues] : issues.filter((i) => i.audience === filter);
}

/** 区分で絞り込んだ後に残る課題に属する解決策 */
export function filterSolutions(solutions: readonly Solution[], visibleIssues: readonly Issue[]): Solution[] {
  const ids = new Set(visibleIssues.map((i) => i.id));
  return solutions.filter((s) => ids.has(s.issueId));
}

export interface TreeRow {
  issue: Issue;
  /** 0 から始まる階層（上位課題が 0）。絞り込みで上位が消えたときは、残っている最も近い上位からの深さ */
  level: number;
  hasChildren: boolean;
  expanded: boolean;
}

/**
 * 課題を、上位課題→下位課題の順（深さ優先）に並べた行にする（FR-001）。
 * 折りたたまれた枝の下位は含めない。親が見つからない課題・循環は、上位課題として扱う。
 */
export function buildTreeRows(all: readonly Issue[], visible: readonly Issue[], collapsed: ReadonlySet<string>): TreeRow[] {
  const byId = new Map(all.map((i) => [i.id, i]));
  const visibleIds = new Set(visible.map((i) => i.id));

  const nearestVisibleParent = (issue: Issue): string | null => {
    const seen = new Set<string>([issue.id]);
    let p = issue.parentId ?? null;
    while (p && !seen.has(p)) {
      seen.add(p);
      if (visibleIds.has(p)) return p;
      p = byId.get(p)?.parentId ?? null;
    }
    return null;
  };

  const children = new Map<string | null, Issue[]>();
  for (const issue of visible) {
    const parent = nearestVisibleParent(issue);
    const list = children.get(parent) ?? [];
    list.push(issue);
    children.set(parent, list);
  }

  const rows: TreeRow[] = [];
  const emitted = new Set<string>();
  const emit = (issue: Issue, level: number): void => {
    if (emitted.has(issue.id)) return;
    emitted.add(issue.id);
    const kids = children.get(issue.id) ?? [];
    const expanded = !collapsed.has(issue.id);
    rows.push({ issue, level, hasChildren: kids.length > 0, expanded });
    if (expanded) for (const k of kids) emit(k, level + 1);
  };
  for (const root of children.get(null) ?? []) emit(root, 0);
  return rows;
}

export interface MeceGroup {
  root: Issue;
  /** 根の課題と、その下位のすべての課題（根を先頭に、深さ優先） */
  members: TreeRow[];
}

/** MECE の形: 上位課題ごとに、互いに重ならない群へ分ける（各課題はちょうど 1 つの群に入る） */
export function buildMeceGroups(all: readonly Issue[], visible: readonly Issue[]): MeceGroup[] {
  const rows = buildTreeRows(all, visible, new Set());
  const groups: MeceGroup[] = [];
  for (const row of rows) {
    if (row.level === 0) groups.push({ root: row.issue, members: [row] });
    else groups[groups.length - 1]?.members.push(row);
  }
  return groups;
}

export interface EvaluationItem {
  key: EvaluationKey;
  label: string;
  /** 表示する値（単位つき）。未設定は undefined */
  display?: string;
  sourceIds: string[];
}

/** 課題の評価属性 5 項目（優先順位・コスト・ROI・実現性・リスク）を、表示用に並べる（FR-003） */
export function evaluationItems(issue: Issue): EvaluationItem[] {
  const ev = (issue.evaluation ?? {}) as Partial<Record<EvaluationKey, { value: number | string; unit?: string; sourceIds: string[] }>>;
  return EVALUATION_KEYS.map((key) => {
    const v = ev[key];
    return {
      key,
      label: EVALUATION_LABELS[key],
      display: v ? `${v.value}${v.unit ? ` ${v.unit}` : ''}` : undefined,
      sourceIds: v?.sourceIds ?? [],
    };
  });
}

export interface ProductFit {
  product: Product;
  /** 適合理由。パックに書かれていない場合は undefined */
  reason?: string;
}

/** 解決策に関連付けられた Microsoft 製品と適合理由（FR-005）。0 件なら空配列 */
export function productFits(solution: Solution, products: readonly Product[]): ProductFit[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const reasons = new Map((solution.productFits ?? []).map((f) => [f.productId, f.reason]));
  const out: ProductFit[] = [];
  for (const id of solution.productIds ?? []) {
    const product = byId.get(id);
    if (product) out.push({ product, reason: reasons.get(id) });
  }
  return out;
}

/** 出典の URL を、リンクにしてよい（http/https）ときだけ返す（javascript: などを弾く） */
export function safeHttpUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}
