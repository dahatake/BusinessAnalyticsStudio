// 顧客の了承の記録（FR-181）。案件（企業・Project の単位）ごとの自己申告の記録で、アプリは了承の事実を検証しない。
// 画面（useConsent）とパイプライン（scripts/pipeline/consent.ts）が同じ判定を使う。
// 個人名・連絡先は保存しない（AC-383）: 役割名と方法のメモだけを受け付ける。

export interface ConsentRecord {
  /** 了承あり。記録がある＝了承あり。取り消すと記録ごと消える */
  granted: true;
  /** 確認日（YYYY-MM-DD） */
  confirmedOn: string;
  /** 確認した相手の役割と方法のメモ（個人名・連絡先を含まない） */
  note: string;
}

/** 案件の鍵（企業・Project の単位）。デモは別の Project なので別の鍵になり、了承は混ざらない */
export function consentKeyOf(customerName: string, projectName: string): string {
  return `${customerName} / ${projectName}`;
}

export const CONSENT_SELF_DECLARED_NOTICE =
  '了承は利用者の自己申告の記録です。アプリは顧客の了承の事実を検証しません。端末内にだけ保存し、個人名・連絡先は書かないでください。';

/** 書き出す consent.json の置き場所の案内（AC-386）。パイプラインの readConsent が読む場所 */
export const CONSENT_EXPORT_FILE = 'consent.json';
export const CONSENT_EXPORT_GUIDE =
  '書き出した consent.json は、パイプラインの作業フォルダー <workspace> の直下（<workspace>/consent.json）に置くと、パイプラインがこの案件の了承の記録として読みます。アプリは自動では書き込まず、通信もしません。';

/** consent.json の内容（パイプラインの readConsent が読む形）。この案件の記録だけを含む（AC-384・AC-385） */
export function buildConsentExport(key: string, record: ConsentRecord): string {
  const checked = parseConsentRecord(record);
  if (!key || !checked) throw new Error('了承の記録がないため書き出せません。');
  return `${JSON.stringify({ records: { [key]: { granted: true, confirmedOn: checked.confirmedOn, note: checked.note } } }, null, 2)}\n`;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+|[＠@]/;
const PHONE = /(?:\d[\d\s\-－ー()（）]{6,}\d)/;
const URL_LIKE = /https?:\/\/|www\./i;
/** 「〜様・〜氏・〜殿・〜さん」の呼称が付いた名前らしい表現（「様式」「氏名」のように漢字が続くものは除く） */
const HONORIFIC = /[一-龠ぁ-んァ-ヶA-Za-z]{1,}(?:様|氏|殿|さん|君|くん|ちゃん)(?![一-龠])/;
const LATIN_NAME = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/;

/** メモが個人名・連絡先らしければ、理由を返す（なければ undefined） */
export function personalInfoReason(note: string): string | undefined {
  if (EMAIL.test(note)) return 'メールアドレスらしい文字は保存できません。';
  if (PHONE.test(note)) return '電話番号らしい数字は保存できません。';
  if (URL_LIKE.test(note)) return 'URL は保存できません。';
  if (HONORIFIC.test(note)) return '個人名らしい表現（〇〇様・〇〇さんなど）は保存できません。役割名だけを書いてください。';
  if (LATIN_NAME.test(note)) return '個人名らしい表現は保存できません。役割名だけを書いてください。';
  return undefined;
}

export type ConsentInputResult = { ok: true; record: ConsentRecord } | { ok: false; reason: string };

/** 入力を検証して記録にする。個人名・連絡先らしい入力は保存しない */
export function buildConsentRecord(confirmedOn: string, note: string): ConsentInputResult {
  const n = note.trim();
  if (!n) return { ok: false, reason: '確認した相手の役割と方法のメモを入力してください。' };
  if (n.length > 200) return { ok: false, reason: 'メモは 200 文字以内にしてください。' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(confirmedOn) || Number.isNaN(Date.parse(confirmedOn))) {
    return { ok: false, reason: '確認日は YYYY-MM-DD の形で入力してください。' };
  }
  const why = personalInfoReason(n);
  if (why) return { ok: false, reason: why };
  return { ok: true, record: { granted: true, confirmedOn, note: n } };
}

/** 保存済みの値が正しい形で、個人名・連絡先らしくなければ記録として返す（壊れた・改ざんされた値は無視する） */
export function parseConsentRecord(v: unknown): ConsentRecord | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (o['granted'] !== true || typeof o['confirmedOn'] !== 'string' || typeof o['note'] !== 'string') return undefined;
  const r = buildConsentRecord(o['confirmedOn'], o['note']);
  return r.ok ? r.record : undefined;
}
