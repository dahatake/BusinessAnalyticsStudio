// 空間ビュー（FR-240）の表示状態（階層・KPI）。画面が作り直されても、2D/3D を切り替えても保たれる（AC-575）。保存はしない。
// projection は、3D の面が描いているカメラの種類（テスト用フック t.scene.camera().projection に出す）。
import { create } from 'zustand';
import { SPATIAL_ELEMENT_DEPTH } from './model';
import { clampDepth } from '../semanticzoom';

interface SpatialViewState {
  depth: number;
  kpi: string | undefined;
  projection: 'perspective' | 'orthographic';
  setDepth: (d: number) => void;
  setKpi: (k: string | undefined) => void;
  setProjection: (p: 'perspective' | 'orthographic') => void;
}

export const useSpatialView = create<SpatialViewState>((set) => ({
  depth: 0,
  kpi: undefined,
  projection: 'perspective',
  setDepth: (d) => set({ depth: clampDepth(d, SPATIAL_ELEMENT_DEPTH) }),
  setKpi: (kpi) => set({ kpi }),
  setProjection: (projection) => set({ projection }),
}));
