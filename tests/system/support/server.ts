// System Test 用のローカル静的サーバー（127.0.0.1 だけで待ち受ける）。
// 標準の検証条件（要求定義書 §3.5）: ビルド済みの雛形（dist/）を、お手本パックと AI モックで配信する。
// 顧客パックは dist/ を書き換えずに「重ねて」配信する（FR-101 の差し替えと同じ見え方。CONTRACT.md §2）。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { REPO_ROOT } from './paths';

export interface PackDir {
  /** 顧客パックのルート（`public/data/`・`public/brand/`・`assets/` を持つ）。null は「public/data が空」。 */
  root: string | null;
}

export interface RuntimeConfig {
  relayUrl: string;
  aiMock?: { delayMs?: number };
}

export interface ServeOptions {
  distDir?: string;
  pack: PackDir;
  runtimeConfig: RuntimeConfig;
}

export interface RunningServer {
  url: string;
  port: number;
  requests: string[];
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.hdr': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.wasm': 'application/wasm',
};

export const DIST_DIR = path.join(REPO_ROOT, 'dist');

function safeJoin(base: string, rel: string): string | null {
  const p = path.normalize(path.join(base, rel));
  if (!p.startsWith(path.normalize(base))) return null;
  return p;
}

/** URL のパスを、顧客パックか dist/ のファイルに対応付ける（CONTRACT.md §2 の表）。 */
function resolveFile(urlPath: string, opts: ServeOptions): string | null | 'NOT_FOUND' {
  const dist = opts.distDir ?? DIST_DIR;
  const map: Array<[string, string]> = [
    ['/data/', 'public/data/'],
    ['/brand/', 'public/brand/'],
    ['/assets/brand/', 'assets/brand/'],
    ['/assets/audio/', 'assets/audio/'],
  ];
  for (const [prefix, sub] of map) {
    if (urlPath.startsWith(prefix)) {
      if (!opts.pack.root) return 'NOT_FOUND';
      return safeJoin(path.join(opts.pack.root, sub), urlPath.slice(prefix.length));
    }
  }
  const rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  return safeJoin(dist, rel);
}

export async function startStaticServer(opts: ServeOptions): Promise<RunningServer> {
  const requests: string[] = [];
  const dist = opts.distDir ?? DIST_DIR;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://127.0.0.1');
    const urlPath = decodeURIComponent(u.pathname);
    requests.push(urlPath);
    if (urlPath === '/runtime-config.json') {
      res.writeHead(200, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
      res.end(JSON.stringify(opts.runtimeConfig));
      return;
    }
    const file = resolveFile(urlPath, opts);
    if (file === 'NOT_FOUND' || file === null) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    let target = file;
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      // SPA のフォールバック（拡張子のないパスだけ）
      if (!path.extname(urlPath)) target = path.join(dist, 'index.html');
      else {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(target).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** 使われていないループバックのポート（中継プロセスが「未接続」の状態を作る）。 */
export async function unusedPort(): Promise<number> {
  const s = http.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const port = (s.address() as AddressInfo).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}
