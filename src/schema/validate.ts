// 顧客パックの検証（FR-114 ID の一意・参照、FR-115 出典、FR-116 作成者、FR-117 機密区分、FR-119 構成）。
// 純粋な関数だけで書く（ブラウザーでも Node でも同じ結果になる）。画面の部品を参照しない（NFR-MAINT-001）。
import type { ZodType } from 'zod';
import { REFERENCE_KEYS } from './common';
import { BrandProfileSchema, DATA_FILE_NAMES, DATA_SCHEMAS, type DataFileName } from './files';

export type PackErrorCode =
  | 'missing-file' | 'schema' | 'duplicate-id' | 'dangling-reference' | 'missing-source';

export interface PackError {
  code: PackErrorCode;
  /** パック内の相対パス（例: `public/data/issues.json`） */
  file: string;
  /** JSON 内の位置（例: `issues[2].parentId`）。ファイル全体の誤りでは空 */
  path: string;
  /** 誤りのある項目の ID（分かる場合） */
  id?: string;
  message: string;
}

export interface PackValidation {
  errors: PackError[];
  /** 出典の付いていない数値項目の件数（FR-115） */
  unsourcedNumbers: number;
}

export type PackFiles = Partial<Record<DataFileName, unknown>> & { brandProfile?: unknown };

export const dataFilePath = (name: DataFileName): string => `public/data/${name}.json`;
export const BRAND_PROFILE_PATH = 'public/brand/brand-profile.json';

/** 必須のファイルとフォルダー。`assets/audio/` は任意なので含めない（FR-119）。 */
export const REQUIRED_PATHS: readonly string[] = [
  ...DATA_FILE_NAMES.map(dataFilePath),
  BRAND_PROFILE_PATH,
  'assets/brand/',
  'data/customer-research.md',
  'brand/BRAND-RESEARCH.md',
];

/** パックに含まれるファイルの相対パス一覧から、欠けた必須ファイルを挙げる（FR-119） */
export function validateLayout(paths: readonly string[]): PackError[] {
  const have = new Set(paths.map((p) => p.replaceAll('\\', '/')));
  const errors: PackError[] = [];
  for (const req of REQUIRED_PATHS) {
    const ok = req.endsWith('/') ? [...have].some((p) => p.startsWith(req)) : have.has(req);
    if (!ok) errors.push({ code: 'missing-file', file: req, path: '', message: `必須のファイルがありません: ${req}` });
  }
  return errors;
}

const fmtPath = (segments: ReadonlyArray<PropertyKey>): string =>
  segments.reduce<string>((acc, s) => (typeof s === 'number' ? `${acc}[${s}]` : acc ? `${acc}.${String(s)}` : String(s)), '');

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** JSON を深く辿り、オブジェクトごとに（位置・所有者の ID つきで）訪問する */
function walk(
  v: Json, segs: Array<string | number>, owner: string | undefined,
  visit: (o: Record<string, Json>, path: string, owner: string | undefined) => void,
): void {
  if (Array.isArray(v)) { v.forEach((x, i) => walk(x, [...segs, i], owner, visit)); return; }
  if (!isObj(v)) return;
  const id = typeof v.id === 'string' ? v.id : owner;
  visit(v, fmtPath(segs), id);
  for (const [k, x] of Object.entries(v)) walk(x, [...segs, k], id, visit);
}

function parseWith(schema: ZodType, value: unknown, file: string, errors: PackError[]): void {
  const r = schema.safeParse(value);
  if (r.success) return;
  for (const issue of r.error.issues) {
    errors.push({ code: 'schema', file, path: fmtPath(issue.path), message: issue.message });
  }
}

/** 顧客パックの JSON を、スキーマ・ID の一意・参照・出典の面で検証する */
export function validatePack(files: PackFiles): PackValidation {
  const errors: PackError[] = [];
  let unsourcedNumbers = 0;
  const entries: Array<{ file: string; value: unknown }> = [];

  for (const name of DATA_FILE_NAMES) {
    const file = dataFilePath(name);
    const value = files[name];
    if (value === undefined) {
      errors.push({ code: 'missing-file', file, path: '', message: `必須のファイルがありません: ${file}` });
      continue;
    }
    parseWith(DATA_SCHEMAS[name], value, file, errors);
    entries.push({ file, value });
  }
  if (files.brandProfile === undefined) {
    errors.push({ code: 'missing-file', file: BRAND_PROFILE_PATH, path: '', message: `必須のファイルがありません: ${BRAND_PROFILE_PATH}` });
  } else {
    parseWith(BrandProfileSchema, files.brandProfile, BRAND_PROFILE_PATH, errors);
  }

  // ID の一意（パック全体）
  const seen = new Map<string, { file: string; path: string }>();
  for (const { file, value } of entries) {
    walk(value, [], undefined, (o, path) => {
      if (typeof o.id !== 'string') return;
      const prev = seen.get(o.id);
      if (prev) {
        errors.push({
          code: 'duplicate-id', file, path, id: o.id,
          message: `ID が重複しています: ${o.id}（先に ${prev.file} の ${prev.path || '(root)'} で使われています）`,
        });
      } else seen.set(o.id, { file, path });
    });
  }

  // 参照の存在、数値項目の出典
  for (const { file, value } of entries) {
    walk(value, [], undefined, (o, path, owner) => {
      for (const key of REFERENCE_KEYS) {
        const ref = o[key];
        if (ref === undefined || ref === null) continue;
        const ids = Array.isArray(ref) ? ref : [ref];
        ids.forEach((target, i) => {
          if (typeof target !== 'string' || seen.has(target)) return;
          const at = Array.isArray(ref) ? `${key}[${i}]` : key;
          errors.push({
            code: 'dangling-reference', file, path: path ? `${path}.${at}` : at, id: owner,
            message: `存在しない ID を参照しています: ${target}`,
          });
        });
      }
      if (typeof o.value === 'number') {
        const s = o.sourceIds;
        if (!Array.isArray(s) || s.length === 0) {
          unsourcedNumbers++;
          errors.push({
            code: 'missing-source', file, path, id: owner,
            message: '数値の項目に sourceIds がありません（出典の付いていない数値項目）',
          });
        }
      }
    });
  }
  return { errors, unsourcedNumbers };
}

/** エラーを 1 行の文字列にする（ファイル名・位置・ID を含む） */
export function formatPackError(e: PackError): string {
  return `${e.file}${e.path ? ` ${e.path}` : ''}${e.id ? ` [${e.id}]` : ''}: ${e.message}`;
}
