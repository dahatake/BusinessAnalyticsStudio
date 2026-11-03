// ガイド（ウェルカム／使い方）の開閉（FR-267・FR-272）。
// 起動時には自動で開かない。メイン画面の右上のアイコン「使い方を見る」・分析画面の「使い方」から開く。
// 「確認済み」の記録や「次回から表示しない」の選択は持たない（端末内には何も保存しない）。
import { create } from 'zustand';

export type GuideVariant = 'main' | 'workspace';

interface GuideState {
  open: boolean;
  variant: GuideVariant;
  openGuide: (variant: GuideVariant) => void;
  close: () => void;
}

export const useGuide = create<GuideState>((set) => ({
  open: false,
  variant: 'main',
  openGuide: (variant) => set({ open: true, variant }),
  close: () => set({ open: false }),
}));

export function resetGuide(): void {
  useGuide.setState({ open: false, variant: 'main' });
}
