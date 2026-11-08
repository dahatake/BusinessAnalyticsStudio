// FR-228 AC-529: run the independently decidable Q-115 scenarios while the
// related-component mapping and process order in E2E-326 remain blocked.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--list')) {
  console.error('usage: node tests/system/run-q115.mjs [--list]');
  process.exit(2);
}
const result = spawnSync(process.execPath, [
  path.join(here, 'node_modules', '@playwright', 'test', 'cli.js'),
  'test', '--config', path.join(here, 'playwright.config.ts'),
  'ux-refresh.spec.ts', '--project=chromium',
  '--grep', 'AC-529 (マウス|タッチ|選択・絞り込み|候補)', '--reporter=list', ...args,
], {
  cwd: here,
  stdio: 'inherit',
  env: { ...process.env, ST_OUT_SUBDIR: `p${process.pid}-AC-529-independent` },
});
process.exit(result.status ?? 1);
