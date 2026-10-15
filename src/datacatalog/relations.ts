// データビュアーの関連の導出と簡略表示の判定（FR-170・FR-171）。純関数で、画面・描画から切り離して単体で検査する。表示だけの規則で、データは変えない。
import type { ViewerEntity } from './viewer';

/** 関連の種類: entity=エンティティ間の関係、usecase=ユースケースの使用、column=列の対応、reconcile=企業データカタログとの突合 */
export type RelationKind = 'entity' | 'usecase' | 'column' | 'reconcile';
export const RELATION_KINDS: readonly RelationKind[] = ['entity', 'usecase', 'column', 'reconcile'];
export const RELATION_KIND_LABELS: Record<RelationKind, string> = { entity: '①エンティティ間の関係', usecase: '②ユースケースの使用', column: '③列の対応', reconcile: '④カタログとの突合' };

export const CATALOG_NODE = 'catalog';
export const entityNode = (key: string): string => `e:${key}`;
export const useCaseNode = (name: string): string => `u:${name}`;
export const columnNode = (key: string, col: string): string => `c:${key}:${col}`;

export interface ViewerRelation {
  id: string;
  kind: RelationKind;
  /** 端点（entityNode・useCaseNode・columnNode・CATALOG_NODE のどれか） */
  from: string;
  to: string;
  /** 文字のラベル（色に依存しない） */
  label: string;
  /** 導出／明示（usecase）、4 区分（reconcile）。ほかは空 */
  state: string;
  /** この関連に関わるエンティティの鍵 */
  entityKeys: string[];
  useCase?: string;
}

export interface RelationInput {
  entities: readonly ViewerEntity[];
  /** ①: 顧客パックのエンティティ関係（鍵で指す）。端点が entities にないものは作らない */
  entityLinks: readonly { from: string; to: string; label?: string }[];
  /** ③: 企業データカタログの項目（名称と列）。 */
  catalogItems: readonly { name: string; columns?: readonly { name: string }[] }[];
  normalize: (name: string) => string;
}

