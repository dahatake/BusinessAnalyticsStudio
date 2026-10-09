// 顧客パックの読み込み（FR-100）。顧客固有の情報はコードに持たず、起動時に `/data/*.json` と `/brand/brand-profile.json` から読む。
import {
  DATA_FILE_NAMES, disableInvalidItems, formatPackError,
  type BrandProfile, type DataFileName, type PackData, type PackError, type PackFiles,
} from '../schema';

export interface RuntimeConfig {
  relayUrl?: string;
  aiMock?: { delayMs?: number };
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface LoadedPack {
  data: PackData;
  brand: BrandProfile;
  /** 無効にした項目の理由（ファイル名・位置・内容）。なければ空 */
  issues: PackError[];
  disabledIds: string[];
  /** 同梱のお手本パック（架空企業）で起動したか（FR-104） */
  isExample: boolean;
}

export class PackLoadError extends Error {
  constructor(public readonly errors: PackError[]) {
    super(errors.map(formatPackError).join('\n'));
    this.name = 'PackLoadError';
  }
}

async function getJson(fetchFn: FetchLike, url: string): Promise<unknown | undefined> {
  const res = await fetchFn(url);
  if (!res.ok) return undefined;
  return res.json();
}

/** 実行時の設定。ファイルがなければ空として扱う。 */
export async function loadRuntimeConfig(fetchFn: FetchLike): Promise<RuntimeConfig> {
  try {
    return ((await getJson(fetchFn, '/runtime-config.json')) as RuntimeConfig | undefined) ?? {};
  } catch {
    return {};
  }
}

const DATA_PREFIX = '/data/';
const BRAND_URL = '/brand/brand-profile.json';
/** お手本パック（架空企業）の置き場所。ビルドが examples/mono から dist/example-pack/ に複製する（FR-104） */
export const EXAMPLE_PACK_PREFIX = '/example-pack';

async function readFiles(fetchFn: FetchLike, prefix: string): Promise<PackFiles> {
  const files: PackFiles = {};
  await Promise.all(
    DATA_FILE_NAMES.map(async (name: DataFileName) => {
      try {
        const json = await getJson(fetchFn, `${prefix}/data/${name}.json`);
        if (json !== undefined) files[name] = json;
      } catch {
        /* 読めないファイルは「欠けている」として検証が報告する */
      }
    }),
  );
  try {
    const b = await getJson(fetchFn, `${prefix}/brand/brand-profile.json`);
    if (b !== undefined) files.brandProfile = b;
  } catch {
    /* 同上 */
  }
  return files;
}

/** 顧客パックの JSON が 1 つもない（public/data が空）か */
function isEmptyPack(files: PackFiles): boolean {
  return Object.keys(files).length === 0;
}

/** お手本パックのロゴ等は、お手本パックの置き場所から読む */
function relocateBrandAssets(files: PackFiles): void {
  const b = files.brandProfile as { logo?: { path?: unknown } } | undefined;
  const p = b?.logo?.path;
  if (typeof p === 'string' && p.startsWith('/assets/brand/')) (b as { logo: { path: string } }).logo.path = `${EXAMPLE_PACK_PREFIX}${p}`;
}

/**
 * 顧客パックを読み、検証して返す。誤りがあれば PackLoadError（ファイル名・位置・ID つき）。
 * `/data/` が空（1 つも JSON がない）ときは、同梱のお手本パックで起動する（FR-104）。
 */
export async function loadPack(fetchFn: FetchLike): Promise<LoadedPack> {
  let files = await readFiles(fetchFn, '');
  let isExample = false;
  if (isEmptyPack(files)) {
    const example = await readFiles(fetchFn, EXAMPLE_PACK_PREFIX);
    if (!isEmptyPack(example)) {
      files = example;
      relocateBrandAssets(files);
      isExample = true;
    }
  }
  // FR-102: 問題のある項目だけを無効にして起動を続ける。特定できない誤り（ファイルの欠けなど）は起動しない。
  const r = disableInvalidItems(files);
  if (r.fatal) throw new PackLoadError(r.issues);
  return {
    data: r.files as unknown as PackData,
    brand: r.files.brandProfile as BrandProfile,
    issues: r.issues,
    disabledIds: r.disabledIds,
    isExample,
  };
}
