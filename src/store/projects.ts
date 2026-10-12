// 企業の登録と、企業ごとの複数 Project の管理（FR-137）。
// 保存しない（AC-207 は Q-009 待ち。永続・権限は実装しない）。
import { create } from 'zustand';

/** 企業ごとの Project 数の上限（PARAM-031）。アーカイブ済みも数える。 */
export const MAX_PROJECTS_PER_COMPANY = 50;

export interface Company { id: string; name: string }
export interface Project { id: string; companyId: string; name: string; archived: boolean }

export type Result = { ok: true; id: string } | { ok: false; reason: string };

interface ProjectsState {
  companies: Company[];
  projects: Project[];
  /** 開いている Project の ID */
  openId: string | null;
  seq: number;
  addCompany: (name: string) => Result;
  addProject: (companyId: string, name: string) => Result;
  renameProject: (id: string, name: string) => Result;
  setArchived: (id: string, archived: boolean) => void;
  open: (id: string | null) => void;
}

export const useProjects = create<ProjectsState>((set, get) => ({
  companies: [],
  projects: [],
  openId: null,
  seq: 0,
  addCompany: (raw) => {
    const name = raw.trim();
    if (!name) return { ok: false, reason: '企業名を入力してください。' };
    if (get().companies.some((c) => c.name === name)) return { ok: false, reason: `企業「${name}」は登録済みです。` };
    const id = `company-${get().seq + 1}`;
    set((s) => ({ seq: s.seq + 1, companies: [...s.companies, { id, name }] }));
    return { ok: true, id };
  },
  addProject: (companyId, raw) => {
    const name = raw.trim();
    const { projects, companies } = get();
    if (!companies.some((c) => c.id === companyId)) return { ok: false, reason: '企業が登録されていません。' };
    if (!name) return { ok: false, reason: 'Project 名を入力してください。' };
    const mine = projects.filter((p) => p.companyId === companyId);
    if (mine.length >= MAX_PROJECTS_PER_COMPANY) {
      return { ok: false, reason: `1 企業の Project は ${MAX_PROJECTS_PER_COMPANY} 件までです。不要な Project は名称変更して再利用してください。` };
    }
    if (mine.some((p) => p.name === name)) return { ok: false, reason: `Project「${name}」は同じ企業に既にあります。` };
    const id = `project-${get().seq + 1}`;
    set((s) => ({ seq: s.seq + 1, projects: [...s.projects, { id, companyId, name, archived: false }] }));
    return { ok: true, id };
  },
  renameProject: (id, raw) => {
    const name = raw.trim();
    const target = get().projects.find((p) => p.id === id);
    if (!target) return { ok: false, reason: 'Project が見つかりません。' };
    if (!name) return { ok: false, reason: 'Project 名を入力してください。' };
    if (get().projects.some((p) => p.companyId === target.companyId && p.id !== id && p.name === name)) {
      return { ok: false, reason: `Project「${name}」は同じ企業に既にあります。` };
    }
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)) }));
    return { ok: true, id };
  },
  setArchived: (id, archived) =>
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, archived } : p)),
      openId: archived && s.openId === id ? null : s.openId,
    })),
  open: (id) => set({ openId: id }),
}));

/** テスト用: 状態を初期化する */
export function resetProjects(): void {
  useProjects.setState({ companies: [], projects: [], openId: null, seq: 0 });
}
