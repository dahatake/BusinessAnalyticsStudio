// ホワイトボードのタイマー（FR-099）。議論の時間を区切るための、カウントダウン。
// 残り時間は「終了の時刻」から計算するので、画面を切り替えても、描画が止まっても、ずれない。
import { create } from 'zustand';

export const DEFAULT_TIMER_SEC = 5 * 60;
export const MAX_TIMER_SEC = 99 * 60 + 59;

/** 残りミリ秒を「分:秒」の文字にする（切り上げ。0 以下は 0:00）。 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60), s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface TimerState {
  /** 開始（リセット）したときの長さ（秒） */
  durationSec: number;
  /** 動いているときの終了時刻（ms）。止まっていれば null */
  endsAt: number | null;
  /** 止まっているときの残り（ms） */
  pausedMs: number;
  setDuration: (sec: number) => void;
  start: (now?: number) => void;
  pause: (now?: number) => void;
  reset: () => void;
}

export const useTimer = create<TimerState>((set, get) => ({
  durationSec: DEFAULT_TIMER_SEC,
  endsAt: null,
  pausedMs: DEFAULT_TIMER_SEC * 1000,
  setDuration: (sec) => {
    const durationSec = Math.min(MAX_TIMER_SEC, Math.max(1, Math.round(sec)));
    set({ durationSec, endsAt: null, pausedMs: durationSec * 1000 });
  },
  start: (now = Date.now()) => {
    const s = get();
    if (s.endsAt !== null && s.endsAt > now) return;
    const finished = s.endsAt !== null;
    const ms = !finished && s.pausedMs > 0 ? s.pausedMs : s.durationSec * 1000;
    set({ endsAt: now + ms, pausedMs: ms });
  },
  pause: (now = Date.now()) => {
    const s = get();
    if (s.endsAt === null) return;
    set({ endsAt: null, pausedMs: Math.max(0, s.endsAt - now) });
  },
  reset: () => set((s) => ({ endsAt: null, pausedMs: s.durationSec * 1000 })),
}));

export const remainingMs = (s: Pick<TimerState, 'endsAt' | 'pausedMs'>, now: number): number =>
  s.endsAt === null ? s.pausedMs : Math.max(0, s.endsAt - now);

export const isRunning = (s: Pick<TimerState, 'endsAt'>, now: number): boolean => s.endsAt !== null && s.endsAt > now;
