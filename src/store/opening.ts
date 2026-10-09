// オープニングの再生状態（FR-076）。アプリの起動時に 1 回再生し、あとから再生し直せる（ショーコントロールバーの「オープニングの再生」など）。
// 保存しない（再読込でもう一度再生する）。
import { create } from 'zustand';

interface OpeningState {
  /** オープニングを終えた（本編を表示してよい）か */
  opened: boolean;
  /** 本編へ移る（スキップ・Esc・時間切れ） */
  finish: () => void;
  /** もう一度再生する */
  replay: () => void;
}

export const useOpening = create<OpeningState>((set) => ({
  opened: false,
  finish: () => set({ opened: true }),
  replay: () => set({ opened: false }),
}));
