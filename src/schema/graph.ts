// 顧客パックの任意項目の共通の語彙とスキーマ（FR-241。意味の種類・Twin の流れの向き・層・KPI の段階）。
// 顧客固有の語は持たない。顧客の言葉は、顧客パックの関係ラベル（label）として持つ。
// このモジュールは画面の部品を参照しない（NFR-MAINT-001）。
import { z } from 'zod';
import { tr } from '../i18n';

/** 関係の意味の種類（FR-235。九つ） */
export const MEANINGS = [
  'influences', 'dependsOn', 'causes', 'owns', 'derivedFrom', 'memberOf', 'locatedIn', 'measures', 'controls',
] as const;
export type Meaning = (typeof MEANINGS)[number];
export const MeaningSchema = z.enum(MEANINGS);
export const isMeaning = (v: unknown): v is Meaning => typeof v === 'string' && (MEANINGS as readonly string[]).includes(v);

/** 意味の種類の日本語の名前と、「A は B に影響する」の形の読み方（述部） */
// 表示のたびに言語に合わせて読めるよう、getter で持つ（言語切替で更新される）
const meaningLabel = (name: string, predicate: string) => ({ get name() { return tr(name); }, get predicate() { return tr(predicate); } });
export const MEANING_LABELS: Readonly<Record<Meaning, { name: string; predicate: string }>> = {
  influences: meaningLabel('影響', 'に影響する'),
  dependsOn: meaningLabel('依存', 'に依存する'),
  causes: meaningLabel('因果', 'の原因になる'),
  owns: meaningLabel('所有', 'を所有する'),
  derivedFrom: meaningLabel('データ系統', 'から導出される'),
  memberOf: meaningLabel('所属', 'に所属する'),
  locatedIn: meaningLabel('配置', 'に配置される'),
  measures: meaningLabel('計測', 'を計測する'),
  controls: meaningLabel('制御', 'を制御する'),
};

/** 「A は B に影響する」の形の読み上げ文 */
export const readMeaning = (meaning: Meaning, from: string, to: string): string =>
  tr('{from} は {to} {predicate}', { from, to, predicate: MEANING_LABELS[meaning].predicate });

/** Twin の流れの向き（data＝データ、control＝制御） */
export const FLOW_KINDS = ['data', 'control'] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];
export const FlowKindSchema = z.enum(FLOW_KINDS);
export const isFlowKind = (v: unknown): v is FlowKind => typeof v === 'string' && (FLOW_KINDS as readonly string[]).includes(v);

/** デジタル世界のエンティティの層 */
export const TWIN_LAYERS = ['operations', 'experience', 'insights'] as const;
export type TwinLayer = (typeof TWIN_LAYERS)[number];
export const TwinLayerSchema = z.enum(TWIN_LAYERS);
export const isTwinLayer = (v: unknown): v is TwinLayer => typeof v === 'string' && (TWIN_LAYERS as readonly string[]).includes(v);

/** KPI の段階 */
export const KPI_STAGES = ['good', 'caution', 'action'] as const;
export type KpiStage = (typeof KPI_STAGES)[number];
export const KPI_STAGE_LABELS: Readonly<Record<KpiStage, string>> = {
  get good() { return tr('良'); }, get caution() { return tr('注意'); }, get action() { return tr('要対応'); },
};

/**
 * KPI の段階の境界。boundaries は昇順の 2 値 [b1, b2]。
 * betterWhen=high（既定。大きいほど良い）: 値 ≥ b2 は良、b1 ≤ 値 < b2 は注意、値 < b1 は要対応。
 * betterWhen=low（小さいほど良い）: 値 ≤ b1 は良、b1 < 値 ≤ b2 は注意、値 > b2 は要対応。
 */
export const KpiStagesSchema = z.looseObject({
  boundaries: z.tuple([z.number(), z.number()]),
  betterWhen: z.enum(['high', 'low']).optional(),
}).superRefine((v, ctx) => {
  if (!(v.boundaries[0] < v.boundaries[1])) {
    ctx.addIssue({ code: 'custom', path: ['boundaries'], message: tr('段階の境界は昇順（良・注意・要対応の境目が小さい順）で書きます') });
  }
});
export type KpiStages = z.infer<typeof KpiStagesSchema>;

