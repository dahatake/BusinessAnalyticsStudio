// ナレッジグラフの編集（FR-037 AC-045）。ノード・エッジの追加と削除を、顧客パックのデータの書き換えとして行う。
// 結果は新しいパックのデータで、表・課題-解決策分析など他のビューがそのまま読む。画面・ストアを参照しない純粋なモジュール。
import { REFERENCE_KEYS, type PackData } from '../schema';
import type { GraphEdge, NodeKind } from '../selection/graph';

export const ADDABLE_KINDS: ReadonlyArray<{ kind: Extract<NodeKind, 'issue' | 'solution' | 'product' | 'feature' | 'entity'>; label: string }> = [
  { kind: 'issue', label: '課題' },
  { kind: 'solution', label: '解決策' },
  { kind: 'product', label: '製品' },
  { kind: 'feature', label: '機能' },
  { kind: 'entity', label: 'エンティティ' },
];
export type AddableKind = (typeof ADDABLE_KINDS)[number]['kind'];

export type EditResult = { ok: true; data: PackData; id?: string } | { ok: false; reason: string };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const clone = <T,>(v: T): T => structuredClone(v);

let seq = 0;
/** 一意な ID（小文字英数字とハイフン）。 */
export function newRecordId(prefix: string): string {
  seq += 1;
  return `${prefix}-u-${Date.now().toString(36)}${seq.toString(36)}`;
}

/** パックのすべてのレコード（ID を持つ要素）の配列。編集の対象を探すために使う。 */
function recordArrays(data: PackData): Rec[][] {
  const arrays: Rec[][] = [
    data.entities.entities, data.issues.issues, data.issues.solutions, data.products.products, data.plan.features, data.plan.tasks,
    data.architecture.nodes, data.mocks.mocks, data.show.chapters, data.sources.sources,
  ] as unknown as Rec[][];
  for (const c of data.show.chapters) arrays.push(c.topics as unknown as Rec[]);
  for (const v of [data.architecture.asis, data.architecture.tobe]) if (v) arrays.push(v.elements as unknown as Rec[]);
  return arrays;
}

export function findRecord(data: PackData, id: string): Rec | undefined {
  for (const arr of recordArrays(data)) {
    const r = arr.find((x) => x.id === id);
    if (r) return r;
  }
  return undefined;
}

const trim = (s: string): string => s.trim();

/** ノードを追加する。解決策は課題（`linkTo` の課題、なければ最初の課題）に紐づく。 */
export function addNode(data: PackData, kind: AddableKind, name: string, linkTo?: string): EditResult {
  const label = trim(name);
  if (label === '') return { ok: false, reason: '名前を入力してください。' };
  const next = clone(data);
  const id = newRecordId(kind);
  switch (kind) {
    case 'issue':
      next.issues.issues.push({ id, createdBy: 'human', parentId: null, title: label, audience: 'internal' });
      break;
    case 'solution': {
      const target = linkTo && next.issues.issues.some((i) => i.id === linkTo) ? linkTo : next.issues.issues[0]?.id;
      if (!target) return { ok: false, reason: '解決策を紐づける課題がありません。先に課題を追加してください。' };
      next.issues.solutions.push({ id, createdBy: 'human', issueId: target, issueIds: [target], title: label });
      break;
    }
    case 'product':
      next.products.products.push({ id, createdBy: 'human', name: label });
      break;
    case 'feature':
      next.plan.features.push({ id, createdBy: 'human', title: label });
      break;
    case 'entity':
      next.entities.entities.push({ id, createdBy: 'human', type: 'other', name: label });
      break;
  }
  return { ok: true, data: next, id };
}

/** エッジを追加する。始点のレコードの `relatedIds` に終点を足す（グラフの辺は ID の参照から作られる）。 */
export function addEdge(data: PackData, from: string, to: string): EditResult {
  if (!from || !to) return { ok: false, reason: '始点と終点を選んでください。' };
  if (from === to) return { ok: false, reason: '始点と終点が同じです。別のノードを選んでください。' };
  const next = clone(data);
  const rec = findRecord(next, from);
  if (!rec || !findRecord(next, to)) return { ok: false, reason: '選んだノードが見つかりません。' };
  const cur = Array.isArray(rec.relatedIds) ? (rec.relatedIds as string[]) : [];
  if (cur.includes(to)) return { ok: false, reason: 'そのエッジはすでにあります。' };
  rec.relatedIds = [...cur, to];
  return { ok: true, data: next };
}

