// FR-228 の再配置の計画（AC-529）と「元に戻す」（AC-530）の単体・結合テスト
import { beforeEach, describe, expect, it } from 'vitest';
import { planStepFlow, stepRelevance } from '../../src/stepper/flow';
import { STEPS } from '../../src/stepper/model';
import { useLayout } from '../../src/store/layout';
import { undoStepFlow, useStepFlow } from '../../src/store/stepFlow';

const B = { w: 1200, h: 800 };
const KPI = STEPS.findIndex((s) => s.key === 'kpi');

describe('FR-228 AC-529 stepRelevance / planStepFlow', () => {
  it('FR-228 AC-529 関連は screens の順、重要は作業画面、ほかは後ろ', () => {
    expect(stepRelevance(KPI, 'priority')).toMatchObject({ relevant: true, rank: 0, importance: 'high' });
    expect(stepRelevance(KPI, 'ranking')).toMatchObject({ relevant: true, rank: 1, importance: 'normal' });
    const r = stepRelevance(KPI, 'gantt', ['a', 'gantt']);
    expect(r.relevant).toBe(false);
    expect(r.rank).toBeGreaterThan(stepRelevance(KPI, 'matrix').rank);
  });

  it('FR-228 AC-529 工程の順に左上から右下、重要が大きい、関連しないものは後ろで最小', () => {
    const keys = ['gantt', 'matrix', 'ranking', 'priority', 'summary'];
    const out = planStepFlow({ step: KPI, keys, bounds: B, pinned: {}, manual: {} });
    const order = ['priority', 'ranking', 'matrix', 'gantt', 'summary'];
    for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
      const a = out[order[i]!]!, b = out[order[j]!]!;
      expect(a.y < b.y || (a.y === b.y && a.x < b.x)).toBe(true);
    }
    const area = (k: string) => out[k]!.w * out[k]!.h;
    expect(area('priority')).toBeGreaterThan(area('ranking'));
    expect(area('ranking')).toBeGreaterThanOrEqual(area('gantt'));
    expect(area('gantt')).toBe(area('summary'));
    expect(keys.every((k) => k in out)).toBe(true); // 非表示にしない
  });

  it('FR-228 AC-529 ピン止めは結果に含めず避けて並べ、手で変えた大きさは保つ', () => {
    const pin = { x: 0, y: 0, w: 500, h: 400 };
    const out = planStepFlow({ step: KPI, keys: ['priority', 'ranking', 'gantt'], bounds: B, pinned: { priority: pin }, manual: { ranking: { w: 333, h: 222 } } });
    expect('priority' in out).toBe(false);
    expect(out.ranking).toMatchObject({ w: 333, h: 222 });
    for (const r of Object.values(out)) expect(r.x < pin.w && r.y < pin.h && r.x + r.w > pin.x && r.y + r.h > pin.y).toBe(false);
  });
});

describe('FR-228 AC-530 元に戻す', () => {
  beforeEach(() => { useLayout.setState({ floats: {}, pinned: {}, zOrder: [] }); useStepFlow.getState().clear(); });
  it('FR-228 AC-530 再配置前の自由配置に戻り、ピン止めは変わらない', () => {
    const persona = useLayout.getState().persona;
    const pin = { x: 0, y: 0, w: 0.4, h: 0.4 };
    const before = { a: { x: 0.5, y: 0.5, w: 0.3, h: 0.3 }, p: pin };
    useLayout.setState({ floats: { [persona]: before }, pinned: { [persona]: { p: pin } }, zOrder: ['a'] });
    useStepFlow.getState().remember({ persona, floats: { ...before }, zOrder: ['a'] });
    useLayout.getState().setFloats({ a: { x: 0, y: 0.5, w: 0.2, h: 0.2 }, b: { x: 0.6, y: 0, w: 0.2, h: 0.2 } });
    expect(undoStepFlow()).toBe(true);
    const s = useLayout.getState();
    expect(s.floats[persona]).toEqual(before);
    expect(s.pinned[persona]).toEqual({ p: pin });
    expect(useStepFlow.getState().undo).toBeNull();
    expect(undoStepFlow()).toBe(false);
  });
});
