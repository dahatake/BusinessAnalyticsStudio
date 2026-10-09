// 顧客パックのデータの検索（FR-017）。エンティティ関係グラフの節（課題・解決策・製品・エンティティ）を、表示名の一部一致で探す純粋な関数。
// どのペルソナでも同じ結果になるよう、レイアウトや選択状態には依存しない（FR-112 AC-138）。
import { KIND_LABELS, type EntityGraph, type GraphNode, type NodeKind } from '../selection/graph';

/** 検索の対象にする種類と、結果に並べる順 */
export const SEARCH_KINDS: readonly NodeKind[] = ['issue', 'solution', 'product', 'entity'];

export interface SearchGroup {
  kind: NodeKind;
  label: string;
  hits: GraphNode[];
}

/** 全角・半角、大文字・小文字の違いを吸収する */
export function normalizeQuery(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** 空のクエリは結果なし（グループなし）。一致があった種類だけを、SEARCH_KINDS の順で返す。 */
export function searchGraph(graph: EntityGraph | null, query: string): SearchGroup[] {
  const q = normalizeQuery(query);
  if (!graph || q === '') return [];
  const words = q.split(' ');
  const groups: SearchGroup[] = [];
  for (const kind of SEARCH_KINDS) {
    const hits = graph.nodes.filter((n) => {
      if (n.kind !== kind) return false;
      const label = normalizeQuery(n.label);
      return words.every((w) => label.includes(w));
    });
    if (hits.length > 0) groups.push({ kind, label: KIND_LABELS[kind], hits });
  }
  return groups;
}

export const countHits = (groups: readonly SearchGroup[]): number => groups.reduce((n, g) => n + g.hits.length, 0);
