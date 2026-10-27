// 生成AIの効果的な活用シナリオの分析（FR-284）。解決策に生成AIを使うべきかを、適合性の判断基準でルールベースに判定する（既定のモック。外部送信なし）。
// 生成AIを無理に使わない: 結論は「適する」「条件付きで適する」「不要／不向き」のいずれかで、「不要／不向き」も正当な結論として扱う。
// Foundry 実接続（FR-285）の結果も同じ形（ScenarioResult）で受け取り、失敗時はこの判定を代替として使う。
import { tr } from '../i18n';

/** 入力の文字数の上限（PARAM-122） */
export const GENAI_MAX_INPUT_CHARS = 8000;
/** Foundry 呼び出しのタイムアウト秒（PARAM-121）。中継プロセスの既定と同じ */
export const GENAI_TIMEOUT_SECONDS = 60;

export type Conclusion = 'suitable' | 'conditional' | 'unsuitable';
/** yes = 生成AI向きの条件を満たす、partial = 条件付き、no = 満たさない（生成AIより他の手段が向く） */
export type Verdict = 'yes' | 'partial' | 'no';

// 画面に出る文言は、参照した時点の言語で返す（getter）
export const CONCLUSION_LABELS: Record<Conclusion, string> = {
  get suitable() { return tr('生成AIが適する'); },
  get conditional() { return tr('条件付きで適する'); },
  get unsuitable() { return tr('生成AIは不要／不向き'); },
};
export const VERDICT_LABELS: Record<Verdict, string> = {
  get yes() { return tr('向く'); },
  get partial() { return tr('条件付き'); },
  get no() { return tr('向かない'); },
};

export interface CriterionDef { id: string; label: string; question: string }
/** 適合性の判断基準（AI提案。FR-284） */
export const CRITERIA: readonly CriterionDef[] = [
  { id: 'unstructured-input', get label() { return tr('入力の性質'); }, get question() { return tr('入力が非定型の文章・画像・音声などか（定型の数値・項目なら従来の処理で足りる）'); } },
  { id: 'open-output', get label() { return tr('出力の性質'); }, get question() { return tr('出力が正解の一意でない生成（要約・文案・提案など）か'); } },
  { id: 'hard-to-ruleify', get label() { return tr('規則化の難しさ'); }, get question() { return tr('規則・条件分岐で書き切るのが難しいか（規則化できるならルール・既存ソフトが確実で安い）'); } },
  { id: 'error-tolerance', get label() { return tr('誤りの許容度'); }, get question() { return tr('誤りを人が確認・修正できるか（誤りが許されない処理には向かない）'); } },
  { id: 'accountability', get label() { return tr('説明責任'); }, get question() { return tr('判断の根拠を説明する責任が重くないか（監査・法令・審査では生成AIだけに任せない）'); } },
  { id: 'confidentiality', get label() { return tr('データの機密性'); }, get question() { return tr('扱うデータを外部のサービスへ送れるか（個人情報・機密は匿名化や社内利用が条件）'); } },
  { id: 'cost-benefit', get label() { return tr('費用対効果'); }, get question() { return tr('件数・頻度が十分で、生成AIの費用に見合う効果が見込めるか'); } },
];

export interface CriterionResult { id: string; label: string; verdict: Verdict; reason: string }

export interface ScenarioResult {
  conclusion: Conclusion;
  criteria: CriterionResult[];
  /** 生成AIを使う具体的な理由、または使わない理由（文章） */
  reason: string;
  /** 生成AI以外の代替案 */
  alternatives: string[];
}

export type InputCheck = { ok: true; text: string } | { ok: false; reason: string; action: string };

/** 入力の検査（AC-736）。空・上限超過は実行せず、理由と対処を返す */
export function validateInput(raw: string, max: number = GENAI_MAX_INPUT_CHARS): InputCheck {
  const text = raw.trim();
  if (text === '') return { ok: false, reason: tr('解決策が入力されていないため、分析を実行しません。'), action: tr('解決策を入力するか、本アプリの解決策を選んでください。') };
  if (text.length > max) {
    return { ok: false, reason: tr('入力が {max} 文字を超えている（{len} 文字）ため、分析を実行しません。', { max, len: text.length }), action: tr('{max} 文字以内に短くしてください。', { max }) };
  }
  return { ok: true, text };
}

