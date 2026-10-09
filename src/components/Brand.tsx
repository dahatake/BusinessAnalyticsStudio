// ブランドの表示部品（FR-061、FR-062）。ロゴは利用条件が「確認済み」のローカルファイルだけを、変形・再着色・トリミングせずに表示する。
import { Text, makeStyles, tokens } from '@fluentui/react-components';
import type { BrandProfile } from '../schema';

/** ロゴの利用条件が不明なときに出す文言（FR-061） */
export const LOGO_PLACEHOLDER_TEXT = 'LOGO（要許諾確認）';

/** 共創表現「<顧客名> × Microsoft」 */
export const coCreationLabel = (customerName: string): string => `${customerName} × Microsoft`;

/** ロゴを表示してよいか。条件が確認済みで、同梱のローカルファイル（外部 URL でない）のときだけ */
export function canShowLogo(logo: BrandProfile['logo']): logo is BrandProfile['logo'] & { path: string } {
  return logo.status === 'confirmed' && !!logo.path && logo.path.startsWith('/') && !logo.path.startsWith('//');
}

const useStyles = makeStyles({
  root: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalM },
  accent: { width: '4px', height: '24px', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorBrandBackground, flexShrink: 0 },
  // 高さだけを決め、幅は自動（元の縦横比のまま。object-fit・フィルター・回転は使わない）
  logo: { height: '32px', width: 'auto', display: 'block' },
  placeholder: {
    border: `${tokens.strokeWidthThin} dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusSmall,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    color: tokens.colorNeutralForeground2,
  },
});

export function BrandLockup({ brand, customerName }: { brand: BrandProfile; customerName: string }) {
  const s = useStyles();
  return (
    <div className={s.root} data-testid="brand-lockup">
      <span className={s.accent} data-testid="accent" aria-hidden />
      {canShowLogo(brand.logo)
        ? <img className={s.logo} data-testid="customer-logo" src={brand.logo.path} alt={`${customerName} のロゴ`} />
        : <Text className={s.placeholder} size={200} data-testid="logo-placeholder">{LOGO_PLACEHOLDER_TEXT}</Text>}
      <Text size={300} weight="semibold">{coCreationLabel(customerName)}</Text>
    </div>
  );
}

/** 数値の表示（等幅数字。桁がそろって読み比べやすい。FR-062）。KPI の値はこの部品で表示する。 */
export function KpiValue({ children }: { children: React.ReactNode }) {
  return <span data-testid="kpi-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{children}</span>;
}
