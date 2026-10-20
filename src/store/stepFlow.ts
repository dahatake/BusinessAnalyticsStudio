// ステップのクリックでの再配置の要求と、「元に戻す」の記録（FR-228）。レイアウトの保存は store/layout.ts が行う。
import { create } from 'zustand';
import { useLayout, type FloatMap, type FloatRect } from './layout';
import type { Persona } from '../workspace/layoutModel';

interface Snapshot { persona: Persona; floats: FloatMap | undefined; zOrder: string[] }

interface StepFlowState {
  /** 再配置の要求の通し番号（Workspace が見て、測ってから並べる） */
  seq: number;
  step: number;
  undo: Snapshot | null;
  request: (step: number) => void;
  remember: (s: Snapshot) => void;
  clear: () => void;
}

export const useStepFlow = create<StepFlowState>((set) => ({
  seq: 0,
  step: 0,
  undo: null,
  request: (step) => set((s) => ({ seq: s.seq + 1, step })),
  remember: (snap) => set({ undo: snap }),
  clear: () => set({ undo: null }),
}));

/** 再配置の直前のレイアウトに戻す。ピン止めしたものは再配置の前後で変えない。戻したら true */
export function undoStepFlow(): boolean {
  const snap = useStepFlow.getState().undo;
  if (!snap) return false;
  const L = useLayout.getState();
  if (L.persona !== snap.persona) { useStepFlow.getState().clear(); return false; }
  const pins: Record<string, FloatRect> = L.pinned[snap.persona] ?? {};
  const floats: FloatMap = { ...(snap.floats ?? {}), ...pins };
  const next = { ...L.floats };
  if (Object.keys(floats).length > 0) next[snap.persona] = floats;
  else delete next[snap.persona];
  useLayout.setState({ floats: next, zOrder: snap.zOrder });
  useStepFlow.getState().clear();
  return true;
}
