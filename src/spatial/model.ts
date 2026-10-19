// 空間ビュー（FR-240）の純粋なモデル。React に依存しない。
// 空間の階層（拠点 → フロア → 部屋・設備。FR-030）と、KPI（ツイン関係「計測する」＝measures。FR-214・FR-235）を、パックの entities から作る。
// 上位（フロア・拠点）の KPI は顧客パックが値を与えたものだけを使い、下位の値から計算しない（AC-574）。
import { KPI_STAGE_LABELS, kpiStageOf, type KpiStage, type KpiStages } from '../graphmodel';

export type SpatialKind = 'site' | 'floor' | 'room' | 'equipment';

export const SPATIAL_KIND_LABELS: Record<SpatialKind, string> = { site: '拠点', floor: 'フロア', room: '部屋', equipment: '設備' };

/** 意味的ズームの要素の段の数 D（拠点・フロア・部屋/設備）。階層は 全体 → 拠点 → フロア → 部屋/設備 → 詳細 の 5 つ（FR-237） */
export const SPATIAL_ELEMENT_DEPTH = 3;

export interface SpatialNode {
  id: string;
  name: string;
  kind: SpatialKind;
  parentId?: string;
  children: string[];
  sourceIds: string[];
}

export interface KpiReading {
  kpi: string;
  value: number;
  unit?: string;
  stages?: KpiStages;
  stage?: KpiStage;
  /** 値を与えたセンサー/指標のエンティティ ID */
  metricId: string;
}

export interface SpatialModel {
  nodes: Map<string, SpatialNode>;
  /** 拠点（表示の順） */
  sites: string[];
  /** KPI の名前（出現順） */
  kpiNames: string[];
  readings: Map<string, Map<string, KpiReading>>;
  /** 空間のノードを計測するセンサー/指標（関係の表示用） */
  measuredBy: Map<string, string[]>;
  names: Map<string, string>;
}

export interface RawEntity {
  id: string;
  name?: string;
  type?: string;
  kind?: string;
  parentId?: string | null;
  sourceIds?: string[];
  metrics?: Array<{ label: string; value: number; unit?: string; stages?: KpiStages }>;
}
export interface RawTwin { realId: string; digitalId: string; relation: string }

export function buildSpatialModel(entities: readonly RawEntity[], twins: readonly RawTwin[] = []): SpatialModel {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const kindOf = (e: RawEntity): SpatialKind | undefined => {
    if (e.kind === 'site' || e.kind === 'floor' || e.kind === 'room') return e.kind;
    // 種別（type）が site のものは拠点（地図と同じ扱い。kind が業務などでも、拠点の種別を優先して空間に含める）
    if (e.type === 'site') return 'site';
    return undefined;
  };
  const nodes = new Map<string, SpatialNode>();
  for (const e of entities) {
    const k = kindOf(e);
    if (k) nodes.set(e.id, { id: e.id, name: e.name ?? e.id, kind: k, parentId: e.parentId ?? undefined, children: [], sourceIds: [...(e.sourceIds ?? [])] });
  }
  // 設備は、空間のノードの下にあるものだけ（部屋・設備の段に出す）
  for (const e of entities) {
    if (e.kind === 'equipment' && e.parentId && nodes.has(e.parentId)) {
      nodes.set(e.id, { id: e.id, name: e.name ?? e.id, kind: 'equipment', parentId: e.parentId, children: [], sourceIds: [...(e.sourceIds ?? [])] });
    }
  }
  const sites: string[] = [];
  for (const n of nodes.values()) {
    if (n.parentId && nodes.has(n.parentId) && n.parentId !== n.id) nodes.get(n.parentId)!.children.push(n.id);
    if (n.kind === 'site') sites.push(n.id);
  }

  const readings = new Map<string, Map<string, KpiReading>>();
  const measuredBy = new Map<string, string[]>();
  const kpiNames: string[] = [];
  for (const t of twins) {
    if (t.relation !== 'measures' || !nodes.has(t.realId)) continue;
    const metric = byId.get(t.digitalId);
    if (!metric) continue;
    measuredBy.set(t.realId, [...(measuredBy.get(t.realId) ?? []), metric.id]);
    for (const m of metric.metrics ?? []) {
      if (typeof m.value !== 'number' || Number.isNaN(m.value)) continue;
      const per = readings.get(t.realId) ?? new Map<string, KpiReading>();
      if (!per.has(m.label)) {
        per.set(m.label, { kpi: m.label, value: m.value, unit: m.unit, stages: m.stages, stage: m.stages ? kpiStageOf(m.value, m.stages) : undefined, metricId: metric.id });
      }
      readings.set(t.realId, per);
      if (!kpiNames.includes(m.label)) kpiNames.push(m.label);
    }
  }
  return { nodes, sites, kpiNames, readings, measuredBy, names: new Map(entities.map((e) => [e.id, e.name ?? e.id])) };
}

