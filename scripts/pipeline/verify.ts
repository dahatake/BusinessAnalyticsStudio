// ⑥ verify（顧客パックの受け入れ判定。FR-127）。固定のスモークテストで、次の 9 項目を PARAM-020 以内に判定する。
//   1 スキーマ検証エラー 0 件／2 起動時のページエラー 0 件／3 Primary 色の反映と AA コントラスト／
//   4 タイトルとオープニングの顧客名・Project 名／5 出典のない数値項目 0 件／6 主要画面の「サンプル」「AI 生成」の表示／
//   7 P・M・Esc の動作／8 Markdown のエクスポートと復元／9 所要時間の合計
// 1・5・3 の AA・4 の JSON 側は、顧客パックのファイルから直接判定する。2・3 の反映・4 の画面側・6〜8 は、ブラウザーで起動したアプリを
// `SmokeRunner`（接続点）が操作して判定する。同梱の既定は Playwright（Chromium）、`mockSmoke` はブラウザーを使わない合格の差し替え部品。
// 失敗した項目は、原因と対処を出力する。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { UNCLASSIFIED_LABEL, countUnclassified, formatPackError, type PackError } from '../../src/schema';
import { contrastRatio, isHexColor } from '../../src/theme/brand';
import { buildBrandTheme } from '../../src/theme/brandTheme';
import { validateGeneratedPackDir, validatePackDir } from '../lib/pack-fs';
import { PARAMS } from './common';
import { startStaticServer } from './launch';

export const VERIFY_ITEMS = [
  { id: 'schema', name: 'スキーマ検証エラー 0 件' },
  { id: 'page-errors', name: '起動時のページエラー 0 件' },
  { id: 'primary', name: 'Primary 色の反映と AA コントラスト' },
  { id: 'names', name: 'タイトルとオープニングの顧客名・Project 名' },
  { id: 'sources', name: '出典のない数値項目 0 件' },
  { id: 'labels', name: '主要画面の「サンプル」「AI 生成」の表示' },
  { id: 'keys', name: 'P / M / Esc の動作' },
  { id: 'markdown', name: 'Markdown のエクスポートと復元' },
  { id: 'time', name: '所要時間の合計' },
] as const;
export type VerifyItemId = (typeof VERIFY_ITEMS)[number]['id'];

/** ブラウザーで判定する項目（2・3 の反映・4 の画面側・6〜8） */
export type BrowserItemId = 'page-errors' | 'primary' | 'names' | 'labels' | 'keys' | 'markdown';
export const BROWSER_ITEMS: readonly BrowserItemId[] = ['page-errors', 'primary', 'names', 'labels', 'keys', 'markdown'];

export interface Finding {
  ok: boolean;
  detail: string;
  /** 失敗したときの対処 */
  remedy?: string;
}

/** ブラウザーの検査に渡す、判定の基準（顧客パックのファイルから求めたもの） */
export interface SmokeContext {
  /** アプリの URL（`dist` と顧客パックを重ねて配信している 127.0.0.1 の URL） */
  url: string;
  workDir: string;
  customer: string;
  projectName: string;
  /** Primary 色の実効色（FR-060 の補正後。ライトテーマ） */
  effectivePrimary: string;
  /** 顧客パックにサンプルの項目（createdBy が sample）があるか */
  hasSample: boolean;
  /** 打ち切りの合図（PARAM-020 の上限に達したとき） */
  signal: AbortSignal;
}

/** スモークテストの接続点。ブラウザーで判定する 6 項目の結果を返す */
export interface SmokeRunner {
  run(ctx: SmokeContext): Promise<Record<BrowserItemId, Finding>>;
}

/** ブラウザーを使わず、6 項目を合格として返す差し替え部品（雛形の代わりの小さなフォルダーでの確認用） */
export const mockSmoke: SmokeRunner = {
  async run() {
    return Object.fromEntries(BROWSER_ITEMS.map((id) => [id, { ok: true, detail: 'モック（ブラウザーでは確かめていません）' }])) as Record<BrowserItemId, Finding>;
  },
};

