// コマンドパレット・ショートカット一覧の開閉の状態（FR-111・FR-029）。
import { create } from 'zustand';

interface CommandUiState {
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
}

export const useCommandUi = create<CommandUiState>((set) => ({
  paletteOpen: false,
  shortcutsOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen, ...(paletteOpen ? { shortcutsOpen: false } : {}) }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen, ...(shortcutsOpen ? { paletteOpen: false } : {}) }),
}));

/** グローバルなキー: Ctrl+K（⌘K）でコマンドパレット（[ASSUMPTION] A-05）、? でショートカット一覧。入力欄の中の `?` は文字入力なので除く。 */
export function globalKeyAction(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; editable: boolean }): 'palette' | 'shortcuts' | null {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') return 'palette';
  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.editable) return 'shortcuts';
  return null;
}
