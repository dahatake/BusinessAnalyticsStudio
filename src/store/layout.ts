// ワークスペースのレイアウトの状態。ペルソナ別に localStorage へ保存し、再読込で復元する（FR-014）。
// 「選択中の対象」と「絞り込み」は別の状態で、ここでは持たない（FR-110: 既定に戻しても変わらない）。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_PERSONA, PERSONAS, activate, arrangeAll, defaultLayout, hide, isLayout, isVisible, mergeIntoTabs, move, prune, resize, show,
  splitFromTabs, toggleDirection, type Layout, type Move, type Path, type Persona,
} from '../workspace/layoutModel';

/** 画面の registry に登録されたコンポーネントのキー。App が起動時に設定する。 */
let available: ReadonlySet<string> = new Set();
export function setAvailableComponents(keys: readonly string[]): void {
  available = new Set(keys);
}

interface LayoutState {
  persona: Persona;
  /** 利用者が変えたレイアウト。ないペルソナは既定のレイアウト */
  layouts: Partial<Record<Persona, Layout>>;
  /** 最大化中のコンポーネント（保存しない） */
  maximized: string | null;
  setPersona: (p: Persona) => void;
  hideComponent: (key: string) => void;
  showComponent: (key: string) => void;
  moveComponent: (key: string, dir: Move) => void;
  toggleDirection: (key: string) => void;
  mergeTabs: (key: string, target: string) => void;
  untab: (key: string) => void;
  resizeAt: (path: Path, index: number, delta: number) => void;
  activateTab: (key: string) => void;
  setMaximized: (key: string | null) => void;
  resetLayout: () => void;
}

/** 表示するレイアウト（使えないコンポーネントを除く）。 */
export function effectiveLayout(s: Pick<LayoutState, 'persona' | 'layouts'>): Layout {
  const stored = s.layouts[s.persona];
  if (stored === null) return null; // 利用者が全部を非表示にした状態はそのまま（ドックから再表示できる）
  // 既定、または保存値の画面が 1 つも残らないとき: §7 の既定、それも空なら登録済みの画面を並べる（暫定）
  const kept = stored !== undefined ? prune(stored, available) : null;
  return kept ?? prune(defaultLayout(s.persona), available) ?? arrangeAll([...available]);
}

export const useLayout = create<LayoutState>()(
  persist(
    (set, get) => {
      const apply = (fn: (l: Layout) => Layout, maximized?: string | null) =>
        set((s) => ({
          layouts: { ...s.layouts, [s.persona]: fn(effectiveLayout(s)) },
          ...(maximized !== undefined ? { maximized } : {}),
        }));
      return {
        persona: DEFAULT_PERSONA,
        layouts: {},
        maximized: null,
        setPersona: (persona) => set({ persona, maximized: null }),
        hideComponent: (key) => apply((l) => hide(l, key), get().maximized === key ? null : get().maximized),
        showComponent: (key) => apply((l) => show(l, key)),
        moveComponent: (key, dir) => apply((l) => move(l, key, dir)),
        toggleDirection: (key) => apply((l) => toggleDirection(l, key)),
        mergeTabs: (key, target) => apply((l) => mergeIntoTabs(l, key, target)),
        untab: (key) => apply((l) => splitFromTabs(l, key)),
        resizeAt: (path, index, delta) => apply((l) => resize(l, path, index, delta)),
        activateTab: (key) => apply((l) => activate(l, key)),
        setMaximized: (maximized) => set({ maximized }),
        resetLayout: () => set((s) => {
          const layouts = { ...s.layouts };
          delete layouts[s.persona];
          return { layouts, maximized: null };
        }),
      };
    },
    {
      name: 'edb.layout',
      version: 1,
      partialize: (s) => ({ persona: s.persona, layouts: s.layouts }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Pick<LayoutState, 'persona' | 'layouts'>>;
        const persona = PERSONAS.includes(p.persona as Persona) ? (p.persona as Persona) : current.persona;
        const layouts: Partial<Record<Persona, Layout>> = {};
        for (const name of PERSONAS) {
          const v = (p.layouts as Record<string, unknown> | undefined)?.[name];
          if (v !== undefined && isLayout(v)) layouts[name] = v;
        }
        return { ...current, persona, layouts };
      },
    },
  ),
);

/** 表示中か（テスト・コマンド用）。 */
export function isComponentVisible(key: string): boolean {
  return isVisible(effectiveLayout(useLayout.getState()), key);
}
