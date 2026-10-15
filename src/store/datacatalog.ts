// データカタログの明示の紐づけ（FR-160）の保存と、画面の選択状態。Project ごとに分離する（FR-138）。
// 保存は store/persist.ts（端末内 localStorage のみ。NFR-SEC-004）。導出の結果は保存しない。
import { create } from 'zustand';
import { addLink, removeLink, removeLinksOfUseCase, type DataEntity, type ExplicitLink, type LinkResult } from '../datacatalog/model';
import type { UseCase } from '../usecase/model';
import {
  checkSourceUrl, mergeTodos, parseCatalog, type CatalogItem, type ProjectTask,
} from '../datacatalog/reconcile';
import { usePackStore } from './pack';
import { useProjects } from './projects';
import { registerTestHook } from '../testing/hook';

/** 取り込んだ企業データカタログ（Project ごと。FR-161）。出典の URL は記録するだけで、アクセスしない */
export interface ImportedCatalog { items: CatalogItem[]; fileName: string; sourceUrl: string }

interface DataCatalogState {
  linksByProject: Record<string, ExplicitLink[]>;
  /** 取り込んだ企業データカタログ（FR-161。端末内だけ。再取り込みは置き換え。拒否したときは変えない） */
  catalogByProject: Record<string, ImportedCatalog>;
  /** Project の plan の tasks への追加分（FR-162。顧客パックの schema/plan.json は変えない） */
  tasksByProject: Record<string, ProjectTask[]>;
  /** ファイルを取り込む。拒否のときは原因を返し、何も変えない */
  importCatalog: (projectId: string, text: string, fileName: string, sizeBytes: number) => { ok: true; count: number } | { ok: false; errors: string[] };
  /** 出典の URL を記録する（記録のみ。取得しない） */
  setSourceUrl: (projectId: string, raw: string) => { ok: true } | { ok: false; error: string };
  /** ToDo を冪等に追加し、追加した件数を返す */
  addTodos: (projectId: string, todos: readonly ProjectTask[]) => number;
  /** 画面で選択中のエンティティの鍵（保存しない。レイアウトの変更でコンポーネントが作り直されても残す。NFR-UX-011 AC-309） */
  selectedKey: string | null;
  select: (key: string | null) => void;
  /** 追加（検証は addLink）。拒否したときは何も変えない */
  add: (projectId: string, entities: readonly DataEntity[], useCases: readonly UseCase[], entityName: string, useCaseId: string) => LinkResult;
  remove: (projectId: string, entityName: string, useCaseId: string) => void;
  /** ユースケースの削除に伴う連動削除（FR-160 AC-313） */
  removeByUseCase: (projectId: string, useCaseId: string) => void;
  reset: () => void;
}

const NONE: ExplicitLink[] = [];

export const useDataCatalog = create<DataCatalogState>((set, get) => ({
  linksByProject: {},
  catalogByProject: {},
  tasksByProject: {},
  selectedKey: null,
  importCatalog: (projectId, text, fileName, sizeBytes) => {
    const r = parseCatalog(text, fileName, sizeBytes);
    if (!r.ok) return r;
    set((s) => ({ catalogByProject: { ...s.catalogByProject, [projectId]: { items: r.items, fileName, sourceUrl: s.catalogByProject[projectId]?.sourceUrl ?? '' } } }));
    return { ok: true, count: r.items.length };
  },
  setSourceUrl: (projectId, raw) => {
    const c = checkSourceUrl(raw);
    if (!c.ok) return c;
    set((s) => ({ catalogByProject: { ...s.catalogByProject, [projectId]: { items: s.catalogByProject[projectId]?.items ?? [], fileName: s.catalogByProject[projectId]?.fileName ?? '', sourceUrl: c.url } } }));
    return { ok: true };
  },
  addTodos: (projectId, todos) => {
    const cur = get().tasksByProject[projectId] ?? [];
    const m = mergeTodos(cur, todos);
    if (m.added > 0) set((s) => ({ tasksByProject: { ...s.tasksByProject, [projectId]: m.tasks } }));
    return m.added;
  },
  select: (selectedKey) => set({ selectedKey }),
  add: (projectId, entities, useCases, entityName, useCaseId) => {
    const r = addLink(get().linksByProject[projectId] ?? NONE, entities, useCases, entityName, useCaseId);
    if (r.ok) set((s) => ({ linksByProject: { ...s.linksByProject, [projectId]: r.links } }));
    return r;
  },
  remove: (projectId, entityName, useCaseId) => set((s) => {
    const cur = s.linksByProject[projectId];
    if (!cur) return s;
    return { linksByProject: { ...s.linksByProject, [projectId]: removeLink(cur, entityName, useCaseId) } };
  }),
  removeByUseCase: (projectId, useCaseId) => set((s) => {
    const cur = s.linksByProject[projectId];
    if (!cur || !cur.some((l) => l.useCaseId === useCaseId)) return s;
    return { linksByProject: { ...s.linksByProject, [projectId]: removeLinksOfUseCase(cur, useCaseId) } };
  }),
  reset: () => set({ linksByProject: {}, catalogByProject: {}, tasksByProject: {}, selectedKey: null }),
}));

const NO_TASKS: ProjectTask[] = [];
/** 画面用: Project の plan の tasks への追加分（なければ空） */
export function useProjectTasks(projectId: string | null): ProjectTask[] {
  return useDataCatalog((s) => (projectId ? s.tasksByProject[projectId] : undefined)) ?? NO_TASKS;
}
export function useImportedCatalog(projectId: string | null): ImportedCatalog | undefined {
  return useDataCatalog((s) => (projectId ? s.catalogByProject[projectId] : undefined));
}

/** 顧客パックの tasks と Project 内の追加分を合わせた plan の tasks（FR-162。ガントの表示と同じ元） */
export function planTasksOf(projectId: string | null): { id: string; title: string; description: string }[] {
  const st = usePackStore.getState().state;
  const pack = st.status === 'ready' ? (st.pack.data.plan.tasks as unknown as { id: string; title: string; work?: string }[]) : [];
  const extra = projectId ? useDataCatalog.getState().tasksByProject[projectId] ?? [] : [];
  return [...pack.map((t) => ({ id: t.id, title: t.title, description: t.work ?? '' })), ...extra];
}

// テスト用フック（CONTRACT §12: t.plan.tasks()）。Project の plan の tasks を { id, title, description } で返す
registerTestHook('plan', { tasks: () => planTasksOf(useProjects.getState().openId) });

/** 画面用: Project の明示の紐づけ（なければ空） */
export function useExplicitLinks(projectId: string | null): ExplicitLink[] {
  return useDataCatalog((s) => (projectId ? s.linksByProject[projectId] : undefined)) ?? NONE;
}
