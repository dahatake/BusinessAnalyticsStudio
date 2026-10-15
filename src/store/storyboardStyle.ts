// ストーリーボードの再生スタイル（FR-166）。この端末の localStorage だけに保存して復元する。既定は Isometric 3D。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_STYLE, isStyle, type StoryStyle } from '../usecase/storyboard';

interface StyleState { style: StoryStyle; setStyle: (s: StoryStyle) => void }

export const useStoryStyle = create<StyleState>()(
  persist(
    (set) => ({ style: DEFAULT_STYLE, setStyle: (style) => set({ style }) }),
    {
      name: 'eabk.storyboard-style.v1',
      version: 1,
      partialize: (s) => ({ style: s.style }),
      merge: (persisted, current) => {
        const raw = (persisted as { style?: unknown } | undefined)?.style;
        return { ...current, style: isStyle(raw) ? raw : DEFAULT_STYLE };
      },
    },
  ),
);
