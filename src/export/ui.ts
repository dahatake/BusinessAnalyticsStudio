// エクスポートの画面の開閉と、書き出し後の通知（FR-052）。常設ボタン・ショートカット・コマンドは、すべてここを開く。
import { create } from 'zustand';

export interface ExportNotice { kind: 'success' | 'error'; title: string; lines: string[] }

interface ExportUi {
  open: boolean;
  notice: ExportNotice | null;
  openDialog: () => void;
  closeDialog: () => void;
  setNotice: (n: ExportNotice | null) => void;
}

export const useExportUi = create<ExportUi>((set) => ({
  open: false,
  notice: null,
  openDialog: () => set({ open: true }),
  closeDialog: () => set({ open: false }),
  setNotice: (notice) => set({ notice }),
}));

/** どこからでも呼べる、エクスポートの画面を開く処理。 */
export const openExportDialog = (): void => useExportUi.getState().openDialog();
