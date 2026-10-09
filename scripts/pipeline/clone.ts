// ③ 雛形の複製（FR-124）: `node_modules` と `dist` を含めて作業フォルダーに用意する。`npm install` もビルドもしない。
// 既定（link）は、読み取り専用で共有できる `node_modules` と `dist` を、ディレクトリ・ジャンクション（Windows）／シンボリックリンク
// （Linux・macOS）で瞬時に用意する。`--copy`（copy）は、すべてをフルコピーする。
// 複製先に、秘密（`.env`）と雛形に残った顧客のデータ（顧客パック）を入れない。
import fs from 'node:fs';
import path from 'node:path';
import { PARAMS } from './common';
import type { Recorder } from './timing';

/** 複製しない最上位の項目（履歴・実行の作業ファイル・調査キャッシュ・ログ・System Test の依存・顧客のデータ） */
const SKIP_TOP = new Set(['.git', 'work', 'research-cache', 'logs', 'tests', 'data', 'brand']);
/** 複製しない顧客パックの置き場所（雛形からの相対パス）。`public/data/README.txt` は雛形の一部なので残す */
const CUSTOMER_PATHS = ['public/data', 'public/brand', 'assets/brand', 'assets/audio'];
const CUSTOMER_KEEP = new Set(['public/data/README.txt']);
/** リンクで共有する（読み取り専用として扱う）項目 */
const SHARED = ['node_modules', 'dist'] as const;
const CONCURRENCY = 16;

/** 秘密を持つファイル名か。`.env.example` は秘密を持たない例なので複製する */
export function isSecretName(name: string): boolean {
  return (name === '.env' || name.startsWith('.env.')) && name !== '.env.example';
}

/** 雛形からの相対パス（`/` 区切り）が、複製の対象外か */
export function isExcludedRel(rel: string): boolean {
  const parts = rel.split('/').filter(Boolean);
  if (parts.length === 0) return false;
  if (SKIP_TOP.has(parts[0]!)) return true;
  // node_modules / dist の中身はリンクまたは丸ごとのコピーなので、ここでは判定しない
  if (parts[0] === 'node_modules' || parts[0] === 'dist') return false;
  if (parts.some(isSecretName)) return true;
  const joined = parts.join('/');
  if (CUSTOMER_KEEP.has(joined)) return false;
  // 置き場所のフォルダー自体は残し（空のまま）、中身の顧客パックだけを除く
  return CUSTOMER_PATHS.some((p) => joined.startsWith(`${p}/`));
}

async function pool<T>(items: readonly T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]!);
  }));
}

export type CloneMode = 'link' | 'copy';

export interface CloneOptions {
  template: string;
  dest: string;
  /** 既定 link。copy はすべてをフルコピーする */
  mode?: CloneMode;
  /** 複製の対象から外すフォルダー（作業フォルダーの親など。雛形の中にある場合の再帰を防ぐ） */
  exclude?: string[];
  rec?: Recorder;
}

export interface CloneResult {
  /** 実際に使った方式。link を求めてもリンクを作れなかったときは copy */
  method: CloneMode;
  entries: string[];
  durationSec: number;
  limitSec: number;
  withinLimit: boolean;
  /** link を求めたが copy にした理由 */
  fallbackReason?: string;
}

export class TemplateNotBuiltError extends Error {
  constructor(public readonly missing: string[]) {
    super(`雛形がビルド済みではありません（${missing.join('、')} がありません）。雛形のフォルダーで 1 度だけ npm install と npm run build を実行してください。`);
    this.name = 'TemplateNotBuiltError';
  }
}

/** 既存のリンクは、リンクの先に触れずに取り除く。実体のフォルダー・ファイルは再帰して消す（複製先のものだけ） */
function removeExisting(p: string): void {
  let st: fs.Stats;
  try { st = fs.lstatSync(p); } catch { return; }
  if (st.isSymbolicLink()) fs.unlinkSync(p); // ジャンクションも同じ。リンク先は消えない
  else fs.rmSync(p, { recursive: true, force: true });
}

export async function cloneTemplate(opts: CloneOptions): Promise<CloneResult> {
  const template = path.resolve(opts.template);
  const dest = path.resolve(opts.dest);
  const excluded = (opts.exclude ?? []).map((p) => path.resolve(p));
  const missing = SHARED.filter((n) => !fs.existsSync(path.join(template, n)));
  if (missing.length) throw new TemplateNotBuiltError([...missing]);

  const t0 = performance.now();
  fs.mkdirSync(dest, { recursive: true });
  const top = fs.readdirSync(template).filter((n) => !SKIP_TOP.has(n) && !isSecretName(n));
  const wantLink = (opts.mode ?? 'link') === 'link';
  let method: CloneMode = wantLink ? 'link' : 'copy';
  let fallbackReason: string | undefined;

  // 複製先に前回のリンクが残っていると、コピーが雛形に書き込んでしまう。先に取り除く
  for (const n of SHARED) removeExisting(path.join(dest, n));

  const linked: string[] = [];
  if (wantLink) {
    try {
      for (const n of SHARED) {
        fs.symlinkSync(path.join(template, n), path.join(dest, n), process.platform === 'win32' ? 'junction' : 'dir');
        linked.push(n);
      }
    } catch (e) {
      for (const n of linked) removeExisting(path.join(dest, n));
      linked.length = 0;
      method = 'copy';
      fallbackReason = `リンクを作れないため、コピーに切り替えた（${(e as Error).message}）`;
    }
  }

  const filter = (src: string): boolean => {
    const abs = path.resolve(src);
    if (excluded.some((x) => abs === x)) return false;
    const rel = path.relative(template, abs).split(path.sep).join('/');
    return !isExcludedRel(rel);
  };
  const copy = (from: string, to: string): Promise<void> =>
    fs.promises.cp(from, to, { recursive: true, force: true, verbatimSymlinks: true, filter });

  const jobs: Array<[string, string]> = [];
  const copied: string[] = [];
  for (const name of top) {
    if (linked.includes(name)) continue;
    const from = path.join(template, name);
    const to = path.join(dest, name);
    copied.push(name);
    if (name === 'node_modules' && fs.statSync(from).isDirectory()) {
      // 大きなフォルダーは、直下の項目ごとに並列で複製する
      fs.mkdirSync(to, { recursive: true });
      for (const child of fs.readdirSync(from)) jobs.push([path.join(from, child), path.join(to, child)]);
    } else {
      jobs.push([from, to]);
    }
  }
  opts.rec?.recordCommand(`copy ${template}${path.sep}{${copied.join(',')}} -> ${dest}`);
  if (linked.length) opts.rec?.recordCommand(`link ${linked.join(', ')} -> ${template}（読み取り専用で共有）`);
  await pool(jobs, CONCURRENCY, ([from, to]) => copy(from, to));

  const durationSec = (performance.now() - t0) / 1000;
  return {
    method, entries: top, durationSec, limitSec: PARAMS.cloneLimitSec, withinLimit: durationSec <= PARAMS.cloneLimitSec,
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}
