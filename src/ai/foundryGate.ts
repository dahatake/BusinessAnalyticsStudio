// 「Copilot で分析実行」の送信前の判定と失敗時の案内（FR-283）。画面側（src/ai/review 系）が共通で使う、副作用のない関数だけを置く。
// 未設定（エンドポイント・デプロイ名、または選んだ認証方式の資格情報がない）のときは Foundry へ送信しない（呼び出し 0 回）。
// 失敗（認証エラー・タイムアウト・サーバーエラー）では、原因と次の行動を文字で示す。表示にキー・トークンの値を含めない。
import type { FoundryView } from './foundryClient';

export type FoundryRunGate = { ok: true } | { ok: false; kind: 'not-configured'; message: string };

export const NOT_CONFIGURED_NOTICE =
  'Microsoft Foundry の接続設定が未設定です。設定画面の「Microsoft Foundry」でエンドポイント・デプロイ名・認証方式（API キーを使う場合はキー）を保存してから、もう一度実行してください。';

/** 接続設定から送信してよいかを決める。view が null（中継に届かない・未取得）も未設定として扱い、送信しない */
export function foundryRunGate(view: FoundryView | null): FoundryRunGate {
  const ok = !!view && view.configured && (view.provider === 'copilot' || (!!view.endpoint && !!view.deployment));
  return ok ? { ok: true } : { ok: false, kind: 'not-configured', message: NOT_CONFIGURED_NOTICE };
}

export type FoundryFailureCause = 'auth' | 'timeout' | 'server' | 'unreachable';

export interface FoundryFailureNotice {
  cause: FoundryFailureCause;
  /** 原因 */
  reason: string;
  /** 次の行動 */
  action: string;
  /** 画面に出す 1 つの文 */
  text: string;
}

const NOTICES: Record<FoundryFailureCause, { reason: string; action: string }> = {
  auth: { reason: '認証に失敗しました（認証エラー）。', action: '設定画面で認証方式・API キー（または Microsoft Entra ID のサインイン）を確認してから、もう一度実行してください。' },
  timeout: { reason: 'Foundry の応答がタイムアウトしました。', action: '接続先のエンドポイントとネットワークを確認してから、もう一度実行してください。' },
  server: { reason: 'Foundry がエラーを返しました（サーバーエラー）。', action: 'しばらくしてから、もう一度実行してください。続く場合は設定（エンドポイント・デプロイ名）を確認してください。' },
  unreachable: { reason: '中継プロセスに届きませんでした。', action: '`npm run relay` で中継プロセスが起動しているか確認してから、もう一度実行してください。' },
};

/** HTTP の状態・原因名・例外から原因を決める */
export function classifyFoundryFailure(input: { status?: number; cause?: string; timedOut?: boolean; networkError?: boolean }): FoundryFailureCause {
  if (input.timedOut || input.cause === 'timeout' || input.status === 408 || input.status === 504) return 'timeout';
  if (input.cause === 'auth' || input.cause === 'key-missing' || input.status === 401 || input.status === 403) return 'auth';
  if (input.networkError || input.cause === 'unreachable' || input.cause === 'relay') return 'unreachable';
  return 'server';
}

/** 秘密の値（キー・トークン）を伏せた文字列にする。表示前に必ず通す */
export function redactSecrets(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join('•••');
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer •••');
  out = out.replace(/(api[-_ ]?key|token|authorization)(\s*[:=]\s*)["']?[A-Za-z0-9._~+/=-]{8,}["']?/gi, '$1$2•••');
  return out;
}

/** 失敗の案内。サーバーの文言は使わず（キー・トークンが紛れないよう）、原因ごとの固定文だけを示す */
export function foundryFailureNotice(cause: FoundryFailureCause): FoundryFailureNotice {
  const n = NOTICES[cause];
  return { cause, reason: n.reason, action: n.action, text: `${n.reason}${n.action}` };
}
