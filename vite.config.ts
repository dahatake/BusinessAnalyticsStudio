import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// 開発サーバーだけ、お手本パックを `/data/` `/brand/` `/assets/brand/` に重ねて配信する（FR-100）。
// ビルド成果物（dist/）には顧客固有のデータを含めない。顧客パックは配信側が重ねる。
const PACK = process.env.EDB_PACK ?? 'mono';
const packRoot = path.resolve(__dirname, 'examples', PACK);
const OVERLAYS: Array<[string, string]> = [
  ['/data/', 'public/data/'],
  ['/brand/', 'public/brand/'],
  ['/assets/brand/', 'assets/brand/'],
];

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p) : [p];
  });
}

export default defineConfig({
  plugins: [
    react(),
    {
      // FR-104: 顧客パックがない（public/data が空）ときに起動するお手本パック（架空企業）を、dist/example-pack/ に同梱する。
      // 顧客固有のデータではないので同梱してよい（FR-100）。顧客パックは配信側が `/data/` に重ねて返す。
      name: 'edb-example-pack',
      apply: 'build',
      generateBundle() {
        const example = path.resolve(__dirname, 'examples', 'mono');
        for (const [, sub] of OVERLAYS) {
          const base = path.join(example, sub);
          for (const file of listFiles(base)) {
            const rel = path.relative(base, file).split(path.sep).join('/');
            this.emitFile({ type: 'asset', fileName: `example-pack/${sub.replace(/^public\//, '')}${rel}`, source: fs.readFileSync(file) });
          }
        }
      },
    },
    {
      name: 'edb-dev-pack-overlay',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');
          for (const [prefix, sub] of OVERLAYS) {
            if (!url.startsWith(prefix)) continue;
            const file = path.normalize(path.join(packRoot, sub, url.slice(prefix.length)));
            if (file.startsWith(packRoot) && fs.existsSync(file) && fs.statSync(file).isFile()) {
              res.setHeader('content-type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
              fs.createReadStream(file).pipe(res);
              return;
            }
          }
          next();
        });
      },
    },
  ],
  build: { outDir: 'dist', sourcemap: false },
  // 負荷時（並列実行・統合の verify）でも、ファイル走査や起動を含むテストが既定の 5 秒でタイムアウトしないようにする。並列のワーカー数も抑える
  test: { include: ['tests/unit/**/*.test.{ts,tsx}'], environment: 'node', testTimeout: 60_000, hookTimeout: 60_000, maxWorkers: 4, minWorkers: 1 },
});
