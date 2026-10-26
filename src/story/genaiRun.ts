// プレゼンテーションの生成 AI によるストーリーの作成の実行（FR-290）。部品はすべて差し替えられる（テストでは生成 AI へ実接続せず、スタブで確かめる）。
// 呼び出しの条件・回数・予算・間隔は「現状の説明」（FR-274・FR-276）と同じ判定を使い、利用量は共通の記録に合算する。
// 条件が欠けるときは生成 AI を呼ばず（呼び出し 0 回）、理由を返す。画面は「生成 AI を使わずに開始」（FR-179 のストーリー）を示す。
import type { FoundryAskResult, FoundryView } from '../ai/foundryClient';
import { KIND_PRESENTATION, missingSendKinds } from '../ai/sendKinds';
import type { ExplainLimits } from '../explain/params';
import { formatAt, gate, intervalWait, recordCall, type UsageState } from '../explain/usage';
import {
  buildStoryPrompt, composeGenaiStory, parseGenaiScenes, renderMaterials,
  STORY_GENAI_MAX_OUTPUT_TOKENS, STORY_GENAI_TIMEOUT_SEC, type StoryMaterials,
} from './genai';
import type { StoryScene } from './model';

export type StoryUnavailable =
  | 'company' | 'consent' | 'relay' | 'not-configured' | 'disabled' | 'person-unconfirmed'
  | 'daily-limit' | 'budget' | 'error' | 'timeout' | 'invalid';

/** 理由の文（接続先に依らない書き方） */
export const STORY_REASON_TEXT: Record<StoryUnavailable, string> = {
  company: 'この Project の企業は外部 AI への送信を許可していないため、生成 AI に接続しませんでした（企業の設定の「外部 AI への送信を許可する」で許可できます）',
  consent: '顧客の了承の記録がないため、生成 AI へ送信できません',
  relay: '中継プロセスに届かないため、生成 AI に接続できません（`npm run relay` で起動しているか確認してください）',
  'not-configured': '生成 AI の接続情報が未設定のため、接続できません（設定画面で設定できます）',
  disabled: '生成 AI の実接続が有効になっていません（設定画面で有効にできます）',
  'person-unconfirmed': '種別「人」を含む顧客パックは送信前の確認が必要なため、生成 AI に接続しませんでした',
  'daily-limit': '1 日の生成の回数の上限に達したため、生成 AI に接続しませんでした',
  budget: '今月の概算費用が予算の停止の割合に達したため、生成 AI に接続しませんでした',
  error: '生成 AI の呼び出しに失敗しました（接続先の応答がありません）',
  timeout: `生成 AI の応答が ${STORY_GENAI_TIMEOUT_SEC} 秒以内に届かなかったため、接続を打ち切りました`,
  invalid: '生成 AI の出力の形式が想定と異なるため、接続の結果を採用しませんでした',
};

/**
 * 開いている作業先の企業の許可（FR-140・FR-290 AC-785）。実際の Project では、その企業の「外部 AI への送信を許可する」だけを見る（既定は許可なし）。
 * Project を開いていない（お手本パックのデモ）ときは undefined（許可は不要）。
 */
export function companyAllowedOf(s: { openId: string | null; projects: ReadonlyArray<{ id: string; companyId: string }>; companies: ReadonlyArray<{ id: string; aiAllowed?: boolean }> }): boolean | undefined {
  if (!s.openId) return undefined;
  const project = s.projects.find((p) => p.id === s.openId);
  return s.companies.find((c) => c.id === project?.companyId)?.aiAllowed === true;
}

/** すべての文を除いたときの通知（FR-290 AC-776） */
export const allRemovedText = (n: number): string =>
  `生成 AI が作った ${n} 文は、すべて材料にない数値・名称（解決策・KPI/OKR・ユースケース）を含むため表示しませんでした`;

export const PROVIDER_LABEL: Record<'foundry' | 'copilot', string> = { foundry: 'Microsoft Foundry', copilot: 'GitHub Copilot SDK' };

export interface StoryGenaiDeps {
  now: () => Date;
  limits: () => ExplainLimits;
  usage: { get: () => UsageState; set: (s: UsageState) => void };
  consent: boolean;
  /** 開いている Project の企業が外部 AI への送信を許可しているか（FR-140・FR-290 AC-785）。undefined はお手本パックのデモ（許可は不要） */
  companyAllowed?: boolean;
  includesPerson?: boolean;
  confirmPerson?: () => Promise<{ allowed: boolean }>;
  fetchView: () => Promise<FoundryView | null>;
  /** 有効化の確認で確認済みの送信情報の種類（FR-290 AC-777） */
  confirmedKinds: () => readonly string[];
  ask: (req: { prompt: string; consent: boolean; maxOutputTokens: number; timeoutSeconds: number; includesPerson?: boolean; personConfirmed?: boolean }, signal: AbortSignal) => Promise<FoundryAskResult>;
  /** 応答待ちの上限（秒）。既定は PARAM-127 */
  timeoutSec?: number;
}

export interface StoryGenaiSession { lastStartMs: number | null; inFlight: boolean }
export const newStorySession = (): StoryGenaiSession => ({ lastStartMs: null, inFlight: false });

