// verify:pack（FR-127）の、ファイルだけで判定できる項目の判定（CLI の scripts/pipeline/verify.ts と、
// ブラウザー内の検証 FR-303 が同じ関数を使う。検査の実装を二重に持たない）。
// 純粋な関数だけで書く（Node 専用の API は使わない）。
import { contrastRatio, isHexColor } from '../theme/brand';
import { buildBrandTheme } from '../theme/brandTheme';

export interface Finding {
  ok: boolean;
  detail: string;
  /** 失敗したときの対処 */
  remedy?: string;
}

export interface PrimaryJudgement { effective: string; finding: Finding; warnings: string[] }

/** Primary 色: FR-060 の補正後の実効色が AA（白い文字との比 4.5 以上）を満たすかで合否を決め、元の値の不足は警告にする（A-18） */
export function judgePrimary(brand: unknown): PrimaryJudgement {
  const primary = ((brand as { colors?: { primary?: unknown } } | undefined)?.colors?.primary) as string | undefined;
  if (typeof primary !== 'string' || !isHexColor(primary)) {
    return {
      effective: '', warnings: [],
      finding: { ok: false, detail: `Primary 色（public/brand/brand-profile.json の colors.primary）が色として読めません: ${String(primary)}`, remedy: 'colors.primary を #RRGGBB の形の色にしてください。' },
    };
  }
  const warnings: string[] = [];
  const problems: string[] = [];
  let effectiveLight = '';
  const parts: string[] = [];
  for (const mode of ['light', 'dark'] as const) {
    const t = buildBrandTheme(mode, primary);
    const onBrand = (t.theme as unknown as Record<string, string>)['colorNeutralForegroundOnBrand']!;
    const before = contrastRatio(primary, onBrand);
    const after = contrastRatio(t.effectivePrimary, onBrand);
    if (mode === 'light') effectiveLight = t.effectivePrimary;
    const label = mode === 'light' ? 'ライト' : 'ダーク';
    parts.push(`${label}: ${t.effectivePrimary}（比 ${after.toFixed(2)}）`);
    if (after < 4.5) problems.push(`${label}テストの補正後の実効色 ${t.effectivePrimary} でも、文字との比が ${after.toFixed(2)} で AA（4.5）を満たしません`);
    if (t.effectivePrimary.toUpperCase() !== primary.toUpperCase()) {
      warnings.push(
        `Primary 色の元の値 ${primary.toUpperCase()} は文字との比が ${before.toFixed(2)} で AA（4.5）を満たしません。` +
        `${label}テストでは補正後の ${t.effectivePrimary}（比 ${after.toFixed(2)}）で表示します。`,
      );
    }
  }
  return {
    effective: effectiveLight, warnings,
    finding: problems.length
      ? { ok: false, detail: problems.join(' / '), remedy: 'Primary 色を、白い文字との比が 4.5 以上になる色（明度を下げた色）にしてください。' }
      : { ok: true, detail: `補正後の実効色は AA を満たしています（${parts.join('、')}）` },
  };
}

interface Located { code: string; file: string; path: string }

/**
 * 検証エラーを、verify:pack の項目 1（スキーマ検証）と項目 5（出典のない数値）に振り分ける。
 * 数値項目の sourceIds がないことはスキーマ違反としても報告される。同じ原因は、出典の項目（5）にだけ数える。
 */
export function splitPackErrors<E extends Located>(errors: readonly E[]): { schemaErrors: E[]; sourceErrors: E[] } {
  const sourceErrors = errors.filter((e) => e.code === 'missing-source');
  const missingAt = new Set(sourceErrors.map((e) => `${e.file}\u0000${e.path}`));
  const isSourceSchemaError = (e: E): boolean =>
    e.code === 'schema' && /(^|\.)sourceIds(\[\d+\])?$/.test(e.path) && missingAt.has(`${e.file}\u0000${e.path.replace(/\.?sourceIds(\[\d+\])?$/, '')}`);
  const schemaErrors = errors.filter((e) => e.code !== 'missing-source' && !isSourceSchemaError(e));
  return { schemaErrors, sourceErrors };
}
