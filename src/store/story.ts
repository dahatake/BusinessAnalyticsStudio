// ペルソナ別ストーリーの状態（FR-177・FR-290）。保存しない（再読込で通常に戻る）。
// picking: ペルソナの選択ダイアログを出している。persona: ストーリーを再生中のペルソナ（null は再生していない）。
// genai: 「生成 AI で作成」（FR-290）の進行（作成中・使えない理由・送信情報の再確認）。aiStory: 生成 AI で作ったシーン（null は FR-179 のストーリー）。
import { create } from 'zustand';
import type { StoryPersona, StoryScene } from '../story/model';

export type StoryGenaiPhase =
  | { phase: 'running'; persona: StoryPersona; runId: number }
  | { phase: 'error'; persona: StoryPersona; reasonText: string }
  /** 生成された文をすべて除いた（エラーではない。FR-290 AC-776） */
  | { phase: 'removed'; persona: StoryPersona; message: string }
  | { phase: 'reconfirm'; persona: StoryPersona; added: Array<{ id: string; label: string }> };

export interface AiStory {
  scenes: StoryScene[];
  provider: 'foundry' | 'copilot';
  /** 入力を上限に合わせて切り詰めた */
  truncated: boolean;
  /** 材料にない数値・名称を含むため表示しなかった文の数 */
  removed: number;
}

interface StoryState {
  picking: boolean;
  persona: StoryPersona | null;
  /** ストーリーを閉じても保つ現在のシーンの位置（Esc でフルスクリーンを抜けても位置は保たれる。FR-178 AC-360） */
  index: number;
  genai: StoryGenaiPhase | null;
  aiStory: AiStory | null;
  openPicker: () => void;
  closePicker: () => void;
  /** FR-179 のストーリー（生成 AI を使わない）を始める */
  play: (persona: StoryPersona) => void;
  /** 生成 AI での作成を始める（作成中の表示） */
  startGenai: (persona: StoryPersona) => void;
  setGenai: (g: StoryGenaiPhase | null) => void;
  /** 生成 AI で作ったストーリーを始める */
  playAi: (persona: StoryPersona, story: AiStory) => void;
  setIndex: (index: number) => void;
  /** ストーリーとダイアログを閉じる */
  reset: () => void;
}

let runSeq = 0;

export const useStoryStore = create<StoryState>((set) => ({
  picking: false,
  persona: null,
  index: 0,
  genai: null,
  aiStory: null,
  openPicker: () => set({ picking: true }),
  closePicker: () => set({ picking: false }),
  play: (persona) => set({ picking: false, persona, index: 0, genai: null, aiStory: null }),
  startGenai: (persona) => set({ picking: false, persona: null, index: 0, aiStory: null, genai: { phase: 'running', persona, runId: ++runSeq } }),
  setGenai: (genai) => set({ genai }),
  playAi: (persona, aiStory) => set({ picking: false, persona, index: 0, genai: null, aiStory }),
  setIndex: (index) => set({ index }),
  reset: () => set({ picking: false, persona: null, index: 0, genai: null, aiStory: null }),
}));
