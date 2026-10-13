// 最小化・復元（コンポーネント、左のメニュー）の動き（NFR-UX-008）。
// レイアウトは操作の直後に最終の状態へ切り替え（動きの途中でも次の操作・計測が最終の配置で行える）、変化した部品の見た目だけを
// Fluent 2 の Normal（200ms）・Decelerate で整える。動きの途中でも操作を受け付ける（アニメーションはポインターを奪わない）。
// 「視差効果を減らす」が有効、またはアニメーションが「停止中」のときは、動きを付けずに最終の状態にする（FR-071・FR-072）。
import { useState } from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { prefersReducedMotion, useAnimation } from '../store/animation';

export type FoldPhase = 'fold' | 'unfold';

const useStyles = makeStyles({
  base: { animationDuration: tokens.durationNormal, animationTimingFunction: tokens.curveDecelerateMid, animationFillMode: 'none' },
  fold: { animationName: { from: { opacity: 0.5 }, to: { opacity: 1 } } },
  unfold: { animationName: { from: { opacity: 0.6, filter: 'saturate(0.6)' }, to: { opacity: 1, filter: 'saturate(1)' } } },
});

/** 動きを付けてよいか（再生中で、OS の「視差効果を減らす」が無効） */
export function motionAllowed(playing: boolean, reduced: boolean): boolean {
  return playing && !reduced;
}

/**
 * `folded` が変わった直後の描画で、`fold`（畳んだ）／`unfold`（戻した）を返す。最初の描画では何も返さない。
 * 動きを付けない設定のときは、変わっても undefined のまま。
 */
export function useFoldMotion(folded: boolean): FoldPhase | undefined {
  const playing = useAnimation((s) => s.playing);
  const [state, setState] = useState({ folded, moved: false });
  if (state.folded !== folded) setState({ folded, moved: true });
  if (!state.moved || !motionAllowed(playing, prefersReducedMotion())) return undefined;
  return folded ? 'fold' : 'unfold';
}

/** 畳んだ・戻した直後に付ける class（動きを付けないときは undefined） */
export function useFoldClass(folded: boolean): string | undefined {
  const s = useStyles();
  const phase = useFoldMotion(folded);
  return phase ? mergeClasses(s.base, phase === 'fold' ? s.fold : s.unfold) : undefined;
}