// エンティティ関係グラフ（FR-024）。顧客パックのすべてのエンティティを節、ID の参照を辺にした、読み取り専用のグラフ。
// 選択状態ストア（src/store/selection.ts）と並んで、すべてのビューが唯一の情報源として購読する。
// 画面の部品（src/components, src/app）を参照しない純粋なモジュール。後続のビュー（ナレッジグラフ・3D・ガントなど）は、
// ここから節・辺・関連を取り、独自に ID の参照を数え直さない。
import { REFERENCE_KEYS, type PackData } from '../schema';

/** 節の種類。後続の項目が種類を足すときは、ここと KIND_LABELS に足す。 */
export const NODE_KINDS = [
  'entity', 'issue', 'solution', 'product', 'feature', 'task', 'architecture', 'mock', 'chapter', 'topic', 'source',
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const KIND_LABELS: Record<NodeKind, string> = {
  entity: 'エンティティ',
  issue: '課題',
  solution: '解決策',
  product: '製品',
  feature: '機能',
  task: 'タスク',
  architecture: 'アーキテクチャ',
  mock: 'モック',
  chapter: '章',
  topic: '議題',
  source: '出典',
};

export interface GraphNode {
  id: string;
  kind: NodeKind;
  /** 表示名（title / name / label のいずれか。なければ ID） */
  label: string;
  /** エンティティの type（拠点・部品など）。ほかの種類では undefined */
  type?: string;
}

export type EdgeKind = 'ref' | 'relation' | 'contain';

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  /** ref: 項目内の ID の参照、relation: アーキテクチャの接続など from/to を持つレコード、contain: 章と議題 */
  kind: EdgeKind;
  /** 参照した項目名（issueId・sourceIds など）。relation はレコードの label */
  label?: string;
}

export interface EntityGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  has(id: string): boolean;
  node(id: string): GraphNode | undefined;
  /** 直接つながっている節（向きは問わない）。自分自身は含めない */
  neighbors(id: string): ReadonlySet<string>;
  /** 自分自身と直接つながっている節 */
  related(id: string): ReadonlySet<string>;
}

type Rec = Record<string, unknown>;

const REF_KEYS = new Set<string>(REFERENCE_KEYS);
const EMPTY: ReadonlySet<string> = new Set();

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function labelOf(r: Rec): string {
  for (const k of ['title', 'name', 'label']) if (isStr(r[k])) return r[k] as string;
  return String(r.id);
}

/** 顧客パックからグラフを作る。同じ入力なら同じ結果になる。存在しない ID への参照は辺にしない（検証は src/schema が受け持つ）。 */
export function buildEntityGraph(data: PackData): EntityGraph {
  const nodes: GraphNode[] = [];
  const records = new Map<string, Rec>();
  const relationRecords: Rec[] = [];
  const containEdges: Array<[string, string]> = [];

  const add = (kind: NodeKind, list: readonly unknown[] | undefined, parent?: string): void => {
    for (const raw of list ?? []) {
      if (!isRec(raw) || !isStr(raw.id)) continue;
      // アーキテクチャの接続のように from と to を持つレコードは、節ではなく辺にする
      if (isStr(raw.from) && isStr(raw.to)) { relationRecords.push(raw); continue; }
      if (records.has(raw.id)) continue;
      records.set(raw.id, raw);
      nodes.push({ id: raw.id, kind, label: labelOf(raw), type: kind === 'entity' && isStr(raw.type) ? raw.type : undefined });
      if (parent) containEdges.push([parent, raw.id]);
      if (kind === 'chapter') add('topic', raw.topics as unknown[] | undefined, raw.id);
    }
  };
  add('entity', data.entities.entities);
  add('issue', data.issues.issues);
  add('solution', data.issues.solutions);
  add('product', data.products.products);
  add('feature', data.plan.features);
  add('task', data.plan.tasks);
  add('architecture', data.architecture.nodes);
  add('architecture', data.architecture.edges);
  // FR-040: ToBe の要素と、ToBe にない AsIs の要素（同じ ID は先の ToBe を使う）
  add('architecture', data.architecture.tobe?.elements);
  add('architecture', data.architecture.asis?.elements);
  add('mock', data.mocks.mocks);
  add('chapter', data.show.chapters);
  add('source', data.sources.sources);

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const link = (from: string, to: string, kind: EdgeKind, label?: string): void => {
    if (from === to || !records.has(from) || !records.has(to)) return;
    const id = `${from}->${to}:${kind}:${label ?? ''}`;
    if (seen.has(id)) return;
    seen.add(id);
    edges.push({ id, from, to, kind, label });
  };

  const collect = (owner: string, value: unknown, skip: ReadonlySet<string>): void => {
    if (Array.isArray(value)) { for (const v of value) collect(owner, v, skip); return; }
    if (!isRec(value)) return;
    for (const [k, v] of Object.entries(value)) {
      if (skip.has(k)) continue;
      if (REF_KEYS.has(k)) {
        for (const t of Array.isArray(v) ? v : [v]) if (isStr(t)) link(owner, t, 'ref', k);
      } else if (typeof v === 'object' && v !== null) {
        collect(owner, v, skip);
      }
    }
  };

  for (const [id, rec] of records) collect(id, rec, new Set(['topics']));
  for (const [parent, child] of containEdges) link(parent, child, 'contain');
  for (const rec of relationRecords) link(rec.from as string, rec.to as string, 'relation', isStr(rec.label) ? rec.label : undefined);
  for (const variant of [data.architecture.tobe, data.architecture.asis]) {
    for (const l of variant?.links ?? []) link(l.from, l.to, 'relation', isStr(l.label) ? l.label : undefined);
  }

  const adjacency = new Map<string, Set<string>>();
  const touch = (a: string, b: string): void => {
    const s = adjacency.get(a) ?? new Set<string>();
    s.add(b);
    adjacency.set(a, s);
  };
  for (const e of edges) { touch(e.from, e.to); touch(e.to, e.from); }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const relatedCache = new Map<string, ReadonlySet<string>>();
  return {
    nodes,
    edges,
    has: (id) => byId.has(id),
    node: (id) => byId.get(id),
    neighbors: (id) => adjacency.get(id) ?? EMPTY,
    related: (id) => {
      let r = relatedCache.get(id);
      if (!r) {
        r = byId.has(id) ? new Set([id, ...(adjacency.get(id) ?? [])]) : EMPTY;
        relatedCache.set(id, r);
      }
      return r;
    },
  };
}