/** 項目の KPI の値。パックが与えていなければ undefined（推測で集約しない） */
export const readingOf = (m: SpatialModel, id: string, kpi: string | undefined): KpiReading | undefined => (kpi ? m.readings.get(id)?.get(kpi) : undefined);

/** 段階の表し方: 色に加えて形と文字（FR-240 AC-573） */
export const STAGE_GLYPHS: Record<KpiStage, string> = { good: '●', caution: '▲', action: '■' };

export interface KpiCell {
  /** 'value'＝値あり、'none'＝値なし */
  state: 'value' | 'none';
  text: string;
  stage?: KpiStage;
  glyph?: string;
  stageLabel?: string;
}

/** 表示用の文字。値なしは「データなし」。フロア・拠点は「集計なし」も添える（AC-574） */
export function kpiCell(m: SpatialModel, id: string, kpi: string | undefined): KpiCell {
  const r = readingOf(m, id, kpi);
  if (!r) {
    const kind = m.nodes.get(id)?.kind;
    return { state: 'none', text: kind === 'floor' || kind === 'site' ? 'データなし（集計なし）' : 'データなし' };
  }
  const value = `${r.value}${r.unit ? ` ${r.unit}` : ''}`;
  if (!r.stage) return { state: 'value', text: value };
  return { state: 'value', text: `${value} ${STAGE_GLYPHS[r.stage]} ${KPI_STAGE_LABELS[r.stage]}`, stage: r.stage, glyph: STAGE_GLYPHS[r.stage], stageLabel: KPI_STAGE_LABELS[r.stage] };
}

const levelRank = (k: SpatialKind): number => (k === 'site' ? 0 : k === 'floor' ? 1 : 2);

export const isDescendantOf = (m: SpatialModel, id: string, ancestor: string): boolean => {
  for (let cur = m.nodes.get(id)?.parentId, n = 0; cur && n < 20; cur = m.nodes.get(cur)?.parentId, n++) if (cur === ancestor) return true;
  return false;
};

/** 階層の番号（1=拠点、2=フロア、3=部屋/設備）に出す項目。選択中の上位の項目があれば、その配下だけに絞る */
export function itemsAtDepth(m: SpatialModel, depth: number, selectedIds: readonly string[]): SpatialNode[] {
  if (depth < 1 || depth > SPATIAL_ELEMENT_DEPTH) return [];
  const target = depth - 1;
  const all = [...m.nodes.values()].filter((n) => levelRank(n.kind) === target);
  let focus: string | undefined;
  for (const id of selectedIds) {
    const n = m.nodes.get(id);
    if (n && levelRank(n.kind) < target) focus = id;
  }
  return focus ? all.filter((n) => isDescendantOf(m, n.id, focus!)) : all;
}

/** 3D で積む建物の拠点: 選択中の項目の拠点、なければフロアを持つ最初の拠点 */
export function buildingSite(m: SpatialModel, selectedIds: readonly string[]): string | undefined {
  for (const id of [...selectedIds].reverse()) {
    let cur = m.nodes.get(id);
    for (let n = 0; cur && n < 20; n++) {
      if (cur.kind === 'site') return cur.id;
      cur = cur.parentId ? m.nodes.get(cur.parentId) : undefined;
    }
  }
  return m.sites.find((s) => m.nodes.get(s)!.children.some((c) => m.nodes.get(c)?.kind === 'floor')) ?? m.sites[0];
}

/** 詳細（階層 4）で見る部屋/設備: 選択中のもの、なければ最初の部屋 */
export function detailTarget(m: SpatialModel, selectedIds: readonly string[]): SpatialNode | undefined {
  for (const id of [...selectedIds].reverse()) {
    const n = m.nodes.get(id);
    if (n && (n.kind === 'room' || n.kind === 'equipment')) return n;
  }
  return [...m.nodes.values()].find((n) => n.kind === 'room' || n.kind === 'equipment');
}

/** 等角投影（アイソメ図）。x・y は床の平面、z は高さ。画面の座標へ（x 右下へ、y 左下へ、z 上へ） */
export function isoProject(x: number, y: number, z: number): { sx: number; sy: number } {
  const c = Math.cos(Math.PI / 6);
  const s = Math.sin(Math.PI / 6);
  return { sx: (x - y) * c, sy: (x + y) * s - z };
}
