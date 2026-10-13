// 3D ビューの描画の段階（FR-147）。最初のフレームは軽いシーン（拠点・床・ライト）だけで出し、重い要素は後から足す。
// first: 最初のフレームの前（軽い要素だけ）／ rest: 重い要素を非表示のまま組み上げ、シェーダーを非同期でコンパイル中／ shown: すべて表示。
import { createContext, useContext, type ReactNode } from 'react';

export type RenderStage = 'first' | 'rest' | 'shown';

/** 既定は shown（段階表示をしない描画（地図など）は、これまでどおりすべて出す） */
export const StageContext = createContext<RenderStage>('shown');

export function useRenderStage(): RenderStage {
  return useContext(StageContext);
}

/** 最初のフレームの後に足す要素。rest の間は非表示で組み上げる（コンパイルを済ませてから見せる）。 */
export function LaterStage({ children }: { children: ReactNode }) {
  const stage = useRenderStage();
  if (stage === 'first') return null;
  return <group visible={stage === 'shown'}>{children}</group>;
}

/** 段階の進め方（純粋関数）。単体テストの対象。 */
export function nextStage(stage: RenderStage, event: 'settled' | 'compiled'): RenderStage {
  if (stage === 'first' && event === 'settled') return 'rest';
  if (stage === 'rest' && event === 'compiled') return 'shown';
  return stage;
}
