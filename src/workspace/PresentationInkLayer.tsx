// 作業領域（配置を受けるキャンバス）の上に重ねる、プレゼン中の注釈の描画面（FR-091 AC-111・FR-086）。
// 画面「キャンバス」の廃止（FR-012）に伴い、画面から作業領域へ移した。「一時的な注釈」か「保存」を選んだ間だけ入力を受ける。
import { useEffect } from 'react';
import { BoardSurface } from '../ink/BoardSurface';
import { PRESENTATION_BOARD_ID, PRESENTATION_VIEW_KEY, usePresentationInk } from '../ink/presentationInk';
import { useInk } from '../ink/store';
import { currentTopic, usePresentationStore } from '../store/presentation';

export function PresentationInkLayer() {
  const presenting = usePresentationStore((st) => currentTopic(st) !== null);
  const mode = usePresentationInk((st) => st.mode);
  const ensureAnnotationBoard = useInk((st) => st.ensureAnnotationBoard);
  useEffect(() => { ensureAnnotationBoard(PRESENTATION_VIEW_KEY); }, [ensureAnnotationBoard]);
  if (!presenting) return null; // プレゼン中だけ置く（通常の表示には描画面を持ち込まない）
  return (
    <BoardSurface
      boardId={PRESENTATION_BOARD_ID}
      testId="presentation-ink"
      ariaLabel="プレゼン中の注釈"
      overlay
      active={mode !== 'off'}
      temporary={mode === 'temporary'}
    />
  );
}
