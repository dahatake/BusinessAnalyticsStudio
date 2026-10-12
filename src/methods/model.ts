// 組織・業務の分析手法（SWOT・ファイブフォース・バリューチェーン・3C・バランスト・スコアカード）の定義と計算（FR-133〜135）。
// 手法の名称と枠組みだけを使い、既存資料の本文は複製しない。項目名は一般的な観点の短い見出しである。

export type MethodId = 'swot' | 'five-forces' | 'value-chain' | '3c' | 'bsc';

/** 1 項目の分類・値（スコア）・重み */
export interface Factor { id: string; label: string; category: string }
export interface Method { id: MethodId; name: string; summary: string; categories: string[]; factors: Factor[] }

/** スコアの範囲・既定、重みの範囲・既定 */
export const SCORE = { min: 0, max: 10, def: 5 } as const;
export const WEIGHT = { min: 1, max: 5, def: 1 } as const;

const f = (id: string, category: string, label: string): Factor => ({ id: `factor-${id}`, label, category });

export const METHODS: Method[] = [
  {
    id: 'swot', name: 'SWOT 分析', summary: '内部の強み・弱みと外部の機会・脅威を評価する',
    categories: ['強み', '弱み', '機会', '脅威'],
    factors: [
      f('swot-strength-1', '強み', '自社の技術力'), f('swot-strength-2', '強み', '顧客基盤'),
      f('swot-weakness-1', '弱み', '人材の不足'), f('swot-weakness-2', '弱み', '業務の属人化'),
      f('swot-opportunity-1', '機会', '市場の拡大'), f('swot-opportunity-2', '機会', '規制の緩和'),
      f('swot-threat-1', '脅威', '競合の参入'), f('swot-threat-2', '脅威', '需要の変動'),
    ],
  },
  {
    id: 'five-forces', name: 'ファイブフォース分析', summary: '業界の競争を 5 つの力の強さで評価する',
    categories: ['競争', '新規参入', '代替品', '買い手', '売り手'],
    factors: [
      f('ff-rivalry-1', '競争', '既存企業間の競争'), f('ff-entry-1', '新規参入', '新規参入の脅威'),
      f('ff-substitute-1', '代替品', '代替品の脅威'), f('ff-buyer-1', '買い手', '買い手の交渉力'),
      f('ff-supplier-1', '売り手', '売り手の交渉力'),
    ],
  },
  {
    id: 'value-chain', name: 'バリューチェーン分析', summary: '活動ごとの価値への貢献を評価する',
    categories: ['主活動', '支援活動'],
    factors: [
      f('vc-primary-1', '主活動', '調達'), f('vc-primary-2', '主活動', '製造'), f('vc-primary-3', '主活動', '出荷・物流'),
      f('vc-primary-4', '主活動', '販売'), f('vc-primary-5', '主活動', 'サービス'),
      f('vc-support-1', '支援活動', '全般管理'), f('vc-support-2', '支援活動', '人事・労務'), f('vc-support-3', '支援活動', '技術開発'),
    ],
  },
  {
    id: '3c', name: '3C 分析', summary: '顧客・競合・自社の観点で評価する',
    categories: ['顧客', '競合', '自社'],
    factors: [
      f('c3-customer-1', '顧客', '市場規模'), f('c3-customer-2', '顧客', 'ニーズの強さ'),
      f('c3-competitor-1', '競合', '競合の強さ'), f('c3-competitor-2', '競合', '差別化の余地'),
      f('c3-company-1', '自社', '経営資源'), f('c3-company-2', '自社', '実行力'),
    ],
  },
  {
    id: 'bsc', name: 'バランスト・スコアカード', summary: '4 つの視点で業績の達成度を評価する',
    categories: ['財務', '顧客', '業務プロセス', '学習と成長'],
    factors: [
      f('bsc-finance-1', '財務', '収益の伸び'), f('bsc-customer-1', '顧客', '顧客満足'),
      f('bsc-process-1', '業務プロセス', 'プロセスの品質'), f('bsc-growth-1', '学習と成長', '人材の育成'),
    ],
  },
];

export function getMethod(id: MethodId): Method {
  const m = METHODS.find((x) => x.id === id);
  if (!m) throw new Error(`未知の分析手法: ${id}`);
  return m;
}

/** 手法ごとのパラメーター（項目ごとの値と重み） */
export type Params = Record<string, { score: number; weight: number }>;

export function defaultParams(m: Method): Params {
  return Object.fromEntries(m.factors.map((x) => [x.id, { score: SCORE.def, weight: WEIGHT.def }]));
}

export type Field = 'score' | 'weight';
export type Parsed = { ok: true; value: number } | { ok: false; reason: string };

/** 入力文字列を検証する。範囲外・型違いは、原因と直し方を返す。 */
export function parseField(field: Field, raw: string): Parsed {
  const range = field === 'score' ? SCORE : WEIGHT;
  const name = field === 'score' ? '値' : '重み';
  const text = raw.trim();
  if (text === '' || !/^[+-]?\d+(\.\d+)?$/.test(text)) {
    return { ok: false, reason: `${name}は数値で入力してください（${range.min}〜${range.max}）。` };
  }
  const n = Number(text);
  if (n < range.min || n > range.max) {
    return { ok: false, reason: `${name}は ${range.min}〜${range.max} の範囲で入力してください（入力: ${text}）。` };
  }
  if (field === 'weight' && !Number.isInteger(n)) {
    return { ok: false, reason: `重みは整数で入力してください（入力: ${text}）。` };
  }
  return { ok: true, value: n };
}

export interface ResultItem { id: string; label: string; category: string; score: number; weight: number; value: number }
export interface CategoryTotal { category: string; total: number; count: number }
export interface AnalysisResult { items: ResultItem[]; totals: CategoryTotal[] }

/** 結果 = 項目ごとの 値 × 重み、と分類ごとの合計 */
export function compute(m: Method, params: Params): AnalysisResult {
  const items = m.factors.map((x) => {
    const p = params[x.id] ?? { score: SCORE.def, weight: WEIGHT.def };
    return { id: x.id, label: x.label, category: x.category, score: p.score, weight: p.weight, value: p.score * p.weight };
  });
  const totals = m.categories.map((category) => {
    const inCat = items.filter((i) => i.category === category);
    return { category, count: inCat.length, total: inCat.reduce((a, i) => a + i.value, 0) };
  });
  return { items, totals };
}

/** 絞り込み: 項目名・分類・ID の部分一致（大文字小文字を区別しない）。空なら全件。 */
export function filterItems(items: ResultItem[], query: string): ResultItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => `${i.label} ${i.category} ${i.id}`.toLowerCase().includes(q));
}

export type ViewerId = 'table' | 'matrix' | 'chart';
export const VIEWERS: { id: ViewerId; name: string }[] = [
  { id: 'table', name: '表' }, { id: 'matrix', name: 'マトリクス' }, { id: 'chart', name: 'グラフ' },
];
