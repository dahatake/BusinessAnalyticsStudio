// Project ごとのユースケースとアニメーション（FR-158・FR-155）。ほかの Project に混ざらない（FR-138）。
// 保存は store/persist.ts（端末内 localStorage のみ。FR-137・NFR-SEC-004）。
import { create } from 'zustand';
import {
  createAnimation, toDraft, validateDraft,
  type Animation, type UseCase, type UseCaseDraft,
} from '../usecase/model';

export interface UseCaseSet { items: UseCase[]; animations: Record<string, Animation>; seq: number }
const EMPTY: UseCaseSet = { items: [], animations: {}, seq: 0 };

export type SaveResult = { ok: true; id: string } | { ok: false; errors: string[] };

interface UseCaseState {
  byProject: Record<string, UseCaseSet>;
  /** 登録（id なし）または更新（id あり）。誤りがあれば保存せず理由を返す */
  save: (projectId: string, draft: UseCaseDraft, id?: string) => SaveResult;
  remove: (projectId: string, id: string) => void;
  /** アニメーションを作る（作り直しも）。手順が 0 件なら拒否し、何も変えない */
  createAnimation: (projectId: string, id: string) => { ok: true } | { ok: false; errors: string[] };
  reset: () => void;
}

export const useUseCases = create<UseCaseState>((set, get) => ({
  byProject: {},
  save: (projectId, draft, id) => {
    const v = validateDraft(draft);
    if (!v.ok) return v;
    const cur = get().byProject[projectId] ?? EMPTY;
    if (id !== undefined) {
      if (!cur.items.some((u) => u.id === id)) return { ok: false, errors: ['ユースケースが見つかりません。'] };
      set((s) => ({ byProject: { ...s.byProject, [projectId]: { ...cur, items: cur.items.map((u) => (u.id === id ? { ...v.value, id } : u)) } } }));
      return { ok: true, id };
    }
    const newId = `uc-${cur.seq + 1}`;
    set((s) => ({ byProject: { ...s.byProject, [projectId]: { ...cur, seq: cur.seq + 1, items: [...cur.items, { ...v.value, id: newId }] } } }));
    return { ok: true, id: newId };
  },
  remove: (projectId, id) => set((s) => {
    const cur = s.byProject[projectId];
    if (!cur) return s;
    const { [id]: _gone, ...animations } = cur.animations;
    return { byProject: { ...s.byProject, [projectId]: { ...cur, items: cur.items.filter((u) => u.id !== id), animations } } };
  }),
  createAnimation: (projectId, id) => {
    const cur = get().byProject[projectId] ?? EMPTY;
    const uc = cur.items.find((u) => u.id === id);
    if (!uc) return { ok: false, errors: ['ユースケースが見つかりません。'] };
    const a = createAnimation(toDraft(uc));
    if (!a.ok) return a;
    set((s) => ({ byProject: { ...s.byProject, [projectId]: { ...cur, animations: { ...cur.animations, [id]: a.value } } } }));
    return { ok: true };
  },
  reset: () => set({ byProject: {} }),
}));

const NONE: UseCaseSet = EMPTY;
/** 画面用: Project のユースケース一式（なければ空） */
export function useUseCaseSet(projectId: string | null): UseCaseSet {
  return useUseCases((s) => (projectId ? s.byProject[projectId] : undefined)) ?? NONE;
}
