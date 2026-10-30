// タスクワークスペースの状態（FR-298）。5 階層「アプリ → ウィンドウ → ゾーン → タスクワークスペース → タスク文脈」のうち、
// タスクワークスペースごとに「ロール（どのコンポーネントがどのゾーンか）」「レイアウト（ゾーンの割合）」「モード」「ゾーンの結合」「タスク文脈」を持つ。
// ロールとレイアウトは別のフィールドで、一方を変えても他方は変わらない（AC-806）。この端末の localStorage に保存し、再読込で復元する。
// 画面の見た目・OS・Focus の没入（FR-299・FR-300）は、この状態を読むだけで拡張できる（モードやゾーンの定義は workspace/zones.ts）。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_MODE, DEFAULT_RATIOS, ZONE_NAMES, isMode, isZoneName, sanitizeRatio, type Ratios, type WorkspaceMode, type ZoneName } from '../workspace/zones';
import { tr } from '../i18n';
import { rememberEntered, workspaceFromUrl } from './workspaceEntry';

/** タスク文脈（開いているコンポーネント・選択・絞り込み・入力中の内容・ズームなど。workspace/taskContext.ts が取り込み・復元する） */
export interface TaskContext {
  persona: string;
  /** 画面の一時的な状態（絞り込み・入力中の内容・視点など。store/retained.ts） */
  retained: Record<string, unknown>;
  /** 選択中の対象 */
  selection: string[];
  /** そのペルソナの配置（開いているコンポーネント・位置・最小化など。store/layout.ts の項目ごと） */
  layout: Record<string, unknown>;
}

export interface TaskWorkspace {
  id: string;
  name: string;
  mode: WorkspaceMode;
  /** ゾーンの割合（%）。ロールとは別に保持する */
  ratios: Ratios;
  /** 結合して 1 つにしているゾーン */
  merged: ZoneName[];
  /** ロール: コンポーネントのキー → ゾーン */
  roles: Record<string, ZoneName>;
  context: TaskContext | null;
  /** 最後に使った時刻（最近使った作業の順） */
  usedAt: number;
}

interface State {
  items: TaskWorkspace[];
  /** このウィンドウで見ているタスクワークスペース */
  active: string;
  setMode: (mode: WorkspaceMode) => void;
  setRatio: (zone: keyof Ratios, value: number) => void;
  assign: (key: string, zone: ZoneName | null) => void;
  merge: (zones: readonly ZoneName[]) => void;
  unmerge: () => void;
  /** 文脈を保存する（利用中のものへ） */
  saveContext: (id: string, ctx: TaskContext) => void;
  add: () => string;
  activate: (id: string) => void;
}

export const STORAGE_KEY = 'eabk.workspaces.v1';
/** 最近使った作業として並べる件数（PARAM-140） */
export const RECENT_LIMIT = 5;

