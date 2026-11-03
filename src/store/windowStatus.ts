// 開いているコンポーネントの一覧（WindowList）が求めた Window の状態を、左メニュー（AppShell）へ渡す（FR-295 AC-824）。
// 状態の求め方は windowStates.ts の 1 つだけで、一覧と左メニューは同じ値を見る（食い違わない）。保存はしない（FR-014 のレイアウトから毎回求める）。
import { create } from 'zustand';
import type { WindowState } from '../workspace/windowStates';

interface WindowStatus {
  states: Record<string, WindowState>;
  /** レイアウトの木にあるコンポーネントのキー（最小化の復元が「元の位置」か、再表示かを分ける） */
  inTree: string[];
  /** コンポーネントのキー → 属する画面のキー */
  screenOf: Record<string, string>;
  publish: (s: Pick<WindowStatus, 'states' | 'inTree' | 'screenOf'>) => void;
}

export const useWindowStatus = create<WindowStatus>((set) => ({
  states: {},
  inTree: [],
  screenOf: {},
  publish: (s) => set(s),
}));
