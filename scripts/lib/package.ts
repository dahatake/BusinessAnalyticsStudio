// 配布パッケージの同梱リスト（FR-105）。許可リスト方式: 実行に必要なものだけを名前で選ぶ。
// 秘密値（.env・.env.*）と顧客パック（public/data・public/brand・assets/brand とそのビルド済みの複製）は含めない。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** ルート直下などで同梱するファイル（存在するものだけ） */
export const PACKAGE_FILES = [
  'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html',
  'README.md', 'CREDITS.md', 'LICENSE', '.env.example', 'docs/distribution.md',
  // 顧客パックの置き場所の説明だけ。顧客パックの JSON は含めない
  'public/data/README.txt',
];

/** 同梱するフォルダー（中身を再帰的に。顧客パックと秘密値は除く） */
export const PACKAGE_DIRS = [
  'dist', 'node_modules', 'src', 'schema', 'examples', 'scripts/relay', 'scripts/lib',
];

/** 同梱するスクリプト（Python の管理用スクリプトなど、実行に不要なものは含めない） */
export const PACKAGE_SCRIPTS = ['scripts/check-pack.ts', 'scripts/gen-schema.ts', 'scripts/make-package.ts'];

/** ルートからの相対パス（/ 区切り）で、顧客パックに当たるもの。ビルドが public/ から dist/ に複製したものを含む */
const CUSTOMER_PACK = [
  /^dist\/data\/(?!README\.txt$)/,
  /^dist\/brand\//,
  /^dist\/assets\/(brand|audio)\//,
  /^public\/(data|brand)\/(?!README\.txt$)/,
  /^assets\//,
];

/** 秘密値のファイル（.env.example だけは可） */
export function isSecretFile(rel: string): boolean {
  const base = rel.split('/').pop() ?? '';
  return (base === '.env' || base.startsWith('.env.')) && base !== '.env.example';
}

export function isCustomerPack(rel: string): boolean {
  return CUSTOMER_PACK.some((re) => re.test(rel));
}

function allowed(rel: string): boolean {
  return !isSecretFile(rel) && !isCustomerPack(rel);
}

function walk(root: string, relDir: string, out: string[]): void {
  const abs = path.join(root, relDir);
  if (!fs.existsSync(abs)) return;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${relDir}/${e.name}`;
    if (e.isDirectory()) walk(root, rel, out);
    else if (e.isFile() && allowed(rel)) out.push(rel);
  }
}

/** 同梱するファイルの一覧（root からの相対パス、/ 区切り、ソート済み） */
export function collectPackageFiles(root: string): string[] {
  const out: string[] = [];
  for (const f of [...PACKAGE_FILES, ...PACKAGE_SCRIPTS]) {
    const abs = path.join(root, f);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile() && allowed(f)) out.push(f);
  }
  for (const d of PACKAGE_DIRS) walk(root, d, out);
  return [...new Set(out)].sort();
}

/** 同梱の一覧どおりに .tgz を作る（ルート固定の相対パスで列挙するので、除外パターンは使わない）。作った一覧を返す */
export function createPackage(root: string, outFile: string): string[] {
  const files = collectPackageFiles(root);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const listFile = `${outFile}.list`;
  fs.writeFileSync(listFile, files.join('\n') + '\n', 'utf8');
  try {
    const r = spawnSync('tar', ['-czf', path.resolve(outFile), '-T', path.resolve(listFile)], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`tar の実行に失敗しました（終了コード ${r.status}）。`);
  } finally {
    fs.rmSync(listFile, { force: true });
  }
  return files;
}