const has = (t: string, words: readonly string[]): boolean => words.some((w) => t.includes(w));

const UNSTRUCTURED = ['文章', 'メール', '要約', '分類', '問い合わせ', '問合せ', '議事録', '文書', '画像', '音声', 'チャット', 'レビュー', '自由記述', '翻訳', 'ドキュメント', '契約書', '報告書', '日報', 'コメント', '会話', '対話', '資料', 'マニュアル', 'FAQ', '検索'];
const STRUCTURED = ['金額', '計算', '集計', '数値', '在庫', '請求', '承認', 'フロー', '台帳', 'マスタ', '入力チェック', '転記', '照合', '残高', '税', '給与', '勤怠', '定型'];
const OPEN_OUTPUT = ['生成', '作成', '提案', '草案', '下書き', '文案', '要約', '説明', '回答', '応答', '返信', '案内', '翻訳', 'レポート', '企画', 'アイデア', '文面'];
const FIXED_OUTPUT = ['計算', '判定', '照合', '集計', '承認', '転記', '振替', '採番', '通知', '同期', '入力チェック', '突合'];
const RULEABLE = ['定型', '計算', '承認フロー', 'ルール', '条件分岐', '転記', '集計', '入力チェック', '通知', 'スケジュール', '採番', '同期', '突合', '閾値', 'しきい値'];
const HIGH_STAKES = ['金額', '請求', '会計', '決算', '法的', '医療', '診断', '安全', '制御', '決済', '支払', '監査', '承認', '給与', '税'];
const ASSISTED = ['下書き', '草案', '提案', '要約', '候補', '支援', 'レビュー', '人が確認', '案内', '文案'];
const ACCOUNTABLE = ['監査', '法令', '規制', '与信', '採用', '審査', '承認', '評価', '査定', '診断', '懲戒'];
const SENSITIVE = ['個人情報', '機密', '社外秘', '患者', '顧客情報', '従業員', '契約', '給与', '病歴', 'マイナンバー'];
const HIGH_VOLUME = ['大量', '毎日', '毎月', '多数', '日次', '全件', '数千', '数万', '件数', '繰り返'];
const LOW_VOLUME = ['少量', '数件', '1 回', '一度だけ', '年に 1', '年1', 'まれ'];

type Judge = (t: string) => { verdict: Verdict; reason: string };

