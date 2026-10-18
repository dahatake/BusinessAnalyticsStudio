// ビューの切替の状態を画面から使うためのフック（FR-217・FR-218）。
//  - useComponentView(key): そのコンポーネントの表示モード・世界の表示（保存した値と宣言・環境から決めたもの）と、切り替える関数
//  - useScreenViewSwitch(): 画面の見出しの切替（全コンポーネントにまとめて効く）
//  - usePublishViewItems(key, ...): コンポーネントが表示している項目とツイン関係を、テスト用フック t.view.state(key) に知らせる
import { useCallback, useLayoutEffect } from 'react';
import { useLayout, type ViewSetting } from '../store/layout';
import { useSelectionStore } from '../store/selection';
import { registerTestHook } from '../testing/hook';
import { detect3D } from './render3d';
import {
  effectiveMode, effectiveWorld, screenModeFor, screenWorldFor, viewDeclKeys, viewDeclOf,
  type ViewDecl, type ViewMode, type WorldView,
} from './viewModel';

export interface ComponentView {
  decl: ViewDecl;
  mode: ViewMode;
  world: WorldView;
  can3D: boolean;
  setMode: (m: ViewMode) => void;
  setWorld: (w: WorldView) => void;
}

/** 保存した値（いまのペルソナ） */
function storedOf(s: ReturnType<typeof useLayout.getState>, key: string): ViewSetting | undefined {
  return s.views[s.persona]?.[key];
}

/** いまの表示モード・世界の表示（ストアの外から読む。テスト用フック・3D の可視判定に使う） */
export function viewStateOf(key: string): { mode: ViewMode; world: WorldView } {
  const decl = viewDeclOf(key);
  const st = storedOf(useLayout.getState(), key);
  return { mode: effectiveMode(decl, st?.mode, detect3D()), world: effectiveWorld(decl, st?.world) };
}

export function useComponentView(key: string): ComponentView {
  const decl = viewDeclOf(key);
  const storedMode = useLayout((s) => s.views[s.persona]?.[key]?.mode);
  const storedWorld = useLayout((s) => s.views[s.persona]?.[key]?.world);
  const setView = useLayout((s) => s.setView);
  const can3D = detect3D();
  const setMode = useCallback((m: ViewMode) => setView(key, { mode: m }), [setView, key]);
  const setWorld = useCallback((w: WorldView) => setView(key, { world: w }), [setView, key]);
  return { decl, mode: effectiveMode(decl, storedMode, can3D), world: effectiveWorld(decl, storedWorld), can3D, setMode, setWorld };
}

/** 画面の見出しの切替。表現を固定したコンポーネント・その表現を持たないコンポーネントは変えない（AC-507）。ピン止めしたものにも効く（Q-036 の回答まで。A-54） */
export function applyScreenView(patch: ViewSetting, keys: readonly string[] = viewDeclKeys()): void {
  const patches: Record<string, ViewSetting> = {};
  for (const k of keys) {
    const decl = viewDeclOf(k);
    const p: ViewSetting = {};
    if (patch.mode) { const m = screenModeFor(decl, patch.mode); if (m) p.mode = m; }
    if (patch.world) { const w = screenWorldFor(decl, patch.world); if (w) p.world = w; }
    if (p.mode || p.world) patches[k] = p;
  }
  useLayout.getState().setViews(patches, patch);
}

export function useScreenView(): { mode: ViewMode; world: WorldView } {
  const sv = useLayout((s) => s.screenView[s.persona]);
  return { mode: sv?.mode ?? '2d', world: sv?.world ?? 'both' };
}

// ---- 表示中の項目（テスト用フック t.view.state。CONTRACT.md §21） ----
interface Published { itemIds: readonly string[]; twinLinks: ReadonlyArray<readonly [string, string]> }
const published = new Map<string, Published>();

/** コンポーネントが表示している項目（非表示の世界の項目を含めない）と、線か印で表示しているツイン関係を知らせる */
export function usePublishViewItems(key: string, itemIds: readonly string[], twinLinks: ReadonlyArray<readonly [string, string]> = []): void {
  useLayoutEffect(() => {
    published.set(key, { itemIds, twinLinks });
  }, [key, itemIds, twinLinks]);
  useLayoutEffect(() => () => { published.delete(key); }, [key]);
}

export interface ViewTestState {
  mode: ViewMode;
  world: WorldView;
  itemIds: string[];
  selectedIds: string[];
  twinLinks: Array<[string, string]>;
}

/** そのコンポーネントが表示している状態（t.view.state(key)） */
export function viewTestState(key: string): ViewTestState {
  const { mode, world } = viewStateOf(key);
  const p = published.get(key);
  const sel = useSelectionStore.getState().selectedIds;
  const items = p ? [...p.itemIds] : [];
  const shown = new Set(items);
  return {
    mode,
    world,
    itemIds: items,
    selectedIds: p ? sel.filter((id) => shown.has(id)) : [...sel],
    twinLinks: p ? p.twinLinks.map(([a, b]) => [a, b] as [string, string]) : [],
  };
}

/** テスト用フック（`?e2e=1` のときだけ）。App が 1 回登録する */
export function registerViewTestHook(): () => void {
  return registerTestHook('view', { state: (key: string) => viewTestState(key) });
}
