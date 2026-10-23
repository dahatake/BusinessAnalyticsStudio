// 生成AIの活用分析の Foundry 実接続のクライアント（FR-285）。ブラウザーからの送信先は localhost の中継プロセスだけ（NFR-SEC-002）。
// エンドポイント・デプロイ名・API キーはブラウザーに渡らず、送らない（共通接続 FR-275 の中継の保管庫だけ）。失敗は原因つきで返し、自動の再試行はしない。
import { isLoopbackUrl } from '../ai/client';
import { GENAI_TIMEOUT_SECONDS, parseScenarioResult, type ScenarioResult } from './scenario';

type FetchFn = (u: string, i?: RequestInit) => Promise<Response>;

export type FoundryCause = 'key-missing' | 'disabled' | 'unreachable' | 'timeout' | 'upstream-status' | 'bad-response' | 'bad-request';

export type FoundryOutcome =
  | { ok: true; result: ScenarioResult }
  | { ok: false; cause: FoundryCause; message: string };

/** 原因ごとの分かりやすい文言（キーの値を含まない） */
export function causeMessage(cause: FoundryCause, detail: { timeoutSeconds?: number; upstreamStatus?: number } = {}): string {
  switch (cause) {
    case 'key-missing': return 'Foundry の接続情報（API キー）が設定されていません（設定画面の「Microsoft Foundry（生成AI機能の共通接続）」で設定してください）。';
    case 'disabled': return 'Foundry の実接続が有効ではありません（設定画面の共通接続で有効にしてください）。';
    case 'unreachable': return 'Foundry に接続できません（中継プロセスの起動、またはネットワークとエンドポイントを確認してください）。';
    case 'timeout': return `Foundry の応答がタイムアウトしました（${detail.timeoutSeconds ?? GENAI_TIMEOUT_SECONDS} 秒）。`;
    case 'upstream-status': return `Foundry がエラー応答を返しました（ステータス ${detail.upstreamStatus ?? '不明'}）。`;
    case 'bad-response': return 'Foundry の応答の形式が想定と異なるため、結果を使えません。';
    case 'bad-request': return '接続先の設定（エンドポイント・デプロイ名）が正しくないため、送信できません。設定を確認してください。';
  }
}

const CAUSES: readonly string[] = ['key-missing', 'disabled', 'unreachable', 'timeout', 'upstream-status', 'bad-response', 'bad-request'];

/** 解決策の文章を中継プロセスへ送り、Foundry の分析結果を得る。失敗しても例外は投げず、原因を返す */
export async function analyzeViaRelay(
  env: { relayUrl?: string; packId: string; consent?: boolean; includesPerson?: boolean; personConfirmed?: boolean; fetchFn?: FetchFn; timeoutMs?: number },
  solution: string,
): Promise<FoundryOutcome> {
  if (!env.relayUrl || !isLoopbackUrl(env.relayUrl)) return { ok: false, cause: 'unreachable', message: causeMessage('unreachable') };
  const f: FetchFn = env.fetchFn ?? ((u, i) => fetch(u, i));
  const ctl = new AbortController();
  // 中継プロセス側のタイムアウトより少し長く待つ（中継が原因つきで答える余裕）
  const timer = setTimeout(() => ctl.abort(), env.timeoutMs ?? (GENAI_TIMEOUT_SECONDS + 10) * 1000);
  try {
    const res = await f(`${env.relayUrl}/foundry/analyze`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ packId: env.packId, solution, consent: env.consent, includesPerson: env.includesPerson, personConfirmed: env.personConfirmed }),
    });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const e = (j.error ?? {}) as { cause?: string; timeoutSeconds?: number; upstreamStatus?: number };
      const cause = (CAUSES.includes(e.cause ?? '') ? e.cause : 'unreachable') as FoundryCause;
      return { ok: false, cause, message: causeMessage(cause, e) };
    }
    const result = parseScenarioResult(j);
    return result ? { ok: true, result } : { ok: false, cause: 'bad-response', message: causeMessage('bad-response') };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    const cause: FoundryCause = aborted ? 'timeout' : 'unreachable';
    return { ok: false, cause, message: causeMessage(cause) };
  } finally {
    clearTimeout(timer);
  }
}
