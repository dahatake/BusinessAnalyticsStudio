// AI 呼び出しの唯一の入口（FR-010・FR-011・FR-132・NFR-SEC-002）。
// LLM を使う 5 種類の処理（構造化・要約・提言・チャット・サマリー更新）は、すべて askAi を通る。
// ブラウザーからの送信先は、設定された localhost の中継プロセス（relayUrl）だけ。実接続を明示的に有効にするまではモックで、何も送信しない。
import { tr } from '../i18n';

export const AI_KINDS = ['structure', 'summary', 'recommend', 'chat', 'exec-summary'] as const;
export type AiKind = (typeof AI_KINDS)[number];

export type AiMode = 'mock' | 'connected';

export interface AiRequest {
  kind: AiKind;
  /** 顧客パックの識別（顧客名）。実接続の有効化はこの顧客パックにだけ働く */
  packId: string;
  prompt: string;
}

export interface AiResult {
  answer: string;
  sourceIds: string[];
  mode: AiMode;
  /** 画面で確認できる、中継プロセスへ送った（モックのときは送らなかった）内容 */
  sent: string;
  transmitted: boolean;
}

export interface AiEnv {
  relayUrl?: string;
  mockDelayMs?: number;
  /** 利用者が、この顧客パックで実接続を確認つきで有効にしている */
  realEnabled: boolean;
  fetchFn?: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}

export const MOCK_LABEL = 'AI 生成（モック）';
export const REAL_LABEL = 'AI 生成';

export function isLoopbackUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
  } catch {
    return false;
  }
}

export function mockAnswer(kind: AiKind, prompt: string): string {
  const head = prompt.replace(/\s+/g, ' ').slice(0, 60);
  return tr('（モックの回答）{kind} 「{head}」への回答の例です。実際の AI には送信していません。', { kind, head });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function askAi(req: AiRequest, env: AiEnv): Promise<AiResult> {
  const sent = JSON.stringify({ kind: req.kind, packId: req.packId, prompt: req.prompt });
  const useRelay = env.realEnabled && !!env.relayUrl && isLoopbackUrl(env.relayUrl);
  if (!useRelay) {
    if (env.mockDelayMs) await sleep(env.mockDelayMs);
    return { answer: mockAnswer(req.kind, req.prompt), sourceIds: [], mode: 'mock', sent, transmitted: false };
  }
  const f = env.fetchFn ?? ((u, i) => fetch(u, i));
  const res = await f(`${env.relayUrl}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: sent });
  if (!res.ok) throw new Error(tr('中継プロセスがエラーを返しました（{status}）', { status: res.status }));
  const j = (await res.json()) as { answer?: string; sourceIds?: string[]; mode?: AiMode };
  const mode: AiMode = j.mode === 'mock' ? 'mock' : 'connected';
  return { answer: String(j.answer ?? ''), sourceIds: j.sourceIds ?? [], mode, sent, transmitted: true };
}

export type ProbeResult = { ok: true } | { ok: false; reason: string };

/** 中継プロセスが稼働中で、Copilot にサインイン済みかを確かめる（実接続を有効にする操作のときだけ呼ぶ）。 */
export async function probeRelay(relayUrl: string | undefined, fetchFn: NonNullable<AiEnv['fetchFn']> = (u, i) => fetch(u, i)): Promise<ProbeResult> {
  if (!relayUrl || !isLoopbackUrl(relayUrl)) return { ok: false, reason: '中継プロセスの URL（localhost）が設定されていません。' };
  try {
    const res = await fetchFn(`${relayUrl}/health`);
    if (!res.ok) return { ok: false, reason: '中継プロセスに接続できません。' };
    const j = (await res.json()) as { status?: string; copilot?: string };
    if (j.status !== 'ready') return { ok: false, reason: '中継プロセスの準備ができていません。' };
    if (j.copilot !== 'signed-in') return { ok: false, reason: 'GitHub Copilot にサインインしていません。' };
    return { ok: true };
  } catch {
    return { ok: false, reason: '中継プロセスに接続できません（オフライン、または未起動）。' };
  }
}

/** 中継プロセスに、この顧客パックの実接続を登録・解除する。 */
export async function setRelayConnection(
  relayUrl: string,
  packId: string,
  enable: boolean,
  fetchFn: NonNullable<AiEnv['fetchFn']> = (u, i) => fetch(u, i),
  /** 案件の了承の記録がある（FR-181）。なければ中継プロセスは有効化を拒否する */
  consent = false,
): Promise<boolean> {
  try {
    const res = await fetchFn(`${relayUrl}/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ packId, enable, confirmed: enable, consent }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

