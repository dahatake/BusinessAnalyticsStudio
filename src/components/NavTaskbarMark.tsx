// 左メニューの項目に重ねる、Window の件数バッジと青いバー（FR-295 AC-824。契約: tests/system/CONTRACT.md §34）。
// 色だけに頼らない: 件数は数字、前面の有無はバーの長さ（前面あり 20px ＞ 前面なし 8px）とアクセシブルな名前で示す。
// ハイコントラスト（forced-colors）ではシステムの強調色にし、幅と数字は変えない。
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { useT } from '../i18n';

const useStyles = makeStyles({
  bar: {
    position: 'absolute', insetInline: 0, bottom: '2px', marginInline: 'auto', height: '3px', borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorCompoundBrandBackground, pointerEvents: 'none',
    '@media (forced-colors: active)': { backgroundColor: 'Highlight', forcedColorAdjust: 'none' },
  },
  front: { width: '20px' },
  other: { width: '8px' },
  badge: {
    position: 'absolute', insetBlockStart: '2px', insetInlineEnd: '4px', minWidth: '16px', height: '16px', boxSizing: 'border-box', paddingInline: tokens.spacingHorizontalXXS,
    borderRadius: tokens.borderRadiusCircular, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: tokens.fontSizeBase100, lineHeight: tokens.lineHeightBase100, fontWeight: tokens.fontWeightSemibold,
    backgroundColor: tokens.colorCompoundBrandBackground, color: tokens.colorNeutralForegroundOnBrand, pointerEvents: 'none',
    '@media (forced-colors: active)': { backgroundColor: 'Highlight', color: 'HighlightText', forcedColorAdjust: 'none', border: `${tokens.strokeWidthThin} solid HighlightText` },
  },
});

export function NavTaskbarMark({ screenKey, count, hasFront }: { screenKey: string; count: number; hasFront: boolean }) {
  const s = useStyles();
  const t = useT();
  return (
    <>
      {count >= 2 ? <span role="img" data-testid={`nav-badge-${screenKey}`} data-count={count} aria-label={t('Window {n} 件', { n: count })} className={s.badge}>{count}</span> : null}
      <span role="img" data-testid={`nav-bar-${screenKey}`} data-state={hasFront ? 'front' : 'other'} aria-label={hasFront ? t('前面の Window あり') : t('前面ではない Window あり')} className={mergeClasses(s.bar, hasFront ? s.front : s.other)} />
    </>
  );
}
