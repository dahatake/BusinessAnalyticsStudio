// ③ 雛形の複製（FR-124）: `node_modules` と `dist` を含めて作業フォルダーに複製する。`npm install` もビルドもしない。
import fs from 'node:fs';
import path from 'node:path';
import { PARAMS } from './common';
import type { Recorder } from './timing';

/** 複製しない最上位の項目（履歴・実行の作業ファイル・調査キャッシュ・System Test の依存） */
const SKIP_TOP = new Set(['.git', 'work', 'research-cache', 'tests']);
const CONCURRENCY = 16;

async function pool<T>(items: readonly T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]!);
  }));
}

export interface CloneOptions {
  template: string;
  dest: string;
  /** 複製の対象から外すフォルダー（作業フォルダーの親など。雛形の中にある場合の再帰を防ぐ） */
  exclude?: string[];
  rec?: Recorder;
}

export class TemplateNotBuiltError extends Error {
  constructor(public readonly missing: string[]) {
    super(`雛形がビルド済みではありません（${missing.join('、')} がありません）。雛形のフォルダーで 1 度だけ npm install と npm run build を実行してください。`);
    this.name = 'TemplateNotBuiltError';
  }
}

export async function cloneTemplate(opts: CloneOptions): Promise<{ entries: string[]; durationSec: number; limitSec: number; withinLimit: boolean }> {
  const template = path.resolve(opts.template);
  const dest = path.resolve(opts.dest);
  const excluded = (opts.exclude ?? []).map((p) => path.resolve(p));
  const missing = ['node_modules', 'dist'].filter((n) => !fs.existsSync(path.join(template, n)));
  if (missing.length) throw new TemplateNotBuiltError(missing);

  const t0 = performance.now();
  fs.mkdirSync(dest, { recursive: true });
  const top = fs.readdirSync(template).filter((n) => !SKIP_TOP.has(n));
  const filter = (src: string): boolean => !excluded.some((x) => path.resolve(src) === x);
  const copy = (from: string, to: string): Promise<void> =>
    fs.promises.cp(from, to, { recursive: true, force: true, verbatimSymlinks: true, filter });

  opts.rec?.recordCommand(`copy ${template}${path.sep}{${top.join(',')}} -> ${dest}`);
  const jobs: Array<[string, string]> = [];
  for (const name of top) {
    const from = path.join(template, name);
    const to = path.join(dest, name);
    if (name === 'node_modules' && fs.statSync(from).isDirectory()) {
      // 大きなフォルダーは、直下の項目ごとに並列で複製する
      fs.mkdirSync(to, { recursive: true });
      for (const child of fs.readdirSync(from)) jobs.push([path.join(from, child), path.join(to, child)]);
    } else {
      jobs.push([from, to]);
    }
  }
  await pool(jobs, CONCURRENCY, ([from, to]) => copy(from, to));

  const durationSec = (performance.now() - t0) / 1000;
  return { entries: top, durationSec, limitSec: PARAMS.cloneLimitSec, withinLimit: durationSec <= PARAMS.cloneLimitSec };
}
