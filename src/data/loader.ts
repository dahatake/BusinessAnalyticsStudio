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

/** 顧客パックを読み、検証して返す。誤りがあれば PackLoadError（ファイル名・位置・ID つき） */
export async function loadPack(fetchFn: FetchLike): Promise<LoadedPack> {
  const files: PackFiles = {};
  await Promise.all(
    DATA_FILE_NAMES.map(async (name: DataFileName) => {
      try {
        const json = await getJson(fetchFn, `/data/${name}.json`);
        if (json !== undefined) files[name] = json;
      } catch {
        /* 読めないファイルは「欠けている」として検証が報告する */
      }
    }),
  );
  try {
    const b = await getJson(fetchFn, '/brand/brand-profile.json');
    if (b !== undefined) files.brandProfile = b;
  } catch {
    /* 同上 */
  }
  // FR-102: 問題のある項目だけを無効にして起動を続ける。特定できない誤り（ファイルの欠けなど）は起動しない。
  const r = disableInvalidItems(files);
  if (r.fatal) throw new PackLoadError(r.issues);
  return {
    data: r.files as unknown as PackData,
    brand: r.files.brandProfile as BrandProfile,
    issues: r.issues,
    disabledIds: r.disabledIds,
  };
}
