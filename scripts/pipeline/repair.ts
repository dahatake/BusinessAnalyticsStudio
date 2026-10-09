// 自己修正（FR-126）: スキーマ検証でエラーが出たら、エラーの箇所だけを再生成して直す（最大 PARAM-006 回）。
// 全体を再生成しない。再生成の依頼は `PackGenerator`（接続点）に、エラーの位置（`target`）を付けて渡す。
// 上限に達してもエラーが残るときは、残ったエラーを返す（呼び出し側がエラーの一覧を出して止まる）。
import fs from 'node:fs';
import path from 'node:path';
import { formatPackError, type PackError } from '../../src/schema';
import { validatePackDir } from '../lib/pack-fs';
import type { Inputs } from './common';
import { PACK_FILE_KEYS, packFilePath, type GenerateTarget, type Material, type PackFileKey, type PackGenerator } from './generate';
import { getAt, parsePath, setAt } from './jsonpath';
import type { ResearchCache } from './research';

export interface RepairTarget {
  file: string;
  key: PackFileKey;
  /** ファイル内の位置。空はファイル全体 */
  path: string;
  errors: PackError[];
}

export interface RepairedItem { file: string; path: string; round: number }

export interface RepairResult {
  /** 修正の再生成を行った回数（0 は、最初から検証エラーがなかった） */
  rounds: number;
  /** 再生成して書き戻した箇所 */
  repaired: RepairedItem[];
  /** 修正の後に残ったエラー（0 件なら成功） */
  errors: PackError[];
  /** 再生成の依頼の数（箇所ごとに 1 回） */
  requests: number;
}

const isJsonFile = (file: string): boolean => file.endsWith('.json');

/** エラーを「ファイル + 位置」ごとにまとめる。直せない場所（生成するファイルではないもの）は含めない */
export function groupTargets(errors: readonly PackError[]): RepairTarget[] {
  const byLoc = new Map<string, RepairTarget>();
  for (const e of errors) {
    const key = PACK_FILE_KEYS.find((k) => packFilePath(k) === e.file);
    if (!key) continue; // 例: assets/brand/（生成するファイルではない）
    const id = `${e.file}\u0000${e.path}`;
    const t = byLoc.get(id);
    if (t) t.errors.push(e); else byLoc.set(id, { file: e.file, key, path: e.path, errors: [e] });
  }
  const all = [...byLoc.values()];
  // 外側の箇所を再生成すれば内側も入れ替わるので、内側は依頼しない
  return all.filter((t) => !all.some((o) => o !== t && o.file === t.file && isInside(t.path, o.path)));
}

/** `inner` が `outer` の内側（または同じ）か。`outer` が空なら、ファイル全体 */
function isInside(inner: string, outer: string): boolean {
  if (outer === inner) return false;
  if (outer === '') return true;
  return inner.startsWith(`${outer}.`) || inner.startsWith(`${outer}[`);
}

export interface RepairContext {
  workDir: string;
  generator: PackGenerator;
  input: Inputs;
  cache: ResearchCache;
  /** お手本パックの中身（キーごと） */
  sample: Record<PackFileKey, unknown>;
  materials: Material[];
  /** 最大回数（PARAM-006） */
  maxRounds: number;
  log?: (line: string) => void;
}

function readCurrent(workDir: string, t: RepairTarget): unknown {
  const abs = path.join(workDir, t.file);
  if (!fs.existsSync(abs)) return undefined;
  const text = fs.readFileSync(abs, 'utf8');
  if (!isJsonFile(t.file)) return text;
  try { return getAt(JSON.parse(text), parsePath(t.path)); } catch { return undefined; }
}

/** 再生成した値を、その位置だけに書き戻す。書き戻せなかったら false */
function applyValue(workDir: string, t: RepairTarget, value: unknown): boolean {
  if (value === undefined) return false;
  const abs = path.join(workDir, t.file);
  if (!isJsonFile(t.file)) {
    if (typeof value !== 'string') return false;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, value, 'utf8');
    return true;
  }
  let root: unknown;
  if (fs.existsSync(abs)) {
    try { root = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch { root = undefined; }
  }
  // 壊れた JSON や、ファイルがないときは、ファイル全体を置き換える
  const next = root === undefined ? (t.path === '' ? value : undefined) : setAt(root, parsePath(t.path), value);
  if (next === undefined) return false;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return true;
}

/** 検証して、エラーがあれば、エラーの箇所だけを再生成して直す。最大 `maxRounds` 回 */
export async function validateWithRepair(ctx: RepairContext): Promise<RepairResult> {
  const log = ctx.log ?? (() => {});
  const repaired: RepairedItem[] = [];
  let requests = 0;
  let errors = validatePackDir(ctx.workDir).errors;
  let rounds = 0;
  while (errors.length > 0 && rounds < ctx.maxRounds) {
    const targets = groupTargets(errors);
    if (targets.length === 0) break; // 生成器では直せないエラーだけ
    rounds++;
    log(`⑤ スキーマ検証: エラー ${errors.length} 件。エラーの箇所 ${targets.length} 件だけを再生成します（自己修正 ${rounds}/${ctx.maxRounds} 回目）`);
    const results = await Promise.all(targets.map(async (t) => {
      const target: GenerateTarget = {
        path: t.path,
        errors: t.errors.map((e) => formatPackError(e)),
        current: readCurrent(ctx.workDir, t),
      };
      requests++;
      try {
        const value = await ctx.generator.generate({
          key: t.key, input: ctx.input, cache: ctx.cache, sample: ctx.sample[t.key], materials: ctx.materials, target,
        });
        return { t, value };
      } catch (e) {
        log(`再生成に失敗しました（${t.file}${t.path ? ` ${t.path}` : ''}）: ${e instanceof Error ? e.message : String(e)}`);
        return { t, value: undefined };
      }
    }));
    for (const { t, value } of results) {
      if (applyValue(ctx.workDir, t, value)) repaired.push({ file: t.file, path: t.path, round: rounds });
    }
    errors = validatePackDir(ctx.workDir).errors;
  }
  return { rounds, repaired, errors, requests };
}
