// 配布パッケージの作成（FR-105）。依存パッケージ（node_modules）とビルド済みの dist/ を同梱した .tgz を作る。
// 同梱するものは scripts/lib/package.ts の許可リストで決める（.env と顧客パックは含めない）。
// 展開した PC で `npm start`（vite preview）を実行すれば、ネットワークがなくてもお手本パックで起動する。
// 使い方: npm ci && npm run build && npm run package
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPackage } from './lib/package';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { name: string; version: string };

for (const need of ['node_modules', 'dist/index.html', 'package-lock.json']) {
  if (!fs.existsSync(path.join(root, need))) {
    console.error(`${need} がありません。先に npm ci と npm run build を実行してください。`);
    process.exit(1);
  }
}

const out = path.join(root, 'work', 'package', `${pkg.name}-${pkg.version}.tgz`);
const files = createPackage(root, out);
console.log(`作成しました: ${path.relative(root, out)}（${files.length} ファイル）`);
