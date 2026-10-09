// 有効なブランド（顧客パックの値に、設定パネルでの上書きを重ねたもの）。FR-064
import { useMemo } from 'react';
import type { BrandProfile } from '../schema';
import { useSettings } from '../store/settings';
import { usePackStore } from '../store/pack';

export function applyOverrides(brand: BrandProfile, primaryOverride: string | null): BrandProfile {
  if (!primaryOverride) return brand;
  return { ...brand, colors: { ...brand.colors, primary: primaryOverride } };
}

/** 顧客パックが読めていれば、上書きを重ねたブランド。読めていなければ undefined */
export function useEffectiveBrand(): BrandProfile | undefined {
  const state = usePackStore((s) => s.state);
  const override = useSettings((s) => s.brandPrimaryOverride);
  const brand = state.status === 'ready' ? state.pack.brand : undefined;
  return useMemo(() => (brand ? applyOverrides(brand, override) : undefined), [brand, override]);
}