/** 削除すると壊れる必須の参照（解決策の issueId など） */
const REQUIRED_SCALAR = new Set(['issueId']);

/** ノードを削除する。ほかのレコードからの参照（配列の要素・任意の参照・アーキテクチャの接続）も取り除く。必須の参照が残るときは削除しない。 */
export function removeNode(data: PackData, id: string): EditResult {
  const next = clone(data);
  if (!findRecord(next, id)) return { ok: false, reason: '選んだノードが見つかりません。' };
  const blockers: string[] = [];
  const scan = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(scan); return; }
    if (!isRec(v)) return;
    for (const k of REQUIRED_SCALAR) if (v[k] === id && v.id !== id) blockers.push(String(v.title ?? v.name ?? v.id));
    Object.values(v).forEach(scan);
  };
  scan(next);
  if (blockers.length > 0) {
    return { ok: false, reason: `「${blockers.join('」「')}」がこのノードに必須で紐づいているため削除できません。先に削除してください。` };
  }
  const refKeys = new Set<string>(REFERENCE_KEYS);
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      return v
        .filter((x) => !(isRec(x) && x.id === id) && !(isRec(x) && (x.from === id || x.to === id)))
        .map(strip);
    }
    if (!isRec(v)) return v;
    const out: Rec = {};
    for (const [k, x] of Object.entries(v)) {
      if (refKeys.has(k) && k !== 'from' && k !== 'to') {
        if (Array.isArray(x)) { out[k] = x.filter((t) => t !== id); continue; }
        if (x === id) { if (k === 'parentId') out[k] = null; continue; }
      }
      out[k] = strip(x);
    }
    return out;
  };
  return { ok: true, data: strip(next) as PackData };
}

/** エッジを削除する。参照の辺はその参照を取り除き、アーキテクチャの接続は接続を取り除く。包含や必須の参照は削除できない。 */
export function removeEdge(data: PackData, edge: Pick<GraphEdge, 'from' | 'to' | 'kind' | 'label'>): EditResult {
  const next = clone(data);
  if (edge.kind === 'contain') return { ok: false, reason: '章と議題の包含は、エッジとしては削除できません。議題のノードを削除してください。' };
  if (edge.kind === 'relation') {
    const keep = <T extends { from: string; to: string }>(l: T[] | undefined): T[] | undefined =>
      l?.filter((e) => !(e.from === edge.from && e.to === edge.to));
    next.architecture.edges = keep(next.architecture.edges as Array<{ from: string; to: string }>) as typeof next.architecture.edges;
    for (const v of [next.architecture.asis, next.architecture.tobe]) if (v) v.links = keep(v.links);
    return { ok: true, data: next };
  }
  const key = edge.label ?? '';
  if (REQUIRED_SCALAR.has(key)) return { ok: false, reason: `「${key}」は必須の参照のため、エッジだけを削除できません。ノードを削除してください。` };
  const rec = findRecord(next, edge.from);
  if (!rec) return { ok: false, reason: '選んだエッジが見つかりません。' };
  const v = rec[key];
  if (Array.isArray(v)) rec[key] = v.filter((t) => t !== edge.to);
  else if (v === edge.to) { if (key === 'parentId') rec[key] = null; else delete rec[key]; }
  else {
    // 項目の中の入れ子（効果・原因などの ID の参照）にある参照
    let removed = false;
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) { x.forEach(walk); return; }
      if (!isRec(x)) return;
      const y = x[key];
      if (Array.isArray(y) && y.includes(edge.to)) { x[key] = y.filter((t) => t !== edge.to); removed = true; }
      else if (y === edge.to) { delete x[key]; removed = true; }
      Object.values(x).forEach(walk);
    };
    walk(rec);
    if (!removed) return { ok: false, reason: '選んだエッジが見つかりません。' };
  }
  return { ok: true, data: next };
}
