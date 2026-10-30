// 議論ツリーのストア（FR-042）。顧客パック（顧客名 / Project 名）ごとに localStorage へ保存し、再読込で復元する。
// 生成は非同期のジョブで、進行中も他の画面を操作でき、「取り消し」で止められる（NFR-UX-003）。元に戻す・やり直しは編集に効く。
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { tr } from '../i18n';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  addChild, buildMockTree, demoTreeDoc, moveNode, parseAiTree, redecompose, removeTreeNode, renameNode,
  type ThemeLike, type TreeDoc, type TreeEdit, type TreeKind, type TreeNode,
} from '../analysis/tree';
import type { PackData } from '../schema';

const memoryStore = new Map<string, string>();
const safeStorage = {
  getItem: (k: string) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : (memoryStore.get(k) ?? null)),
  setItem: (k: string, v: string) => { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); else memoryStore.set(k, v); },
  removeItem: (k: string) => { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); else memoryStore.delete(k); },
};

export interface AskFn {
  (kind: 'structure', prompt: string): Promise<{ answer: string; mode: 'mock' | 'connected' }>;
}

interface TreeState {
  docs: Record<string, TreeDoc | undefined>;
  /** 生成中のジョブ（保存しない）。null は生成していない */
  job: { key: string; seq: number; themeTitle: string } | null;
  error: string | null;
  past: Record<string, TreeNode[][]>;
  future: Record<string, TreeNode[][]>;

  /** 議論テーマの記録からツリーを生成する。完了すると、その顧客パックのツリーを置き換える。 */
  generate: (key: string, theme: ThemeLike, data: PackData, ask: AskFn) => Promise<void>;
  cancel: () => void;
  edit: (key: string, fn: (nodes: readonly TreeNode[]) => TreeEdit) => TreeEdit;
  add: (key: string, parentId: string, title: string, kind?: TreeKind) => TreeEdit;
  rename: (key: string, id: string, title: string) => TreeEdit;
  remove: (key: string, id: string) => TreeEdit;
  move: (key: string, id: string, parentId: string) => TreeEdit;
  redecompose: (key: string, id: string) => TreeEdit;
  undo: (key: string) => boolean;
  redo: (key: string) => boolean;
  clearError: () => void;
}

let jobSeq = 0;

export const useTreeStore = create<TreeState>()(
  persist(
    (set, get) => ({
      docs: {},
      job: null,
      error: null,
      past: {},
      future: {},

      generate: async (key, theme, data, ask) => {
        const seq = ++jobSeq;
        set({ job: { key, seq, themeTitle: theme.title }, error: null });
        try {
          const prompt = `次の議論の記録から、議題・論点・課題・原因・解決策・決定事項・次のアクションの系統ツリーを作ってください。議題: ${theme.title} 選択肢: ${theme.options} 決定事項: ${theme.decisions}`;
          const r = await ask('structure', prompt);
          if (get().job?.seq !== seq) return; // 取り消された
          const fromAi = r.mode === 'connected' ? parseAiTree(r.answer, theme) : null;
          const nodes = fromAi ?? buildMockTree(theme, data);
          const doc: TreeDoc = { themeId: theme.id, themeTitle: theme.title, nodes, mode: fromAi ? 'connected' : 'mock' };
          set((s) => ({ docs: { ...s.docs, [key]: doc }, job: null, past: { ...s.past, [key]: [] }, future: { ...s.future, [key]: [] } }));
        } catch (e) {
          if (get().job?.seq !== seq) return;
          set({ job: null, error: e instanceof Error ? e.message : String(e) });
        }
      },

      cancel: () => set({ job: null }),

      edit: (key, fn) => {
        const doc = get().docs[key];
        if (!doc) return { ok: false, reason: tr('ツリーがありません。') };
        const r = fn(doc.nodes);
        if (!r.ok) return r;
        set((s) => ({
          docs: { ...s.docs, [key]: { ...doc, nodes: r.nodes } },
          past: { ...s.past, [key]: [...(s.past[key] ?? []), doc.nodes] },
          future: { ...s.future, [key]: [] },
        }));
        return r;
      },
      add: (key, parentId, title, kind) => get().edit(key, (n) => addChild(n, parentId, title, kind)),
      rename: (key, id, title) => get().edit(key, (n) => renameNode(n, id, title)),
      remove: (key, id) => get().edit(key, (n) => removeTreeNode(n, id)),
      move: (key, id, parentId) => get().edit(key, (n) => moveNode(n, id, parentId)),
      redecompose: (key, id) => get().edit(key, (n) => redecompose(n, id)),

      undo: (key) => {
        const doc = get().docs[key];
        const past = get().past[key] ?? [];
        const prev = past[past.length - 1];
        if (!doc || !prev) return false;
        set((s) => ({
          docs: { ...s.docs, [key]: { ...doc, nodes: prev } },
          past: { ...s.past, [key]: past.slice(0, -1) },
          future: { ...s.future, [key]: [...(s.future[key] ?? []), doc.nodes] },
        }));
        return true;
      },
      redo: (key) => {
        const doc = get().docs[key];
        const future = get().future[key] ?? [];
        const next = future[future.length - 1];
        if (!doc || !next) return false;
        set((s) => ({
          docs: { ...s.docs, [key]: { ...doc, nodes: next } },
          past: { ...s.past, [key]: [...(s.past[key] ?? []), doc.nodes] },
          future: { ...s.future, [key]: future.slice(0, -1) },
        }));
        return true;
      },
      clearError: () => set({ error: null }),
    }),
    {
      name: 'edb.tree',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ docs: s.docs }),
    },
  ),
);

/**
 * 議論ツリーの文書。保存したものがなければ、デモの議論ツリー（パックの discussionTheme。FR-287）を返し、保存して編集できるようにする。
 * デモ以外（discussionTheme を持たない実際の Project）では何も補わない。
 */
export function useTreeDoc(key: string, data: PackData | undefined): TreeDoc | undefined {
  const stored = useTreeStore((st) => st.docs[key]);
  const demo = useMemo(() => (stored || !data ? undefined : demoTreeDoc(data)), [stored, data]);
  useEffect(() => {
    if (demo && key) useTreeStore.setState((s) => (s.docs[key] ? s : { docs: { ...s.docs, [key]: demo } }));
  }, [demo, key]);
  return stored ?? demo;
}
