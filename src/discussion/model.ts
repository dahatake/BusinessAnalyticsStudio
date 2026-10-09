// 議論テーマのデータモデル（FR-048〜FR-051）。画面の部品を参照しない純粋なモジュール（NFR-MAINT-001）。
import { z } from 'zod';
import { CreatedBySchema, IdSchema } from '../schema/common';

/** 決定ステータス（FR-050）。`ai-proposed` だけが AI の提案で、それ以外は顧客が選んだ状態。 */
export const DECISION_STATUSES = ['ai-proposed', 'considering', 'decided', 'on-hold'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

/** 選択肢に出す名前（ドロップダウン）。 */
export const STATUS_OPTION_LABEL: Record<DecisionStatus, string> = {
  'ai-proposed': 'AI 提案',
  considering: '検討中',
  decided: '決定',
  'on-hold': '保留',
};

/** 一覧・詳細に出す表示。決定は「顧客決定」と書き、AI の提案と文字で区別する（色だけに頼らない）。 */
export const STATUS_DISPLAY_LABEL: Record<DecisionStatus, string> = {
  'ai-proposed': 'AI 提案',
  considering: '検討中',
  decided: '顧客決定',
  'on-hold': '保留',
};

/** 誰の判断か。AI 提案だけが AI、それ以外は顧客の選択。 */
export function statusOrigin(status: DecisionStatus): 'ai' | 'customer' {
  return status === 'ai-proposed' ? 'ai' : 'customer';
}

/** 議論の記録の 6 項目（FR-049）。キーと見出し。次のアクションは別に持つ。 */
export const RECORD_FIELDS = [
  { key: 'options', label: '選択肢' },
  { key: 'recommendation', label: '戦略的提言' },
  { key: 'rationale', label: '根拠' },
  { key: 'costBenefit', label: 'コスト/効果' },
  { key: 'decisions', label: '決定事項' },
  { key: 'openIssues', label: '未決事項' },
] as const;
export type RecordFieldKey = (typeof RECORD_FIELDS)[number]['key'];

export type DueResult = { ok: true; value: string } | { ok: false; reason: string };

/** 期限の入力を検証する。空は未設定として許す。`YYYY-MM-DD`（`/` 区切りも可）の実在する日付だけ受け付け、`YYYY-MM-DD` にそろえる。 */
export function parseDueDate(input: string): DueResult {
  const s = input.trim();
  if (s === '') return { ok: true, value: '' };
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (!m) return { ok: false, reason: '期限は日付（例: 2026-11-30）で入力してください。日付として読み取れません。' };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return { ok: false, reason: `${s} は存在しない日付です。期限は実在する日付で入力してください。` };
  }
  return { ok: true, value: `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

export const NextActionSchema = z.object({
  id: IdSchema,
  text: z.string().default(''),
  owner: z.string().default(''),
  /** 期限。空、または `YYYY-MM-DD` の実在する日付 */
  due: z.string().default('').refine((v) => v === '' || parseDueDate(v).ok, { message: '期限は日付で入力してください' }),
});
export type NextAction = z.infer<typeof NextActionSchema>;

export const ThemeSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  /** 元になった課題の ID（課題から作ったテーマ） */
  issueId: IdSchema.optional(),
  /** テーマを作った者（AI の提案か、利用者か） */
  createdBy: CreatedBySchema,
  status: z.enum(DECISION_STATUSES),
  /** AI の提案の内容。決定後も別の欄に残す（FR-050） */
  aiProposal: z.string().default(''),
  /** AI の提案を作ったときの接続（モックか実接続か）。表示のラベルに使う */
  aiMode: z.enum(['mock', 'connected']).optional(),
  options: z.string().default(''),
  recommendation: z.string().default(''),
  rationale: z.string().default(''),
  costBenefit: z.string().default(''),
  decisions: z.string().default(''),
  openIssues: z.string().default(''),
  actions: z.array(NextActionSchema).default([]),
});
export type Theme = z.infer<typeof ThemeSchema>;

let seq = 0;
/** 一意な ID（小文字英数字とハイフン）。`prefix` は ID 規則に合う文字列。 */
export function newId(prefix: string): string {
  seq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}${rand}`;
}

export function createTheme(init: Partial<Theme> & { title: string }): Theme {
  return {
    id: newId('theme'),
    createdBy: 'human',
    status: 'considering',
    aiProposal: '',
    options: '',
    recommendation: '',
    rationale: '',
    costBenefit: '',
    decisions: '',
    openIssues: '',
    actions: [],
    ...init,
  };
}

export function createNextAction(): NextAction {
  return { id: newId('act'), text: '', owner: '', due: '' };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `yyyymmdd`（端末のローカル日付） */
export function yyyymmdd(d: Date = new Date()): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** ファイル名に使えない文字を `_` にする。 */
export function sanitizeFilePart(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
}

/** FR-051: 保存の既定のファイル名 `<yyyymmdd>-{{顧客名}}-{{Project名}}-discussion-memo.md` */
export function defaultMemoFileName(customerName: string, projectName: string, date: Date = new Date()): string {
  return `${yyyymmdd(date)}-${sanitizeFilePart(customerName)}-${sanitizeFilePart(projectName)}-discussion-memo.md`;
}

/** 議論データを顧客パックごとに分ける鍵 */
export function packKeyOf(customerName: string, projectName: string): string {
  return `${customerName} / ${projectName}`;
}