const JUDGES: Record<string, Judge> = {
  'unstructured-input': (t) => {
    const u = has(t, UNSTRUCTURED); const s = has(t, STRUCTURED);
    if (u && !s) return { verdict: 'yes', reason: '入力が文章・画像などの非定型で、決まった項目に分けにくいため、生成AIの読解力が活きます。' };
    if (s && !u) return { verdict: 'no', reason: '入力が数値・項目などの定型で、従来の処理で正確に扱えるため、生成AIの強みが要りません。' };
    if (u && s) return { verdict: 'partial', reason: '非定型の文章と定型の数値が混在します。文章の部分だけに生成AIを使い、数値は従来の処理にする分担が考えられます。' };
    return { verdict: 'partial', reason: '入力の性質が文面からは判断できません。非定型の文章・画像が中心かを確認してください。' };
  },
  'open-output': (t) => {
    const o = has(t, OPEN_OUTPUT); const f = has(t, FIXED_OUTPUT);
    if (o && !f) return { verdict: 'yes', reason: '出力が要約・文案・提案など、正解が一つに決まらない生成で、生成AIに向きます。' };
    if (f && !o) return { verdict: 'no', reason: '出力が計算・判定など、正解が一意に決まる結果で、生成AIでは再現性と正確さを保証できません。' };
    return { verdict: 'partial', reason: '出力に、生成と一意の結果が混ざります。結果の確定は規則で行い、文面の作成だけを生成AIにする方法があります。' };
  },
  'hard-to-ruleify': (t) => {
    const r = has(t, RULEABLE); const u = has(t, UNSTRUCTURED);
    if (r && !u) return { verdict: 'no', reason: '手順を規則や条件分岐で書き切れる定型処理で、規則化したほうが確実で、費用も小さくなります。' };
    if (u && !r) return { verdict: 'yes', reason: '表現の揺れが大きく、規則では網羅しにくいため、生成AIの柔軟な理解が役に立ちます。' };
    return { verdict: 'partial', reason: '規則化できる部分とできない部分があります。規則にできる部分は先に規則にしてください。' };
  },
  'error-tolerance': (t) => {
    const h = has(t, HIGH_STAKES); const a = has(t, ASSISTED);
    if (h && !a) return { verdict: 'no', reason: '金額・法的・安全などに関わり、誤りの影響が大きいため、生成AIの出力をそのまま使えません。' };
    if (a && !h) return { verdict: 'yes', reason: '下書き・候補・要約として人が確認してから使えるため、誤りを許容し、修正できます。' };
    return { verdict: 'partial', reason: '誤りの影響の大きさが判断できません。人が確認する工程を必ず置くことが条件です。' };
  },
  accountability: (t) => {
    const a = has(t, ACCOUNTABLE); const s = has(t, ASSISTED);
    if (a && !s) return { verdict: 'no', reason: '監査・法令・審査など、判断の根拠を説明する責任が重く、生成AIだけに判断を任せられません。' };
    if (s && !a) return { verdict: 'yes', reason: '最終の判断は人が行い、生成AIは支援に留まるため、説明責任を人が果たせます。' };
    return { verdict: 'partial', reason: '判断の根拠を示す責任の重さが判断できません。根拠の記録と、人の最終判断を条件にしてください。' };
  },
  confidentiality: (t) => (has(t, SENSITIVE)
    ? { verdict: 'partial', reason: '個人情報・機密を含む可能性があります。匿名化・マスキング、または社外へ送らない構成が条件です。' }
    : { verdict: 'yes', reason: '個人情報・機密を含むことは読み取れません。送信するデータの範囲は、実施前に確認してください。' }),
  'cost-benefit': (t) => {
    const hi = has(t, HIGH_VOLUME); const lo = has(t, LOW_VOLUME);
    if (hi && !lo) return { verdict: 'yes', reason: '大量・繰り返しの処理で、人手の削減が見込めるため、生成AIの利用料に見合う可能性が高いです。' };
    if (lo && !hi) return { verdict: 'no', reason: '件数が少なく、生成AIの導入・運用の費用に見合う効果が出にくいです。人手で足ります。' };
    return { verdict: 'partial', reason: '件数・頻度が判断できません。小さく試して、効果と費用を測ってから広げてください。' };
  },
};

const SCORE: Record<Verdict, number> = { yes: 2, partial: 1, no: 0 };

/** 生成AI以外の代替案（ルール・既存のソフトウェア・業務改善・統計／従来の機械学習）。解決策の文面から選ぶ */
export function alternativesFor(t: string): string[] {
  const out: string[] = [];
  if (has(t, ['計算', '集計', '転記', '照合', '突合', '入力チェック', '採番', '同期', '通知'])) out.push('ルール（条件分岐・計算式）で処理を自動化する、または表計算・既存の業務システムの機能を使う');
  if (has(t, ['承認', 'フロー', '申請', 'ワークフロー'])) out.push('既存のワークフロー製品・業務システムの承認機能で、定型の承認フローを置き換える');
  if (has(t, ['予測', '需要', '異常', '不正', '離反', '故障', '最適化', '在庫', '売上'])) out.push('統計／従来の機械学習（回帰・分類・異常検知）で、数値データから予測・検知する');
  if (has(t, ['分類', '振り分け', '検索', 'FAQ', '問い合わせ', '問合せ'])) out.push('ルールベースの振り分け、キーワード検索、既存の問い合わせ管理ソフトの機能を先に使う');
  out.push('業務改善（手順・様式・入力項目の見直し、不要な作業の廃止）で、そもそもの作業量を減らす');
  return [...new Set(out)].map((a) => tr(a));
}