export interface VerifyItemResult extends Finding {
  id: VerifyItemId;
  name: string;
}

export interface VerifyResult {
  ok: boolean;
  items: VerifyItemResult[];
  /** 合否に含めない警告（例: 補正前の Primary 色が AA を満たさない） */
  warnings: string[];
  /** 世界区分（world）のないエンティティ（区分なし）の件数（FR-213 AC-490・AC-509） */
  unclassified: number;
  elapsedMs: number;
  limitSec: number;
}

export interface VerifyOptions {
  /** 顧客パックのあるフォルダー（`dist` を含む作業フォルダー） */
  workDir: string;
  /** 期待する顧客名・Project 名。なければ `public/data/customer.json` の値 */
  customer?: string;
  projectName?: string;
  smoke?: SmokeRunner;
  limitSec?: number;
  /**
   * 生成パイプラインが作った顧客パックとして判定する（FR-213 AC-509）。世界区分か種別のないエンティティを、
   * 項目 1（スキーマ検証）の位置つきのエラーにする。既定 false（手作りの顧客パックでは区分なしを警告だけにする。AC-490）
   */
  requireClassified?: boolean;
  /** 経過時間の測定（テスト用） */
  clock?: () => number;
}

const readJson = (file: string): unknown => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return undefined; }
};

const listErrors = (errors: readonly PackError[], max = 5): string =>
  errors.slice(0, max).map((e) => formatPackError(e)).join(' / ') + (errors.length > max ? ` ほか ${errors.length - max} 件` : '');

/** 顧客パックにサンプルの項目（createdBy が sample）が 1 つでもあるか */
function hasSampleItems(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(hasSampleItems);
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return o['createdBy'] === 'sample' || Object.values(o).some(hasSampleItems);
}

interface PrimaryJudgement { effective: string; finding: Finding; warnings: string[] }

