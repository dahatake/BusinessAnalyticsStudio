// データビュアー（FR-169）の表示状態: 表示モード・倍率・詳細度・絞り込み。保存しない。
// 画面（コンポーネント）が作り直されても、2D/3D を切り替えても、ここに持つので失われない（AC-337、NFR-UX-012）。
import { create } from 'zustand';
import { ZOOM_HOME, clampZoom, levelOfZoom, nextLevel, scaleZoom, stepZoom, type DetailLevel } from '../datacatalog/viewer';

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
  reset: () => void;
}

const INITIAL = { mode: '2d' as ViewMode, zoom: ZOOM_HOME, level: levelOfZoom(ZOOM_HOME), filter: '', cluster: null as string | null };

export const useDataViewer = create<DataViewerState>((set) => ({
  ...INITIAL,
  setMode: (mode) => set({ mode }),
  setZoom: (z) => set((s) => { const zoom = clampZoom(z); return { zoom, level: nextLevel(s.level, zoom) }; }),
  zoomBy: (factor) => set((s) => { const zoom = scaleZoom(s.zoom, factor); return { zoom, level: nextLevel(s.level, zoom) }; }),
  step: (dir) => set((s) => { const zoom = stepZoom(s.zoom, dir); return { zoom, level: nextLevel(s.level, zoom) }; }),
  home: () => set({ zoom: ZOOM_HOME, level: levelOfZoom(ZOOM_HOME) }),
  setFilter: (filter) => set({ filter }),
  setCluster: (cluster) => set({ cluster }),
  reset: () => set({ ...INITIAL }),
}));
