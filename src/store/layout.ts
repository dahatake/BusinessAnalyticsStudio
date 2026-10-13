// ワークスペースのレイアウトの状態。ペルソナ別に localStorage へ保存し、再読込で復元する（FR-014）。
// 「選択中の対象」と「絞り込み」は別の状態で、ここでは持たない（FR-110: 既定に戻しても変わらない）。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_PERSONA, PERSONAS, activate, keysOf, arrangeAll, defaultLayout, hide, isLayout, isVisible, mergeIntoTabs, move, prune, resize, show,
  splitFromTabs, splitBetween, toggleDirection, dropAt, getAt, type DropZone, type Layout, type Move, type Path, type Persona,
} from '../workspace/layoutModel';
import { resizedKeys } from '../workspace/autosize';
import { snapLayout, type SnapKind, type SnapOpts } from '../workspace/snap';

/** 画面の registry に登録されたコンポーネントのキー。App が起動時に設定する。 */
let available: ReadonlySet<string> = new Set();
export function setAvailableComponents(keys: readonly string[]): void {
  available = new Set(keys);
}

interface LayoutState {
  persona: Persona;
  /** 利用者が変えたレイアウト。ないペルソナは既定のレイアウト */
  layouts: Partial<Record<Persona, Layout>>;
  /** 操作中のコンポーネントを大きくする自動のサイズ調整（FR-143）。保存する */
  autoSize: boolean;
  /** 利用者が手で大きさを変えたコンポーネント（ペルソナ別）。自動の調整で変えない */
  manual: Partial<Record<Persona, string[]>>;
  setAutoSize: (on: boolean) => void;
  /** 最小化したコンポーネント（ペルソナ別。見出しだけ残して畳む。保存する。FR-151） */
  minimized: Partial<Record<Persona, string[]>>;
  /** 左のメニューをアイコンだけにしているか（保存する。FR-151） */
  navMin: boolean;
  setMinimized: (key: string, on: boolean) => void;
  setNavMin: (on: boolean) => void;
  dropMove: (key: string, target: string, zone: DropZone) => void;
  /** 画面端のスナップの候補どおりに配置する（FR-152）。配置した大きさは自動のサイズ調整で変えない */
  snapTo: (key: string, kind: SnapKind, opts?: SnapOpts) => void;
  resizeByKeys: (a: string, b: string, delta: number) => void;
  /** 最大化中のコンポーネント（保存しない） */
  maximized: string | null;
  /** 直近に「見せたい」と指示されたコンポーネント（ナビ・再表示・タブ選択。保存しない）。最小幅でタブにまとめた中でも前面にするために使う */
  revealed: { key: string } | null;
  /** 「既定のレイアウトに戻す」を行った回数（保存しない）。戻した直後は操作中の扱いを解き、次の操作まで既定の寸法にする（FR-110 AC-135、FR-143） */
  resetCount: number;
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
        revealed: null,
        resetCount: 0,
        autoSize: true,
        manual: {},
        setAutoSize: (autoSize) => set({ autoSize }),
        minimized: {},
        navMin: false,
        setMinimized: (key, on) => set((st) => {
          const cur = (st.minimized[st.persona] ?? []).filter((k) => k !== key);
          // 最小化は最大化と両立しない（最小化すると最大化を解く）
          return { minimized: { ...st.minimized, [st.persona]: on ? [...cur, key] : cur }, ...(on && st.maximized === key ? { maximized: null } : {}) };
        }),
        setNavMin: (navMin) => set({ navMin }),
        dropMove: (key, target, zone) => apply((l) => dropAt(l, key, target, zone)),
        snapTo: (key, kind, opts) => {
          set((st) => (kind === 'tabs' ? {} : { manual: { ...st.manual, [st.persona]: [...new Set([...(st.manual[st.persona] ?? []), ...keysOf(effectiveLayout(st))])] } }));
          apply((l) => snapLayout(l, key, kind, opts));
        },
        resizeByKeys: (a, b, delta) => {
          const l = effectiveLayout(get());
          const at = splitBetween(l, a, b);
          if (!at || !l) return;
          const keys = resizedKeys(getAt(l, at.path), at.index);
          set((st) => ({ manual: { ...st.manual, [st.persona]: [...new Set([...(st.manual[st.persona] ?? []), ...keys])] } }));
          apply((x) => resize(x, at.path, at.index, delta));
        },
        setPersona: (persona) => set({ persona, maximized: null }),
        hideComponent: (key) => apply((l) => hide(l, key), get().maximized === key ? null : get().maximized),
        showComponent: (key) => { apply((l) => show(l, key)); set({ revealed: { key } }); },
        moveComponent: (key, dir) => apply((l) => move(l, key, dir)),
        toggleDirection: (key) => apply((l) => toggleDirection(l, key)),
        mergeTabs: (key, target) => apply((l) => mergeIntoTabs(l, key, target)),
        untab: (key) => apply((l) => splitFromTabs(l, key)),
        resizeAt: (path, index, delta) => {
          const l = effectiveLayout(get());
          const keys = l ? resizedKeys(getAt(l, path), index) : [];
          set((st) => ({ manual: { ...st.manual, [st.persona]: [...new Set([...(st.manual[st.persona] ?? []), ...keys])] } }));
          apply((x) => resize(x, path, index, delta));
        },
        activateTab: (key) => apply((l) => activate(l, key)),
        setMaximized: (maximized) => set((st) => ({
          maximized,
          // 操作の対象にすると最小化は解ける（FR-151）
          ...(maximized ? { minimized: { ...st.minimized, [st.persona]: (st.minimized[st.persona] ?? []).filter((k) => k !== maximized) } } : {}),
        })),
        resetLayout: () => set((s) => {
          const layouts = { ...s.layouts };
          delete layouts[s.persona];
          const manual = { ...s.manual };
          delete manual[s.persona];
          const minimized = { ...s.minimized };
          delete minimized[s.persona];
          return { layouts, manual, minimized, navMin: false, maximized: null, resetCount: s.resetCount + 1 };
        }),
      };
    },
    {
      name: 'edb.layout',
      version: 1,
      partialize: (s) => ({ persona: s.persona, layouts: s.layouts, autoSize: s.autoSize, manual: s.manual, minimized: s.minimized, navMin: s.navMin }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Pick<LayoutState, 'persona' | 'layouts' | 'autoSize' | 'manual' | 'minimized' | 'navMin'>>;
        const minimized: Partial<Record<Persona, string[]>> = {};
        for (const name of PERSONAS) {
          const v = (p.minimized as Record<string, unknown> | undefined)?.[name];
          if (Array.isArray(v) && v.every((k) => typeof k === 'string')) minimized[name] = v as string[];
        }
        const persona = PERSONAS.includes(p.persona as Persona) ? (p.persona as Persona) : current.persona;
        const layouts: Partial<Record<Persona, Layout>> = {};
        for (const name of PERSONAS) {
          const v = (p.layouts as Record<string, unknown> | undefined)?.[name];
          if (v !== undefined && isLayout(v)) layouts[name] = v;
        }
        const manual: Partial<Record<Persona, string[]>> = {};
        for (const name of PERSONAS) {
          const v = (p.manual as Record<string, unknown> | undefined)?.[name];
          if (Array.isArray(v) && v.every((k) => typeof k === 'string')) manual[name] = v as string[];
        }
        return { ...current, persona, layouts, manual, minimized, navMin: p.navMin === true, autoSize: typeof p.autoSize === 'boolean' ? p.autoSize : true };
      },
    },
  ),
);

/** 表示中か（テスト・コマンド用）。 */
export function isComponentVisible(key: string): boolean {
  return isVisible(effectiveLayout(useLayout.getState()), key);
}

/** 画面として登録されているか（表のように、後の項目で登録される画面の有無を見分けるため）。 */
export function isComponentAvailable(key: string): boolean {
  return available.has(key);
}
