// 顧客パックの JSON ファイルごとの zod スキーマ（FR-119 の構成）。
// 未知の項目は通す（looseObject）。以後の項目が、既存のファイルを壊さずに項目を足せるようにするため。
import { z } from 'zod';
import {
  ClassificationSchema, ConfidenceSchema, CreatedBySchema, IdSchema, entityShape,
} from './common';

const entity = <T extends z.ZodRawShape>(shape: T) => z.looseObject({ ...entityShape, ...shape });

/** 数値・事実を表す項目。`sourceIds` が必須（FR-115） */
export const MetricSchema = z.looseObject({
  label: z.string().min(1),
  value: z.number(),
  unit: z.string().optional(),
  sourceIds: z.array(IdSchema).min(1),
});

export const CustomerSchema = z.looseObject({
  name: z.string().min(1),
  projectName: z.string().min(1),
  templateVersion: z.string().min(1),
  locale: z.string().default('ja'),
  industryPreset: z.string().optional(),
  createdBy: CreatedBySchema,
  coreObject: z.looseObject({
    candidates: z.array(z.looseObject({ id: IdSchema, label: z.string().min(1) })),
    selectedId: IdSchema.optional(),
  }),
});

/** 拠点の位置（FR-021）。地図・地球儀に置く場所。緯度 -90〜90、経度 -180〜180（度） */
export const LocationSchema = z.looseObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const EntitiesSchema = z.looseObject({
  entities: z.array(entity({
    type: z.string().min(1),
    name: z.string().min(1),
    /** 階層の親（FR-020・FR-023）。拠点の下のライン、設備の下の部品など。なければ最上位 */
    parentId: IdSchema.nullable().optional(),
    /** 位置（拠点）。なければ地図には出さず「位置情報なし」として数える（FR-113） */
    location: LocationSchema.optional(),
    metrics: z.array(MetricSchema).optional(),
  })),
  /** 物流・データの流れ（FR-021）。拠点から拠点への流れを、時間軸（0〜23 時）に応じた量の粒子で示す */
  flows: z.array(entity({
    from: IdSchema,
    to: IdSchema,
    label: z.string().min(1),
    /** 流れの種類（粒子の色分け）。物流・データ・お金など */
    kind: z.string().optional(),
    /** 1 時間あたりの量の最大（単位は unit）。粒子の数と線の太さに反映する */
    volume: z.number().nonnegative().optional(),
    unit: z.string().optional(),
    /** 流れが最も多い時刻（0〜23 時）。時刻ごとの量は、この時刻を頂点とする山形 */
    peakHour: z.number().min(0).max(23).optional(),
  })).optional(),
});

/** 課題の区分（FR-002）。社内向け／社外向けのどちらか（機密区分 classification とは別） */
export const AUDIENCES = ['internal', 'external'] as const;
export const AudienceSchema = z.enum(AUDIENCES);
export type Audience = z.infer<typeof AudienceSchema>;

/** 課題の評価属性（FR-003）。値には出典が必須（FR-115） */
export const EVALUATION_KEYS = ['priority', 'cost', 'roi', 'feasibility', 'risk'] as const;
export type EvaluationKey = (typeof EVALUATION_KEYS)[number];
export const EvaluationValueSchema = z.looseObject({
  value: z.union([z.number(), z.string().min(1)]),
  unit: z.string().optional(),
  sourceIds: z.array(IdSchema).min(1),
});
export const EvaluationSchema = z.looseObject({
  priority: EvaluationValueSchema.optional(),
  cost: EvaluationValueSchema.optional(),
  roi: EvaluationValueSchema.optional(),
  feasibility: EvaluationValueSchema.optional(),
  risk: EvaluationValueSchema.optional(),
});

/** 生成 AI の価値（FR-006）。解決策が `genAiValues` で指定したものだけを表示する */
export const GENAI_VALUE_KEYS = ['parameter', 'fusion', 'chatRag', 'workflow'] as const;
export type GenAiValueKey = (typeof GENAI_VALUE_KEYS)[number];

/** 原因・効果（FR-038）。課題の原因、解決策の効果。ID はパック全体で一意 */
export const NamedItemSchema = z.looseObject({
  id: IdSchema,
  title: z.string().min(1),
});

