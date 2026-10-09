// 顧客パックを検証する。使い方: `npm run check:pack -- examples/mono`（引数なしは examples/ のすべて）
import fs from 'node:fs';
import path from 'node:path';
import { formatPackError } from '../src/schema';
import { REPO_ROOT, validatePackDir } from './lib/pack-fs';

const args = process.argv.slice(2);
const examples = path.join(REPO_ROOT, 'examples');
const roots = args.length
  ? args.map((a) => path.resolve(a))
  : fs.readdirSync(examples, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(examples, e.name));

let failed = false;
for (const root of roots) {
  const r = validatePackDir(root);
  console.log(`${path.relative(REPO_ROOT, root)}: エラー ${r.errors.length} 件、出典の付いていない数値項目 ${r.unsourcedNumbers} 件`);
  for (const e of r.errors) console.log(`  ${formatPackError(e)}`);
  if (r.errors.length) failed = true;
}
process.exit(failed ? 1 : 0);
