// ファイルシステム上の顧客パック（例: examples/mono）を読み込む（Node 専用）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_FILE_NAMES, dataFilePath, BRAND_PROFILE_PATH, listUnclassified, validateLayout, validatePack } from '../../src/schema';
import type { PackError, PackFiles, PackValidation } from '../../src/schema';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function listFiles(root: string, dir = ''): string[] {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    return e.isDirectory() ? listFiles(root, rel) : [rel];
  });
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function readPackFiles(root: string): PackFiles {
  const files: PackFiles = {};
  for (const name of DATA_FILE_NAMES) {
    const f = path.join(root, dataFilePath(name));
    if (fs.existsSync(f)) files[name] = readJson(f);
  }
  const b = path.join(root, BRAND_PROFILE_PATH);
  if (fs.existsSync(b)) files.brandProfile = readJson(b);
  return files;
}

/** パック 1 つの構成（FR-119）と中身（FR-114〜117）をまとめて検証する */
export function validatePackDir(root: string): PackValidation {
  const layout: PackError[] = validateLayout(listFiles(root));
  const content = validatePack(readPackFiles(root));
  // 欠けたファイルは構成の検査で既に報告しているので、中身の検査の重複を除く
  const reported = new Set(layout.map((e) => e.file));
  const errors = [...layout, ...content.errors.filter((e) => !(e.code === 'missing-file' && reported.has(e.file)))];
  return { errors, unsourcedNumbers: content.unsourcedNumbers };
}

/**
 * 生成パイプラインが作る顧客パックの「区分なし」（world か kind のないエンティティ）を、位置つきの検証エラーにする（FR-213 AC-509）。
 * 手作りの顧客パックの検証（validatePackDir・verify:pack の既定）では使わない（区分なしは警告だけ。AC-490）。
 */
export function unclassifiedErrors(root: string): PackError[] {
  const file = dataFilePath('entities');
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) return []; // ファイルがないことは構成の検査が報告する
  let json: unknown;
  try { json = readJson(abs); } catch { return []; } // 壊れた JSON は中身の検査が報告する
  return listUnclassified(json).map((u) => ({
    code: 'schema' as const,
    file,
    path: u.path.reduce<string>((acc, s) => (typeof s === 'number' ? `${acc}[${s}]` : acc ? `${acc}.${s}` : s), ''),
    ...(u.id ? { id: u.id } : {}),
    message: u.message,
  }));
}

/** 生成した顧客パックの検証（validatePackDir に、区分なしのエラーを加える。FR-213 AC-509） */
export function validateGeneratedPackDir(root: string): PackValidation {
  const v = validatePackDir(root);
  return { ...v, errors: [...v.errors, ...unclassifiedErrors(root)] };
}
