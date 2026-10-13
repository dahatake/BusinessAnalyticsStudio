// 3D ビューの描画の段階（FR-147）。最初のフレームは軽いシーン（拠点・床・ライト）だけで出し、重い要素は後から足す。
// first: 最初のフレームの前（軽い要素だけ）／ rest: 重い要素を非表示のまま組み上げ、シェーダーを非同期でコンパイル中／ shown: すべて表示。
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

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

/** 重い効果（環境マップ・後処理）の段階。1 度に 1 つずつ足し、それぞれの 1 秒ほどの同期停止を重ねない。 */
export type HeavyPhase = 'none' | 'env' | 'fx';

/** 表示が出そろってから環境マップを足すまでの待ち */
export const HEAVY_EFFECTS_DELAY_MS = 5000;
/** 環境マップの後、後処理を足すまでの間（その間に追従・クリックを受け付ける） */
export const HEAVY_EFFECTS_GAP_MS = 1500;

/** 重い効果の段階の進め方（純粋関数）。stage が shown でなければ none のまま。 */
export function nextHeavy(phase: HeavyPhase, stage: RenderStage): HeavyPhase {
  if (stage !== 'shown') return phase;
  if (phase === 'none') return 'env';
  if (phase === 'env') return 'fx';
  return phase;
}

/** 重い効果の段階を時間で進める。stage が shown になってから DELAY、その後は GAP ごとに 1 段ずつ。 */
export function useHeavyPhase(stage: RenderStage, delayMs = HEAVY_EFFECTS_DELAY_MS, gapMs = HEAVY_EFFECTS_GAP_MS): HeavyPhase {
  const [phase, setPhase] = useState<HeavyPhase>('none');
  useEffect(() => {
    if (stage !== 'shown' || phase === 'fx') return;
    const t = setTimeout(() => setPhase((p) => nextHeavy(p, stage)), phase === 'none' ? delayMs : gapMs);
    return () => clearTimeout(t);
  }, [stage, phase, delayMs, gapMs]);
  return phase;
}

/** 段階を進める（enabled が false なら常に shown）。settled で rest へ、compile が済むと shown へ。 */
export function useStageProgress(enabled: boolean, settled: boolean, restDelayMs: number, compile: (alive: () => boolean) => Promise<void>): RenderStage {
  const [stage, setStage] = useState<RenderStage>(enabled ? 'first' : 'shown');
  useEffect(() => {
    if (!enabled || !settled) return;
    const t = setTimeout(() => setStage((s) => nextStage(s, 'settled')), restDelayMs);
    return () => clearTimeout(t);
  }, [enabled, settled, restDelayMs]);
  useEffect(() => {
    if (stage !== 'rest') return;
    let alive = true;
    void (async () => {
      await new Promise<void>((res) => setTimeout(res, 0)); // 重い要素が組み上がるのを待つ
      if (!alive) return;
      await compile(() => alive);
      if (!alive) return;
      setStage((s) => nextStage(s, 'compiled'));
    })();
    return () => { alive = false; };
  // compile は呼び出し側が段階ごとに安定させる
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);
  return stage;
}

/** 段階の進め方（純粋関数）。単体テストの対象。 */
export function nextStage(stage: RenderStage, event: 'settled' | 'compiled'): RenderStage {
  if (stage === 'first' && event === 'settled') return 'rest';
  if (stage === 'rest' && event === 'compiled') return 'shown';
  return stage;
}
