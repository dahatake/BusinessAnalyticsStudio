// グラフ表現に向くエンティティ・関係の判断基準（FR-235）。純粋な関数だけで書く（同じ入力は同じ結果）。
// 意味の種類・読み方・既定の判定は共通の語彙で、顧客固有の語を持たない。画面の部品を参照しない（NFR-MAINT-001）。
import { MEANINGS, MEANING_LABELS, isMeaning, readMeaning, type Meaning } from '../schema/graph';

/** 利用者の問い。(a) 連鎖・経路 (b) 多対多 (c) 到達性・孤立 (d) つながりの多い中心 */
export const GRAPH_QUESTIONS = ['path', 'manyToMany', 'reachability', 'hub'] as const;
export type GraphQuestion = (typeof GRAPH_QUESTIONS)[number];
export const GRAPH_QUESTION_LABELS: Readonly<Record<GraphQuestion, string>> = {
  path: '連鎖・経路をたどる', manyToMany: '多対多の関係を見る', reachability: '到達性・孤立を確かめる', hub: 'つながりの多い中心を探す',
};

/** グラフ以外の表現が向く関係の性質 */
export const NON_GRAPH_NATURES = ['timeOrder', 'locationOnly', 'parentChild', 'oneToOne', 'quantity'] as const;
export type NonGraphNature = (typeof NON_GRAPH_NATURES)[number];

/** 推奨の表現 */
export type Representation = 'graph' | 'gantt' | 'timeline' | 'map' | 'tree' | 'nested' | 'table' | 'chart';
export const REPRESENTATION_LABELS: Readonly<Record<Representation, string>> = {
  graph: 'グラフ（ノードと関係）', gantt: 'ガント', timeline: '時系列', map: '地図', tree: 'ツリー', nested: '入れ子', table: '表', chart: 'グラフ（チャート）',
};

const NATURE_ADVICE: Readonly<Record<NonGraphNature, { reason: string; recommended: readonly Representation[] }>> = {
  timeOrder: { reason: '時間の前後だけの関係です', recommended: ['gantt', 'timeline', 'table'] },
  locationOnly: { reason: '位置だけの関係です', recommended: ['map'] },
  parentChild: { reason: '純粋な親子の関係です', recommended: ['tree', 'nested'] },
  oneToOne: { reason: '一対一の属性です', recommended: ['table'] },
  quantity: { reason: '数量の比較です', recommended: ['chart'] },
};

export type SuitabilityReasonCode = 'suitable' | 'no-direction' | 'no-meaning' | 'invalid-meaning' | NonGraphNature;

export interface RelationInput {
  /** 意味の種類（九つのどれか）。ないものは「意味なし」 */
  meaning?: string | null;
  /** 向きがあるか。省略は「向きあり」（関係は from→to の有向で持つ）。false は向きなし */
  directed?: boolean;
  /** 利用者の問い。省略すると、意味の種類の既定の問い（DEFAULT_QUESTION_BY_MEANING）を使う */
  question?: GraphQuestion;
  /** グラフ以外の表現が向く性質（時間の前後だけ・位置だけ・親子・一対一・数量） */
  nature?: NonGraphNature;
}

export interface Suitability {
  suitable: boolean;
  code: SuitabilityReasonCode;
  /** 日本語の理由（画面にそのまま出せる） */
  reason: string;
  /** 向かないときの推奨の表現（向くときは ['graph']） */
  recommended: readonly Representation[];
  /** 向くときに満たした問い */
  question?: GraphQuestion;
}

/** 意味の種類ごとの既定の問い */
export const DEFAULT_QUESTION_BY_MEANING: Readonly<Record<Meaning, GraphQuestion>> = {
  causes: 'path', dependsOn: 'path', influences: 'path', derivedFrom: 'path',
  memberOf: 'manyToMany', owns: 'manyToMany', measures: 'hub', controls: 'hub', locatedIn: 'reachability',
};

/**
 * 関係がグラフ表現に向くかを判定する（FR-235 AC-545）。
 * 優先順: ①意味がなく、グラフ以外が向く性質があるもの ②向きなし ③意味なし／不正 ④性質が別の表現に向くもの ⑤向く。
 * 向かない判定でも Graph の表示は選べる（強制しない）。
 */
