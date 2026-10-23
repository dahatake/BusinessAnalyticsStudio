// 接続テストの実行判定（FR-282 AC-763）。画面側が、停止中・連打の間隔内は中継を呼ばない（呼び出し 0 回）。中継側は受けた要求に 1 回だけ呼ぶ。
// 接続テストの呼び出しも FR-276 の利用量の記録に数える（失敗も数える安全側。出力は最小の上限で数える）。
import { budgetLevel, formatAt, intervalWait, nextMonthStart, recordCall, rollover, type UsageState } from '../explain/usage';
import type { ExplainLimits } from '../explain/params';
import type { FoundryTestResult } from './foundryClient';

/** 接続テストの出力トークンの上限（中継の最小値と同じ）と入力の概算 */
export const FOUNDRY_TEST_OUTPUT_TOKENS = 16;
export const FOUNDRY_TEST_INPUT_TOKENS = 2;

export interface FoundryTestSession { lastStartMs: number | null; inFlight: boolean }
export const newFoundryTestSession = (): FoundryTestSession => ({ lastStartMs: null, inFlight: false });

export interface FoundryTestDeps {
  now: () => Date;
  limits: () => ExplainLimits;
  usage: { get: () => UsageState; set: (s: UsageState) => void };
  test: () => Promise<FoundryTestResult>;
}

export type FoundryTestOutcome =
  | { kind: 'result'; result: FoundryTestResult }
  | { kind: 'blocked'; message: string }
  | { kind: 'wait'; waitSec: number; message: string }
  | { kind: 'busy'; message: string };

export async function runFoundryTest(deps: FoundryTestDeps, session: FoundryTestSession): Promise<FoundryTestOutcome> {
  const limits = deps.limits();
  const now = deps.now();
  if (session.inFlight) return { kind: 'busy', message: '接続テストの実行中です。結果が出るまでお待ちください' };
  const wait = intervalWait(session.lastStartMs, now.getTime(), limits);
  if (wait > 0) return { kind: 'wait', waitSec: wait, message: `前回の呼び出しから ${limits.minIntervalSec} 秒たっていません。あと ${wait} 秒待ってから押してください` };
  const rolled = rollover(deps.usage.get(), now);
  if (budgetLevel(rolled, limits) === 'stop') {
    return { kind: 'blocked', message: `今月の概算費用が予算（${limits.budgetYen} 円）の ${limits.stopPercent}% に達したため、接続テストは呼び出しません。再開の時刻: ${formatAt(nextMonthStart(now))}` };
  }
  deps.usage.set(recordCall(deps.usage.get(), FOUNDRY_TEST_INPUT_TOKENS, { ...limits, outputMaxTokens: FOUNDRY_TEST_OUTPUT_TOKENS }, now));
  session.lastStartMs = now.getTime();
  session.inFlight = true;
  try {
    return { kind: 'result', result: await deps.test() };
  } finally {
    session.inFlight = false;
  }
}
