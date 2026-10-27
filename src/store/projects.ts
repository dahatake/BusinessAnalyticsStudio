// 企業の登録と、企業ごとの複数 Project の管理（FR-137）。
// 保存は store/persist.ts（端末内 localStorage のみ。FR-137 AC-207・NFR-SEC-004）。識別子は自システムの採番だけ（FR-139 AC-211）。
import { create } from 'zustand';
import { tr } from '../i18n';
import { useStepper } from './stepper';

/** 企業ごとの Project 数の上限（PARAM-031）。アーカイブ済みも数える。 */
export const MAX_PROJECTS_PER_COMPANY = 50;

/** aiAllowed: 外部 AI への送信を許可した企業だけ true（既定は許可なし。FR-140 AC-219） */
export interface Company { id: string; name: string; aiAllowed?: boolean }
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
  setAiAllowed: (companyId: string, allowed: boolean) => void;
}

export const useProjects = create<ProjectsState>((set, get) => ({
  companies: [],
  projects: [],
  openId: null,
  seq: 0,
  addCompany: (raw) => {
    const name = raw.trim();
    if (!name) return { ok: false, reason: tr('企業名を入力してください。') };
    if (get().companies.some((c) => c.name === name)) return { ok: false, reason: tr('企業「{name}」は登録済みです。', { name }) };
    const id = `company-${get().seq + 1}`;
    set((s) => ({ seq: s.seq + 1, companies: [...s.companies, { id, name }] }));
    return { ok: true, id };
  },
  addProject: (companyId, raw) => {
    const name = raw.trim();
    const { projects, companies } = get();
    if (!companies.some((c) => c.id === companyId)) return { ok: false, reason: tr('企業が登録されていません。') };
    if (!name) return { ok: false, reason: tr('Project 名を入力してください。') };
    const mine = projects.filter((p) => p.companyId === companyId);
    if (mine.length >= MAX_PROJECTS_PER_COMPANY) {
      return { ok: false, reason: tr('1 企業の Project は {max} 件までです。不要な Project は名称変更して再利用してください。', { max: MAX_PROJECTS_PER_COMPANY }) };
    }
    if (mine.some((p) => p.name === name)) return { ok: false, reason: tr('Project「{name}」は同じ企業に既にあります。', { name }) };
    const id = `project-${get().seq + 1}`;
    set((s) => ({ seq: s.seq + 1, projects: [...s.projects, { id, companyId, name, archived: false }] }));
    return { ok: true, id };
  },
  renameProject: (id, raw) => {
    const name = raw.trim();
    const target = get().projects.find((p) => p.id === id);
    if (!target) return { ok: false, reason: tr('Project が見つかりません。') };
    if (!name) return { ok: false, reason: tr('Project 名を入力してください。') };
    if (get().projects.some((p) => p.companyId === target.companyId && p.id !== id && p.name === name)) {
      return { ok: false, reason: tr('Project「{name}」は同じ企業に既にあります。', { name }) };
    }
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)) }));
    return { ok: true, id };
  },
  setArchived: (id, archived) => {
    const closing = archived && get().openId === id;
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, archived } : p)),
      openId: closing ? null : s.openId,
    }));
    if (closing) useStepper.getState().switchTo(null);
  },
  setAiAllowed: (companyId, allowed) =>
    set((s) => ({ companies: s.companies.map((c) => (c.id === companyId ? { ...c, aiAllowed: allowed } : c)) })),
  // FR-138 AC-209: 開く Project ごとにステッパーの位置を切り替える
  open: (id) => {
    set({ openId: id });
    useStepper.getState().switchTo(id);
  },
}));

/** テスト用: 状態を初期化する */
export function resetProjects(): void {
  useProjects.setState({ companies: [], projects: [], openId: null, seq: 0 });
  useStepper.getState().reset();
}
