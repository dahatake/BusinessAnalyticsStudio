// ビジネス⇔IT のレンズ（FR-019）。同じ ID の項目を、ビジネスの言葉と IT の言葉の 2 通りで見せるための純粋な関数。
import { KIND_LABELS, type EntityGraph, type NodeKind } from '../selection/graph';
import { tr } from '../i18n';

export const LENS_MODES = ['business', 'it', 'both'] as const;
export type LensMode = (typeof LENS_MODES)[number];
export const LENS_LABELS: Record<LensMode, string> = {
  get business() { return tr('ビジネス'); }, get it() { return tr('IT'); }, get both() { return tr('並置'); },
};

/** レンズに並べる節の種類 */
export const LENS_KINDS: readonly NodeKind[] = ['issue', 'solution', 'entity', 'product', 'architecture'];
const BUSINESS_RELATED: readonly NodeKind[] = ['issue', 'solution', 'entity'];
const IT_RELATED: readonly NodeKind[] = ['product', 'architecture', 'feature', 'mock'];

export interface LensItem {
  /** 共通 ID。ビジネス側・IT 側の同じ項目は同じ ID を持つ */
  id: string;
  kind: NodeKind;
  label: string;
  /** ビジネスの言葉: 関連する課題・解決策・関係先 */
  businessNote: string;
  /** IT の言葉: ID・種別と、関連する製品・システム */
  itNote: string;
}

const join = (xs: string[]) => (xs.length ? xs.join(tr('、')) : tr('なし'));

export function buildLensItems(graph: EntityGraph | null): LensItem[] {
  if (!graph) return [];
  const names = (id: string, kinds: readonly NodeKind[]) =>
    [...graph.neighbors(id)]
      .map((n) => graph.node(n))
      .filter((n): n is NonNullable<typeof n> => !!n && kinds.includes(n.kind))
      .slice(0, 3)
      .map((n) => n.label);
  return graph.nodes
    .filter((n) => LENS_KINDS.includes(n.kind))
    .map((n) => ({
      id: n.id,
      kind: n.kind,
      label: n.label,
      businessNote: tr('{kind} ／ 関連: {related}', { kind: KIND_LABELS[n.kind], related: join(names(n.id, BUSINESS_RELATED)) }),
      itNote: tr('{id}（{kind}{type}） ／ 接続: {related}', { id: n.id, kind: KIND_LABELS[n.kind], type: n.type ? `／${n.type}` : '', related: join(names(n.id, IT_RELATED)) }),
    }));
}
