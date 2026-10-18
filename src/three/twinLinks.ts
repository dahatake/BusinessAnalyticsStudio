// デジタルツインの 3D でのツイン関係（FR-218）。three・React に依存しない純粋な関数。
//  - twinPairsOf: 線で結ぶ組（両端が配置にあり、描いているもの）
//  - twinPartnersOfSelection: 選択中の項目のツイン関係の相手（強調する。FR-218 AC-503）
import type { EntityGraph } from '../selection/graph';
import type { TwinLayout, TwinObject } from './entityLayout';

/** ツイン関係の組 [現実世界の ID, デジタル世界の ID] のうち、両端が配置にあり `drawn` を満たすもの */
export function twinPairsOf(graph: EntityGraph | null | undefined, layout: TwinLayout, drawn: (o: TwinObject) => boolean): Array<[string, string]> {
  if (!graph) return [];
  const out: Array<[string, string]> = [];
  for (const e of graph.edges) {
    if (e.kind !== 'twin') continue;
    const a = layout.byId.get(e.from);
    const b = layout.byId.get(e.to);
    if (a && b && drawn(a) && drawn(b)) out.push([e.from, e.to]);
  }
  return out;
}

/** 選択中の項目のツイン関係の相手（選択中の項目そのものは含めない） */
export function twinPartnersOfSelection(graph: EntityGraph | null | undefined, selectedIds: readonly string[]): ReadonlySet<string> {
  const out = new Set<string>();
  if (!graph) return out;
  for (const id of selectedIds) for (const t of graph.twinsOf(id)) out.add(t.id);
  for (const id of selectedIds) out.delete(id);
  return out;
}
