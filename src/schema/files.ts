// 顧客パックの JSON ファイルごとの zod スキーマ（FR-119 の構成）。
// 未知の項目は通す（looseObject）。以後の項目が、既存のファイルを壊さずに項目を足せるようにするため。
import { z } from 'zod';
import {
  ClassificationSchema, ConfidenceSchema, CreatedBySchema, IdSchema, entityShape,
} from './common';
import { EntityKindSchema, TwinSchema, WorldSchema, checkWorldStructure } from './world';
import { KpiStagesSchema, RelationSchema, TwinLayerSchema, checkGraphStructure } from './graph';

/** ユースケースの対象ペルソナ（FR-180）。ワークスペースのペルソナ（経営層・事業部門・IT・現場）と同じ。スキーマは画面の部品を参照しないので、ここに持つ */
export const USECASE_PERSONAS = ['経営層', '事業部門', 'IT', '現場'] as const;

const entity = <T extends z.ZodRawShape>(shape: T) => z.looseObject({ ...entityShape, ...shape });

/** 数値・事実を表す項目。`sourceIds` が必須（FR-115） */
export const MetricSchema = z.looseObject({
  label: z.string().min(1),
  value: z.number(),
  unit: z.string().optional(),
  /** KPI の段階の境界（FR-241。任意）。良・注意・要対応の別を値から求める */
  stages: KpiStagesSchema.optional(),
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
    /** 中核オブジェクトの候補（FR-018）。表示名は `name`、なければ `label`。`scores` は比較の観点 ID → 評価 */
    candidates: z.array(z.looseObject({
      id: IdSchema,
      label: z.string().min(1),
      name: z.string().min(1).optional(),
      summary: z.string().optional(),
      scores: z.record(z.string(), z.string()).optional(),
    })),
    selectedId: IdSchema.optional(),
    /** 候補を比べた観点（FR-018） */
    criteria: z.array(z.looseObject({ id: IdSchema, label: z.string().min(1) })).optional(),
    /** 選定した理由（FR-018） */
    reason: z.string().optional(),
  }),
  /** 用語集（FR-019）。専門用語とその定義 */
  glossary: z.array(z.looseObject({ term: z.string().min(1), definition: z.string().min(1) })).optional(),
  /** お手本の KPI と OKR（FR-153・FR-154）。デモを開いたときの「KPI/OKR」コンポーネントに出る。Objective ごとに Key Result と、それを測る KPI を持つ */
  okr: z.looseObject({
    /** 最終更新日時（ISO 8601） */
    updatedAt: z.string().min(1).optional(),
    objectives: z.array(z.looseObject({
      objective: z.string().min(1),
      keyResults: z.array(z.looseObject({
        /** パック内で一意の ID（任意）。解決策への参照（solutionIds）が壊れたとき、この Key Result だけを無効にできるようにする（FR-102） */
        id: IdSchema.optional(),
        name: z.string().min(1),
        /** この Key Result に効く解決策（FR-179・FR-180。ストーリーの③で、解決策に結び付く KPI/OKR を示す） */
        solutionIds: z.array(IdSchema).optional(),
        kpi: z.looseObject({
          name: z.string().min(1),
          unit: z.string().min(1),
          baseline: z.number(),
          current: z.number(),
          target: z.number(),
          /** 期限（任意。YYYY-MM-DD） */
          due: z.string().optional(),
          /** KPI の段階の境界（FR-241。任意） */
          stages: KpiStagesSchema.optional(),
        }),
      })),
    })),
  }).optional(),
  /**
   * お手本（デモ）のユースケース（FR-180）。ペルソナごとに PARAM-060 件以上。解決策（solutionId）と、影響する KPI の名前（okr の kpi.name）に結び付く。
   * デモの作業先にだけ現れる読み込み専用の値で、実際の Project には混ざらない（FR-138）。
   */
  useCases: z.array(z.looseObject({
    id: IdSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    persona: z.enum(USECASE_PERSONAS),
    steps: z.array(z.looseObject({ title: z.string().min(1), description: z.string().optional() })).min(1),
    effect: z.string().min(1),
    solutionId: IdSchema,
    kpiNames: z.array(z.string().min(1)).min(1),
  })).optional(),
  /** 架空のデータであることの注記（NFR-LEGAL-002）。画面に示す */
  fictionalNote: z.string().min(1).optional(),
});

/** 拠点の位置（FR-021）。地図・地球儀に置く場所。緯度 -90〜90、経度 -180〜180（度） */
export const LocationSchema = z.looseObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * 階層のレベルごとのメタデータ（FR-030）。深さ 0 が最上位（例: 拠点 > 建屋 > 部屋 > 項目）。
 * LOD のしきい値・説明・色・KPI・出典のどれが欠けても検証エラーにする（レベルを書くなら全部書く）。
 * `lodThreshold` は、全体を見渡す視点（ホーム）のカメラ距離に対する倍率。カメラ距離がこの倍率より近づくと、そのレベルの項目を表示する
 * （縦横比や項目の大きさが違うパックでも同じ値で通用する）。FR-031 / FR-032
 */
