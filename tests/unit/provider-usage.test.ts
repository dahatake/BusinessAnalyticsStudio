// FR-275 AC-770: both providers retain daily caps; only Foundry consumes the yen budget (FR-276).
import { describe, expect, it } from 'vitest';
import { addUsage, checkUsage, emptyRecord, DEFAULT_LIMITS } from '../../src/ai/foundryUsage';
import { emptyUsage, gate, recordCall } from '../../src/explain/usage';
import { DEFAULT_LIMITS as EXPLAIN_LIMITS } from '../../src/explain/params';
const now = new Date(2026,9,24,12);
describe('FR-275 provider cost and limits',()=>{
 it('FR-275 AC-770 chat counts Copilot calls and tokens but not yen, ignores Foundry-only budget stop and keeps daily cap',()=>{
  const full={...emptyRecord(now),monthCost:DEFAULT_LIMITS.monthlyBudget};
  expect(checkUsage(full,DEFAULT_LIMITS,now,'foundry').allowed).toBe(false);expect(checkUsage(full,DEFAULT_LIMITS,now,'copilot').allowed).toBe(true);
  const after=addUsage(full,DEFAULT_LIMITS,now,100,50,'copilot');expect(after.dayCount).toBe(1);expect(after.monthTokensIn).toBe(100);expect(after.monthCost).toBe(full.monthCost);
  expect(checkUsage({...after,dayCount:DEFAULT_LIMITS.dailyLimit},DEFAULT_LIMITS,now,'copilot').allowed).toBe(false);
 });
 it('FR-275 AC-770 explanation preserves caps and counts no Copilot yen',()=>{
  const full={...emptyUsage(now),costYen:EXPLAIN_LIMITS.budgetYen};
  expect(gate(full,EXPLAIN_LIMITS,now,'foundry').ok).toBe(false);expect(gate(full,EXPLAIN_LIMITS,now,'copilot').ok).toBe(true);
  const after=recordCall(full,100,EXPLAIN_LIMITS,now,'copilot');expect(after.count).toBe(1);expect(after.costYen).toBe(full.costYen);
  expect(gate({...after,count:EXPLAIN_LIMITS.dailyLimit},EXPLAIN_LIMITS,now,'copilot').ok).toBe(false);
 });
});