export const IssuesSchema = z.looseObject({
  issues: z.array(entity({
    parentId: IdSchema.nullable().optional(),
    title: z.string().min(1),
    hypothesis: z.string().optional(),
    origin: z.string().optional(),
    audience: AudienceSchema,
    personas: z.array(z.string().min(1)).optional(),
    evaluation: EvaluationSchema.optional(),
    causes: z.array(NamedItemSchema).optional(),
  })),
  solutions: z.array(entity({
    issueId: IdSchema,
    /** 1 つの解決策が複数の課題に効く場合の課題（`issueId` に加えて参照する） */
    issueIds: z.array(IdSchema).optional(),
    title: z.string().min(1),
    effects: z.array(NamedItemSchema).optional(),
    genAiValues: z.array(z.enum(GENAI_VALUE_KEYS)).optional(),
    productIds: z.array(IdSchema).optional(),
    /** 製品ごとの適合理由（FR-005）。表示する製品は productIds で決まる */
    productFits: z.array(z.looseObject({
      productId: IdSchema,
      reason: z.string().min(1),
    })).optional(),
  })),
});

export const ProductsSchema = z.looseObject({
  products: z.array(entity({
    name: z.string().min(1),
    vendor: z.string().optional(),
    summary: z.string().optional(),
    metrics: z.array(MetricSchema).optional(),
  })),
});

export const PlanSchema = z.looseObject({
  features: z.array(entity({
    title: z.string().min(1),
    issueIds: z.array(IdSchema).optional(),
  })),
  tasks: z.array(entity({
    title: z.string().min(1),
    featureId: IdSchema.optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    /** 担当（誰が）と作業内容（何を）（FR-007） */
    owner: z.string().min(1).optional(),
    work: z.string().min(1).optional(),
    dependsOn: z.array(IdSchema).optional(),
  })),
});

export const ArchitectureSchema = z.looseObject({
  nodes: z.array(entity({
    label: z.string().min(1),
    layer: z.string().optional(),
    productId: IdSchema.optional(),
  })),
  edges: z.array(entity({ from: IdSchema, to: IdSchema, label: z.string().optional() })),
});

export const MocksSchema = z.looseObject({
  mocks: z.array(entity({
    title: z.string().min(1),
    featureId: IdSchema.optional(),
  })),
});

export const ShowSchema = z.looseObject({
  chapters: z.array(entity({
    title: z.string().min(1),
    topics: z.array(entity({
      title: z.string().min(1),
      entityIds: z.array(IdSchema).optional(),
    })).default([]),
  })),
});

export const SourcesSchema = z.looseObject({
  sources: z.array(z.looseObject({
    id: IdSchema,
    createdBy: CreatedBySchema,
    kind: z.enum(['web', 'workiq', 'document', 'interview', 'sample']),
    title: z.string().min(1),
    url: z.string().optional(),
    retrievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    confidence: ConfidenceSchema,
    classification: ClassificationSchema.optional(),
  }).refine((s) => s.kind !== 'workiq' || s.classification !== undefined, {
    message: 'WorkIQ 由来の出典には機密区分（internal / shareable）が必要',
    path: ['classification'],
  })),
});

/** ブランドの値ごとの出典・確認日・確度（FR-064）。確度が「低」「推定」の値は設定パネルで「推定」と表示する */
const brandValue = <T extends z.ZodRawShape>(shape: T) => z.looseObject({
  source: z.string().min(1),
  retrievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confidence: ConfidenceSchema,
  ...shape,
});

/** ロゴの利用条件（FR-061）。確認済みのときだけロゴを表示し、不明ならプレースホルダーを表示する */
export const LOGO_STATUS = ['confirmed', 'unknown'] as const;

export const BrandProfileSchema = z.looseObject({
  name: z.string().min(1),
  colors: brandValue({ primary: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  logo: brandValue({ status: z.enum(LOGO_STATUS), path: z.string().optional() }),
  fonts: brandValue({ primary: z.string().min(1) }),
  tone: brandValue({ value: z.string().min(1) }),
});

/** `public/data/` の JSON ファイル名（拡張子なし）→ スキーマ */
export const DATA_SCHEMAS = {
  customer: CustomerSchema,
  entities: EntitiesSchema,
  issues: IssuesSchema,
  products: ProductsSchema,
  plan: PlanSchema,
  architecture: ArchitectureSchema,
  mocks: MocksSchema,
  show: ShowSchema,
  sources: SourcesSchema,
} as const;
export type DataFileName = keyof typeof DATA_SCHEMAS;
export const DATA_FILE_NAMES = Object.keys(DATA_SCHEMAS) as DataFileName[];

export type PackData = { [K in DataFileName]: z.infer<(typeof DATA_SCHEMAS)[K]> };
export type BrandProfile = z.infer<typeof BrandProfileSchema>;