export const LevelSchema = z.looseObject({
  depth: z.number().int().min(0),
  name: z.string().min(1).optional(),
  lodThreshold: z.number().positive(),
  description: z.string().min(1),
  /** 色（#rgb または #rrggbb） */
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, '色は #rgb または #rrggbb で書く'),
  /** そのレベルで見る KPI の名前 */
  kpi: z.string().min(1),
  sourceIds: z.array(IdSchema).min(1),
});
export type HierarchyLevel = z.infer<typeof LevelSchema>;

export const EntitiesSchema = z.looseObject({
  /** 階層のレベルごとの LOD のしきい値とメタデータ（FR-030）。なければ階層の深さから既定のしきい値を求める */
  levels: z.array(LevelSchema).optional().superRefine((levels, ctx) => {
    const seen = new Set<number>();
    (levels ?? []).forEach((l, i) => {
      if (seen.has(l.depth)) ctx.addIssue({ code: 'custom', path: [i, 'depth'], message: `階層の深さ ${l.depth} が重複しています` });
      seen.add(l.depth);
    });
  }),
  entities: z.array(entity({
    type: z.string().min(1),
    name: z.string().min(1),
    /** 階層の親（FR-020・FR-023）。拠点の下のライン、設備の下の部品など。なければ最上位 */
    parentId: IdSchema.nullable().optional(),
    /** 位置（拠点）。なければ地図には出さず「位置情報なし」として数える（FR-113） */
    location: LocationSchema.optional(),
    metrics: z.array(MetricSchema).optional(),
    /** 世界区分（FR-213）。real＝現実世界／digital＝デジタル世界。ないものは「区分なし」 */
    world: WorldSchema.optional(),
    /** 種別（FR-213。§3.7 の分類の体系）。世界区分と組み合わせの合うものだけ（現実世界: site〜event／デジタル世界: data〜metric） */
    kind: EntityKindSchema.optional(),
    /** デジタル世界のエンティティの層（FR-241。任意）。operations・experience・insights */
    layer: TwinLayerSchema.optional(),
  })),
  /** 意味ラベル付きの関係（FR-235・FR-241。任意）。meaning は九つの意味の種類、label は顧客の言葉の関係ラベル */
  relations: z.array(RelationSchema).optional(),
  /** ツイン関係（FR-214）。現実世界のエンティティ（realId）と、それを表す・計測する・記録する・表示するデジタル世界のエンティティ（digitalId）の対応。1 対多・多対 1 を許す */
  twins: z.array(TwinSchema).optional(),
  /** 物流・データの流れ（FR-021）。拠点から拠点への流れを、時間軸（0〜23 時）に応じた量の粒子で示す */
  flows: z.array(entity({
    from: IdSchema,
    to: IdSchema,
    label: z.string().min(1),
    /** 流れの種類（粒子の色分け）。物流・データ・お金など。Twin の流れ（FR-241。現実世界とデジタル世界を結ぶもの）は data／control */
    kind: z.string().optional(),
    /** 1 時間あたりの量の最大（単位は unit）。粒子の数と線の太さに反映する */
    volume: z.number().nonnegative().optional(),
    unit: z.string().optional(),
    /** 流れが最も多い時刻（0〜23 時）。時刻ごとの量は、この時刻を頂点とする山形 */
    peakHour: z.number().min(0).max(23).optional(),
  })).optional(),
}).superRefine((v, ctx) => {
  // FR-213 AC-489・FR-214 AC-491: 種別と世界区分の組み合わせ・上位の循環と世界区分・ツイン関係の両端
  for (const issue of checkWorldStructure(v.entities, v.twins)) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    // FR-241 AC-577: 層・意味ラベル付きの関係・Twin の流れ
    for (const issue of checkGraphStructure(v.entities, v.flows, v.relations)) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
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
/** 優先順位分析の評価値 1〜5（FR-039）。AI の提案値（ai）と顧客の決定値（decided）は別の値として持つ */
export const PriorityScoreSchema = z.looseObject({
  ai: z.number().min(1).max(5).optional(),
  decided: z.number().min(1).max(5).optional(),
  sourceIds: z.array(IdSchema).optional(),
});
export const EvaluationSchema = z.looseObject({
  priority: EvaluationValueSchema.optional(),
  cost: EvaluationValueSchema.optional(),
  roi: EvaluationValueSchema.optional(),
  feasibility: EvaluationValueSchema.optional(),
  risk: EvaluationValueSchema.optional(),
  /** 優先順位分析の評価値（impact・roi・feasibility・risk・costEff）。なければ上の属性から AI の提案値を導く */
  scores: z.record(z.string(), PriorityScoreSchema).optional(),
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
    /** 上位の工程（FR-035）。ガントで、上位の工程を展開すると下位の工程が出る。なければ最上位 */
    parentId: IdSchema.nullable().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    /** 担当（誰が）と作業内容（何を）（FR-007） */
    owner: z.string().min(1).optional(),
    work: z.string().min(1).optional(),
    dependsOn: z.array(IdSchema).optional(),
  })),
});

