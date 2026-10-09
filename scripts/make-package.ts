// 配布パッケージの作成（FR-105）。依存パッケージ（node_modules）とビルド済みの dist/ を同梱した .tgz を作る。
// 展開した PC で `npm start`（vite preview）を実行すれば、ネットワークがなくてもお手本パックで起動する。
// 使い方: npm ci && npm run build && npm run package
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { name: string; version: string };

for (const need of ['node_modules', 'dist/index.html', 'package-lock.json']) {
  if (!fs.existsSync(path.join(root, need))) {
    console.error(`${need} がありません。先に npm ci と npm run build を実行してください。`);
    process.exit(1);
  }
}

const outDir = path.join(root, 'work', 'package');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${pkg.name}-${pkg.version}.tgz`);
const excludes = ['.git', 'work', 'tests/system', '*.log'];
const args = ['-czf', out, ...excludes.map((e) => `--exclude=${e}`), '.'];
const r = spawnSync('tar', args, { cwd: root, stdio: 'inherit' });
if (r.status !== 0) {
  console.error('tar の実行に失敗しました。');
  process.exit(r.status ?? 1);
}
console.log(`作成しました: ${path.relative(root, out)}`);
