// チャットの Microsoft Foundry 送信（FR-286）の純粋な部分。送る内容（質問・直近の履歴・顧客パックの根拠）の組み立てと、理由の文言。
// 履歴は直近 HISTORY_PAIRS 組（PARAM-123）。入力が MAX_INPUT_TOKENS（PARAM-114）を超えるときは古い履歴から落とす（FR-276 の (2)）。
// 送る内容にキーは含めない（キーは中継プロセスの外へ出ない。NFR-SEC-005）。
import type { FoundryUnavailableReason } from './foundryClient';
import { tr } from '../i18n';

/** PARAM-123: 渡す直近の会話の組数 */
export const HISTORY_PAIRS = 5;
/** PARAM-114: 1 回の入力の上限（トークン） */
export const MAX_INPUT_TOKENS = 8000;
/** PARAM-115: 1 回の出力の上限（トークン。費用の概算では出力をこの値で数える） */
export const MAX_OUTPUT_TOKENS = 1500;

export interface ChatTurn { question: string; answer: string }
export interface GroundingItem { label: string }
export interface GroundingSource { id: string; title: string }

/** 入力トークンの概算（文字数 ÷ 4 を切り上げ。FR-276） */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface FoundryPromptInput {
  question: string;
  /** これまでの会話（古い順） */
  history: readonly ChatTurn[];
  /** 質問に近い顧客パックの項目 */
  items: readonly GroundingItem[];
  /** 根拠にする出典 */
  sources: readonly GroundingSource[];
  historyPairs?: number;
  maxInputTokens?: number;
}

export interface FoundryPrompt {
  prompt: string;
  /** 実際に渡す履歴（古い順） */
  history: ChatTurn[];
  /** 入力の大きさの上限のために古い履歴を落とした（または質問を切り詰めた）か */
  trimmed: boolean;
  /** 落とした履歴の組数（上限のための分だけ。組数の上限で外れた分は含めない） */
  dropped: number;
  tokens: number;
}

function render(question: string, history: readonly ChatTurn[], items: readonly GroundingItem[], sources: readonly GroundingSource[]): string {
  const lines: string[] = [
    '次の質問に、［根拠］の顧客パックの項目と出典だけを根拠に日本語で答えてください。根拠にない内容は答えず、分からないと伝えてください。',
    '［根拠］',
    ...(items.length > 0 ? items.map((i) => `- 項目: ${i.label}`) : ['- 項目: （質問に近い項目なし）']),
    ...sources.map((s) => `- 出典: ${s.title}`),
    '［これまでの会話］',
    ...(history.length > 0 ? history.flatMap((h) => [`質問: ${h.question}`, `回答: ${h.answer}`]) : ['（なし）']),
    '［質問］',
    question,
  ];
  return lines.join('\n');
}

/** Foundry へ送る内容を組み立てる。履歴は直近の組数まで、入力の上限を超えるときは古い履歴から落とす */
export function buildFoundryPrompt(inp: FoundryPromptInput): FoundryPrompt {
  const pairs = inp.historyPairs ?? HISTORY_PAIRS;
  const max = inp.maxInputTokens ?? MAX_INPUT_TOKENS;
  let hist = pairs > 0 ? inp.history.slice(-pairs) : [];
  let dropped = 0;
  let question = inp.question;
  let prompt = render(question, hist, inp.items, inp.sources);
  while (estimateTokens(prompt) > max && hist.length > 0) {
    hist = hist.slice(1);
    dropped++;
    prompt = render(question, hist, inp.items, inp.sources);
  }
  let cut = false;
  if (estimateTokens(prompt) > max) {
    // 履歴を全部落としても超えるときは、質問を切り詰める
    const over = (estimateTokens(prompt) - max) * 4;
    question = question.slice(0, Math.max(1, question.length - over));
    prompt = render(question, hist, inp.items, inp.sources);
    cut = true;
  }
  return { prompt, history: hist, trimmed: dropped > 0 || cut, dropped, tokens: estimateTokens(prompt) };
}

export const TRIM_NOTICE = '入力が大きいため、古い会話の履歴を省略して送信しました（切り詰め）。';

/** Foundry を呼べなかった原因ごとの理由（画面に出す。キーの値・中継のメッセージは含めない） */
export function foundryReasonText(reason: FoundryUnavailableReason): string {
  switch (reason) {
    case 'timeout': return tr('Microsoft Foundry の応答がタイムアウトしました。しばらくしてから送信し直してください。');
    case 'error': return tr('Microsoft Foundry がエラーを返しました。設定（エンドポイント・デプロイ名・キー）を確認して送信し直してください。');
    case 'person-unconfirmed': return tr('種別「人」を含む顧客パックの送信の確認が済んでいないため、送信しませんでした。');
    case 'consent': return '顧客の了承の記録がないため、送信しませんでした。設定画面で了承の記録を入力してください。';
    case 'disabled': return tr('Microsoft Foundry の実接続が無効のため、送信しませんでした。');
    case 'not-configured': return tr('Microsoft Foundry が未設定のため、送信しませんでした。');
    case 'relay': return tr('中継プロセスに届きませんでした。`npm run relay` で起動しているか確認して、送信し直してください。');
  }
}
