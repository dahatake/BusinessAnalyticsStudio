// プレゼン中の書き込み（FR-091）。「一時的な注釈」で書いた線はチャプターを移ると消え、「保存」で書いた線はボードに残る。
// 書き込みの扱いは利用者が選ぶ（既定は「書かない」＝キャンバスの操作を妨げない）。プレゼンを終えると「書かない」に戻る。
import { create } from 'zustand';
import { usePresentationStore, currentTopic } from '../store/presentation';
import { annotationBoardId, useInk } from './store';

export type AnnotationMode = 'off' | 'temporary' | 'saved';

export const PRESENTATION_VIEW_KEY = 'presentation';
export const PRESENTATION_BOARD_ID = annotationBoardId(PRESENTATION_VIEW_KEY);

interface PresentationInk {
  mode: AnnotationMode;
  setMode: (m: AnnotationMode) => void;
}

export const usePresentationInk = create<PresentationInk>((set) => ({
  mode: 'off',
  setMode: (mode) => set({ mode }),
}));

/** 一時的な注釈（temporary のストローク）を、すべてのボードから消す。消した本数を返す。 */
export function clearTemporaryStrokes(): number {
  const ink = useInk.getState();
  let removed = 0;
  for (const b of ink.boards) {
    const ids = b.strokes.filter((k) => k.temporary).map((k) => k.id);
    if (ids.length === 0) continue;
    removed += ids.length;
    // 履歴には積まない（チャプターの移動で消えたものは「元に戻す」の対象にしない）
    ink.removeObjects(b.id, ids, false);
  }
  return removed;
}

let started = false;
/** チャプターの移動とプレゼンの終了を見て、一時的な注釈を消す（1 回だけ登録する）。 */
export function startPresentationInkWatch(): void {
  if (started) return;
  started = true;
  let lastChapter: string | null = null;
  usePresentationStore.subscribe((s) => {
    const cur = currentTopic(s);
    const chapter = cur?.chapterId ?? null;
    if (chapter !== lastChapter) {
      if (lastChapter !== null || chapter === null) clearTemporaryStrokes();
      lastChapter = chapter;
    }
    if (!s.active && usePresentationInk.getState().mode !== 'off') usePresentationInk.getState().setMode('off');
  });
}

startPresentationInkWatch();
