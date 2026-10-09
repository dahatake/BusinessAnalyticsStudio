// 数値のカウントアップ（FR-070）。KPI の数値は KpiValue で表示し、動きだけをここで足す。
// アニメーション停止中は、最終値を即座に表示する（FR-071）。
import { useEffect, useRef, useState } from 'react';
import { KpiValue } from '../components/Brand';
import { DURATION, countUpValue, scaledDuration } from './fluent';
import { useMotionProfile, usePlaying } from './useMotion';

/** target までの値を、カウントアップしながら返す。停止中・時間 0 のときは target をそのまま返す */
export function useCountUp(target: number, baseMs: number = DURATION.ultraSlow * 2): number {
  const playing = usePlaying();
  const { tempo } = useMotionProfile();
  const [value, setValue] = useState(target);
  const fromRef = useRef(0);
  const ms = scaledDuration(baseMs, tempo, playing);

  useEffect(() => {
    if (ms === 0) {
      fromRef.current = target;
      setValue(target);
      return undefined;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = (now - start) / ms;
      const v = countUpValue(from, target, t);
      fromRef.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return ms === 0 ? target : value;
}

/** カウントアップする KPI の数値 */
export function CountUpValue({ value, format }: { value: number; format?: (v: number) => string }) {
  const v = useCountUp(value);
  const fmt = format ?? ((x: number) => Math.round(x).toLocaleString('ja-JP'));
  return <KpiValue>{fmt(v)}</KpiValue>;
}
