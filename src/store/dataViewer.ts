// データビュアー（FR-169）の表示状態: 表示モード・倍率・詳細度・絞り込み。保存しない。
// 画面（コンポーネント）が作り直されても、2D/3D を切り替えても、ここに持つので失われない（AC-337、NFR-UX-012）。
import { create } from 'zustand';
import { ZOOM_HOME, clampZoom, levelOfZoom, nextLevel, scaleZoom, stepZoom, type DetailLevel } from '../datacatalog/viewer';
import { useLayout } from './layout';

/** 表示モードは、データカタログの見出しの「ビュー」と同じ状態（FR-217 AC-507）。正本はレイアウトの views（保存する）で、ここはその写し */
export const DATA_VIEWER_VIEW_KEY = 'data-catalog';
const layoutMode = (): ViewMode => {
  const s = useLayout.getState();
  return s.views[s.persona]?.[DATA_VIEWER_VIEW_KEY]?.mode ?? '2d';
};

export type ViewMode = '2d' | '3d';

interface DataViewerState {
  mode: ViewMode;
  zoom: number;
  level: DetailLevel;
  filter: string;
  /** 注目している塊（鳥観図で選んだもの） */
  cluster: string | null;
  setMode: (m: ViewMode) => void;
  setZoom: (z: number) => void;
  zoomBy: (factor: number) => void;
  step: (dir: 1 | -1) => void;
  home: () => void;
  setFilter: (q: string) => void;
  setCluster: (c: string | null) => void;
  /** 注目しているユースケース（FR-170） */
  useCase: string | null;
  setUseCase: (u: string | null) => void;
  reset: () => void;
}

const INITIAL = { mode: layoutMode(), zoom: ZOOM_HOME, level: levelOfZoom(ZOOM_HOME), filter: '', cluster: null as string | null, useCase: null as string | null };

export const useDataViewer = create<DataViewerState>((set) => ({
  ...INITIAL,
  setMode: (mode) => { set({ mode }); useLayout.getState().setView(DATA_VIEWER_VIEW_KEY, { mode }); },
  setZoom: (z) => set((s) => { const zoom = clampZoom(z); return { zoom, level: nextLevel(s.level, zoom) }; }),
  zoomBy: (factor) => set((s) => { const zoom = scaleZoom(s.zoom, factor); return { zoom, level: nextLevel(s.level, zoom) }; }),
  step: (dir) => set((s) => { const zoom = stepZoom(s.zoom, dir); return { zoom, level: nextLevel(s.level, zoom) }; }),
  home: () => set({ zoom: ZOOM_HOME, level: levelOfZoom(ZOOM_HOME) }),
  setFilter: (filter) => set({ filter }),
  setCluster: (cluster) => set({ cluster }),
  setUseCase: (useCase) => set({ useCase }),
  reset: () => { set({ ...INITIAL, mode: '2d' }); useLayout.getState().setView(DATA_VIEWER_VIEW_KEY, { mode: '2d' }); },
}));

// 見出しの「ビュー」・既定のレイアウトに戻す・ペルソナの切替で変わった表示モードを写す
useLayout.subscribe(() => {
  const m = layoutMode();
  if (useDataViewer.getState().mode !== m) useDataViewer.setState({ mode: m });
});
