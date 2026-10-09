// 議論メモ（Markdown）の書き出しと読み込み（FR-051・FR-056）。
// 形式: front matter（YAML）＋ 人が読む節 ＋ 機械可読の JSON ブロック（最初の ```json フェンス）。
// 復元は JSON ブロックだけを正とする。人が読む節は引用（`> `）で書くので、本文中のフェンスが JSON ブロックと取り違えられない。
import { z } from 'zod';
import {
  RECORD_FIELDS, STATUS_DISPLAY_LABEL, ThemeSchema, statusOrigin, type Theme,
} from './model';

export const MEMO_FORMAT = 'edb-discussion-memo';
export const MEMO_VERSION = 1;

export const MemoSnapshotSchema = z.object({
  format: z.literal(MEMO_FORMAT, { error: `format は "${MEMO_FORMAT}" ではありません` }),
  version: z.number().int().min(1).max(MEMO_VERSION, { error: `この版のアプリが読めない形式の版です（対応: ${MEMO_VERSION} まで）` }),
  customer: z.object({ name: z.string().min(1), projectName: z.string().min(1) }),
  exportedAt: z.string().optional(),
  discussion: z.object({ themes: z.array(ThemeSchema) }),
  /** 全量エクスポートで足す、データ（課題・解決策など）。キーごとに `registerSnapshotSource` した処理が復元する */
  data: z.record(z.string(), z.unknown()).optional(),
});
export type MemoSnapshot = z.infer<typeof MemoSnapshotSchema>;

const yamlString = (s: string) => JSON.stringify(s);

/** 引用ブロックにして、本文中のフェンスや見出しが構造を壊さないようにする。 */
function quote(text: string): string {
  const t = text.trim();
  if (t === '') return '> （未記入）';
  return t.split(/\r?\n/).map((l) => (l === '' ? '>' : `> ${l}`)).join('\n');
}

/** JSON 文字列の中のバッククォートを \u0060 にして、フェンスの終端と取り違えないようにする。 */
function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/`/g, '\\u0060');
}

export function themeToMarkdown(t: Theme): string {
  const lines: string[] = [];
  const origin = statusOrigin(t.status) === 'ai' ? 'AI の提案' : '顧客の選択';
  lines.push(`## テーマ: ${t.title.replace(/\s+/g, ' ')}`);
  lines.push('', `- 決定ステータス: ${STATUS_DISPLAY_LABEL[t.status]}（${origin}）`);
  if (t.aiProposal.trim() !== '') lines.push('', '### AI の提案', '', quote(t.aiProposal));
  for (const f of RECORD_FIELDS) lines.push('', `### ${f.label}`, '', quote(t[f.key]));
  lines.push('', '### 次のアクション', '');
  if (t.actions.length === 0) lines.push('（なし）');
  for (const a of t.actions) {
    lines.push(`- ${a.text.replace(/\s+/g, ' ') || '（内容なし）'}（担当: ${a.owner || '未定'}／期限: ${a.due || '未定'}）`);
  }
  return lines.join('\n');
}

export interface BuildMemoInput {
  customerName: string;
  projectName: string;
  themes: readonly Theme[];
  /** 全量エクスポートで足すデータ */
  data?: Record<string, unknown>;
  /** 指定すると、議論テーマの節の代わりにこの本文（見出しは `##` 以下）を書く。全量エクスポート（FR-053）が 15 種類の節を渡す */
  body?: string;
  now?: Date;
}

/** 議論メモの Markdown を作る。 */
export function buildDiscussionMemo(input: BuildMemoInput): string {
  const now = input.now ?? new Date();
  const snapshot: MemoSnapshot = {
    format: MEMO_FORMAT,
    version: MEMO_VERSION,
    customer: { name: input.customerName, projectName: input.projectName },
    exportedAt: now.toISOString(),
    discussion: { themes: input.themes.map((t) => ThemeSchema.parse(t)) },
    ...(input.data && Object.keys(input.data).length > 0 ? { data: input.data } : {}),
  };
  const out: string[] = [
    '---',
    `format: ${MEMO_FORMAT}`,
    `version: ${MEMO_VERSION}`,
    `customer: ${yamlString(input.customerName)}`,
    `project: ${yamlString(input.projectName)}`,
    `exported_at: ${yamlString(now.toISOString())}`,
    '---',
    '',
    `# ${input.customerName} ${input.projectName} 議論メモ`,
    '',
  ];
  if (input.body !== undefined) {
    out.push(input.body.trimEnd(), '');
  } else {
    if (input.themes.length === 0) out.push('議論テーマはまだありません。', '');
    for (const t of input.themes) out.push(themeToMarkdown(t), '');
  }
  out.push(
    '## 機械可読データ',
    '',
    'このブロックから、アプリで読み込んで状態を復元できます。編集するときは JSON の形式を壊さないでください。',
    '',
    '```json',
    safeJson(snapshot),
    '```',
    '',
  );
  return out.join('\n');
}

export type ParseMemoResult = { ok: true; snapshot: MemoSnapshot } | { ok: false; errors: string[] };

const FENCE = /^```json[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/m;

/** 議論メモの Markdown を読む。形式が壊れていれば、原因を errors に入れて返す（何も適用しない）。 */
export function parseDiscussionMemo(text: string): ParseMemoResult {
  const src = text.replace(/^\uFEFF/, '');
  if (!/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/.test(src)) {
    return { ok: false, errors: ['先頭に front matter（--- で囲んだ見出し情報）がないため、議論メモとして読み込めません。'] };
  }
  const m = FENCE.exec(src);
  if (!m) return { ok: false, errors: ['JSON ブロック（```json で始まる機械可読データ）が見つかりません。'] };
  let raw: unknown;
  try {
    raw = JSON.parse(m[1] ?? '');
  } catch (e) {
    return { ok: false, errors: [`JSON ブロックを読み取れません（${e instanceof Error ? e.message : String(e)}）。ファイルが壊れている可能性があります。`] };
  }
  const r = MemoSnapshotSchema.safeParse(raw);
  if (!r.success) {
    return {
      ok: false,
      errors: r.error.issues.slice(0, 10).map((i) => `JSON ブロックの ${i.path.join('.') || '(最上位)'}: ${i.message}`),
    };
  }
  return { ok: true, snapshot: r.data };
}
