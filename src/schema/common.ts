// 顧客パックの共通の型（ID・作成者の種別・確度・機密区分）。
// このモジュールは画面の部品（src/components, src/app）を参照しない（NFR-MAINT-001）。
import { z } from 'zod';

/** エンティティ ID。パック全体で一意（FR-114）。 */
export const IdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'ID は小文字英数字とハイフンだけで書く');
export type EntityId = z.infer<typeof IdSchema>;

/** 値の作成者の種別（FR-116） */
export const CREATED_BY = ['ai', 'human', 'sample'] as const;
export const CreatedBySchema = z.enum(CREATED_BY);
export type CreatedBy = z.infer<typeof CreatedBySchema>;

/** 出典の確度（FR-115） */
export const CONFIDENCE = ['高', '中', '低', '推定'] as const;
export const ConfidenceSchema = z.enum(CONFIDENCE);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** 機密区分（FR-117） */
export const CLASSIFICATION = ['internal', 'shareable'] as const;
export const ClassificationSchema = z.enum(CLASSIFICATION);
export type Classification = z.infer<typeof ClassificationSchema>;

/** 他のエンティティを ID で参照する項目名。存在しない ID は検証エラー（FR-114）。 */
export const REFERENCE_KEYS = [
  'parentId', 'issueId', 'issueIds', 'solutionIds', 'featureId', 'featureIds',
  'productId', 'productIds', 'entityId', 'entityIds', 'sourceIds', 'dependsOn',
  'from', 'to', 'taskId', 'selectedId', 'relatedIds', 'chapterId',
] as const;

/** すべてのエンティティが持つ共通の項目。個別の項目は各スキーマで足す。 */
export const entityShape = {
  id: IdSchema,
  createdBy: CreatedBySchema,
  classification: ClassificationSchema.optional(),
  sourceIds: z.array(IdSchema).optional(),
};
