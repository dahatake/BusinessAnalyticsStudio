// 雛形の回帰テスト（NFR-MAINT-002）。依存関係の更新時とリリース時に、`npm run regression` の 1 コマンドで実行する。
//   ① ビルド（型検査 + vite build） → ② お手本パックでの verify（9 項目の受け入れ判定） → ③ 単体・結合テスト
// の順に実行し、すべて合格すると終了コード 0、1 つでも失敗すると 0 以外で終わる（失敗した工程で止め、残りは実行しない）。
// System Test（ブラウザーの E2E。tests/system/）は時間がかかるため含めない。`node tests/system/run.mjs <AC-ID>` か台帳（ledger.py）で実行する。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/pack-fs';

export interface RegressionStep {
  id: 'build' | 'verify-pack' | 'unit';
  name: string;
  /** 終了コード（0 が合格） */
  run(): number | Promise<number>;
}

export interface StepResult { id: RegressionStep['id']; name: string; code: number; skipped: boolean }

/** 工程を順に実行する。失敗（0 以外）した工程で止め、残りは「未実行」にする。 */
export async function runSteps(steps: readonly RegressionStep[], log: (line: string) => void = (l) => console.log(l)): Promise<{ code: number; results: StepResult[] }> {
  const results: StepResult[] = [];
  let failed = false;
  for (const [i, step] of steps.entries()) {
    if (failed) {
      results.push({ id: step.id, name: step.name, code: 0, skipped: true });
      continue;
    }
    log(`\n=== 回帰テスト ${i + 1}/${steps.length}: ${step.name} ===`);
    let code: number;
    try {
      code = await step.run();
    } catch (e) {
      log(`  実行できませんでした: ${e instanceof Error ? e.message : String(e)}`);
      code = 1;
    }
    results.push({ id: step.id, name: step.name, code, skipped: false });
    if (code !== 0) failed = true;
  }
  const lines = results.map((r) => `  ${r.skipped ? '未実行' : r.code === 0 ? '合格  ' : `不合格(${r.code})`}  ${r.name}`);
  log(`\n--- 回帰テストの結果 ---\n${lines.join('\n')}`);
  const bad = results.find((r) => !r.skipped && r.code !== 0);
  log(bad ? `不合格: ${bad.name}。上のログの原因を直してから、もう一度 \`npm run regression\` を実行してください。` : '全工程が合格しました。');
  return { code: bad ? (bad.code === 0 ? 1 : bad.code) : 0, results };
}

function sh(command: string): number {
  const r = spawnSync(command, { cwd: REPO_ROOT, stdio: 'inherit', shell: true, env: process.env });
  return r.status ?? 1;
}

/** お手本パック（examples/mono）の複製と、ビルド済みの dist/ を、verify 用の作業フォルダーに置く。 */
export function prepareVerifyDir(root: string = REPO_ROOT): string {
  const wd = path.join(root, 'work', 'regression', 'verify-pack');
  fs.rmSync(wd, { recursive: true, force: true });
  fs.mkdirSync(wd, { recursive: true });
  fs.cpSync(path.join(root, 'examples', 'mono'), wd, { recursive: true });
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist/index.html がありません。ビルドが先に必要です。');
  fs.cpSync(dist, path.join(wd, 'dist'), { recursive: true });
  return wd;
}

export function defaultSteps(): RegressionStep[] {
  return [
    { id: 'build', name: 'ビルド（型検査と vite build）', run: () => sh('npm run build') },
    {
      id: 'verify-pack',
      name: 'お手本パックでの verify（受け入れ判定 9 項目）',
      run: () => sh(`npm run verify:pack -- "${prepareVerifyDir()}"`),
    },
    { id: 'unit', name: '単体・結合テスト（vitest）', run: () => sh('npm test') },
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runSteps(defaultSteps()).then(({ code }) => process.exit(code));
}
