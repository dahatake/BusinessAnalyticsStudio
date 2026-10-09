// 課題-解決策分析の純粋なロジック（FR-001〜FR-005）。画面の部品を参照しない。
// 課題の絞り込み（区分）、イシューツリーの行への展開、評価属性・製品の適合の取り出しを行う。
import { EVALUATION_KEYS, GENAI_VALUE_KEYS, type Audience, type EvaluationKey, type GenAiValueKey, type PackData } from '../schema';

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

/** 区分で絞り込んだ後に残る課題に属する解決策（複数の課題に効く解決策は、どれか 1 つでも見えていれば含める） */
export function filterSolutions(solutions: readonly Solution[], visibleIssues: readonly Issue[]): Solution[] {
  const ids = new Set(visibleIssues.map((i) => i.id));
  return solutions.filter((s) => solutionIssueIds(s).some((id) => ids.has(id)));
}

/** 解決策が効く課題の ID（`issueId` を先頭に、`issueIds` を重複なく足す） */
export function solutionIssueIds(solution: Solution): string[] {
  return [...new Set([solution.issueId, ...(solution.issueIds ?? [])])];
}

/** 課題に対する解決策（FR-038） */
export function solutionsOfIssue(issueId: string, solutions: readonly Solution[]): Solution[] {
  return solutions.filter((s) => solutionIssueIds(s).includes(issueId));
}

export type NamedItem = { id: string; title: string };

/** 課題の原因（FR-038） */
export function causesOf(issue: Issue): NamedItem[] {
  return (issue.causes ?? []) as NamedItem[];
}

/** 解決策の効果（FR-038） */
export function effectsOf(solution: Solution): NamedItem[] {
  return (solution.effects ?? []) as NamedItem[];
}

/** 生成 AI の価値 4 種類の表示名と説明文（FR-006）。解決策が指定したものだけを表示する */
export const GENAI_VALUE_INFO: Record<GenAiValueKey, { label: string; description: string }> = {
  parameter: {
    label: 'パラメーターを変えて試せる',
    description: '条件（数値や設定）を変えて、結果の違いをその場で確かめられます。',
  },
  fusion: {
    label: '構造化／非構造化データの融合分析',
    description: '表のデータと、文書や会話の文章を組み合わせて分析し、見落としを減らします。',
  },
  chatRag: {
    label: 'チャット＋RAG による品質と物量',
    description: '顧客パックの資料を根拠に回答し、回答の質と、さばける件数を高めます。',
  },
  workflow: {
    label: '業務フローへの組み込み',
    description: '日々の仕事の手順に生成 AI を組み込み、人の手作業を減らします。',
  },
};

/** 解決策が指定した生成 AI の価値（4 種類の定義順、重複なし）。指定がなければ空 */
export function genAiValueItems(solution: Solution): Array<{ key: GenAiValueKey; label: string; description: string }> {
  const chosen = new Set(solution.genAiValues ?? []);
  return GENAI_VALUE_KEYS.filter((k) => chosen.has(k)).map((key) => ({ key, ...GENAI_VALUE_INFO[key] }));
}

/** 出典の種別の表示（FR-009）。WorkIQ・Web 以外は、裏付けを自動で確かめられないため「推定」と区別して示す */
export function sourceKindLabel(kind: Source['kind']): string {
  switch (kind) {
    case 'workiq': return 'WorkIQ';
    case 'web': return 'Web';
    case 'document': return '推定（資料）';
    case 'interview': return '推定（ヒアリング）';
    default: return '推定（サンプル）';
  }
}

/** 課題-解決策分析の流れ（サンキー図）の 1 つの節点（FR-038） */
export type FlowKind = 'issue' | 'cause' | 'solution' | 'effect' | 'product';
export const FLOW_COLUMNS: readonly FlowKind[] = ['issue', 'cause', 'solution', 'effect', 'product'];
export const FLOW_LABELS: Record<FlowKind, string> = {
  issue: '課題', cause: '原因', solution: '解決策', effect: '効果', product: 'Microsoft 製品',
};
export interface FlowNode { id: string; kind: FlowKind; label: string; column: number; row: number }
export interface FlowLink { from: string; to: string }
export interface FlowModel { nodes: FlowNode[]; links: FlowLink[]; rows: number }

/**
 * 課題→原因→解決策→効果→Microsoft 製品の流れを作る（FR-038）。
 * 原因を持たない課題は、解決策へ直接つなぐ。解決策の効果・製品が無ければその列には節点を作らない。
 */
