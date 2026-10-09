// ショーの操作の状態（FR-082 リアクション・FR-084 プレゼンタービュー/レーザーポインター・FR-081 書き出しの画面）。保存しない（再読込で初期に戻る）。
import { create } from 'zustand';
import type { ReactionId } from '../show/extras';

interface ShowUiState {
  /** プレゼンタービュー（発表者向けの表示）を出しているか */
  presenterView: boolean;
  setPresenterView: (on: boolean) => void;
  /** レーザーポインターを使っているか */
  laser: boolean;
  setLaser: (on: boolean) => void;
  /** リアクションの件数（種類ごと） */
  reactions: Record<ReactionId, number>;
  react: (id: ReactionId) => void;
  /** ショート動画の書き出しの画面を開いているか */
  shortVideoOpen: boolean;
  setShortVideoOpen: (open: boolean) => void;
}

export const useShowUi = create<ShowUiState>((set) => ({
  presenterView: false,
  setPresenterView: (presenterView) => set({ presenterView }),
  laser: false,
  setLaser: (laser) => set({ laser }),
  reactions: { like: 0, clap: 0, idea: 0 },
  react: (id) => set((s) => ({ reactions: { ...s.reactions, [id]: s.reactions[id] + 1 } })),
  shortVideoOpen: false,
  setShortVideoOpen: (shortVideoOpen) => set({ shortVideoOpen }),
}));
