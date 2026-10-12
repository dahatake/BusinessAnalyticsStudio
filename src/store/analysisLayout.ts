// 分析画面のレイアウト（結果パネルの位置・大きさ）の変更・保存・復元・既定に戻す（NFR-UX-006 AC-214・AC-215）。
// 保存は端末内の localStorage だけ（画面ごと。Q-009 A）。FR-014 のペルソナ別レイアウトとは別の保存単位。
import { create } from 'zustand';

export const LAYOUT_KEY = 'eabk.analysis-layout.v1';
/** 分析画面の画面キー（画面ごとに保存する単位） */
export const ANALYSIS_SCREEN = 'analysis';
export const MOVE_STEP = 24;
export const MAX_OFFSET = 2000;
export const MIN_WIDTH_DELTA = -400;
export const MAX_WIDTH_DELTA = 800;

/** 既定からの差分。{0,0,0} が既定の配置 */
export interface PanelLayout { dx: number; dy: number; dw: number }
export const DEFAULT_LAYOUT: PanelLayout = { dx: 0, dy: 0, dw: 0 };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const normalize = (l: PanelLayout): PanelLayout => ({
  dx: clamp(Math.round(l.dx), -MAX_OFFSET, MAX_OFFSET),
  dy: clamp(Math.round(l.dy), -MAX_OFFSET, MAX_OFFSET),
  dw: clamp(Math.round(l.dw), MIN_WIDTH_DELTA, MAX_WIDTH_DELTA),
});
export const isDefaultLayout = (l: PanelLayout) => l.dx === 0 && l.dy === 0 && l.dw === 0;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function parseLayouts(raw: string | null): Record<string, PanelLayout> {
  if (!raw) return {};
  try {
    const d = JSON.parse(raw) as unknown;
    if (typeof d !== 'object' || d === null || Array.isArray(d)) return {};
    const out: Record<string, PanelLayout> = {};
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      const o = v as Partial<PanelLayout> | null;
      if (o && [o.dx, o.dy, o.dw].every((n) => typeof n === 'number' && Number.isFinite(n))) out[k] = normalize(o as PanelLayout);
    }
    return out;
  } catch {
    return {};
  }
}

function browserStorage(): Store | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

interface LayoutState {
  screens: Record<string, PanelLayout>;
  get: (screen: string) => PanelLayout;
  moveBy: (screen: string, dx: number, dy: number) => void;
  resizeBy: (screen: string, dw: number) => void;
  set: (screen: string, l: PanelLayout) => void;
  reset: (screen: string) => void;
}

export const useAnalysisLayout = create<LayoutState>((set, get) => ({
  screens: parseLayouts((() => { try { return browserStorage()?.getItem(LAYOUT_KEY) ?? null; } catch { return null; } })()),
  get: (screen) => get().screens[screen] ?? DEFAULT_LAYOUT,
  moveBy: (screen, dx, dy) => { const c = get().get(screen); get().set(screen, { ...c, dx: c.dx + dx, dy: c.dy + dy }); },
  resizeBy: (screen, dw) => { const c = get().get(screen); get().set(screen, { ...c, dw: c.dw + dw }); },
  set: (screen, l) => set((s) => ({ screens: { ...s.screens, [screen]: normalize(l) } })),
  reset: (screen) => set((s) => {
    const { [screen]: _drop, ...rest } = s.screens;
    return { screens: rest };
  }),
}));

/** 変更のたびに端末内へ保存する。保存できなくても操作は続ける。戻り値は購読の解除。 */
export function startLayoutPersistence(storage: Store | null = browserStorage()): () => void {
  if (!storage) return () => {};
  return useAnalysisLayout.subscribe((s) => {
    try { storage.setItem(LAYOUT_KEY, JSON.stringify(s.screens)); } catch { /* 保存できなくても使い続けられる */ }
  });
}

/** テスト用 */
export function resetAnalysisLayout(): void {
  useAnalysisLayout.setState({ screens: {} });
}

startLayoutPersistence();