export function judgeGraphSuitability(input: RelationInput): Suitability {
  const hasMeaning = input.meaning !== undefined && input.meaning !== null && input.meaning !== '';
  if (input.nature && !hasMeaning) {
    const a = NATURE_ADVICE[input.nature];
    return { suitable: false, code: input.nature, reason: a.reason, recommended: a.recommended };
  }
  if (input.directed === false) {
    return { suitable: false, code: 'no-direction', reason: '向きなし（向きのない関係は、つながりの方向を読めません）', recommended: ['table'] };
  }
  if (!hasMeaning) {
    return { suitable: false, code: 'no-meaning', reason: '意味なし（意味の種類がない関係は、何のつながりか読めません）', recommended: ['table'] };
  }
  if (!isMeaning(input.meaning)) {
    return { suitable: false, code: 'invalid-meaning', reason: `意味なし（「${String(input.meaning)}」は九つの意味の種類にありません）`, recommended: ['table'] };
  }
  if (input.nature) {
    const a = NATURE_ADVICE[input.nature];
    return { suitable: false, code: input.nature, reason: a.reason, recommended: a.recommended };
  }
  const question = input.question ?? DEFAULT_QUESTION_BY_MEANING[input.meaning];
  return { suitable: true, code: 'suitable', reason: `${MEANING_LABELS[input.meaning].name}の関係で、「${GRAPH_QUESTION_LABELS[question]}」問いに向きます`, recommended: ['graph'], question };
}

/** 既定の判定の対応表（FR-235）。向く七つの組と、向かない一つの組 */
export interface DefaultJudgment {
  key: string;
  /** 共通の語彙による説明（顧客固有の語を含まない） */
  description: string;
  meaning?: Meaning;
  question?: GraphQuestion;
  nature?: NonGraphNature;
  suitable: boolean;
}
export const DEFAULT_JUDGMENTS: readonly DefaultJudgment[] = [
  { key: 'causal', description: '課題→原因→解決策→効果（因果）', meaning: 'causes', question: 'path', suitable: true },
  { key: 'dependency', description: '工程→工程（依存）', meaning: 'dependsOn', question: 'path', suitable: true },
  { key: 'membership', description: '組織→人（所属・所有）', meaning: 'memberOf', question: 'manyToMany', suitable: true },
  { key: 'lineage', description: 'データエンティティ→列・ユースケース（データ系統）', meaning: 'derivedFrom', question: 'path', suitable: true },
  { key: 'influence', description: 'KPI→OKR（影響）', meaning: 'influences', question: 'path', suitable: true },
  { key: 'measurement-control', description: '設備→センサー/指標（計測・制御）', meaning: 'measures', question: 'hub', suitable: true },
  { key: 'placement', description: '拠点→設備（配置）', meaning: 'locatedIn', question: 'reachability', suitable: true },
  { key: 'time-order', description: '論点→次のアクション（時間の前後だけ）', nature: 'timeOrder', suitable: false },
];

export interface PackRelationLike { id?: string; from: string; to: string; meaning?: string | null; label?: string; directed?: boolean; nature?: NonGraphNature }
export interface RelationJudgment { relation: PackRelationLike; result: Suitability }
export interface PackJudgmentSummary { judgments: RelationJudgment[]; suitable: number; unsuitable: number; total: number }

/** パックの関係の集まりに判断基準を適用し、件数をまとめる（FR-235 AC-547） */
export function judgeRelations(relations: readonly PackRelationLike[]): PackJudgmentSummary {
  const judgments = relations.map((relation) => ({
    relation,
    result: judgeGraphSuitability({ meaning: relation.meaning, directed: relation.directed, nature: relation.nature }),
  }));
  const suitable = judgments.filter((j) => j.result.suitable).length;
  return { judgments, suitable, unsuitable: judgments.length - suitable, total: judgments.length };
}

export { MEANINGS, MEANING_LABELS, isMeaning, readMeaning };
export type { Meaning };
