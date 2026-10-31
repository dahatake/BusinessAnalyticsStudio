// 没入（Immersive）の一時的な状態（FR-300）。保存しない。
//  - Focus に入る前のモード（解除すると、直前の配置に戻す）
//  - Focus で呼び出して広げているゾーン（Main 以外は、減光・縮小して残し、操作で呼び出せる）
//  - 最後にゾーンの操作（Move・Snap）をしたコンポーネント（ゾーンの選択を保つ印）
import { create } from 'zustand';
import type { WorkspaceMode, ZoneName } from '../workspace/zones';

interface State {
  /** タスクワークスペース ID → Focus に入る前のモード */
  before: Record<string, WorkspaceMode>;
  recalled: ZoneName[];
  selectedKey: string | null;
  remember: (id: string, mode: WorkspaceMode) => void;
  toggleRecall: (zone: ZoneName) => void;
  clearRecall: () => void;
  select: (key: string | null) => void;
}

export const useImmersion = create<State>()((set) => ({
  before: {},
  recalled: [],
  selectedKey: null,
  remember: (id, mode) => set((s) => ({ before: { ...s.before, [id]: mode } })),
  toggleRecall: (zone) => set((s) => ({ recalled: s.recalled.includes(zone) ? s.recalled.filter((z) => z !== zone) : [...s.recalled, zone] })),
  clearRecall: () => set((s) => (s.recalled.length === 0 ? s : { recalled: [] })),
  select: (selectedKey) => set({ selectedKey }),
}));
