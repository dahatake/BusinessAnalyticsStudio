// ビジネス関係グラフの入力（FR-236）。顧客パックから、FR-235 で「向く」と判定された関係だけを、ノードとエッジにする純粋なモジュール。
// 同じ入力は同じ結果。画面の部品を参照しない（NFR-MAINT-001）。
import type { PackData } from '../schema';
import { TWIN_RELATION_LABELS, type World } from '../schema/world';
import { MEANINGS, MEANING_LABELS, type Meaning } from '../schema/graph';
import { judgeGraphSuitability } from './suitability';

export interface BizNode {
  id: string;
  name: string;
  /** エンティティの type（拠点・部品など）。グラフの「種別」 */
  type: string;
  world?: World;
  parentId?: string;
  sourceIds: readonly string[];
  /** 塊（上位のエンティティの名前。なければ種別） */
  cluster: string;
}

export interface BizEdge {
  id: string;
  from: string;
  to: string;
  meaning: Meaning;
  /** 意味ラベル（顧客の言葉）。ないものは線だけ */
  label?: string;
  sourceIds: readonly string[];
}

export interface BizGraph { nodes: BizNode[]; edges: BizEdge[] }

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * 顧客パックのビジネス関係グラフ。
 * 関係は entities.json の relations[]（意味の種類つき）と、ツイン関係「計測する」（measures として読む。FR-235）。
 * 意味がない・向かないと判定された関係は含めない。
 */
export function bizGraphOf(data: PackData): BizGraph {
  const raw = data.entities.entities as unknown[];
  const byId = new Map<string, Rec>();
  for (const e of raw) if (isRec(e) && str(e.id) && !byId.has(e.id as string)) byId.set(e.id as string, e);
  const nodes: BizNode[] = [...byId.values()].map((e) => {
    const id = e.id as string;
    const type = str(e.type) ?? 'entity';
    const parentId = str(e.parentId);
    const parent = parentId ? byId.get(parentId) : undefined;
    return {
      id, name: str(e.name) ?? id, type, world: e.world === 'real' || e.world === 'digital' ? e.world : undefined,
      parentId: parent ? parentId : undefined, sourceIds: strs(e.sourceIds),
      cluster: parent ? (str(parent.name) ?? parentId!) : type,
    };
  });

  const edges: BizEdge[] = [];
  const seen = new Set<string>();
  const add = (e: BizEdge): void => {
    const key = `${e.from}|${e.to}|${e.meaning}|${e.label ?? ''}`;
    if (seen.has(key) || !byId.has(e.from) || !byId.has(e.to) || e.from === e.to) return;
    if (!judgeGraphSuitability({ meaning: e.meaning }).suitable) return;
    seen.add(key);
    edges.push(e);
  };
  ((data.entities.relations ?? []) as unknown[]).forEach((r, i) => {
    if (!isRec(r) || !str(r.from) || !str(r.to)) return;
    add({ id: str(r.id) ?? `rel-${i}`, from: r.from as string, to: r.to as string, meaning: r.meaning as Meaning, label: str(r.label), sourceIds: strs(r.sourceIds) });
  });
  for (const t of (data.entities.twins ?? []) as unknown[]) {
    if (!isRec(t) || t.relation !== 'measures' || !str(t.realId) || !str(t.digitalId)) continue;
    // 設備→センサー/指標（FR-235 の既定の判定）の向き: 現実世界から、それを計測するデジタル世界へ
    add({ id: `twin-${t.realId}-${t.digitalId}`, from: t.realId as string, to: t.digitalId as string, meaning: 'measures', label: TWIN_RELATION_LABELS.measures, sourceIds: strs(t.sourceIds) });
  }
  return { nodes, edges };
}

/** 意味の種類ごとの線種（stroke-dasharray。色だけに頼らない。空文字は実線） */
export const MEANING_DASH: Readonly<Record<Meaning, string>> = {
  influences: '', dependsOn: '6 4', causes: '2 3', owns: '10 3 2 3', derivedFrom: '1 4', memberOf: '8 2', locatedIn: '12 4', measures: '4 2 1 2', controls: '3 3 9 3',
};

export const meaningName = (m: Meaning): string => MEANING_LABELS[m].name;
export const MEANING_ORDER: readonly Meaning[] = MEANINGS;

/** 種別ごとの形。種別（type）の一覧から、形の名前を重ならないように割り当てる（足りなければ番号を足す） */
export const BIZ_SHAPES = ['circle', 'square', 'diamond', 'hexagon', 'triangle', 'pentagon', 'octagon', 'stadium', 'parallelogram', 'cross', 'star'] as const;
export function shapeAssignment(types: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  [...new Set(types)].sort().forEach((t, i) => {
    const base = BIZ_SHAPES[i % BIZ_SHAPES.length]!;
    out.set(t, i < BIZ_SHAPES.length ? base : `${base}-${Math.floor(i / BIZ_SHAPES.length) + 1}`);
  });
  return out;
}
