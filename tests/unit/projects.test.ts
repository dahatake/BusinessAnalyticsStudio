import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_PROJECTS_PER_COMPANY, resetProjects, useProjects } from '../../src/store/projects';

const st = () => useProjects.getState();

describe('FR-137 企業の登録と複数 Project の管理', () => {
  beforeEach(resetProjects);

  // FR-137 AC-205
  it('FR-137 AC-205 企業ごとに Project を持ち、別企業に混ざらない', () => {
    const a = st().addCompany('A社'); const b = st().addCompany('B社');
    if (!a.ok || !b.ok) throw new Error('登録に失敗');
    expect(st().addProject(a.id, '案件1').ok).toBe(true);
    expect(st().addProject(a.id, '案件2').ok).toBe(true);
    expect(st().addProject(b.id, '案件B').ok).toBe(true);
    expect(st().projects.filter((p) => p.companyId === a.id).map((p) => p.name)).toEqual(['案件1', '案件2']);
    expect(st().projects.filter((p) => p.companyId === b.id).map((p) => p.name)).toEqual(['案件B']);
  });

  // FR-137 AC-206 PARAM-031
  it('FR-137 AC-206 上限に達すると作成が拒否され、理由が示され、既存は変わらない', () => {
    const a = st().addCompany('A社');
    if (!a.ok) throw new Error();
    for (let i = 0; i < MAX_PROJECTS_PER_COMPANY; i++) expect(st().addProject(a.id, `P${i}`).ok).toBe(true);
    const before = st().projects;
    const r = st().addProject(a.id, '超過');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(String(MAX_PROJECTS_PER_COMPANY));
    expect(st().projects).toBe(before);
  });

  // FR-137 AC-208
  it('FR-137 AC-208 アーカイブ・復元・名称変更ができ、重複名と空名は拒否される', () => {
    const a = st().addCompany('A社');
    if (!a.ok) throw new Error();
    const p = st().addProject(a.id, '案件1'); const q = st().addProject(a.id, '案件2');
    if (!p.ok || !q.ok) throw new Error();
    st().open(p.id);
    st().setArchived(p.id, true);
    expect(st().projects.find((x) => x.id === p.id)?.archived).toBe(true);
    expect(st().openId).toBeNull();
    st().setArchived(p.id, false);
    expect(st().projects.find((x) => x.id === p.id)?.archived).toBe(false);
    expect(st().renameProject(p.id, '新名称').ok).toBe(true);
    expect(st().projects.find((x) => x.id === p.id)?.name).toBe('新名称');
    expect(st().renameProject(p.id, '案件2').ok).toBe(false);
    expect(st().renameProject(p.id, '  ').ok).toBe(false);
    expect(st().addCompany('A社').ok).toBe(false);
  });
});
