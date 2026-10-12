import { beforeEach, describe, expect, it } from 'vitest';
import { resetProjects, useProjects } from '../../src/store/projects';
import { useAnalyses, resetAnalyses } from '../../src/store/analyses';
import {
  activeProjects, parseChoice, shouldShowStartupPicker, targetOptions, workTargetLabel, STARTUP_PICKER_MIN_PROJECTS,
} from '../../src/projects/workTarget';

const st = () => useProjects.getState();

function seed() {
  const a = st().addCompany('合成株式会社A');
  if (!a.ok) throw new Error();
  const p1 = st().addProject(a.id, '業務改善 2026');
  const p2 = st().addProject(a.id, '在庫最適化');
  if (!p1.ok || !p2.ok) throw new Error();
  return { p1: p1.id, p2: p2.id };
}

describe('FR-144 起動後のデモ／実プロジェクトの選択', () => {
  beforeEach(() => { resetProjects(); resetAnalyses(); });

  // FR-144 AC-229
  it('FR-144 AC-229 実 Project が 2 件以上のとき起動時に選択画面を出し、候補はデモと各 Project（企業名 / Project 名）', () => {
    expect(STARTUP_PICKER_MIN_PROJECTS).toBe(2);
    const { p1 } = seed();
    expect(shouldShowStartupPicker(st().projects)).toBe(true);
    const labels = targetOptions(st().projects, st().companies).map((o) => o.label);
    expect(labels[0]).toContain('デモ');
    expect(labels).toContain('合成株式会社A / 業務改善 2026');
    expect(labels).toContain('合成株式会社A / 在庫最適化');
    // 作業先の表示
    expect(workTargetLabel(p1, st().projects, st().companies)).toBe('合成株式会社A / 業務改善 2026');
    expect(workTargetLabel(null, st().projects, st().companies)).toBe('デモ');
  });

  // FR-144 AC-229（異常系: アーカイブ済みは候補に出ず、件数にも数えない）
  it('FR-144 AC-229 異常系: アーカイブ済みの Project は候補に出ず、起動時の選択画面の条件にも数えない', () => {
    const { p2 } = seed();
    st().setArchived(p2, true);
    expect(activeProjects(st().projects)).toHaveLength(1);
    expect(shouldShowStartupPicker(st().projects)).toBe(false);
    expect(targetOptions(st().projects, st().companies).map((o) => o.label).join()).not.toContain('在庫最適化');
  });

  // FR-144 AC-230
  it('FR-144 AC-230 実 Project が 0 件なら選択画面を出さずデモで開き、候補はデモと「実際の Project を登録」だけ', () => {
    expect(shouldShowStartupPicker(st().projects)).toBe(false);
    expect(workTargetLabel(st().openId, st().projects, st().companies)).toBe('デモ');
    const opts = targetOptions(st().projects, st().companies);
    expect(opts.map((o) => o.kind)).toEqual(['demo', 'register']);
    expect(opts[1]!.label).toBe('実際の Project を登録');
  });

  // FR-144 AC-231
  it('FR-144 AC-231 デモに切り替えても Project の未保存の入力は失われず、デモの表示に Project の名前は出ない', () => {
    const { p1 } = seed();
    st().open(p1);
    useAnalyses.setState({ drafts: { [p1]: { k: '7' } } });
    st().open(null); // デモへ
    expect(useAnalyses.getState().drafts[p1]).toEqual({ k: '7' });
    expect(workTargetLabel(st().openId, st().projects, st().companies)).toBe('デモ');
    expect(workTargetLabel(st().openId, st().projects, st().companies)).not.toContain('合成株式会社A');
    st().open(p1);
    expect(useAnalyses.getState().drafts[p1]).toEqual({ k: '7' });
  });

  // FR-144 AC-232
  it('FR-144 AC-232 候補の値を選択結果（デモ・登録・Project）へ変換でき、不正な値は無視される', () => {
    const { p1 } = seed();
    const opt = targetOptions(st().projects, st().companies).find((o) => o.kind === 'project')!;
    expect(parseChoice(opt.value)).toEqual({ kind: 'project', id: p1 });
    expect(parseChoice('demo')).toEqual({ kind: 'demo' });
    expect(parseChoice('register')).toEqual({ kind: 'register' });
    expect(parseChoice('x')).toBeNull();
  });
});
