// 議論テーマのストア（FR-048〜FR-051）。顧客パック（顧客名 / Project 名）ごとに、localStorage へ保存して再読込で復元する。
// 元に戻す・やり直しは、テーマの作成・名前の変更・削除・決定ステータスの変更に効く。入力中の本文は履歴に積まない。
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  createNextAction, createTheme, type DecisionStatus, type NextAction, type Theme,
} from '../discussion/model';

export interface PackDiscussion {
  themes: Theme[];
  selectedId: string | null;
}

type Op =
  | { kind: 'insert'; theme: Theme; index: number }
  | { kind: 'remove'; theme: Theme; index: number }
  | { kind: 'patch'; id: string; before: Partial<Theme>; after: Partial<Theme> };

interface History {
  undo: Op[];
  redo: Op[];
}

const EMPTY_THEMES: Theme[] = [];
const EMPTY_DISCUSSION: PackDiscussion = { themes: EMPTY_THEMES, selectedId: null };
const EMPTY_HISTORY: History = { undo: [], redo: [] };

function applyOp(themes: Theme[], op: Op, direction: 'undo' | 'redo'): Theme[] {
  const insert = (t: Theme, index: number) => {
    const next = themes.filter((x) => x.id !== t.id);
    next.splice(Math.min(index, next.length), 0, t);
    return next;
  };
  const remove = (id: string) => themes.filter((x) => x.id !== id);
  switch (op.kind) {
    case 'insert':
      return direction === 'undo' ? remove(op.theme.id) : insert(op.theme, op.index);
    case 'remove':
      return direction === 'undo' ? insert(op.theme, op.index) : remove(op.theme.id);
    case 'patch':
      return themes.map((x) => (x.id === op.id ? { ...x, ...(direction === 'undo' ? op.before : op.after) } : x));
  }
}

function opTargetId(op: Op): string {
  return op.kind === 'patch' ? op.id : op.theme.id;
}

const memoryStore = new Map<string, string>();
const safeStorage = {
  getItem: (k: string) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : (memoryStore.get(k) ?? null)),
  setItem: (k: string, v: string) => { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); else memoryStore.set(k, v); },
  removeItem: (k: string) => { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); else memoryStore.delete(k); },
};

interface DiscussionState {
  byPack: Record<string, PackDiscussion>;
  history: Record<string, History>;

  /** テーマを追加して選択する。作成者が AI なら AI の提案として記録する。 */
  addTheme: (key: string, init: Partial<Theme> & { title: string }) => Theme;
  /** 課題からテーマを作る。同じ課題のテーマが既にあれば、それを選択して返す（重複させない）。 */
  createFromIssue: (key: string, issue: { id: string; title: string }) => Theme;
  /** 名前を変える。空は変えずに false */
  rename: (key: string, id: string, title: string) => boolean;
  remove: (key: string, id: string) => void;
  setStatus: (key: string, id: string, status: DecisionStatus) => void;
  /** 記録の項目（本文）を書き換える。履歴には積まない */
  update: (key: string, id: string, patch: Partial<Omit<Theme, 'id' | 'actions'>>) => void;
  addAction: (key: string, themeId: string) => NextAction;
  patchAction: (key: string, themeId: string, actionId: string, patch: Partial<Omit<NextAction, 'id'>>) => void;
  removeAction: (key: string, themeId: string, actionId: string) => void;
  select: (key: string, id: string | null) => void;
  undo: (key: string) => boolean;
  redo: (key: string) => boolean;
  /** 読み込んだ内容で置き換える（履歴は捨てる） */
  replaceThemes: (key: string, themes: Theme[]) => void;
  /** 空の状態に戻す（サンプルに戻すなどから呼ぶ） */
  reset: (key: string) => void;
}

