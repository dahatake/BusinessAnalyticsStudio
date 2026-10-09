// 演出の設定を読むフック。ブランドトーンから決まる設定（FR-063）と、利用者の選択を重ねた演出強度を返す。
import { useMemo } from 'react';
import { useEffectiveBrand } from '../theme/useBrand';
import { useSettings } from '../store/settings';
import { useAnimation } from '../store/animation';
import { motionProfileForTone, resolveIntensity, type Intensity, type MotionProfile } from './tone';

/** ブランドトーンから決まる演出の設定（パックが読めていないときは「先進的」相当） */
export function useMotionProfile(): MotionProfile {
  const brand = useEffectiveBrand();
  const tone = brand?.tone.value;
  return useMemo(() => motionProfileForTone(tone), [tone]);
}

/** 現在の演出強度（利用者が選んでいなければ、トーンの既定値） */
export function useIntensity(): Intensity {
  const profile = useMotionProfile();
  const chosen = useSettings((s) => s.intensity);
  return resolveIntensity(chosen, profile);
}

/** 動きを付けてよいか（アニメーションが再生中か） */
export function usePlaying(): boolean {
  return useAnimation((s) => s.playing);
}