/** Primary 色: FR-060 の補正後の実効色が AA（白い文字との比 4.5 以上）を満たすかで合否を決め、元の値の不足は警告にする（A-18） */
function judgePrimary(brand: unknown): PrimaryJudgement {
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

const failAll = (reason: string, remedy: string): Record<BrowserItemId, Finding> =>
  Object.fromEntries(BROWSER_ITEMS.map((id) => [id, { ok: false, detail: reason, remedy }])) as Record<BrowserItemId, Finding>;

/** 顧客パックの受け入れ判定を行う（FR-127）。9 項目の結果を返す。例外は投げない（ブラウザーが使えない場合は該当の項目の不合格にする） */
export async function verifyPack(opts: VerifyOptions): Promise<VerifyResult> {
  const clock = opts.clock ?? (() => performance.now());
  const t0 = clock();
  const limitSec = opts.limitSec ?? PARAMS.verifyLimitSec;
  const { workDir } = opts;

  const validation = opts.requireClassified ? validateGeneratedPackDir(workDir) : validatePackDir(workDir);
  const sourceErrors = validation.errors.filter((e) => e.code === 'missing-source');
  // 数値項目の sourceIds がないことは、スキーマ違反としても報告される。同じ原因は、出典の項目（5）にだけ数える
  const missingAt = new Set(sourceErrors.map((e) => `${e.file}\u0000${e.path}`));
  const isSourceSchemaError = (e: PackError): boolean =>
    e.code === 'schema' && /(^|\.)sourceIds(\[\d+\])?$/.test(e.path) && missingAt.has(`${e.file}\u0000${e.path.replace(/\.?sourceIds(\[\d+\])?$/, '')}`);
  const schemaErrors = validation.errors.filter((e) => e.code !== 'missing-source' && !isSourceSchemaError(e));
  const customerJson = readJson(path.join(workDir, 'public', 'data', 'customer.json')) as { name?: string; projectName?: string } | undefined;
  const brandJson = readJson(path.join(workDir, 'public', 'brand', 'brand-profile.json'));
  const customer = opts.customer ?? customerJson?.name ?? '';
  const projectName = opts.projectName ?? customerJson?.projectName ?? '';

  const primary = judgePrimary(brandJson);
  const fixed: Partial<Record<VerifyItemId, Finding>> = {
    schema: schemaErrors.length === 0
      ? { ok: true, detail: 'エラー 0 件' }
      : {
        ok: false, detail: `エラー ${schemaErrors.length} 件: ${listErrors(schemaErrors)}`,
        remedy: 'public/data と public/brand の JSON を schema/ に合わせて直してください（`npm run check:pack -- <作業フォルダー>` で全件を確かめられます）。',
      },
    sources: sourceErrors.length === 0
      ? { ok: true, detail: '出典のない数値項目 0 件' }
      : {
        ok: false, detail: `出典のない数値項目 ${sourceErrors.length} 件: ${listErrors(sourceErrors)}`,
        remedy: '該当の数値項目に、調査の出典（sourceIds）を付けてください。出典が確かめられない数値は、削除するか推定として扱ってください（FR-115）。',
      },
  };

  // ブラウザーで判定する項目
  let browser: Record<BrowserItemId, Finding>;
  const controller = new AbortController();
  const smoke = opts.smoke ?? (await import('./smoke')).playwrightSmoke;
  if (!fs.existsSync(path.join(workDir, 'dist', 'index.html'))) {
    browser = failAll('dist/index.html がありません', '雛形をビルドしてから複製してください（`npm run build`）。');
  } else {
    let server: Awaited<ReturnType<typeof startStaticServer>> | undefined;
    let timer: NodeJS.Timeout | undefined;
    try {
      server = await startStaticServer(workDir);
      const remainingMs = Math.max(1, limitSec * 1000 - (clock() - t0));
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error(`上限（${limitSec} 秒）に達したため、ブラウザーの検査を打ち切りました`)); }, remainingMs);
      });
      browser = await Promise.race([
        smoke.run({
          url: server.url, workDir, customer, projectName, effectivePrimary: primary.effective,
          hasSample: hasSampleItems(readJsonDir(workDir)), signal: controller.signal,
        }),
        timeout,
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      browser = failAll(`ブラウザーの検査を実行できませんでした: ${msg}`, '`tests/system` で `npm install` を実行し、`npx playwright install chromium` で Chromium を入れてから、もう一度実行してください。');
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
      await server?.close();
    }
  }

  // 3: Primary 色（ファイルの補正後の実効色 + 画面の反映）、4: 顧客名・Project 名（ファイル + 画面）
  const nameOk = customerJson?.name === customer && customerJson?.projectName === projectName;
  const items: Record<VerifyItemId, Finding> = {
    schema: fixed.schema!,
    'page-errors': browser['page-errors'],
    primary: !primary.finding.ok ? primary.finding : browser.primary.ok
      ? { ok: true, detail: `${primary.finding.detail}。画面の反映: ${browser.primary.detail}` }
      : browser.primary,
    names: !nameOk
      ? {
        ok: false,
        detail: `public/data/customer.json の顧客名・Project 名（${customerJson?.name ?? '(なし)'} / ${customerJson?.projectName ?? '(なし)'}）が入力（${customer} / ${projectName}）と一致しません`,
        remedy: '顧客パックの customer.json の name と projectName を入力の値にしてください。',
      }
      : browser.names.ok ? { ok: true, detail: `${customer} / ${projectName}。${browser.names.detail}` } : browser.names,
    sources: fixed.sources!,
    labels: browser.labels,
    keys: browser.keys,
    markdown: browser.markdown,
    time: { ok: true, detail: '' },
  };
  const elapsedMs = Math.round((clock() - t0) * 10) / 10;
  items.time = elapsedMs <= limitSec * 1000
    ? { ok: true, detail: `${(elapsedMs / 1000).toFixed(1)} 秒（上限 ${limitSec} 秒）` }
    : {
      ok: false, detail: `${(elapsedMs / 1000).toFixed(1)} 秒で、上限 ${limitSec} 秒を超えました`,
      remedy: 'ブラウザー検査の遅い項目（ページエラー・画面の切替）を確かめてください。PC の負荷が高い場合は、ほかのアプリを閉じて再実行してください。',
    };

  const list: VerifyItemResult[] = VERIFY_ITEMS.map((m) => ({ id: m.id, name: m.name, ...items[m.id] }));
  // FR-213 AC-490: 世界区分のないエンティティは合否に含めず、件数を警告にする（既存の顧客パックを壊さない）
  // FR-213 AC-509: 生成した顧客パック（requireClassified）では、区分なしは項目 1 のエラーとして上で数えている
  const unclassified = countUnclassified(readJson(path.join(workDir, 'public', 'data', 'entities.json')));
  const warnings = [...primary.warnings];
  if (unclassified > 0 && !opts.requireClassified) {
    warnings.push(`世界区分（world）のないエンティティが ${unclassified} 件あります（「${UNCLASSIFIED_LABEL}」として扱います）。public/data/entities.json の各エンティティに world と kind を付けてください（FR-213）。`);
  }
  return { ok: list.every((i) => i.ok), items: list, warnings, unclassified, elapsedMs, limitSec };
}

