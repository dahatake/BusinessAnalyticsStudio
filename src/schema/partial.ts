// 問題のある項目だけを無効にして、残りで起動を続ける（FR-102）。
// 純粋な関数だけで書く。画面の部品を参照しない（NFR-MAINT-001）。
import { DATA_FILE_NAMES, type DataFileName } from './files';
import { validatePack, type PackError, type PackFiles } from './validate';

export interface PartialResult {
  /** 無効にした項目を取り除いたパック */
  files: PackFiles;
  /** 検証で見つかったすべてのエラー（無効にした理由。ファイル名・位置・内容を含む） */
  issues: PackError[];
  /** 無効にした項目の ID */
  disabledIds: string[];
  /** 項目を特定できず起動できない場合 true（ファイルの欠け・設定ファイルの誤りなど） */
  fatal: boolean;
}

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `issues[2].title` → ['issues', 2, 'title'] */
export function parsePath(path: string): Array<string | number> {
  const out: Array<string | number> = [];
  for (const m of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) out.push(m[2] !== undefined ? Number(m[2]) : (m[1] as string));
  return out;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** エラーの位置から、最も内側の「ID を持つ配列の要素」を探す */
function findItem(root: Json, path: string): { array: Json[]; item: unknown } | undefined {
  let cur: Json = root;
  let found: { array: Json[]; item: unknown } | undefined;
  let parent: Json;
  for (const seg of parsePath(path)) {
    parent = cur;
    cur = isObj(cur) ? cur[String(seg)] : Array.isArray(cur) && typeof seg === 'number' ? cur[seg] : undefined;
    if (typeof seg === 'number' && Array.isArray(parent) && isObj(cur) && (typeof cur.id === 'string' || ('from' in cur && 'to' in cur))) {
      found = { array: parent, item: cur };
    }
    if (cur === undefined) break;
  }
  return found;
}

/** パックを検証し、エラーのある項目（と、それを参照して壊れる項目）だけを無効にする */
export function disableInvalidItems(input: PackFiles): PartialResult {
  const files = clone(input);
  const issues: PackError[] = [];
  const seen = new Set<string>();
  const disabledIds: string[] = [];
  const names = new Set<string>(DATA_FILE_NAMES);

  for (let round = 0; round < 10; round++) {
    const { errors } = validatePack(files);
    if (errors.length === 0) return { files, issues, disabledIds, fatal: false };
    for (const e of errors) {
      const key = `${e.file}|${e.path}|${e.message}`;
      if (!seen.has(key)) { seen.add(key); issues.push(e); }
    }
    const targets: Array<{ array: Json[]; item: unknown }> = [];
    for (const e of errors) {
      const m = /^public\/data\/([a-z]+)\.json$/.exec(e.file);
      const name = m?.[1];
      const target = e.code !== 'missing-file' && name && names.has(name)
        ? findItem(files[name as DataFileName], e.path)
        : undefined;
      if (!target) return { files, issues, disabledIds, fatal: true };
      targets.push(target);
    }
    for (const t of targets) {
      const i = t.array.indexOf(t.item);
      if (i >= 0) {
        t.array.splice(i, 1);
        const id = (t.item as { id?: unknown }).id;
        if (typeof id === 'string') disabledIds.push(id);
      }
    }
  }
  return { files, issues, disabledIds, fatal: true };
}
