// アニメーションの再生／停止（P キー）。3D の連続描画はこれに従う。（FR-071 の土台。CSS・動画の停止は FR-071 の項目で足す）
import { create } from 'zustand';

interface AnimationState {
  playing: boolean;
  toggle: () => void;
}

export const useAnimation = create<AnimationState>((set) => ({
  playing: true,
  toggle: () => set((s) => ({ playing: !s.playing })),
}));
