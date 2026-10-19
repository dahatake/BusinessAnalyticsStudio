// エンティティ関係グラフ（FR-024）。顧客パックのすべてのエンティティを節、ID の参照を辺にした、読み取り専用のグラフ。
// 選択状態ストア（src/store/selection.ts）と並んで、すべてのビューが唯一の情報源として購読する。
// 画面の部品（src/components, src/app）を参照しない純粋なモジュール。後続のビュー（ナレッジグラフ・3D・ガントなど）は、
// ここから節・辺・関連を取り、独自に ID の参照を数え直さない。
import {
  ENTITY_KINDS, REFERENCE_KEYS, TWIN_RELATIONS, TWIN_RELATION_LABELS, WORLDS, tableWorldOf,
  type EntityKind, type PackData, type TwinRelation, type World,
} from '../schema';

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

/**
 * 世界区分の項目を持たない節の種類が当たる、§3.7 の分類表の行（FR-218・A-57）。null は世界区分の項目を持つ節（entity）だけ。
 * task は data.plan.tasks（工程）で、ガントチャートの画面の宣言（registry.ts の tableWorldDecl(['工程'])）と同じ行を当て、
 * 画面間で世界区分を一致させる。mock は data.mocks.mocks で、§3.7 の「モック」の行を当てる。
 */
export const NODE_KIND_TABLE_ROW: Record<NodeKind, string | null> = {
  entity: null,
  issue: '課題',
  solution: '解決策',
  product: 'Microsoft 製品',
  feature: 'Feature',
  task: '工程',
  architecture: 'アーキテクチャ',
  mock: 'モック',
  chapter: 'チャプター',
  topic: '議題',
  source: '出典',
};

/** 世界区分の項目を持たない節の種類の、§3.7 の分類表による既定の世界区分（FR-218・A-57）。決まらないものは undefined */
export function defaultWorldOfNodeKind(kind: NodeKind): World | undefined {
  const row = NODE_KIND_TABLE_ROW[kind];
  return row ? tableWorldOf(row) : undefined;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  /** 表示名（title / name / label のいずれか。なければ ID） */
  label: string;
  /** エンティティの type（拠点・部品など）。ほかの種類では undefined */
  type?: string;
  /**
   * 世界区分（FR-213・FR-218）。エンティティは world の値（書かれていなければ undefined＝区分なし）。
   * 世界区分の項目を持たない節（課題・解決策など）は §3.7 の分類表の世界区分（defaultWorldOfNodeKind。A-57）。
   * 工程（task）は現実世界、モック（mock）はデジタル世界。
   */
  world?: World;
  /** エンティティの種別（FR-213。§3.7 の分類の体系） */
  entityKind?: EntityKind;
}

/** ツイン関係の相手（FR-214）。twinsOf の結果 */
export interface TwinLink {
  /** 相手のエンティティの ID */
  id: string;
  /** 相手の世界区分 */
  world: World;
  relation: TwinRelation;
  /** 関係の種類の表示名（表す・計測する・記録する・表示する） */
  relationLabel: string;
  sourceIds: readonly string[];
}

/** twin: 現実世界とデジタル世界のツイン関係（FR-214。from が現実世界、to がデジタル世界、label が関係の種類） */
export type EdgeKind = 'ref' | 'relation' | 'contain' | 'twin';

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
  /** ツイン関係の相手の一覧（FR-214 AC-492）。現実世界の項目ならデジタル世界の相手、デジタル世界の項目なら現実世界の相手を、関係の種類つきで返す */
  twinsOf(id: string): readonly TwinLink[];
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
      const node: GraphNode = { id: raw.id, kind, label: labelOf(raw), type: kind === 'entity' && isStr(raw.type) ? raw.type : undefined };
      if (kind === 'entity') {
        if ((WORLDS as readonly unknown[]).includes(raw.world)) node.world = raw.world as World;
        if ((ENTITY_KINDS as readonly unknown[]).includes(raw.kind)) node.entityKind = raw.kind as EntityKind;
      } else {
        const w = defaultWorldOfNodeKind(kind);
        if (w) node.world = w;
      }
      nodes.push(node);
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
  // FR-239 AC-568: 流れ（entities.json の flows[]。FR-021・FR-241）の両端も関連として辺にする（Twin ビューで選ぶと、流れで結ばれた項目が他の画面でも強調される）
  for (const f of data.entities.flows ?? []) link(f.from, f.to, 'relation', isStr(f.label) ? f.label : undefined);
  for (const variant of [data.architecture.tobe, data.architecture.asis]) {
    for (const l of variant?.links ?? []) link(l.from, l.to, 'relation', isStr(l.label) ? l.label : undefined);
  }

  // FR-214: ツイン関係を辺にする。両端が存在し、現実世界とデジタル世界の組のものだけ（検証は src/schema が受け持つ）
  const twinMap = new Map<string, TwinLink[]>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const raw of (data.entities.twins ?? []) as unknown[]) {
    if (!isRec(raw) || !isStr(raw.realId) || !isStr(raw.digitalId)) continue;
    const real = nodeById.get(raw.realId);
    const digital = nodeById.get(raw.digitalId);
    // ツイン関係はエンティティ（entities.json）どうしだけ（課題などの既定の世界区分では結ばない）
    if (real?.kind !== 'entity' || digital?.kind !== 'entity') continue;
    if (real.world !== 'real' || digital.world !== 'digital') continue;
    if (!(TWIN_RELATIONS as readonly unknown[]).includes(raw.relation)) continue;
    const relation = raw.relation as TwinRelation;
    const sourceIds = Array.isArray(raw.sourceIds) ? raw.sourceIds.filter(isStr) : [];
    const before = edges.length;
    link(real.id, digital.id, 'twin', relation);
    if (edges.length === before) continue; // 同じ組・同じ種類の重複
    const push = (from: string, to: GraphNode): void => {
      const list = twinMap.get(from) ?? [];
      list.push({ id: to.id, world: to.world!, relation, relationLabel: TWIN_RELATION_LABELS[relation], sourceIds });
      twinMap.set(from, list);
    };
    push(real.id, digital);
    push(digital.id, real);
  }

  const adjacency = new Map<string, Set<string>>();
  const touch = (a: string, b: string): void => {
    const s = adjacency.get(a) ?? new Set<string>();
    s.add(b);
    adjacency.set(a, s);
  };
  for (const e of edges) { touch(e.from, e.to); touch(e.to, e.from); }

  const byId = nodeById;
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
    twinsOf: (id) => twinMap.get(id) ?? [],
  };
}
