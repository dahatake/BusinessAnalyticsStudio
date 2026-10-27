// Project ごとのユースケースとアニメーション（FR-158・FR-155）。ほかの Project に混ざらない（FR-138）。
// 保存は store/persist.ts（端末内 localStorage のみ。FR-137・NFR-SEC-004）。
import { create } from 'zustand';
import { tr } from '../i18n';
import { useDataCatalog } from './datacatalog';
import { createStoryboard, validateScenes, type Storyboard, type StoryScene } from '../usecase/storyboard';
import type { StoryVideo, StoryVideoScene } from '../usecase/storyVideo';
import {
  createAnimation, signature, toDraft, validateDraft,
  type Animation, type UseCase, type UseCaseDraft, type UseCaseSource,
} from '../usecase/model';

export interface UseCaseSet { items: UseCase[]; animations: Record<string, Animation>; seq: number; /** ストーリーボード（FR-163）。古い保存内容にはない */ storyboards?: Record<string, Storyboard>; /** AI 生成ストーリー動画（FR-291）。古い保存内容にはない */ storyVideos?: Record<string, StoryVideo> }
const EMPTY: UseCaseSet = { items: [], animations: {}, seq: 0 };

export type SaveResult = { ok: true; id: string } | { ok: false; errors: string[] };

interface UseCaseState {
  byProject: Record<string, UseCaseSet>;
  /** 登録（id なし）または更新（id あり）。誤りがあれば保存せず理由を返す */
  save: (projectId: string, draft: UseCaseDraft, id?: string, source?: UseCaseSource) => SaveResult;
  remove: (projectId: string, id: string) => void;
  /** アニメーションを作る（作り直しも）。手順が 0 件なら拒否し、何も変えない */
  createAnimation: (projectId: string, id: string) => { ok: true } | { ok: false; errors: string[] };
  /** ストーリーボードを作る（作り直しも）。手順が 0 件なら拒否し、何も変えない（FR-163） */
  createStoryboard: (projectId: string, id: string) => { ok: true } | { ok: false; errors: string[] };
  /** 編集したシーンを保存する。元のユースケースは変えない */
  saveStoryboardScenes: (projectId: string, id: string, scenes: StoryScene[]) => { ok: true } | { ok: false; errors: string[] };
  /** 生成した（検査を通った）ストーリー動画を保存する。作成時の内容の署名を持ち、手順などを編集すると「古い」になる（FR-291 AC-781） */
  saveStoryVideo: (projectId: string, id: string, v: { scenes: StoryVideoScene[]; html: string }, now?: Date) => { ok: true } | { ok: false; errors: string[] };
  reset: () => void;
}

export const useUseCases = create<UseCaseState>((set, get) => ({
  byProject: {},
  save: (projectId, draft, id, source) => {
    const v = validateDraft(draft);
    if (!v.ok) return v;
    const cur = get().byProject[projectId] ?? EMPTY;
    if (id !== undefined) {
      if (!cur.items.some((u) => u.id === id)) return { ok: false, errors: [tr('ユースケースが見つかりません。')] };
      set((s) => ({ byProject: { ...s.byProject, [projectId]: { ...cur, items: cur.items.map((u) => (u.id === id ? { ...v.value, id, ...(u.source ? { source: u.source } : {}) } : u)) } } }));
      return { ok: true, id };
    }
    const newId = `uc-${cur.seq + 1}`;
    set((s) => ({ byProject: { ...s.byProject, [projectId]: { ...cur, seq: cur.seq + 1, items: [...cur.items, { ...v.value, id: newId, ...(source ? { source } : {}) }] } } }));
    return { ok: true, id: newId };
  },
  remove: (projectId, id) => {
    set((s) => {
      const cur = s.byProject[projectId];
      if (!cur) return s;
      const { [id]: _gone, ...animations } = cur.animations;
      const { [id]: _sb, ...storyboards } = cur.storyboards ?? {};
      const { [id]: _sv, ...storyVideos } = cur.storyVideos ?? {};
      return { byProject: { ...s.byProject, [projectId]: { ...cur, items: cur.items.filter((u) => u.id !== id), animations, storyboards, storyVideos } } };
    });
    // FR-160 AC-313: そのユースケースへのデータカタログの明示の紐づけも連動して削除する
    useDataCatalog.getState().removeByUseCase(projectId, id);
  },
  createAnimation: (projectId, id) => {
    const cur = get().byProject[projectId] ?? EMPTY;
    const uc = cur.items.find((u) => u.id === id);
    if (!uc) return { ok: false, errors: [tr('ユースケースが見つかりません。')] };
    const a = createAnimation(toDraft(uc));
    if (!a.ok) return a;
    set((s) => ({ byProject: { ...s.byProject, [projectId]: { ...cur, animations: { ...cur.animations, [id]: a.value } } } }));
    return { ok: true };
  },
  createStoryboard: (projectId, id) => {
    const cur = get().byProject[projectId] ?? EMPTY;
    const uc = cur.items.find((u) => u.id === id);
    if (!uc) return { ok: false, errors: [tr('ユースケースが見つかりません。')] };
    const a = createStoryboard(toDraft(uc));
    if (!a.ok) return a;
    set((s) => ({ byProject: { ...s.byProject, [projectId]: { ...cur, storyboards: { ...(cur.storyboards ?? {}), [id]: a.value } } } }));
    return { ok: true };
  },
  saveStoryboardScenes: (projectId, id, scenes) => {
    const cur = get().byProject[projectId] ?? EMPTY;
    const sb = cur.storyboards?.[id];
    if (!sb) return { ok: false, errors: [tr('ストーリーボードが見つかりません。')] };
    const v = validateScenes(scenes);
    if (!v.ok) return v;
    set((s) => ({ byProject: { ...s.byProject, [projectId]: { ...cur, storyboards: { ...(cur.storyboards ?? {}), [id]: { ...sb, scenes: v.value } } } } }));
    return { ok: true };
  },
  saveStoryVideo: (projectId, id, v, now = new Date()) => {
    const cur = get().byProject[projectId] ?? EMPTY;
    const uc = cur.items.find((u) => u.id === id);
    if (!uc) return { ok: false, errors: [tr('ユースケースが見つかりません。')] };
    const video: StoryVideo = { scenes: v.scenes, html: v.html, signature: signature(toDraft(uc)), createdAt: now.toISOString() };
    set((s) => ({ byProject: { ...s.byProject, [projectId]: { ...cur, storyVideos: { ...(cur.storyVideos ?? {}), [id]: video } } } }));
    return { ok: true };
  },
  reset: () => set({ byProject: {} }),
}));

const NONE: UseCaseSet = EMPTY;
/** 画面用: Project のユースケース一式（なければ空） */
export function useUseCaseSet(projectId: string | null): UseCaseSet {
  return useUseCases((s) => (projectId ? s.byProject[projectId] : undefined)) ?? NONE;
}