export function buildFlow(issues: readonly Issue[], solutions: readonly Solution[], products: readonly Product[]): FlowModel {
  const columns: FlowNode[][] = FLOW_COLUMNS.map(() => []);
  const byId = new Map<string, FlowNode>();
  const add = (kind: FlowKind, id: string, label: string): FlowNode => {
    const found = byId.get(id);
    if (found) return found;
    const column = FLOW_COLUMNS.indexOf(kind);
    const list = columns[column]!;
    const node: FlowNode = { id, kind, label, column, row: list.length };
    list.push(node);
    byId.set(id, node);
    return node;
  };
  const productById = new Map(products.map((p) => [p.id, p]));
  const links: FlowLink[] = [];
  const link = (from: string, to: string) => {
    if (!links.some((l) => l.from === from && l.to === to)) links.push({ from, to });
  };

  const rows = buildTreeRows(issues, issues, new Set());
  const visibleIds = new Set(issues.map((i) => i.id));
  for (const { issue } of rows) {
    add('issue', issue.id, issue.title);
    for (const c of causesOf(issue)) { add('cause', c.id, c.title); link(issue.id, c.id); }
  }
  for (const issue of issues) {
    for (const sol of solutionsOfIssue(issue.id, solutions)) {
      add('solution', sol.id, sol.title);
      const causes = causesOf(issue);
      if (causes.length === 0) link(issue.id, sol.id);
      for (const c of causes) link(c.id, sol.id);
    }
  }
  for (const sol of solutions) {
    if (!solutionIssueIds(sol).some((id) => visibleIds.has(id))) continue;
    for (const e of effectsOf(sol)) { add('effect', e.id, e.title); link(sol.id, e.id); }
    for (const pid of sol.productIds ?? []) {
      const p = productById.get(pid);
      if (p) { add('product', p.id, p.name); link(sol.id, p.id); }
    }
  }
  return { nodes: columns.flat(), links, rows: Math.max(1, ...columns.map((c) => c.length)) };
}

/** 選んだ節点に関係する節点（上流と下流をそれぞれたどる。選んだ節点自身は含めない） */
export function relatedFlowNodes(flow: FlowModel, selectedId: string): Set<string> {
  const out = new Set<string>();
  const down = (from: string) => {
    for (const l of flow.links) if (l.from === from && !out.has(l.to)) { out.add(l.to); down(l.to); }
  };
  const up = (to: string) => {
    for (const l of flow.links) if (l.to === to && !out.has(l.from)) { out.add(l.from); up(l.from); }
  };
  down(selectedId);
  up(selectedId);
  out.delete(selectedId);
  return out;
}

export interface MatrixCell { product?: Product; solutions: Solution[] }
export interface MatrixRow { issue: Issue; level: number; causes: NamedItem[]; cells: MatrixCell[] }
export interface MatrixModel {
  /** 列: 製品（解決策で使われているものだけ）。最後の「製品なし」は product が undefined */
  columns: Array<Product | undefined>;
  rows: MatrixRow[];
}

/** 課題（行）× Microsoft 製品（列）のマトリクス。セルには、その課題に効き、その製品を使う解決策が入る（FR-038） */
export function buildMatrix(issues: readonly Issue[], solutions: readonly Solution[], products: readonly Product[]): MatrixModel {
  const productById = new Map(products.map((p) => [p.id, p]));
  const treeRows = buildTreeRows(issues, issues, new Set());
  const visibleIds = new Set(issues.map((i) => i.id));
  const used = new Set<string>();
  let hasNone = false;
  for (const s of solutions) {
    if (!solutionIssueIds(s).some((id) => visibleIds.has(id))) continue;
    const known = (s.productIds ?? []).filter((id) => productById.has(id));
    if (known.length === 0) hasNone = true;
    known.forEach((id) => used.add(id));
  }
  const columns: Array<Product | undefined> = products.filter((p) => used.has(p.id));
  if (hasNone) columns.push(undefined);
  const rows = treeRows.map(({ issue, level }) => {
    const mine = solutionsOfIssue(issue.id, solutions);
    return {
      issue, level, causes: causesOf(issue),
      cells: columns.map((product) => ({
        product,
        solutions: mine.filter((s) => {
          const known = (s.productIds ?? []).filter((id) => productById.has(id));
          return product ? known.includes(product.id) : known.length === 0;
        }),
      })),
    };
  });
  return { columns, rows };
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
