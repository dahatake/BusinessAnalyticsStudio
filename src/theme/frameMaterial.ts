// 枠の面の素材（Mica／Acrylic 風の半透明。FR-300・FR-058 の「控えめ」の範囲）。
//  - 対象は、ヘッダー・Workspace Switcher・ゾーンの境界のような枠の面だけ。コンテンツの面（コンポーネント）は不透明のまま。
//  - 不透明度は FRAME_OPACITY（PARAM-141 = 80% 以上）。背景のぼかしを加える。文字のコントラストは、面の色（不透明のときと同じ色）で FR-060 を満たす。
//  - 強制カラー・「透明効果を減らす」では、不透明な面に戻す（CSS の媒体条件。下の frameSurfaceStyle）。
//  - 面の色は、Fluent のトークン（colorNeutralBackground3）の解決済みの値から rgba を作って CSS 変数 --eabk-frame-bg に置く（Light・Dark・ブランドで変わる）。
//    色の混合（color-mix）は計算済みスタイルが color() の形になり、透明度を機械的に読めないため使わない。
import { useEffect, type RefObject } from 'react';
import { tokens } from '@fluentui/react-components';

/** 枠の面の不透明度（PARAM-141 の 80% 以上） */
export const FRAME_OPACITY = 0.9;
export const FRAME_VAR = '--eabk-frame-bg';

/** makeStyles に展開する、枠の面のスタイル（半透明＋ぼかし。強制カラー・透明効果の低減は不透明） */
export const frameSurfaceStyle = {
  backgroundColor: `var(${FRAME_VAR}, ${tokens.colorNeutralBackground3})`,
  backdropFilter: 'blur(14px) saturate(1.15)',
  '@media (forced-colors: active)': { backgroundColor: tokens.colorNeutralBackground3, backdropFilter: 'none' },
  '@media (prefers-reduced-transparency: reduce)': { backgroundColor: tokens.colorNeutralBackground3, backdropFilter: 'none' },
} as const;

/** CSS の色（#rgb・#rrggbb・rgb()・rgba()）を [r, g, b] にする。読めなければ null */
export function parseColor(v: string): [number, number, number] | null {
  const s = v.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const h = hex[1]!.length === 3 ? hex[1]!.split('').map((c) => c + c).join('') : hex[1]!;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (rgb) {
    const p = rgb[1]!.split(/[ ,/]+/).filter(Boolean).slice(0, 3).map(Number);
    if (p.length === 3 && p.every((n) => Number.isFinite(n))) return [p[0]!, p[1]!, p[2]!];
  }
  return null;
}

/** 面の色に不透明度を付けた rgba */
export function withOpacity(rgb: readonly [number, number, number], opacity: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`;
}

/**
 * ref の要素に、枠の面の色（半透明）の CSS 変数を置く。テーマ（Light・Dark・ブランド）が変わったら置き直す。
 * テーマはプロバイダーの class・style で切り替わるため、祖先の属性の変化を見る。
 */
export function useFrameMaterial(ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (): void => {
      const rgb = parseColor(getComputedStyle(el).getPropertyValue('--colorNeutralBackground3'));
      if (rgb) el.style.setProperty(FRAME_VAR, withOpacity(rgb, FRAME_OPACITY));
      else el.style.removeProperty(FRAME_VAR);
    };
    apply();
    const mo = new MutationObserver(apply);
    for (let a: HTMLElement | null = el.parentElement; a; a = a.parentElement) mo.observe(a, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    mq?.addEventListener('change', apply);
    return () => { mo.disconnect(); mq?.removeEventListener('change', apply); el.style.removeProperty(FRAME_VAR); };
  }, [ref]);
}