function buildReason(conclusion: Conclusion, criteria: readonly CriterionResult[]): string {
  const yes = criteria.filter((c) => c.verdict === 'yes').map((c) => c.label);
  const no = criteria.filter((c) => c.verdict === 'no').map((c) => c.label);
  const partial = criteria.filter((c) => c.verdict === 'partial').map((c) => c.label);
  const q = (xs: readonly string[]) => tr('「{items}」', { items: xs.join(tr('」「')) });
  if (conclusion === 'unsuitable') {
    return tr('生成AIを使わない理由: ') + (no.length ? tr('{items}が生成AIに向きません。', { items: q(no) }) : tr('判断基準の総合の得点が低いためです。')) + tr('生成AIを使うと、費用・誤り・説明の負担が増えるわりに得るものが少ないため、下の代替案を先に検討してください。');
  }
  if (conclusion === 'suitable') {
    return tr('生成AIを使う具体的な理由: {items}の条件がそろい、生成AIの強み（非定型の理解と文章の生成）が活きます。誤りは人が確認する前提で、小さく始めて効果を測ってください。', { items: q(yes) });
  }
  const cond = [...no, ...partial];
  return tr('生成AIを使う具体的な理由: ') + (yes.length ? tr('{items}の点で生成AIの強みが活きます。', { items: q(yes) }) : '') + tr('ただし {items}は条件付きです。条件（人の確認・匿名化・規則との分担）を満たす範囲に限って使い、満たせない部分は代替案にしてください。', { items: cond.length ? q(cond) : tr('一部の基準') });
}

/** 結論の判定。中核の基準（入力・規則化）が向かないものは不向き、全体の得点で適する／条件付きを分ける */
export function judge(criteria: readonly CriterionResult[]): Conclusion {
  const v = (id: string): Verdict => criteria.find((c) => c.id === id)?.verdict ?? 'partial';
  const total = criteria.reduce((n, c) => n + SCORE[c.verdict], 0);
  const ratio = criteria.length ? total / (2 * criteria.length) : 0;
  if (v('unstructured-input') === 'no' && v('hard-to-ruleify') === 'no') return 'unsuitable';
  if (v('hard-to-ruleify') === 'no' && v('open-output') === 'no') return 'unsuitable';
  if (ratio < 0.4) return 'unsuitable';
  const hardNo = criteria.some((c) => c.verdict === 'no');
  if (ratio >= 0.75 && !hardNo) return 'suitable';
  return 'conditional';
}

/** ルールベースの分析（モック・代替）。外部へ送信しない。純粋関数 */
export function analyzeRuleBased(text: string): ScenarioResult {
  const t = text.replace(/\s+/g, ' ');
  const criteria: CriterionResult[] = CRITERIA.map((c) => { const j = JUDGES[c.id]!(t); return { id: c.id, label: c.label, verdict: j.verdict, reason: tr(j.reason) }; });
  const conclusion = judge(criteria);
  return { conclusion, criteria, reason: buildReason(conclusion, criteria), alternatives: alternativesFor(t) };
}

const isConclusion = (v: unknown): v is Conclusion => v === 'suitable' || v === 'conditional' || v === 'unsuitable';
const isVerdict = (v: unknown): v is Verdict => v === 'yes' || v === 'partial' || v === 'no';

/** 中継プロセスから受け取った結果の検査。形が違えば undefined（呼び出し側は代替を使う） */
export function parseScenarioResult(raw: unknown): ScenarioResult | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (!isConclusion(r.conclusion) || typeof r.reason !== 'string' || !r.reason.trim() || !Array.isArray(r.criteria) || !Array.isArray(r.alternatives)) return undefined;
  const criteria: CriterionResult[] = [];
  for (const c of r.criteria) {
    if (typeof c !== 'object' || c === null) return undefined;
    const o = c as Record<string, unknown>;
    if (typeof o.id !== 'string' || !isVerdict(o.verdict) || typeof o.reason !== 'string') return undefined;
    criteria.push({ id: o.id, label: CRITERIA.find((d) => d.id === o.id)?.label ?? o.id, verdict: o.verdict, reason: o.reason });
  }
  const alternatives = r.alternatives.filter((a): a is string => typeof a === 'string' && a.trim() !== '');
  if (criteria.length === 0) return undefined;
  return { conclusion: r.conclusion, criteria, reason: r.reason, alternatives: alternatives.length ? alternatives : alternativesFor('') };
}
