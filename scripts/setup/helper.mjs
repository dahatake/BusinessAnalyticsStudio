// セットアップスクリプト（scripts/setup.ps1・scripts/setup.sh。FR-107・FR-108）の補助。
// Node.js が使えるようになってから、PowerShell / シェルの両方から同じ判定を呼ぶために 1 か所にまとめている。
// 使い方: node scripts/setup/helper.mjs <deps|sdk|chromium|install-chromium|dist-fresh|env-port|relay|prepare-verify>
//   deps             package.json の依存パッケージがすべて node_modules にあるか（なければ不足を表示して終了コード 1）
//   sdk              Copilot SDK（@github/copilot-sdk）が node_modules にあるか
//   chromium         verify のブラウザー検査に使う Chromium が導入済みか（Playwright が見つからないときも 1）
//   install-chromium Chromium を導入する（Playwright の公式の手順）
//   dist-fresh       dist/ がビルド済みで、ソース（src など）より新しいか
//   env-port         中継プロセスのポート（.env の EDB_RELAY_PORT、なければ .env.example、なければ 8787）
//   relay            中継プロセスを一時的に起動し、127.0.0.1 の /health で疎通と Copilot のサインインを確かめて止める
//   prepare-verify   お手本パック（examples/mono）で verify を行うための作業フォルダー work/setup-verify を用意する
// 外部へは何も送信しない。ネットワークの利用は、`install-chromium` が呼ぶ Playwright の導入だけ。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SDK_NAME = '@github/copilot-sdk';
const DEFAULT_PORT = 8787;
const RELAY_WAIT_MS = /^\d+$/.test(process.env.EDB_SETUP_RELAY_WAIT_MS ?? '') ? Number(process.env.EDB_SETUP_RELAY_WAIT_MS) : 45_000;

const p = (...a) => path.join(ROOT, ...a);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const hasPkg = (name) => fs.existsSync(p('node_modules', ...name.split('/'), 'package.json'));

function missingDeps() {
  const pkg = readJson(p('package.json'));
  return Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }).filter((n) => !hasPkg(n));
}

function readEnvValue(file, key) {
  if (!fs.existsSync(file)) return undefined;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[1] === key && m[2]) return m[2];
  }
  return undefined;
}

function relayPort() {
  const v = readEnvValue(p('.env'), 'EDB_RELAY_PORT') ?? readEnvValue(p('.env.example'), 'EDB_RELAY_PORT') ?? process.env.EDB_RELAY_PORT;
  const n = Number(v ?? DEFAULT_PORT);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : DEFAULT_PORT;
}

async function loadPlaywrightChromium() {
  for (const dir of [p('tests', 'system'), ROOT]) {
    try {
      const resolved = createRequire(path.join(dir, 'noop.js')).resolve('@playwright/test');
      const mod = await import(pathToFileURL(resolved).href);
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return { chromium, dir };
    } catch { /* 次の場所を探す */ }
  }
  return null;
}

function getHealth(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 2_000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(res.statusCode === 200 ? JSON.parse(body) : null); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function killTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* 終了済み */ } }
  }
}

async function relayCheck() {
  const port = relayPort();
  const report = (h, note) => {
    console.log(`中継プロセス: 127.0.0.1:${port} で疎通 OK${note}`);
    console.log(`copilot=${h.copilot === 'signed-in' ? 'signed-in' : 'signed-out'}`);
  };
  const running = await getHealth(port);
  if (running) { report(running, '（すでに起動していたものを使用）'); return 0; }
  const child = spawn('npm run relay', {
    cwd: ROOT, shell: true, stdio: 'ignore', detached: process.platform !== 'win32',
    env: { ...process.env, EDB_RELAY_PORT: String(port) },
  });
  let exited = false;
  child.on('exit', () => { exited = true; });
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < RELAY_WAIT_MS) {
      const h = await getHealth(port);
      if (h) { report(h, ''); return 0; }
      if (exited) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    console.error(`原因: 中継プロセス（npm run relay）が 127.0.0.1:${port} で応答しませんでした。`);
    console.error(`対処: ポート ${port} を別のプログラムが使っていないか確認し、.env の EDB_RELAY_PORT を空いているポートに変えてから、もう一度実行してください。`);
    return 1;
  } finally {
    killTree(child);
  }
}

function prepareVerify() {
  const src = p('examples', 'mono');
  const dist = p('dist');
  if (!fs.existsSync(path.join(src, 'public'))) { console.error(`原因: お手本パック（${src}）が見つかりません。`); return 1; }
  if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('原因: dist/index.html（ビルド済みのアプリ）がありません。'); return 1; }
  const work = p('work', 'setup-verify');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  // お手本パックの全体（public・assets・brand・data）を、作業フォルダーに複製する（雛形の中身は変えない）
  fs.cpSync(src, work, { recursive: true });
  // dist と node_modules は、読み取り専用のリンクで共有する（管理者権限は不要。Windows はジャンクション）
  fs.symlinkSync(dist, path.join(work, 'dist'), 'junction');
  if (fs.existsSync(p('node_modules'))) fs.symlinkSync(p('node_modules'), path.join(work, 'node_modules'), 'junction');
  console.log(work);
  return 0;
}

/** dist が最新か（dist/index.html があり、ソースより新しい）。古いままの dist で verify すると、新しい画面が見つからず不合格になる */
function distFresh() {
  const index = p('dist', 'index.html');
  if (!fs.existsSync(index)) return false;
  const built = fs.statSync(index).mtimeMs;
  let newest = 0;
  const visit = (f) => {
    const st = fs.statSync(f, { throwIfNoEntry: false });
    if (!st) return;
    if (st.isDirectory()) { for (const e of fs.readdirSync(f)) visit(path.join(f, e)); } else newest = Math.max(newest, st.mtimeMs);
  };
  for (const f of ['src', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json']) visit(p(f));
  visit(p('examples', 'mono', 'public'));
  return built >= newest;
}

const cmd = process.argv[2];
let code = 2;
switch (cmd) {
  case 'deps': {
    const m = missingDeps();
    if (m.length) console.log(`不足: ${m.join(', ')}`);
    code = m.length ? 1 : 0;
    break;
  }
  case 'sdk': code = hasPkg(SDK_NAME) ? 0 : 1; break;
  case 'chromium': {
    const pw = await loadPlaywrightChromium();
    code = pw && fs.existsSync(pw.chromium.executablePath()) ? 0 : 1;
    break;
  }
  case 'install-chromium': {
    const pw = await loadPlaywrightChromium();
    if (!pw) { console.error('原因: @playwright/test が見つかりません。'); code = 1; break; }
    const cli = createRequire(path.join(pw.dir, 'noop.js')).resolve('playwright-core/cli.js');
    code = spawnSync(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit', cwd: pw.dir }).status ?? 1;
    break;
  }
  case 'env-port': console.log(String(relayPort())); code = 0; break;
  case 'relay': code = await relayCheck(); break;
  case 'dist-fresh': code = distFresh() ? 0 : 1; break;
  case 'prepare-verify': code = prepareVerify(); break;
  default: console.error('使い方: node scripts/setup/helper.mjs <deps|sdk|chromium|install-chromium|dist-fresh|env-port|relay|prepare-verify>');
}
process.exit(code);
