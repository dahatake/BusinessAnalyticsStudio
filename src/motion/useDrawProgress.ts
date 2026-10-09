// チャートの描画の動き（FR-070）。0〜1 の進みを返し、チャートはこれで線・棒・面を描く。停止中は最初から 1（完成した状態）。
import { useEffect, useState } from 'react';
import { DURATION, drawProgress, scaledDuration } from './fluent';
import { useMotionProfile, usePlaying } from './useMotion';

export function useDrawProgress(baseMs: number = DURATION.ultraSlow * 2): number {
  const playing = usePlaying();
  const { tempo } = useMotionProfile();
  const ms = scaledDuration(baseMs, tempo, playing);
  const [p, setP] = useState(() => drawProgress(0, ms, playing));

  useEffect(() => {
    if (ms === 0) { setP(1); return undefined; }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const v = drawProgress(now - start, ms, true);
      setP(v);
      if (v < 1) raf = requestAnimationFrame(tick);
    };
    setP(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ms]);

  return ms === 0 ? 1 : p;
}
