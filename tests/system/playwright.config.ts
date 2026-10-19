// System Test の Playwright 設定（tests/system の下に置く。実行は run.mjs から）
// アプリの起動は各テストのフィクスチャが行う（support/server.ts。127.0.0.1 のランダムなポート）。
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { REPO_ROOT } from './support/paths';

const runId = process.env.RUN_ID;
const outDir = runId
  ? path.join(REPO_ROOT, 'work', 'runs', runId, 'evidence', 'playwright')
  : path.join(REPO_ROOT, 'work', 'system-test', 'playwright');

export default defineConfig({
  testDir: './e2e',
  // run.mjs がプロセスごとの ST_OUT_SUBDIR を渡す（並列実行で outputDir・artifacts が重ならない）
  outputDir: path.join(outDir, process.env.ST_OUT_SUBDIR ?? '_default'),
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.ST_WORKERS ? Number(process.env.ST_WORKERS) : '50%',
  retries: 0,
  reporter: [['list'], ['json', { outputFile: path.join(outDir, 'results.json') }]],
  use: {
    // 標準の検証条件: Chromium 系のブラウザー（要求定義書 §3.5）
    ...devices['Desktop Chrome'],
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1600, height: 900 },
    acceptDownloads: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', viewport: { width: 1600, height: 900 } },
      grepInvert: /@perf/,
    },
    {
      // 性能の計測（AC-117 など）: 垂直同期の上限を外し、フレームの実時間を測る
      name: 'chromium-perf',
      use: {
        browserName: 'chromium',
        viewport: { width: 1600, height: 900 },
        launchOptions: { args: ['--disable-frame-rate-limit', '--disable-gpu-vsync', '--enable-unsafe-webgpu'] },
      },
      grep: /@perf/,
      fullyParallel: false,
    },
  ],
});