export type StoryGenaiOutcome =
  | { kind: 'ai'; scenes: StoryScene[]; provider: 'foundry' | 'copilot'; truncated: boolean; removed: number }
  | { kind: 'unavailable'; reason: StoryUnavailable; reasonText: string }
  /** 生成された文がすべて材料にない数値・名称を含むため除いた（エラーではなく除去の通知。FR-290 AC-776） */
  | { kind: 'all-removed'; removed: number; provider: 'foundry' | 'copilot'; message: string }
  | { kind: 'reconfirm'; added: Array<{ id: string; label: string }> }
  | { kind: 'wait'; waitSec: number; message: string }
  | { kind: 'busy'; message: string }
  | { kind: 'cancelled' };

const unavailable = (reason: StoryUnavailable, resumeAt?: Date): StoryGenaiOutcome => ({
  kind: 'unavailable', reason, reasonText: `${STORY_REASON_TEXT[reason]}${resumeAt ? `。再開の時刻: ${formatAt(resumeAt)}` : ''}`,
});

export async function runStoryGenai(
  deps: StoryGenaiDeps, session: StoryGenaiSession, materials: StoryMaterials, base: readonly StoryScene[], signal?: AbortSignal,
): Promise<StoryGenaiOutcome> {
  const limits = deps.limits();
  const now = deps.now();
  // FR-276 (4): 生成中の二重の呼び出しと、最小の間隔（PARAM-116）に満たない再実行は呼び出さない
  if (session.inFlight) return { kind: 'busy', message: '生成中です。完了か取り消しを待ってください' };
  const wait = intervalWait(session.lastStartMs, now.getTime(), limits);
  if (wait > 0) return { kind: 'wait', waitSec: wait, message: `前回の作成から ${limits.minIntervalSec} 秒たっていません。あと ${wait} 秒待ってから作成してください` };

  // FR-290 AC-785: Project の企業が外部 AI への送信を許可していなければ、呼び出さない（FR-140。お手本パックのデモは対象外）
  if (deps.companyAllowed === false) return unavailable('company');
  // AC-776: 了承・中継・接続情報・実接続の有効のどれかが欠けたら、呼び出さない
  if (!deps.consent) return unavailable('consent');
  const view = await deps.fetchView();
  if (!view) return unavailable('relay');
  if (!view.configured) return unavailable('not-configured');
  if (!view.enabled) return unavailable('disabled');
  // AC-777: 送信情報の種類が増えた（プレゼンテーションの材料）のに再確認していなければ、呼び出さない
  const added = missingSendKinds(deps.confirmedKinds(), [KIND_PRESENTATION]);
  if (added.length > 0) return { kind: 'reconfirm', added };
  if (deps.includesPerson && (!deps.confirmPerson || !(await deps.confirmPerson()).allowed)) return unavailable('person-unconfirmed');

  const provider = view.provider ?? 'foundry';
  const g = gate(deps.usage.get(), limits, now, provider);
  if (!g.ok) return unavailable(g.kind, g.resumeAt);

  // FR-276 (2): 入力を PARAM-114 以下へ切り詰める
  const p = buildStoryPrompt(materials, limits.inputMaxTokens);
  const outLimits: ExplainLimits = { ...limits, outputMaxTokens: STORY_GENAI_MAX_OUTPUT_TOKENS };
  // 失敗も数える（安全側）: 開始時に回数・トークン・概算費用を記録する
  deps.usage.set(recordCall(deps.usage.get(), p.tokens, outLimits, now, provider));
  session.lastStartMs = now.getTime();
  session.inFlight = true;
  const timeoutSec = deps.timeoutSec ?? STORY_GENAI_TIMEOUT_SEC;
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    if (signal?.aborted) return { kind: 'cancelled' };
    const aborted = new Promise<'aborted'>((res) => { ctl.signal.addEventListener('abort', () => res('aborted'), { once: true }); });
    const timedOut = new Promise<'timeout'>((res) => { timer = setTimeout(() => { res('timeout'); ctl.abort(); }, timeoutSec * 1000); });
    const r = await Promise.race([
      deps.ask({
        prompt: p.prompt, consent: deps.consent, maxOutputTokens: STORY_GENAI_MAX_OUTPUT_TOKENS, timeoutSeconds: timeoutSec,
        ...(deps.includesPerson ? { includesPerson: true, personConfirmed: true } : {}),
      }, ctl.signal),
      timedOut, aborted,
    ]);
    if (r === 'timeout') return unavailable('timeout');
    if (r === 'aborted') return signal?.aborted ? { kind: 'cancelled' } : unavailable('timeout');
    if (r.mode === 'unavailable') {
      const known = r.reason in STORY_REASON_TEXT ? (r.reason as StoryUnavailable) : 'error';
      return unavailable(known);
    }
    const gen = parseGenaiScenes(r.answer);
    if (!gen) return unavailable('invalid');
    const composed = composeGenaiStory(base, gen, renderMaterials(materials));
    if (!composed.scenes.some((s) => s.aiHeading || (s.narration && s.narration.length > 0))) {
      // AC-776: すべての文を除いたときは、エラーではなく除いた旨を知らせる（代替は「生成 AI を使わずに開始」）
      if (composed.removed > 0) return { kind: 'all-removed', removed: composed.removed, provider, message: allRemovedText(composed.removed) };
      return unavailable('invalid');
    }
    return { kind: 'ai', scenes: composed.scenes, provider, truncated: p.truncated, removed: composed.removed };
  } catch {
    return signal?.aborted ? { kind: 'cancelled' } : unavailable('error');
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    session.inFlight = false;
  }
}
