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

export default defineConfig({
  plugins: [
    react(),
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
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
