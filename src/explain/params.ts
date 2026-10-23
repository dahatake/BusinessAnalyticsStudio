// 「現状の説明」（FR-274〜277）の課金の安全策の既定値。docs/requirements-definition.md の PARAM-113〜119 と A-70 の単価の初期値。
// 値を変えるときは要求定義書の PARAM を先に変える（利用者の回答 Q-050・Q-051）。上げる変更は設定画面で確認を求める（FR-276）。

export interface ExplainLimits {
  /** PARAM-113 1 日の生成の回数の上限（回/日） */
  dailyLimit: number;
  /** PARAM-114 1 回の入力の上限（トークン） */
  inputMaxTokens: number;
  /** PARAM-115 1 回の出力の上限（トークン） */
  outputMaxTokens: number;
  /** PARAM-116 呼び出しの最小の間隔（秒） */
  minIntervalSec: number;
  /** PARAM-117 月の予算（円/月） */
  budgetYen: number;
  /** PARAM-118 警告の割合（%） */
  warnPercent: number;
  /** PARAM-119 停止の割合（%） */
  stopPercent: number;
  /** A-70 入力 100 万トークンあたりの単価（円。利用者が設定画面で確認・変更できる） */
  unitYenPerMInput: number;
  /** A-70 出力 100 万トークンあたりの単価（円） */
  unitYenPerMOutput: number;
}

export const DEFAULT_LIMITS: ExplainLimits = {
  dailyLimit: 30,
  inputMaxTokens: 8000,
  outputMaxTokens: 1500,
  minIntervalSec: 5,
  budgetYen: 100000,
  warnPercent: 80,
  stopPercent: 100,
  unitYenPerMInput: 750,
  unitYenPerMOutput: 3000,
};