let seq = 0;
let lastTick = 0;
/** 単調に増える時刻（同じミリ秒に続けて使っても、使った順が決まる） */
function tick(): number {
  lastTick = Math.max(Date.now(), lastTick + 1);
  return lastTick;
}
export function newId(): string {
  seq += 1;
  return `ws-${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 表示する名前。既定の名前（「ワークスペース N」）は、表示言語に合わせる（利用者が付けた名前はそのまま。FR-294） */
export function workspaceLabel(name: string): string {
  const m = /^ワークスペース (\d+)$/.exec(name);
  return m ? tr('ワークスペース {n}', { n: m[1]! }) : name;
}

export function blankWorkspace(index: number, id: string = newId()): TaskWorkspace {
  return { id, name: `ワークスペース ${index}`, mode: DEFAULT_MODE, ratios: { ...DEFAULT_RATIOS }, merged: [], roles: {}, context: null, usedAt: tick() };
}

function clean(raw: unknown, index: number): TaskWorkspace | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<TaskWorkspace>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const ratios: Ratios = { ...DEFAULT_RATIOS };
  for (const k of ['main', 'reference', 'communication'] as const) { const v = r.ratios?.[k]; if (typeof v === 'number' && Number.isFinite(v) && v > 0) ratios[k] = v; }
  const roles: Record<string, ZoneName> = {};
  for (const [k, z] of Object.entries(r.roles ?? {})) if (isZoneName(z)) roles[k] = z;
  return {
    id: r.id,
    name: typeof r.name === 'string' && r.name ? r.name : `ワークスペース ${index}`,
    mode: isMode(r.mode) ? r.mode : DEFAULT_MODE,
    ratios,
    merged: Array.isArray(r.merged) ? ZONE_NAMES.filter((n) => (r.merged as unknown[]).includes(n)) : [],
    roles,
    context: r.context && typeof r.context === 'object' ? (r.context as TaskContext) : null,
    usedAt: typeof r.usedAt === 'number' ? r.usedAt : 0,
  };
}

const SESSION_ACTIVE = 'eabk.workspace.active';
function sessionActive(): string | null {
  try { return window.sessionStorage.getItem(SESSION_ACTIVE); } catch { return null; }
}
function rememberActive(id: string): void {
  try { window.sessionStorage.setItem(SESSION_ACTIVE, id); } catch { /* 無視 */ }
}

const FIRST = blankWorkspace(1, 'ws-1');

export const useTaskWorkspaces = create<State>()(
  persist(
    (set, get) => {
      /** 利用中のタスクワークスペースだけを書き換える。操作したことを覚える（再読込で分析画面へ戻る） */
      const patch = (fn: (w: TaskWorkspace) => TaskWorkspace): void => {
        rememberEntered();
        set((s) => ({ items: s.items.map((w) => (w.id === s.active ? fn(w) : w)) }));
      };
      return {
        items: [FIRST],
        active: FIRST.id,
        setMode: (mode) => patch((w) => (w.mode === mode ? w : { ...w, mode })),
        // 割合を変えても、ロールは変えない（AC-806）
        setRatio: (zone, value) => patch((w) => ({ ...w, ratios: { ...w.ratios, [zone]: sanitizeRatio(value) } })),
        // ロールを変えても、割合は変えない（AC-806）。null で割り当てを外す
        assign: (key, zone) => patch((w) => {
          const roles = { ...w.roles };
          if (zone) roles[key] = zone; else delete roles[key];
          return { ...w, roles };
        }),
        merge: (zones) => patch((w) => ({ ...w, merged: ZONE_NAMES.filter((n) => zones.includes(n)) })),
        unmerge: () => patch((w) => (w.merged.length === 0 ? w : { ...w, merged: [] })),
        saveContext: (id, context) => set((s) => ({ items: s.items.map((w) => (w.id === id ? { ...w, context } : w)) })),
        add: () => {
          rememberEntered();
          const id = newId();
          set((s) => ({ items: [...s.items, blankWorkspace(s.items.length + 1, id)] }));
          return id;
        },
        activate: (id) => {
          if (!get().items.some((w) => w.id === id)) return;
          rememberEntered();
          rememberActive(id);
          set((s) => ({ active: id, items: s.items.map((w) => (w.id === id ? { ...w, usedAt: tick() } : w)) }));
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (s) => ({ items: s.items, active: s.active }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { items?: unknown[]; active?: string };
        const items = (Array.isArray(p.items) ? p.items : []).map((x, i) => clean(x, i + 1)).filter((x): x is TaskWorkspace => x !== null);
        if (items.length === 0) return current;
        // このウィンドウで見るもの: URL の指定（別のウィンドウへ移した）→ このタブで最後に見たもの → 保存していたもの
        const want = [workspaceFromUrl(), sessionActive(), p.active].find((id) => id && items.some((w) => w.id === id));
        return { ...current, items, active: want ?? items[0]!.id };
      },
    },
  ),
);

/** 利用中のタスクワークスペース */
export function activeWorkspace(s: Pick<State, 'items' | 'active'>): TaskWorkspace {
  return s.items.find((w) => w.id === s.active) ?? s.items[0]!;
}
export const useActiveWorkspace = (): TaskWorkspace => useTaskWorkspaces((s) => activeWorkspace(s));

/** 最近使ったタスクワークスペース（新しい順。RECENT_LIMIT 件まで） */
export function recentWorkspaces(items: readonly TaskWorkspace[]): TaskWorkspace[] {
  return [...items].sort((a, b) => b.usedAt - a.usedAt).slice(0, RECENT_LIMIT);
}
