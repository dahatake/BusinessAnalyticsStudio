// チャットの回答の根拠づけ（FR-017）。質問に近い顧客パックの項目を探し、その出典を回答の出典カードに選ぶ純粋な関数。
// モックの回答は、ここで選んだ項目と出典だけを根拠にする（顧客パックの外の知識は使わない）。
import type { EntityGraph, GraphNode, NodeKind } from '../selection/graph';

const GROUNDING_KINDS: readonly NodeKind[] = ['issue', 'solution', 'product', 'entity'];

export interface Grounding {
  /** 質問に近い項目（近い順） */
  matched: GraphNode[];
  /** 出典 ID（顧客パックにあるものだけ。回答に近い順、重複なし） */
  sourceIds: string[];
}

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 1 < s.length; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** 質問と項目名の近さ。名前が質問に含まれれば高く、そうでなければ共有する 2 文字連続の数（2 つ未満は 0）。 */
export function closeness(question: string, label: string): number {
  const q = norm(question);
  const l = norm(label);
  if (!q || !l) return 0;
  if (q.includes(l)) return 100 + l.length;
  const shared = [...bigrams(l)].filter((b) => q.includes(b)).length;
  return shared >= 2 ? shared : 0;
}

function sourcesOf(graph: EntityGraph, id: string, valid: ReadonlySet<string>): string[] {
  const direct = [...graph.neighbors(id)].filter((n) => valid.has(n) && graph.node(n)?.kind === 'source');
  if (direct.length > 0) return direct;
  const out: string[] = [];
  for (const n of graph.neighbors(id)) {
    for (const m of graph.neighbors(n)) if (valid.has(m) && graph.node(m)?.kind === 'source' && !out.includes(m)) out.push(m);
  }
  return out;
}

/**
 * 質問に近い項目と、その出典を選ぶ。近い項目がなければ、顧客パックの出典の先頭から選ぶ（出典カードが 1 件以上付くように）。
 * `allSourceIds` は顧客パックの出典の ID（並び順どおり）。
 */
export function groundQuestion(graph: EntityGraph | null, question: string, allSourceIds: readonly string[], maxSources = 3): Grounding {
  const valid = new Set(allSourceIds);
  const matched = (graph?.nodes ?? [])
    .filter((n) => GROUNDING_KINDS.includes(n.kind))
    .map((n) => ({ n, score: closeness(question, n.label) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.n);
  const ids: string[] = [];
  if (graph) {
    for (const n of matched) for (const sid of sourcesOf(graph, n.id, valid)) if (!ids.includes(sid)) ids.push(sid);
  }
  const sourceIds = (ids.length > 0 ? ids : [...allSourceIds]).slice(0, maxSources);
  return { matched, sourceIds };
}
