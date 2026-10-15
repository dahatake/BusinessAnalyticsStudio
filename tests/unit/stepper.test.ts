// FR-136 業務改善ステッパー
import { beforeEach, describe, expect, it } from 'vitest';
import { STEPS, stepIndexForScreen, stepState } from '../../src/stepper/model';
import { useStepper } from '../../src/store/stepper';
import { SCREENS } from '../../src/screens/registry';

beforeEach(() => useStepper.getState().reset());

describe('FR-136 業務改善ステッパー', () => {
  // FR-136 AC-202
  it('AC-202 5 ステップ（PARAM-030）が順に並び、現在・完了・未着手が区別できる', () => {
    expect(STEPS.map((s) => s.label)).toEqual(['課題定義', '現状分析', 'KPI 測定', 'ユースケース作成', '施策計画']);
    expect(STEPS.map((_, i) => stepState(i, 2))).toEqual(['done', 'done', 'current', 'not-started', 'not-started']);
  });

  // FR-136 AC-202（初期状態は完了済みなし）
  it('AC-202 初期状態は先頭が現在で、完了済みはない', () => {
    const cur = useStepper.getState().current;
    const states = STEPS.map((_, i) => stepState(i, cur));
    expect(states[0]).toBe('current');
    expect(states).not.toContain('done');
  });

  // FR-136 AC-203
  it('AC-203 画面へ移ると対応するステップが現在になり、対応のない画面では変わらない', () => {
    useStepper.getState().followScreen('priority');
    expect(useStepper.getState().current).toBe(2);
    useStepper.getState().followScreen('settings');
    expect(useStepper.getState().current).toBe(2);
    useStepper.getState().followScreen('gantt');
    expect(useStepper.getState().current).toBe(4);
  });

  // FR-136 AC-204
  it('AC-204 各ステップの作業画面は登録済みの画面で、その画面へ移るとそのステップが現在になる', () => {
    const keys = SCREENS.map((s) => s.key);
    STEPS.forEach((step, i) => {
      expect(keys).toContain(step.screen);
      expect(stepIndexForScreen(step.screen)).toBe(i);
    });
  });

  // FR-136 AC-372（デモ = Project を開いていない）
  it('AC-372 デモでは 5 ステップが並び現在が区別できるが、完了済みを持たず、進捗は保存されない', () => {
    useStepper.getState().switchTo(null);
    useStepper.getState().followScreen('gantt');
    const cur = useStepper.getState().current;
    expect(cur).toBe(4);
    const states = STEPS.map((_, i) => stepState(i, cur, useStepper.getState().projectId !== null));
    expect(states).toEqual(['not-started', 'not-started', 'not-started', 'not-started', 'current']);
    expect(useStepper.getState().byProject).toEqual({});
  });

  // FR-136 AC-372 AC-202
  it('AC-372 デモで進めても実際の Project の進捗は変わらず、Project を開くと AC-202 のとおり完了済みを持つ', () => {
    const st = useStepper.getState();
    st.switchTo('p1');
    st.followScreen('priority');
    expect(useStepper.getState().byProject).toEqual({ p1: 2 });
    st.switchTo(null); // デモへ
    expect(useStepper.getState().current).toBe(0);
    useStepper.getState().followScreen('gantt');
    expect(useStepper.getState().byProject).toEqual({ p1: 2 });
    useStepper.getState().switchTo('p1');
    expect(useStepper.getState().current).toBe(2);
    expect(STEPS.map((_, i) => stepState(i, 2, true))).toEqual(['done', 'done', 'current', 'not-started', 'not-started']);
  });
});