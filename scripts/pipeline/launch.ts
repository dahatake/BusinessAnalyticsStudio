// ⑦ 起動（ローカルの静的サーバー）。127.0.0.1 だけで待ち受け、`dist` を配信する。
// 顧客パックは、開発サーバーと同じ対応（/data/、/brand/、/assets/brand/、/assets/audio/）で作業フォルダーから重ねて返す。
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

export interface Launched {
  url: string;
  close(): Promise<void>;
}
/** 起動の接続点。`workDir` の `dist` と顧客パックを配信する */
export type Launcher = (workDir: string) => Promise<Launched>;

const HOST = '127.0.0.1';
const PREFERRED_PORT = 4173;

const OVERLAYS: ReadonlyArray<readonly [string, string]> = [
  ['/data/', 'public/data'],
  ['/brand/', 'public/brand'],
  ['/assets/brand/', 'assets/brand'],
  ['/assets/audio/', 'assets/audio'],
];

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

function resolveFile(workDir: string, urlPath: string): string | undefined {
  const pick = (root: string, rel: string): string | undefined => {
    const base = path.resolve(root);
    const file = path.resolve(base, '.' + path.sep + rel);
    if (file !== base && !file.startsWith(base + path.sep)) return undefined; // フォルダーの外は返さない
    return fs.existsSync(file) && fs.statSync(file).isFile() ? file : undefined;
  };
  for (const [prefix, sub] of OVERLAYS) {
    if (urlPath.startsWith(prefix)) {
      const hit = pick(path.join(workDir, sub), urlPath.slice(prefix.length));
      if (hit) return hit;
    }
  }
  return pick(path.join(workDir, 'dist'), urlPath === '/' ? 'index.html' : urlPath.slice(1));
}

function listen(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (e: Error): void => reject(e);
    server.once('error', onError);
    server.listen(port, HOST, () => { server.off('error', onError); resolve(); });
  });
}

/** 静的サーバーを起動する。ポートが使用中なら別のポートで起動する */
export const startStaticServer: Launcher = async (workDir) => {
  const server = http.createServer((req, res) => {
    let urlPath = '/';
    try { urlPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/'); } catch { /* 不正な URL は 404 */ }
    const file = urlPath.includes('\0') ? undefined : resolveFile(workDir, urlPath);
    if (!file) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('content-type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  try {
    await listen(server, PREFERRED_PORT);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
    await listen(server, 0);
  }
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://${HOST}:${port}/`,
    close: () => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); }),
  };
};