export const useDiscussionStore = create<DiscussionState>()(
  persist(
    (set, get) => {
      const dis = (key: string): PackDiscussion => get().byPack[key] ?? EMPTY_DISCUSSION;
      const write = (key: string, d: Partial<PackDiscussion>, h?: History) =>
        set((s) => ({
          byPack: { ...s.byPack, [key]: { ...(s.byPack[key] ?? EMPTY_DISCUSSION), ...d } },
          ...(h ? { history: { ...s.history, [key]: h } } : {}),
        }));
      const hist = (key: string): History => get().history[key] ?? EMPTY_HISTORY;
      const record = (key: string, op: Op) => ({ undo: [...hist(key).undo, op], redo: [] as Op[] });

      return {
        byPack: {},
        history: {},

        addTheme: (key, init) => {
          const theme = createTheme(init.createdBy === 'ai' && init.status === undefined ? { ...init, status: 'ai-proposed' } : init);
          const themes = [...dis(key).themes, theme];
          write(key, { themes, selectedId: theme.id }, record(key, { kind: 'insert', theme, index: themes.length - 1 }));
          return theme;
        },

        createFromIssue: (key, issue) => {
          const existing = dis(key).themes.find((t) => t.issueId === issue.id);
          if (existing) {
            write(key, { selectedId: existing.id });
            return existing;
          }
          return get().addTheme(key, { title: issue.title, issueId: issue.id });
        },

        rename: (key, id, title) => {
          const next = title.trim();
          const cur = dis(key).themes.find((t) => t.id === id);
          if (!cur || next === '') return false;
          if (cur.title === next) return true;
          write(
            key,
            { themes: dis(key).themes.map((t) => (t.id === id ? { ...t, title: next } : t)) },
            record(key, { kind: 'patch', id, before: { title: cur.title }, after: { title: next } }),
          );
          return true;
        },

        remove: (key, id) => {
          const d = dis(key);
          const index = d.themes.findIndex((t) => t.id === id);
          if (index < 0) return;
          const theme = d.themes[index];
          if (!theme) return;
          const themes = d.themes.filter((t) => t.id !== id);
          const selectedId = d.selectedId === id ? (themes[Math.min(index, themes.length - 1)]?.id ?? null) : d.selectedId;
          write(key, { themes, selectedId }, record(key, { kind: 'remove', theme, index }));
        },

        setStatus: (key, id, status) => {
          const cur = dis(key).themes.find((t) => t.id === id);
          if (!cur || cur.status === status) return;
          write(
            key,
            { themes: dis(key).themes.map((t) => (t.id === id ? { ...t, status } : t)) },
            record(key, { kind: 'patch', id, before: { status: cur.status }, after: { status } }),
          );
        },

        update: (key, id, patch) =>
          write(key, { themes: dis(key).themes.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),

        addAction: (key, themeId) => {
          const action = createNextAction();
          write(key, { themes: dis(key).themes.map((t) => (t.id === themeId ? { ...t, actions: [...t.actions, action] } : t)) });
          return action;
        },

        patchAction: (key, themeId, actionId, patch) =>
          write(key, {
            themes: dis(key).themes.map((t) =>
              t.id === themeId ? { ...t, actions: t.actions.map((a) => (a.id === actionId ? { ...a, ...patch } : a)) } : t),
          }),

        removeAction: (key, themeId, actionId) =>
          write(key, {
            themes: dis(key).themes.map((t) => (t.id === themeId ? { ...t, actions: t.actions.filter((a) => a.id !== actionId) } : t)),
          }),

        select: (key, id) => write(key, { selectedId: id }),

        undo: (key) => {
          const h = hist(key);
          const op = h.undo[h.undo.length - 1];
          if (!op) return false;
          const d = dis(key);
          const themes = applyOp(d.themes, op, 'undo');
          const id = opTargetId(op);
          const selectedId = themes.some((t) => t.id === id) ? id : (themes.some((t) => t.id === d.selectedId) ? d.selectedId : (themes[0]?.id ?? null));
          write(key, { themes, selectedId }, { undo: h.undo.slice(0, -1), redo: [...h.redo, op] });
          return true;
        },

        redo: (key) => {
          const h = hist(key);
          const op = h.redo[h.redo.length - 1];
          if (!op) return false;
          const d = dis(key);
          const themes = applyOp(d.themes, op, 'redo');
          const id = opTargetId(op);
          const selectedId = themes.some((t) => t.id === id) ? id : (themes.some((t) => t.id === d.selectedId) ? d.selectedId : (themes[0]?.id ?? null));
          write(key, { themes, selectedId }, { undo: [...h.undo, op], redo: h.redo.slice(0, -1) });
          return true;
        },

        replaceThemes: (key, themes) =>
          write(key, { themes, selectedId: themes[0]?.id ?? null }, EMPTY_HISTORY),

        reset: (key) => write(key, { themes: [], selectedId: null }, EMPTY_HISTORY),
      };
    },
    {
      name: 'edb.discussion',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ byPack: s.byPack }),
    },
  ),
);

/** 画面から使う選択子（空配列は共通の定数を返し、無用な再描画を避ける）。 */
export const selectThemes = (key: string) => (s: DiscussionState): Theme[] => s.byPack[key]?.themes ?? EMPTY_THEMES;
export const selectSelectedId = (key: string) => (s: DiscussionState): string | null => s.byPack[key]?.selectedId ?? null;
export const selectCanUndo = (key: string) => (s: DiscussionState): boolean => (s.history[key]?.undo.length ?? 0) > 0;
export const selectCanRedo = (key: string) => (s: DiscussionState): boolean => (s.history[key]?.redo.length ?? 0) > 0;
