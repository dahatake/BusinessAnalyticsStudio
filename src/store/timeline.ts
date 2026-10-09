// 時間軸（FR-021）。地図の流れなど、時刻に応じて表示が変わるビューが共通で読む。アプリで 1 つ。
// 時刻は 0〜23 時。レイアウトの変更・ペルソナの切替・画面の切替で変わらない（NFR-UX-001）。保存はしない。
import { create } from 'zustand';
import { HOURS } from '../map/flows';

interface TimelineState {
  hour: number;
  /** 自動で時刻を進めるか（アニメーションの再生中だけ進む） */
  auto: boolean;
  setHour: (h: number) => void;
  step: (delta: number) => void;
  setAuto: (a: boolean) => void;
}

const wrap = (h: number): number => ((Math.round(h) % HOURS) + HOURS) % HOURS;

export const useTimeline = create<TimelineState>((set) => ({
  hour: 12,
  auto: false,
  setHour: (h) => set({ hour: Math.min(HOURS - 1, Math.max(0, Math.round(h))) }),
  step: (delta) => set((s) => ({ hour: wrap(s.hour + delta) })),
  setAuto: (auto) => set({ auto }),
}));

export const formatHour = (h: number): string => `${String(h).padStart(2, '0')}:00`;
