// ガイド（ウェルカム／使い方）の開閉と「確認済み」の記録（FR-267・FR-272）。
// 確認済みは、「次回から表示しない」を選んで閉じたときだけ、この端末の localStorage に記録する（Project のデータとは別。端末の外へは出さない）。
import { create } from 'zustand';

export const GUIDE_ACK_KEY = 'bas.guide.welcomeAck';

export type GuideVariant = 'main' | 'workspace';

function storage(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

export function readAck(): boolean {
  try { return storage()?.getItem(GUIDE_ACK_KEY) === '1'; } catch { return false; }
}
export function writeAck(): void {
  try { storage()?.setItem(GUIDE_ACK_KEY, '1'); } catch { /* 保存できないときは、次回も表示する */ }
}

/**
 * 起動時に自動で出してよいか。確認済みでなく、このセッションでまだ出していないときだけ。
 * `?e2e=1`（テスト用）のときは、URL に `welcome=1` があるときだけ出す（既存の System Test を妨げない）。
 */
export function shouldAutoShow(search: string = typeof window !== 'undefined' ? window.location.search : ''): boolean {
  if (readAck()) return false;
  const q = new URLSearchParams(search);
  return q.get('e2e') === '1' ? q.get('welcome') === '1' : true;
}

interface GuideState {
  open: boolean;
  variant: GuideVariant;
  /** このセッションで自動表示を済ませたか（閉じても記録しないが、同じセッションでは再表示しない） */
  autoDone: boolean;
  openGuide: (variant: GuideVariant) => void;
  autoOpen: () => void;
  /** 閉じる。dontShow が true のときだけ確認済みを記録する */
  close: (dontShow: boolean) => void;
}

export const useGuide = create<GuideState>((set, get) => ({
  open: false,
  variant: 'main',
  autoDone: false,
  openGuide: (variant) => set({ open: true, variant }),
  autoOpen: () => {
    if (get().autoDone) return;
    set({ autoDone: true });
    if (shouldAutoShow()) set({ open: true, variant: 'main' });
  },
  close: (dontShow) => {
    if (dontShow) writeAck();
    set({ open: false });
  },
}));

export function resetGuide(): void {
  useGuide.setState({ open: false, variant: 'main', autoDone: false });
}