/** 関連を導出する。端点が存在しない関連は作らない。同じ入力から同じ順序の同じ結果になる。入力が空なら 0 件 */
export function deriveViewerRelations(input: RelationInput): ViewerRelation[] {
  const { entities, entityLinks, catalogItems, normalize } = input;
  const keys = new Set(entities.map((e) => e.key));
  const out = new Map<string, ViewerRelation>();
  const add = (r: ViewerRelation): void => { if (!out.has(r.id)) out.set(r.id, r); };

  for (const l of entityLinks) {
    if (l.from === l.to || !keys.has(l.from) || !keys.has(l.to)) continue;
    const [a, b] = l.from < l.to ? [l.from, l.to] : [l.to, l.from];
    const label = l.label?.trim() || '関係';
    add({ id: `entity|${a}|${b}|${label}`, kind: 'entity', from: entityNode(l.from), to: entityNode(l.to), label, state: '', entityKeys: [l.from, l.to] });
  }
  const itemByKey = new Map(catalogItems.map((i) => [normalize(i.name), i]));
  for (const e of entities) {
    for (const u of e.relatedUseCases) {
      const state = u.kind === 'explicit' ? '明示' : '導出';
      add({ id: `usecase|${e.key}|${u.name}`, kind: 'usecase', from: entityNode(e.key), to: useCaseNode(u.name), label: `${u.name}（${state}）`, state, entityKeys: [e.key], useCase: u.name });
    }
    const item = itemByKey.get(e.key) ?? itemByKey.get(normalize(e.name));
    if (item?.columns?.length) {
      const catCols = new Set(item.columns.map((c) => normalize(c.name)));
      for (const c of e.columns) {
        if (!catCols.has(normalize(c.name))) continue;
        add({ id: `column|${e.key}|${normalize(c.name)}`, kind: 'column', from: columnNode(e.key, c.name), to: `k:${normalize(item.name)}:${normalize(c.name)}`, label: `列「${c.name}」がカタログの列と対応`, state: '', entityKeys: [e.key] });
      }
    }
    if (e.category) add({ id: `reconcile|${e.key}`, kind: 'reconcile', from: entityNode(e.key), to: CATALOG_NODE, label: `カタログとの突合: ${e.category}`, state: e.category, entityKeys: [e.key] });
  }
  return [...out.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

export interface LineStyle { label: string; dash: string; width: number }
const RECONCILE_DASH: Record<string, string> = { 一致: '10 3', 差異: '10 3 2 3', BASのみ: '3 4', カタログのみ: '1 4' };
/** 線の種類（実線・破線など）と文字の名前。色を消しても種類・区分が判別できる（AC-340） */
export function lineStyleOf(r: Pick<ViewerRelation, 'kind' | 'state'>): LineStyle {
  switch (r.kind) {
    case 'entity': return { label: '実線', dash: '', width: 2 };
    case 'usecase': return r.state === '明示' ? { label: '太い実線', dash: '', width: 5 } : { label: '破線', dash: '8 4', width: 2 };
    case 'column': return { label: '点線', dash: '2 3', width: 2 };
    case 'reconcile': return { label: r.state === '一致' ? '長破線' : r.state === '差異' ? '破線と点の交互' : r.state === 'BASのみ' ? '粗い点線' : '細かい点線', dash: RECONCILE_DASH[r.state] ?? '4 4', width: 3 };
  }
}
/** 関連 1 件の文字の説明（種類・導出／明示・区分・ラベル・線の種類） */
export function describeRelation(r: ViewerRelation): string {
  const s = lineStyleOf(r);
  return `${RELATION_KIND_LABELS[r.kind]}${r.kind === 'usecase' || r.kind === 'reconcile' ? `［${r.state}］` : ''}: ${r.label}（${s.label}）`;
}

export interface Focus { entityKey?: string | null; useCase?: string | null }
/** 選択（エンティティ、またはユースケース）に関連する関連・エンティティの鍵・ユースケース。選択がなければ null（強調も減光もしない） */
export function relatedOf(relations: readonly ViewerRelation[], focus: Focus): { relations: ViewerRelation[]; entityKeys: Set<string>; useCases: Set<string> } | null {
  const { entityKey, useCase } = focus;
  if (!entityKey && !useCase) return null;
  let rels: ViewerRelation[];
  if (useCase) {
    rels = relations.filter((r) => r.useCase === useCase);
  } else {
    const own = relations.filter((r) => r.entityKeys.includes(entityKey!));
    const ucs = new Set(own.map((r) => r.useCase).filter((x): x is string => !!x));
    rels = [...own, ...relations.filter((r) => r.useCase && ucs.has(r.useCase) && !r.entityKeys.includes(entityKey!))];
  }
  const entityKeys = new Set<string>(rels.flatMap((r) => r.entityKeys));
  if (entityKey) entityKeys.add(entityKey);
  const useCases = new Set<string>(rels.map((r) => r.useCase).filter((x): x is string => !!x));
  return { relations: rels, entityKeys, useCases };
}

/** 強調の状態: selected（選択中）、related（関連）、dimmed（減光）、none（選択なし） */
export function highlightOf(rel: ReturnType<typeof relatedOf>, key: string, selectedKey: string | null): 'selected' | 'related' | 'dimmed' | 'none' {
  if (!rel) return 'none';
  if (key === selectedKey) return 'selected';
  return rel.entityKeys.has(key) ? 'related' : 'dimmed';
}

/** 選択の通知文（aria-live）。関連の件数を添える */
export function relationAnnouncement(name: string | null, relatedCount: number): string {
  return name ? `${name} を選択しました。関連する対象 ${relatedCount} 件` : '選択を解除しました。強調と減光を解除しました。';
}

// --- FR-171 性能の上限と簡略表示 ---
/** PARAM-055: 通常の詳細表示を保証するデータエンティティ数の上限 */
export const MAX_DETAIL_ENTITIES = 300;
/** PARAM-056: 通常の詳細表示を保証する列の総数の上限 */
export const MAX_DETAIL_COLUMNS = 3000;
/** 簡略表示で、検索の一致を詳細付きで出す件数の上限（これを超えた分は集約する。表の代替には全件がある） */
export const SIMPLE_DETAIL_CAP = 50;

export interface ViewMode { simplified: boolean; reason: string }
/** 通常か簡略かの判定。エンティティ数が上限以下かつ列の総数が上限以下なら通常。どちらかを 1 件でも超えれば簡略 */
export function decideViewMode(entityCount: number, columnCount: number, maxEntities: number = MAX_DETAIL_ENTITIES, maxColumns: number = MAX_DETAIL_COLUMNS): ViewMode {
  const reasons: string[] = [];
  if (entityCount > maxEntities) reasons.push(`データエンティティが ${entityCount} 件で、上限 ${maxEntities} 件を超えている`);
  if (columnCount > maxColumns) reasons.push(`列の総数が ${columnCount} 件で、上限 ${maxColumns} 件を超えている`);
  return { simplified: reasons.length > 0, reason: reasons.join('。また、') };
}

/** 簡略表示で詳細を出す対象: 選択中のエンティティとその近傍、絞り込みに一致したもの（上限まで）。残りは集約して件数で示す */
export function simplifySelection(all: readonly ViewerEntity[], shown: readonly ViewerEntity[], selectedKey: string | null, neighborKeys: ReadonlySet<string>, hasFilter: boolean, cap: number = SIMPLE_DETAIL_CAP): { detailKeys: Set<string>; aggregated: number } {
  const present = new Set(all.map((e) => e.key));
  const detail = new Set<string>();
  if (selectedKey && present.has(selectedKey)) detail.add(selectedKey);
  for (const k of neighborKeys) if (present.has(k) && detail.size < cap) detail.add(k);
  if (hasFilter) for (const e of shown) { if (detail.size >= cap && !detail.has(e.key)) break; detail.add(e.key); }
  const shownDetail = shown.filter((e) => detail.has(e.key)).length;
  return { detailKeys: detail, aggregated: Math.max(0, shown.length - shownDetail) };
}
