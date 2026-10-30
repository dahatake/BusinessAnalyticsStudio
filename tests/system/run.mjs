// System Test の実行入口（リポジトリルートから）: node tests/system/run.mjs <AC-ID> [<AC-ID> ...]
// 指定した AC ID を題名に含む Playwright テストだけを実行する。exit code は Playwright のもの
// （一致するテストが 0 件のときも非 0。テストが無いのを成功にしない）。
// 契約: tests/system/CONTRACT.md
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ids = process.argv.slice(2);
if (ids.length === 0 || ids.some((i) => !/^AC-\d{3}$/.test(i))) {
  console.error('usage: node tests/system/run.mjs AC-001 [AC-002 ...]');
  process.exit(2);
}
const TIMING_ACS = new Set(['AC-056', 'AC-086', 'AC-197']);
const grep = '(' + ids.map((i) => `${i}(?!\\d)`).join('|') + ')';
const cli = path.join(here, 'node_modules', '@playwright', 'test', 'cli.js');
const r = spawnSync(process.execPath, [cli, 'test', '--config', path.join(here, 'playwright.config.ts'), '--grep', grep], {
  cwd: here,
  stdio: 'inherit',
  env: {
    ...process.env,
    ST_OUT_SUBDIR: `p${process.pid}-${ids.join('_')}`,
    // 時間閾値（2000ms 等）で判定する可視化の AC は、台帳が複数ケースを同時に走らせても
    // フレーム落ちで揺らがないよう、ワーカー数を絞る（ST_WORKERS 明示時はそれに従う）。
    ...(process.env.ST_WORKERS || !ids.every((i) => TIMING_ACS.has(i)) ? {} : { ST_WORKERS: '1' }),
  },
});
process.exit(r.status ?? 1);