/** アーキテクチャ図の要素の種別（FR-040）。capability=Capability Map、stream=バリューストリームの段階、ほかはアプリ/システムの層の要素 */
export const ARCH_KINDS = ['capability', 'stream', 'app', 'system', 'data', 'external'] as const;
export type ArchKind = (typeof ARCH_KINDS)[number];

/** AsIs／ToBe の図の要素。同じ ID を AsIs と ToBe の両方に置くと「同じ要素の変更」として差分になる */
export const ArchElementSchema = z.looseObject({
  id: IdSchema,
  createdBy: CreatedBySchema,
  name: z.string().min(1),
  kind: z.enum(ARCH_KINDS).optional(),
  layer: z.string().optional(),
  productId: IdSchema.optional(),
  solutionIds: z.array(IdSchema).optional(),
});
export const ArchLinkSchema = z.looseObject({
  from: IdSchema,
  to: IdSchema,
  label: z.string().optional(),
});
export const ArchVariantSchema = z.looseObject({
  elements: z.array(ArchElementSchema),
  links: z.array(ArchLinkSchema).optional(),
});

export const ArchitectureSchema = z.looseObject({
  nodes: z.array(entity({
    label: z.string().min(1),
    layer: z.string().optional(),
    productId: IdSchema.optional(),
  })),
  edges: z.array(entity({ from: IdSchema, to: IdSchema, label: z.string().optional() })),
  /** 現状（AsIs）と将来（ToBe）の図（FR-040）。なければ nodes・edges を両方に使う */
  asis: ArchVariantSchema.optional(),
  tobe: ArchVariantSchema.optional(),
});

/** ミニ・モックアプリの入力欄（FR-043）。画面の中に並べる、動くフォームの部品 */
export const MOCK_FIELD_KINDS = ['text', 'number', 'select', 'date', 'textarea'] as const;
export const MockFieldSchema = z.looseObject({
  label: z.string().min(1),
  kind: z.enum(MOCK_FIELD_KINDS).optional(),
  value: z.string().optional(),
  options: z.array(z.string().min(1)).optional(),
});

/** モックの 1 画面（FR-043）。画面間の遷移は、他の画面の `title` を名前にしたボタンで行う */
export const MockScreenSchema = z.looseObject({
  title: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(MockFieldSchema).optional(),
  /** 一覧の行（文字列） */
  items: z.array(z.string().min(1)).optional(),
});

/** モックの画面数の上限（PARAM-022: 1〜3 画面） */
export const MOCK_SCREENS_MAX = 3;

export const MocksSchema = z.looseObject({
  mocks: z.array(entity({
    title: z.string().min(1),
    featureId: IdSchema.optional(),
    /** このモックを見せる解決策。解決策の選択と連動して表示する（FR-043） */
    solutionId: IdSchema.optional(),
    screens: z.array(MockScreenSchema).min(1).max(MOCK_SCREENS_MAX).optional(),
  })),
});

export const ShowSchema = z.looseObject({
  chapters: z.array(entity({
    title: z.string().min(1),
    topics: z.array(entity({
      title: z.string().min(1),
      entityIds: z.array(IdSchema).optional(),
      /** 議題の種類。なければ通常の議題 */
      type: z.string().min(1).optional(),
      /** テロップ/ローワーサード（FR-078）。出典 ID を併記する */
      telop: z.looseObject({ text: z.string().min(1), sourceIds: z.array(IdSchema).optional() }).optional(),
      /** Before/After の演出（FR-079）。つまみより左が Before、右が After */
      beforeAfter: z.looseObject({
        before: z.looseObject({ label: z.string().optional(), text: z.string().min(1) }),
        after: z.looseObject({ label: z.string().optional(), text: z.string().min(1) }),
      }).optional(),
      /** AI ナビゲーターの台本（FR-080）。字幕で表示し、AI 生成のラベルを付ける */
      narration: z.string().min(1).optional(),
      /** AI 成熟度クイズ（FR-082。type は quiz）。質問ごとの選択肢の点を合計し、levels の minScore 以上で最も高いレベルを結果にする */
      quiz: z.looseObject({
        title: z.string().optional(),
        questions: z.array(z.looseObject({
          id: z.string().min(1).optional(),
          text: z.string().min(1),
          options: z.array(z.looseObject({ label: z.string().min(1), score: z.number() })).min(1),
        })).min(1),
        levels: z.array(z.looseObject({ minScore: z.number(), label: z.string().min(1), description: z.string().optional() })).optional(),
      }).optional(),
      /** ROI 発表の演出（FR-079）。数値は出典 ID を持つ（FR-115） */
      roi: z.looseObject({
        label: z.string().optional(),
        value: z.number(),
        unit: z.string().optional(),
        caption: z.string().optional(),
        sourceIds: z.array(IdSchema).min(1),
      }).optional(),
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
