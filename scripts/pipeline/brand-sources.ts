// ② ブランド調査の出典の優先順位と既定テーマ（FR-122）。
// 出典の優先順位: ①ブランドガイドライン → ②プレスキット → ③公式サイト → ④IR 資料。非公式サイトは使わない（NFR-LEGAL-001）。
// 何も特定できないときは、Microsoft 標準のニュートラルテーマ + Segoe UI Variable / Noto Sans JP + 「先進的」トーンを、確度「推定」で返す。
// 純粋な関数だけで書く（外部に接続しない）。Web 検索などの実体は、候補の一覧をこの関数に渡す。
import type { BrandProfile } from '../../src/schema';

/** 出典の種類。`unofficial`（非公式サイト）は候補として受け取るが、選ばない */
export const BRAND_SOURCE_KINDS = ['guideline', 'presskit', 'official-site', 'ir', 'unofficial'] as const;
export type BrandSourceKind = (typeof BRAND_SOURCE_KINDS)[number];

/** 優先順位の高い順の公式の出典（FR-122） */
export const BRAND_SOURCE_PRIORITY = ['guideline', 'presskit', 'official-site', 'ir'] as const satisfies readonly BrandSourceKind[];

export const BRAND_SOURCE_LABELS: Record<BrandSourceKind, string> = {
  guideline: 'ブランドガイドライン',
  presskit: 'プレスキット',
  'official-site': '公式サイト',
  ir: 'IR 資料',
  unofficial: '非公式サイト',
};

export interface BrandSourceCandidate {
  kind: BrandSourceKind;
  /** 出典の URL またはファイルの場所 */
  url: string;
  title?: string;
}

/**
 * 候補から、使う出典を 1 つ選ぶ。公式の出典のうち優先順位が最も高い種類を選び、同じ種類の中では先に渡された候補を選ぶ。
 * 公式の出典がなければ（非公式サイトだけ、または 0 件）undefined を返す。入力は変更しない。
 */
export function selectBrandSource(candidates: readonly BrandSourceCandidate[]): BrandSourceCandidate | undefined {
  for (const kind of BRAND_SOURCE_PRIORITY) {
    const hit = candidates.find((c) => c.kind === kind);
    if (hit) return hit;
  }
  return undefined;
}

/** 既定テーマ（FR-122）。Primary 色は Fluent 2 の標準（Web Light）のブランド色 */
export const DEFAULT_BRAND_THEME = {
  primary: '#0F6CBD',
  fonts: 'Segoe UI Variable / Noto Sans JP',
  /** プロファイルの fonts.primary には先頭の書体を入れる（以降の代替は FR-062 の順序で付く） */
  primaryFont: 'Segoe UI Variable',
  tone: '先進的',
  themeName: 'Microsoft 標準のニュートラルテーマ',
} as const;

/** 既定のブランドプロファイル（確度「推定」）。顧客のロゴは特定できないので status は unknown */
export function defaultBrandProfile(customer: string, retrievedAt: string): BrandProfile {
  const stamp = { source: '既定テーマ（公式の出典を特定できなかったため）', retrievedAt, confidence: '推定' as const };
  return {
    name: customer,
    colors: { primary: DEFAULT_BRAND_THEME.primary, ...stamp },
    logo: { status: 'unknown', ...stamp },
    fonts: { primary: DEFAULT_BRAND_THEME.primaryFont, ...stamp },
    tone: { value: DEFAULT_BRAND_THEME.tone, ...stamp },
  } as BrandProfile;
}
