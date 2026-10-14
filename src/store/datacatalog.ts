// データカタログの明示の紐づけ（FR-160）の保存と、画面の選択状態。Project ごとに分離する（FR-138）。
// 保存は store/persist.ts（端末内 localStorage のみ。NFR-SEC-004）。導出の結果は保存しない。
import { create } from 'zustand';
import { addLink, removeLink, removeLinksOfUseCase, type DataEntity, type ExplicitLink, type LinkResult } from '../datacatalog/model';
import type { UseCase } from '../usecase/model';

interface DataCatalogState {
  linksByProject: Record<string, ExplicitLink[]>;
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
  selectedKey: null,
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
  reset: () => set({ linksByProject: {}, selectedKey: null }),
}));

/** 画面用: Project の明示の紐づけ（なければ空） */
export function useExplicitLinks(projectId: string | null): ExplicitLink[] {
  return useDataCatalog((s) => (projectId ? s.linksByProject[projectId] : undefined)) ?? NONE;
}
