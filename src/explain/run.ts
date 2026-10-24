// 「現状の説明」の実行（FR-274・FR-276・FR-277）。部品はすべて差し替えられる（テストでは Foundry へ実接続せず、スタブで確かめる）。
// 読み取り専用: 企業・Project・顧客パック・保存データには書かない。書くのは利用量の記録（日付・回数・トークン数・概算費用）だけ。
import type { FoundryAskResult, FoundryView } from '../ai/foundryClient';
import {
  buildFallback, buildPrompt, fitToTokens, parseAiExplanation, REASON_TEXT, type ExplainSnapshot, type UnavailableReason,
} from './model';
import type { ExplainLimits } from './params';
import { budgetLevel, formatAt, gate, intervalWait, recordCall, rollover, type UsageState } from './usage';

export interface ExplainDeps {
  now: () => Date;
  limits: () => ExplainLimits;
  usage: { get: () => UsageState; set: (s: UsageState) => void };
  /** 顧客の了承の記録があるか（FR-181） */
  consent: boolean;
  includesPerson?: boolean;
  confirmPerson?: () => Promise<{ allowed: boolean }>;
  fetchView: () => Promise<FoundryView | null>;
  ask: (req: { prompt: string; consent: boolean; maxOutputTokens: number; includesPerson?: boolean; personConfirmed?: boolean }) => Promise<FoundryAskResult>;
}

/** 前回の呼び出しの開始時刻と、生成中かどうか（二重の呼び出しをしない。FR-276 (4)） */
export interface ExplainSession { lastStartMs: number | null; inFlight: boolean }
export const newSession = (): ExplainSession => ({ lastStartMs: null, inFlight: false });

export type ExplainOutcome =
  | { kind: 'ai'; text: string; truncated: boolean; warning?: string }
  | { kind: 'fallback'; reason: UnavailableReason; reasonText: string; text: string; truncated?: boolean; warning?: string }
  | { kind: 'wait'; waitSec: number; message: string }
  | { kind: 'busy'; message: string }
  | { kind: 'cancelled' };

const NOTICE_WARN = (cost: number, l: ExplainLimits): string =>
  `概算の費用が予算（${l.budgetYen} 円）の ${l.warnPercent}% に達しました（今月の概算 ${Math.round(cost)} 円）。${l.stopPercent}% に達すると呼び出しを停止します。`;

function fallback(snapshot: ExplainSnapshot, reason: UnavailableReason, extra: { resumeAt?: Date; truncated?: boolean; warning?: string } = {}): ExplainOutcome {
  const reasonText = `${REASON_TEXT[reason]}${extra.resumeAt ? `。再開の時刻: ${formatAt(extra.resumeAt)}` : ''}`;
  return { kind: 'fallback', reason, reasonText, text: buildFallback(snapshot), truncated: extra.truncated, warning: extra.warning };
}

export async function runExplain(
  deps: ExplainDeps, session: ExplainSession, snapshot: ExplainSnapshot, signal?: AbortSignal,
): Promise<ExplainOutcome> {
  const limits = deps.limits();
  const now = deps.now();
  // (4) 生成中の二重の呼び出しと、最小の間隔に満たない再押下は呼び出さない
  if (session.inFlight) return { kind: 'busy', message: '生成中です。完了か中止を待ってください' };
  const wait = intervalWait(session.lastStartMs, now.getTime(), limits);
  if (wait > 0) return { kind: 'wait', waitSec: wait, message: `前回の呼び出しから ${limits.minIntervalSec} 秒たっていません。あと ${wait} 秒待ってから押してください` };

  // FR-277: AI が使えない条件（外部へは何も呼ばない）
  if (!deps.consent) return fallback(snapshot, 'consent');
  const view = await deps.fetchView();
  if (!view) return fallback(snapshot, 'relay');
  if (!view.configured) return fallback(snapshot, 'not-configured');
  if (!view.enabled) return fallback(snapshot, 'disabled');

  if (deps.includesPerson && (!deps.confirmPerson || !(await deps.confirmPerson()).allowed)) return fallback(snapshot, 'person-unconfirmed');

  // FR-276 (1)(5) 回数と予算
  const g = gate(deps.usage.get(), limits, now, view.provider);
  if (!g.ok) return fallback(snapshot, g.kind, { resumeAt: g.resumeAt });

  // (2) 入力は上限以下に切り詰める
  const fit = fitToTokens(snapshot, limits.inputMaxTokens);
  const prompt = buildPrompt(fit.snapshot);

  // 失敗も数える（安全側）: 呼び出しの開始時に回数・トークン・概算費用を記録する
  const after = recordCall(deps.usage.get(), fit.tokens, limits, now, view.provider);
  deps.usage.set(after);
  session.lastStartMs = now.getTime();
  session.inFlight = true;
  const level = budgetLevel(rollover(after, now), limits);
  const warning = view.provider !== 'copilot' && (level === 'warn' || level === 'stop') ? NOTICE_WARN(after.costYen, limits) : undefined;
  try {
    const aborted = new Promise<'aborted'>((res) => { signal?.addEventListener('abort', () => res('aborted'), { once: true }); });
    if (signal?.aborted) return { kind: 'cancelled' };
    // (3) 出力は上限を指定して依頼する
    const r = await Promise.race([deps.ask({ prompt, consent: deps.consent, maxOutputTokens: limits.outputMaxTokens, ...(deps.includesPerson ? { includesPerson: true, personConfirmed: true } : {}) }), aborted]);
    if (r === 'aborted') return { kind: 'cancelled' };
    if (r.mode === 'unavailable') return fallback(snapshot, r.reason, { truncated: fit.truncated, warning });
    const parsed = parseAiExplanation(r.answer, fit.snapshot);
    if (!parsed.ok) return fallback(snapshot, 'invalid', { truncated: fit.truncated, warning });
    return { kind: 'ai', text: parsed.text, truncated: fit.truncated, warning };
  } catch {
    return fallback(snapshot, 'error', { truncated: fit.truncated, warning });
  } finally {
    session.inFlight = false;
  }
}
