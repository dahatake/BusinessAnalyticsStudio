// 分析結果の AI 下書き（FR-140 AC-212・AC-213・AC-219）。送信してよいのは、企業ごとに許可された Project だけ。
// 送信は src/ai の askAi（FR-132 の明示的な有効化がなければモックで、何も外へ送らない）を通る。
import type { AiResult } from '../ai/client';
import type { Analysis } from '../store/analyses';
import { analysisResult } from '../store/analyses';
import { getMethod } from '../methods/model';

export const NOT_ALLOWED_MESSAGE =
  'この企業は外部 AI への送信が許可されていません。企業の設定で「外部 AI への送信を許可する」を有効にすると、AI 下書きを依頼できます。';
export const AI_UNAVAILABLE_MESSAGE = 'AI を利用できませんでした。手動で入力を続けられます。';

export type DraftOutcome =
  | { status: 'draft'; text: string; mock: boolean }
  | { status: 'not-allowed'; message: string }
  | { status: 'error'; message: string };

export function draftPrompt(a: Analysis): string {
  const m = getMethod(a.methodId);
  const r = analysisResult(a);
  return `手法「${m.name}」の分析結果の要約と次の一手の下書き。項目: ${r.items.map((i) => `${i.label}=${i.value}`).join('、')}`;
}

/** 許可がなければ ask を呼ばない（送信しない）。失敗しても例外にせず、結果で返す。 */
export async function requestDraft(
  allowed: boolean | undefined,
  a: Analysis,
  ask: (prompt: string) => Promise<AiResult>,
): Promise<DraftOutcome> {
  if (allowed !== true) return { status: 'not-allowed', message: NOT_ALLOWED_MESSAGE };
  try {
    const r = await ask(draftPrompt(a));
    if (!r.answer.trim()) return { status: 'error', message: AI_UNAVAILABLE_MESSAGE };
    return { status: 'draft', text: r.answer, mock: r.mode === 'mock' };
  } catch {
    return { status: 'error', message: AI_UNAVAILABLE_MESSAGE };
  }
}