/** 値がない場合は undefined（「データなし」として扱う） */
export function kpiStageOf(value: number | null | undefined, stages: KpiStages): KpiStage | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  const [b1, b2] = stages.boundaries;
  if ((stages.betterWhen ?? 'high') === 'high') return value >= b2 ? 'good' : value >= b1 ? 'caution' : 'action';
  return value <= b1 ? 'good' : value <= b2 ? 'caution' : 'action';
}

const idRe = /^[a-z0-9][a-z0-9-]*$/;

/** 意味ラベル付きの関係（entities.json の relations[]）。label は顧客の言葉（自由な文字列） */
export const RelationSchema = z.looseObject({
  id: z.string().regex(idRe, { error: () => tr('ID は小文字英数字とハイフンだけで書く') }).optional(),
  from: z.string().regex(idRe),
  to: z.string().regex(idRe),
  meaning: MeaningSchema,
  label: z.string().min(1).optional(),
  sourceIds: z.array(z.string().regex(idRe)).optional(),
});
export type Relation = z.infer<typeof RelationSchema>;

interface Issue { path: Array<string | number>; message: string }
interface EntityLike { id?: unknown; world?: unknown; layer?: unknown }

/**
 * entities.json の中の、任意項目をまたぐ検査（FR-241 AC-577）。位置（path）は entities.json の中の位置。
 * - layer はデジタル世界のエンティティだけが持てる
 * - 関係・流れの両端は entities にある ID
 * - Twin の流れ（どちらかの端がデジタル世界）は、向きが data か control で、両端の世界区分が異なる。
 *   両端とも現実世界・区分なしの流れは従来の物流・データの流れ（FR-021）で、検査しない（後方互換）
 */
export function checkGraphStructure(
  entities: readonly EntityLike[], flows: readonly unknown[] | undefined, relations: readonly unknown[] | undefined,
): Issue[] {
  const issues: Issue[] = [];
  const worldById = new Map<string, unknown>();
  entities.forEach((e) => { if (typeof e?.id === 'string' && !worldById.has(e.id)) worldById.set(e.id, e.world); });

  entities.forEach((e, i) => {
    if (e && typeof e === 'object' && e.layer !== undefined && isTwinLayer(e.layer) && e.world !== 'digital') {
      issues.push({ path: ['entities', i, 'layer'], message: tr('層（layer）はデジタル世界のエンティティだけが持てます') });
    }
  });

  (relations ?? []).forEach((r, i) => {
    if (!r || typeof r !== 'object') return;
    for (const key of ['from', 'to'] as const) {
      const id = (r as Record<string, unknown>)[key];
      if (typeof id === 'string' && !worldById.has(id)) {
        issues.push({ path: ['relations', i, key], message: tr('関係の {key} が、entities にない ID を指しています: {id}', { key, id }) });
      }
    }
  });

  (flows ?? []).forEach((f, i) => {
    if (!f || typeof f !== 'object') return;
    const fl = f as Record<string, unknown>;
    const fromW = typeof fl.from === 'string' ? worldById.get(fl.from) : undefined;
    const toW = typeof fl.to === 'string' ? worldById.get(fl.to) : undefined;
    const touchesDigital = fromW === 'digital' || toW === 'digital';
    if (!touchesDigital) return;
    if (!isFlowKind(fl.kind)) {
      issues.push({ path: ['flows', i, 'kind'], message: tr('Twin の流れの向きは {kinds} のどちらかです（実際は {actual}）', { kinds: FLOW_KINDS.join('／'), actual: String(fl.kind) }) });
    }
    if (fromW === toW) {
      issues.push({ path: ['flows', i, 'to'], message: tr('Twin の流れの両端は、現実世界とデジタル世界の組み合わせにします（同じ世界区分は指せません）') });
    }
  });
  return issues;
}
