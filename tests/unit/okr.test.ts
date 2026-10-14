// KPI と OKR（FR-153・FR-154）の単体・結合テスト。
import { beforeEach, describe, expect, it } from 'vitest';
import {
  achievement, achievementState, achievementText, diffObjectives, toDraft, validateDraft, type OkrDraft,
} from '../../src/okr/model';
import { DEMO_KEY, currentOkr, useOkr } from '../../src/store/okr';
import { resetEditForTest, useEditStore } from '../../src/store/edit';
import { restore, snapshot, STORAGE_KEY } from '../../src/store/persist';
import { defaultLayout, keysOf, type Persona, PERSONAS } from '../../src/workspace/layoutModel';
import { primaryOf } from '../../src/workspace/persona';

const draft = (over: Partial<OkrDraft> = {}): OkrDraft => ({
  objective: '合成の目標',
  keyResults: [
    { name: 'KR1', kpiName: '売上', unit: '万円', baseline: '0', target: '200', current: '50' },
    { name: 'KR2', kpiName: '欠品率', unit: '%', baseline: '10', target: '30', current: '20' },
  ],
  ...over,
});

beforeEach(() => { useOkr.getState().reset(); resetEditForTest(); });

describe('FR-153 AC-271 達成度の算式', () => {
  it('（現在値 − 基準値）÷（目標値 − 基準値）', () => {
    expect(achievement({ baseline: 0, target: 200, current: 50 })).toBe(0.25);
    expect(achievementText({ baseline: 10, target: 30, current: 20 })).toBe('50%');
    expect(achievementText({ baseline: 40, target: 20, current: 30 })).toBe('50%'); // 減らす KPI
  });
  it('FR-153 AC-272 目標値と基準値が同じなら「算出できない」', () => {
    expect(achievement({ baseline: 100, target: 100, current: 120 })).toBeNull();
    expect(achievementText({ baseline: 100, target: 100, current: 120 })).toBe('算出できない');
    expect(achievementState({ baseline: 100, target: 100, current: 120 })).toBe('算出できない');
  });
  it('FR-154 AC-273 状態は文字（達成・進行中・未着手）', () => {
    expect(achievementState({ baseline: 0, target: 10, current: 10 })).toBe('達成');
    expect(achievementState({ baseline: 0, target: 10, current: 5 })).toBe('進行中');
    expect(achievementState({ baseline: 0, target: 10, current: 0 })).toBe('未着手');
  });
});

describe('FR-153 AC-272 検証', () => {
  it('有効な入力は Objective になる', () => {
    const r = validateDraft(draft());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.objective.keyResults[1]!.kpi.current).toBe(20);
  });
  it('数値でない・単位が空・Objective が空は保存できない', () => {
    for (const bad of [
      draft({ keyResults: [{ name: 'a', kpiName: 'b', unit: '', baseline: '0', target: '1', current: '0' }] }),
      draft({ keyResults: [{ name: 'a', kpiName: 'b', unit: 'x', baseline: 'abc', target: '1', current: '0' }] }),
      draft({ keyResults: [{ name: 'a', kpiName: 'b', unit: 'x', baseline: '0', target: '', current: '0' }] }),
      draft({ keyResults: [{ name: 'a', kpiName: 'b', unit: 'x', baseline: '0', target: '1', current: 'Infinity' }] }),
      draft({ objective: ' ' }),
      draft({ keyResults: [] }),
    ]) expect(validateDraft(bad).ok).toBe(false);
  });
});

describe('FR-153 AC-271・AC-272 ストア（Project ごと・直前の値・変更履歴）', () => {
  it('Project ごとに持ち、ほかの Project に混ざらない', () => {
    expect(useOkr.getState().save('project-1', draft()).ok).toBe(true);
    expect(currentOkr('project-1')?.objectives[0]?.objective).toBe('合成の目標');
    expect(currentOkr('project-2')).toBeUndefined();
  });
  it('検証エラーのときは保存せず、直前の有効な値のまま', () => {
    useOkr.getState().save('project-1', draft());
    const bad = draft({ keyResults: [{ ...draft().keyResults[0]!, unit: '' }] });
    const r = useOkr.getState().save('project-1', bad);
    expect(r.ok).toBe(false);
    expect(currentOkr('project-1')?.objectives[0]?.keyResults).toHaveLength(2);
    expect(currentOkr('project-1')?.objectives[0]?.keyResults[0]?.kpi.unit).toBe('万円');
  });
  it('変更が変更履歴（FR-046）に残る。現在値の更新は前後の値を記録する', () => {
    useOkr.getState().save('project-1', draft());
    const n = useEditStore.getState().log.length;
    expect(n).toBeGreaterThan(0);
    const d = draft(); d.keyResults[0]!.current = '80';
    useOkr.getState().save('project-1', d);
    const last = useEditStore.getState().log.at(-1)!;
    expect(last).toMatchObject({ fieldLabel: '現在値', before: '50', after: '80', entityLabel: 'KR1' });
  });
  it('最終更新日時を記録する', () => {
    useOkr.getState().save('project-1', draft());
    expect(Number.isNaN(Date.parse(currentOkr('project-1')!.updatedAt))).toBe(false);
  });
  it('端末内の保存・復元で保持される（再読込後も保持）', () => {
    useOkr.getState().save('project-1', draft());
    const mem = new Map<string, string>();
    mem.set(STORAGE_KEY, JSON.stringify({ ...snapshot(), companies: [], projects: [] }));
    useOkr.getState().reset();
    expect(restore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) })).toBe(true);
    expect(currentOkr('project-1')?.objectives[0]?.keyResults[0]?.kpi.current).toBe(50);
  });
  it('定義のないデモは顧客パックなしでは未設定', () => {
    expect(currentOkr(DEMO_KEY)).toBeUndefined();
  });
});

describe('diffObjectives / toDraft', () => {
  it('同じ内容は差分なし、往復で値が保たれる', () => {
    const r = validateDraft(draft());
    if (!r.ok) throw new Error('invalid');
    expect(diffObjectives([r.objective], [r.objective])).toEqual([]);
    expect(toDraft(r.objective).keyResults[0]!.target).toBe('200');
  });
});

describe('FR-154 AC-273 既定のレイアウトに KPI/OKR を含める', () => {
  it.each(PERSONAS)('%s の既定のレイアウトに kpi-okr があり、既定の情報表現が最大の領域のまま', (p: Persona) => {
    expect(keysOf(defaultLayout(p))).toContain('kpi-okr');
    expect(primaryOf(p)).not.toBe('kpi-okr');
  });
});