/** 顧客パックの JSON 全体（サンプルの項目の有無の判定用） */
function readJsonDir(workDir: string): unknown[] {
  const dir = path.join(workDir, 'public', 'data');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(dir, f)));
}

/** 画面に出す文（9 項目の合否、不合格の原因と対処、警告、所要時間） */
export function formatVerifyReport(r: VerifyResult): string[] {
  const lines = [`verify（顧客パックの受け入れ判定）: ${r.ok ? '合格' : '不合格'}`];
  r.items.forEach((i, n) => {
    if (i.ok) { lines.push(`  ✓ ${n + 1}. ${i.name} — ${i.detail}`); return; }
    lines.push(`  ✗ ${n + 1}. ${i.name}`);
    lines.push(`      原因: ${i.detail}`);
    if (i.remedy) lines.push(`      対処: ${i.remedy}`);
  });
  for (const w of r.warnings) lines.push(`  警告: ${w}`);
  lines.push(`  所要時間: ${(r.elapsedMs / 1000).toFixed(1)} 秒（上限 ${r.limitSec} 秒）`);
  return lines;
}

/** コマンド: `npm run verify:pack -- <作業フォルダー> [--customer 顧客名] [--project Project名] [--smoke mock]`。終了コード 0=合格、1=不合格、2=使い方の誤り */
export async function main(argv: readonly string[], log: (l: string) => void = (l) => console.log(l)): Promise<number> {
  const opt = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  // 値を取るオプション（--customer など）の次の引数は、作業フォルダーとして扱わない。--generated は値を取らない
  const valueOpts = new Set(['--customer', '--project', '--smoke']);
  const dir = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && valueOpts.has(argv[i - 1]!)));
  if (!dir) { log('使い方: npm run verify:pack -- <作業フォルダー> [--customer 顧客名] [--project Project名] [--smoke mock] [--generated]'); return 2; }
  const customer = opt('customer');
  const projectName = opt('project');
  const r = await verifyPack({
    workDir: path.resolve(dir),
    ...(customer ? { customer } : {}),
    ...(projectName ? { projectName } : {}),
    ...(opt('smoke') === 'mock' ? { smoke: mockSmoke } : {}),
    // 生成パイプラインが作った顧客パックとして判定する（区分なしをエラーにする。FR-213 AC-509）
    ...(argv.includes('--generated') ? { requireClassified: true } : {}),
  });
  for (const l of formatVerifyReport(r)) log(l);
  return r.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
