// FR-107 AC-130 / FR-108 AC-132 AC-133: セットアップスクリプト（scripts/setup.ps1・scripts/setup.sh）の結合テスト。
// 実際の導入・ダウンロードは行わない。使い捨てのフォルダー（雛形の最小の複製）で、winget・brew・npm の導入系・git・copilot を
// 差し替え部品（stub）に置き換えて、段階ごとの判定・冪等性・表示だけの実行・失敗時の表示とログを確かめる。
// 実行するシェルは、PowerShell 版（Windows のみ。Windows PowerShell 5.1）と bash 版（Windows は Git for Windows の bash、ほかは PATH の bash）。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

// 待ち行列を含めた余裕（各テストの個別の上限より、こちらを優先する）
vi.setConfig({ testTimeout: 400_000 });

const REPO = path.resolve(__dirname, '..', '..');
const NODE_DIR = path.dirname(process.execPath);
const IS_WIN = process.platform === 'win32';
const SHELLS = [...(IS_WIN ? (['ps1'] as const) : []), 'sh'] as const;
type Shell = (typeof SHELLS)[number];

function findBash(): string {
  if (!IS_WIN) return 'bash';
  const gitCmd = spawnSync('where', ['git'], { encoding: 'utf8' }).stdout.split(/\r?\n/).find((l) => l.trim());
  const candidates = [
    gitCmd ? path.resolve(path.dirname(gitCmd.trim()), '..', 'usr', 'bin', 'bash.exe') : '',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
  ];
  const found = candidates.find((c) => c && fs.existsSync(c));
  if (!found) throw new Error('Git for Windows の bash が見つかりません');
  return found;
}
const BASH = findBash();
const GIT_USR_BIN = IS_WIN ? path.dirname(BASH) : '';
const POWERSHELL = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

const read = (...p: string[]): string => fs.readFileSync(path.join(REPO, ...p), 'utf8');

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

// 差し替え部品。git・copilot は state.json の installed が true のときだけ動く。導入系は state.json を書き換えて呼び出しを calls.log に残す
const STUB_MJS = `
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const [tool, ...args] = process.argv.slice(2);
const stateFile = path.join(dir, 'state.json');
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const fails = (process.env.STUB_FAIL ?? '').split(',');
const log = (s) => fs.appendFileSync(path.join(dir, 'calls.log'), s + '\\n');
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state));
const has = (s) => args.includes(s);
if (tool === 'git' || tool === 'copilot') {
  if (!state.installed[tool]) { console.error(tool + ': command not found'); process.exit(127); }
  console.log(tool === 'git' ? 'git version 2.99.0' : '9.9.9');
  process.exit(0);
}
if (tool === 'winget' || tool === 'brew') {
  log(tool + ' ' + args.join(' '));
  if (fails.includes(tool)) { console.error(tool + ': install failed (stub)'); process.exit(1); }
  if (args.includes('Git.Git') || (tool === 'brew' && args[0] === 'install' && args[1] === 'git')) { state.installed.git = true; save(); }
  process.exit(0);
}
if (tool === 'npm') {
  if (args[0] === 'install') {
    log('npm ' + args.join(' '));
    if (has('-g') && has('@github/copilot')) {
      if (fails.includes('npm-global')) { console.error('npm ERR! stub failure'); process.exit(1); }
      state.installed.copilot = true; save();
    }
    if (has('@github/copilot-sdk')) {
      if (fails.includes('npm-sdk')) { console.error('npm ERR! stub failure'); process.exit(1); }
      const d = path.join(process.env.STUB_ROOT, 'node_modules', '@github', 'copilot-sdk');
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'package.json'), '{"name":"@github/copilot-sdk","version":"0.0.0"}');
    }
    process.exit(0);
  }
  const real = path.join(process.env.STUB_NODE_DIR, process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const r = spawnSync('"' + real + '"', args, { stdio: 'inherit', shell: true });
  process.exit(r.status ?? 1);
}
process.exit(2);
`;
const RELAY_MJS = `
import http from 'node:http';
http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ status: 'ready', copilot: process.env.STUB_COPILOT ?? 'signed-in' }));
}).listen(Number(process.env.EDB_RELAY_PORT), '127.0.0.1');
`;
const VERIFY_MJS = `
import fs from 'node:fs';
fs.writeFileSync('verify-called.txt', JSON.stringify(process.argv.slice(2)));
console.log('verify（スタブ）: 合格');
process.exit(Number(process.env.STUB_VERIFY_EXIT ?? 0));
`;

interface Sandbox {
  root: string;
  stubs: string;
  port: number;
}
const sandboxes: string[] = [];

async function makeSandbox(opts: { gitInstalled?: boolean; copilotInstalled?: boolean; sdk?: boolean; distStale?: boolean } = {}): Promise<Sandbox> {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-setup-'));
  sandboxes.push(base);
  const root = path.join(base, 'repo');
  const stubs = path.join(base, 'stubs');
  const port = await freePort();
  const w = (rel: string, text: string, dir = root): void => {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  };
  // 本物のスクリプト（sh は改行を LF にして複製する。作業ツリーが CRLF の Windows でも動かすため）
  w('scripts/setup.ps1', read('scripts', 'setup.ps1'));
  w('scripts/setup.sh', read('scripts', 'setup.sh').replace(/\r\n/g, '\n'));
  w('scripts/setup/helper.mjs', read('scripts', 'setup', 'helper.mjs'));
  // 雛形の最小の複製
  w('package.json', JSON.stringify({
    name: 'sandbox', private: true, type: 'module', version: '0.0.0',
    scripts: { relay: 'node relay-stub.mjs', build: 'node -e "process.exit(0)"', 'verify:pack': 'node verify-stub.mjs' },
  }));
  w('relay-stub.mjs', RELAY_MJS);
  w('verify-stub.mjs', VERIFY_MJS);
  w('examples/mono/public/data/customer.json', '{}');
  w('.env.example', `EDB_RELAY_PORT=${port}\nEDB_AI_API_KEY=\n`);
  if (opts.sdk !== false) w('node_modules/@github/copilot-sdk/package.json', '{"name":"@github/copilot-sdk","version":"0.0.0"}');
  // ビルド済みの dist（ソースより新しい）。distStale のときは、ソースより古い dist（再ビルドが必要）にする
  w('dist/index.html', '<!doctype html>');
  const when = opts.distStale ? new Date(Date.now() - 3_600_000) : new Date(Date.now() + 5_000);
  fs.utimesSync(path.join(root, 'dist', 'index.html'), when, when);
  // 差し替え部品
  w('stub.mjs', STUB_MJS, stubs);
  w('state.json', JSON.stringify({ installed: { git: opts.gitInstalled !== false, copilot: opts.copilotInstalled !== false } }), stubs);
  for (const tool of ['git', 'copilot', 'winget', 'brew', 'npm']) {
    w(`${tool}.cmd`, `@echo off\r\nnode "%~dp0stub.mjs" ${tool} %*\r\nexit /b %ERRORLEVEL%\r\n`, stubs);
    const sh = path.join(stubs, tool);
    w(tool, `#!/bin/sh\nexec node "$(dirname "$0")/stub.mjs" ${tool} "$@"\n`, stubs);
    fs.chmodSync(sh, 0o755);
  }
  return { root, stubs, port };
}

// 同時に動かすスクリプトの数を絞る（ほかのテストと並行して実行されても、機械を飽和させない）
const MAX_PARALLEL = 3;
let running = 0;
const waiting: Array<() => void> = [];
async function acquire(): Promise<void> {
  if (running >= MAX_PARALLEL) await new Promise<void>((res) => waiting.push(res));
  running += 1;
}
function release(): void {
  running -= 1;
  waiting.shift()?.();
}

function runSetup(sb: Sandbox, shell: Shell, args: string[] = [], extraEnv: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  const sep = IS_WIN ? ';' : ':';
  const sys = IS_WIN ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32') : '/usr/bin:/bin';
  const dirs = [sb.stubs, NODE_DIR, shell === 'sh' && IS_WIN ? GIT_USR_BIN : '', shell === 'ps1' ? sys : IS_WIN ? '' : sys].filter(Boolean);
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^path$/i.test(k) && !/^(EDB_|STUB_)/.test(k)) env[k] = v;
  Object.assign(env, { PATH: dirs.join(sep), STUB_ROOT: sb.root, STUB_NODE_DIR: NODE_DIR }, extraEnv);
  const [cmd, argv] = shell === 'ps1'
    ? [POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(sb.root, 'scripts', 'setup.ps1'), ...args]]
    : [BASH, [path.join(sb.root, 'scripts', 'setup.sh'), ...args]];
  // 非同期で実行する（同期で待つと、テストの実行器との通信が止まってタイムアウトする）
  return new Promise((resolve) => {
    void acquire().then(() => {
      const child = spawn(cmd, argv, { cwd: sb.root, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let finished = false;
      const finish = (code: number, extra = ''): void => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        release();
        resolve({ code, out: `${out}${extra}` });
      };
      child.stdout.setEncoding('utf8').on('data', (d: string) => { out += d; });
      child.stderr.setEncoding('utf8').on('data', (d: string) => { out += d; });
      const timer = setTimeout(() => { child.kill(); }, 150_000);
      child.on('close', (code) => finish(code ?? -1));
      child.on('error', (e) => finish(-1, String(e)));
    });
  });
}
const dry = (s: Shell): string[] => (s === 'ps1' ? ['-DryRun'] : ['--dry-run']);
const calls = (sb: Sandbox): string[] => {
  const f = path.join(sb.stubs, 'calls.log');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : [];
};
const setupLog = (sb: Sandbox): string => {
  const f = path.join(sb.root, 'logs', 'setup.log');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
};
const exists = (sb: Sandbox, rel: string): boolean => fs.existsSync(path.join(sb.root, rel));

afterAll(() => {
  for (const b of sandboxes) {
    try { fs.rmSync(b, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* 一時フォルダーの後始末（OS が掃除する）。テストの合否には影響しない */ }
  }
});

describe.each(SHELLS)('セットアップスクリプト（%s）', (shell) => {
  const installerOf = shell === 'ps1' ? 'winget' : 'brew';

  // FR-107 AC-130
  it.concurrent('FR-107 AC-130 すべて導入済みなら、何も導入せず「導入済み」と表示し、.env の作成・中継の疎通・verify まで行って成功で終了する', async () => {
    const sb = await makeSandbox();
    const r = await runSetup(sb, shell);
    expect(r.code, r.out).toBe(0);
    for (const name of ['Node.js LTS', 'Git', 'GitHub Copilot CLI', '依存パッケージ（npm）', 'Copilot SDK', 'アプリのビルド']) {
      expect(r.out, name).toMatch(new RegExp(`${name.replace(/[()（）.]/g, '.')}.*: 導入済み`));
    }
    expect(calls(sb), '何も導入しない').toEqual([]);
    expect(fs.readFileSync(path.join(sb.root, '.env'), 'utf8')).toBe(fs.readFileSync(path.join(sb.root, '.env.example'), 'utf8'));
    expect(r.out).toContain('疎通 OK');
    expect(r.out).toContain('サインイン済み');
    const verify = JSON.parse(fs.readFileSync(path.join(sb.root, 'verify-called.txt'), 'utf8')) as string[];
    expect(verify[0]).toMatch(/setup-verify$/);
    // お手本パック（examples/mono/public）が verify の作業フォルダーに用意されている
    expect(exists(sb, 'work/setup-verify/public/data/customer.json')).toBe(true);
    expect(exists(sb, 'work/setup-verify/dist/index.html')).toBe(true);
    expect(r.out).toContain('セットアップが成功しました');
  });

  // FR-107 AC-130: Copilot にサインインしていないときは、注意を表示して成功で終了する（モックで動く）
  it.concurrent('FR-107 AC-130 Copilot にサインインしていないときは、案内を表示して成功で終了する', async () => {
    const sb = await makeSandbox();
    const r = await runSetup(sb, shell, [], { STUB_COPILOT: 'signed-out' });
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('サインインしていません');
    expect(r.out).toContain('/login');
  });

  // FR-108 AC-132
  it.concurrent('FR-108 AC-132 2 回続けて実行すると、2 回目は何も変更せずに成功し、.env の内容が変わらない。実行前に行う内容の一覧が表示される', async () => {
    const sb = await makeSandbox({ gitInstalled: false, copilotInstalled: false });
    const first = await runSetup(sb, shell);
    expect(first.code, first.out).toBe(0);
    expect(first.out).toContain('行う内容');
    expect(first.out.indexOf('行う内容')).toBeLessThan(first.out.indexOf('[1/10]'));
    expect(calls(sb).length, '1 回目は不足分を導入する').toBeGreaterThan(0);
    // 利用者が .env を編集していても、保持される
    const envFile = path.join(sb.root, '.env');
    fs.appendFileSync(envFile, 'EDB_AI_API_KEY=user-value\n');
    const envBefore = fs.readFileSync(envFile, 'utf8');
    const callsBefore = calls(sb);
    const second = await runSetup(sb, shell);
    expect(second.code, second.out).toBe(0);
    expect(calls(sb), '2 回目は何も導入しない').toEqual(callsBefore);
    expect(fs.readFileSync(envFile, 'utf8')).toBe(envBefore);
    // 導入・作成の段階（1〜8）は「導入済み」で終わり、実行しない（9・10 は毎回、確認のために実行する）
    expect(second.out).not.toMatch(/\[[1-8]\/10\] .*: 実行します/);
    expect(second.out).toMatch(/Git: 導入済み/);
  });

  // FR-108 AC-132
  it.concurrent('FR-108 AC-132 表示だけの指定（A-09）では、一覧と現在の状態を表示するだけで、何も変更しない', async () => {
    const sb = await makeSandbox({ gitInstalled: false, copilotInstalled: false, sdk: false });
    const r = await runSetup(sb, shell, dry(shell));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('行う内容');
    expect(r.out).toContain('何も変更していません');
    expect(r.out).toMatch(/Git: 未導入/);
    expect(calls(sb)).toEqual([]);
    expect(exists(sb, '.env')).toBe(false);
    expect(exists(sb, 'logs')).toBe(false);
    expect(exists(sb, 'work')).toBe(false);
    expect(exists(sb, 'verify-called.txt')).toBe(false);
    expect(exists(sb, 'node_modules/@github/copilot-sdk/package.json')).toBe(false);
  });

  // FR-107 AC-130: 不足分だけを導入する
  it.concurrent('FR-107 AC-130 Git・Copilot CLI・Copilot SDK が未導入なら、その分だけを導入する（管理者権限を使わない既定の導入先）', async () => {
    const sb = await makeSandbox({ gitInstalled: false, copilotInstalled: false, sdk: false });
    const r = await runSetup(sb, shell);
    expect(r.code, r.out).toBe(0);
    const c = calls(sb);
    expect(c.some((l) => l.startsWith(`${installerOf} install`) && l.includes(shell === 'ps1' ? 'Git.Git' : ' git'))).toBe(true);
    expect(c).toContain('npm install -g @github/copilot');
    expect(c.some((l) => l.startsWith('npm install') && l.includes('--no-save') && l.endsWith('@github/copilot-sdk'))).toBe(true);
    // Node.js・依存パッケージ（導入済み）は導入しない
    expect(c.some((l) => /node/i.test(l) && l.startsWith(installerOf))).toBe(false);
    if (shell === 'ps1') expect(c.find((l) => l.startsWith('winget'))).toContain('--scope user');
    expect(exists(sb, 'node_modules/@github/copilot-sdk/package.json')).toBe(true);
  });

  // FR-108 AC-133
  it.concurrent('FR-108 AC-133 導入の途中の段階が失敗すると、原因と対処を表示して 0 以外で止まり、logs/setup.log に失敗した段階が残る', async () => {
    const sb = await makeSandbox({ copilotInstalled: false });
    const r = await runSetup(sb, shell, [], { STUB_FAIL: 'npm-global' });
    expect(r.code, r.out).not.toBe(0);
    expect(r.out, r.out).toContain('失敗: [3/10] GitHub Copilot CLI');
    expect(r.out).toMatch(/原因: .*GitHub Copilot CLI の導入/);
    expect(r.out).toMatch(/対処: /);
    expect(setupLog(sb)).toContain('失敗: [3/10] GitHub Copilot CLI');
    expect(setupLog(sb)).toContain('原因:');
    // 失敗した段階より後は実行しない
    expect(exists(sb, 'verify-called.txt')).toBe(false);
    expect(exists(sb, '.env')).toBe(false);
  });

  // FR-108 AC-133
  it.concurrent('FR-108 AC-133 verify が不合格なら、原因と対処を表示して 0 以外で止まる', async () => {
    const sb = await makeSandbox();
    const r = await runSetup(sb, shell, [], { STUB_VERIFY_EXIT: '1' });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('失敗: [10/10] お手本パックでの起動確認（verify）');
    expect(setupLog(sb)).toContain('失敗: [10/10]');
  });

  // FR-108 AC-133
  it.concurrent('FR-108 AC-133 中継プロセスが応答しない（ポートが使用中で別のプログラム）ときは、原因と対処を表示して止まる', async () => {
    const sb = await makeSandbox();
    // /health に応答しないサーバーでポートをふさぐ
    const blocker = net.createServer((s) => s.destroy());
    await new Promise<void>((res) => blocker.listen(sb.port, '127.0.0.1', res));
    try {
      const r = await runSetup(sb, shell, [], { EDB_SETUP_RELAY_WAIT_MS: '3000' });
      expect(r.code).not.toBe(0);
      expect(r.out).toContain('失敗: [9/10]');
      expect(r.out).toMatch(/対処: /);
    } finally {
      await new Promise<void>((res) => blocker.close(() => res()));
    }
  });

  // FR-108 AC-133
  it.concurrent('FR-108 AC-133 Node.js が必要な版に満たず、導入しても満たさないときは、原因と対処を表示して止まる', async () => {
    const sb = await makeSandbox();
    const r = await runSetup(sb, shell, [], { EDB_SETUP_NODE_MIN: '99' });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('失敗: [1/10]');
    expect(calls(sb).some((l) => l.startsWith(installerOf) && /node/i.test(l))).toBe(true);
    expect(setupLog(sb)).toContain('失敗: [1/10]');
  });

  // FR-107 AC-130: 古い dist（ソースより前にビルドしたもの）のままで verify しない
  it.concurrent('FR-107 AC-130 dist がソースより古いときだけ、アプリをビルドし直す', async () => {
    const sb = await makeSandbox({ distStale: true });
    const r = await runSetup(sb, shell);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/\[7\/10\] アプリのビルド（dist）: 実行します/);
    expect(r.out).toMatch(/\[7\/10\] アプリのビルド（dist）: 完了/);
  });

  // FR-108 AC-133
  it.concurrent(`FR-108 AC-133 導入に使う ${installerOf} が見つからないときは、手動での導入を案内して止まる`, async () => {
    const sb = await makeSandbox({ gitInstalled: false });
    fs.rmSync(path.join(sb.stubs, `${installerOf}.cmd`));
    fs.rmSync(path.join(sb.stubs, installerOf));
    const r = await runSetup(sb, shell);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('失敗: [2/10] Git');
    expect(r.out).toMatch(/対処: .*手動で/);
  });
});

// FR-108 AC-133（静的検査）: スクリプトに認証情報の値を含めない。管理者権限・外部への送信をしない
describe('セットアップスクリプトの静的検査', () => {
  const FILES = ['scripts/setup.ps1', 'scripts/setup.sh', 'scripts/setup/helper.mjs'];
  const SECRET_PATTERNS: [string, RegExp][] = [
    ['GitHub のトークン', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/],
    ['GitHub の fine-grained トークン', /github_pat_[A-Za-z0-9_]{20,}/],
    ['API キー（sk-）', /\bsk-[A-Za-z0-9_-]{20,}/],
    ['AWS のアクセスキー', /\bAKIA[0-9A-Z]{16}\b/],
    ['秘密鍵', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['値つきの認証情報の代入', /\b(api[_-]?key|token|password|passwd|secret|credential)\b\s*[:=]\s*['"][^'"\s$]{6,}['"]/i],
    ['認証ヘッダー', /authorization\s*[:=]\s*['"]?(bearer|basic)\s+[A-Za-z0-9._-]{8,}/i],
    ['認証情報つきの URL', /https?:\/\/[^\s/:@]+:[^\s/@]+@/],
  ];

  // FR-108 AC-133
  it.each(FILES)('FR-108 AC-133 %s に認証情報の値が含まれていない', (f) => {
    const text = read(...f.split('/'));
    for (const [name, re] of SECRET_PATTERNS) expect(re.test(text), `${f} に ${name} がある`).toBe(false);
  });

  // FR-108 AC-133
  it.concurrent('FR-108 AC-133 .env の雛形に認証情報の値が入っていない', () => {
    const env = read('.env.example');
    for (const line of env.split(/\r?\n/)) {
      const m = /^\s*(EDB_AI_API_KEY)\s*=\s*(.*)$/.exec(line);
      if (m) expect(m[2]!.trim(), '.env.example の API キーは空').toBe('');
    }
  });

  // FR-108 AC-133: 外部への送信をしない（データを送るコマンドを使わず、通信先は 127.0.0.1 の中継プロセスだけ）
  it.each(FILES)('FR-108 AC-133 %s は外部へデータを送信しない', (f) => {
    const text = read(...f.split('/'));
    expect(text).not.toMatch(/\b(Invoke-WebRequest|Invoke-RestMethod|iwr|irm|curl|wget|nc|ncat|scp|sftp|ftp)\b/i);
    expect(text).not.toMatch(/\bfetch\s*\(/);
    expect(text).not.toMatch(/https?\.request\s*\(/);
    const hosts = [...text.matchAll(/https?:\/\/([^\s/'"`）)]+)/g)].map((m) => m[1]);
    const allowed = new Set(['nodejs.org', 'git-scm.com', 'brew.sh']);
    for (const h of hosts) expect(allowed.has(h!), `${f} に想定外の URL ${h}`).toBe(true);
    // 通信を行うのは 127.0.0.1 の /health だけ
    if (f.endsWith('helper.mjs')) expect(text).toMatch(/host: '127\.0\.0\.1'/);
  });

  // FR-108 AC-132: 管理者権限を必要としない
  it.each(FILES)('FR-108 AC-132 %s は管理者権限を要求しない', (f) => {
    const text = read(...f.split('/'));
    expect(text).not.toMatch(/-Verb\s+RunAs|#requires\s+-RunAsAdministrator|\bsudo\s+-?[a-z]/i);
    expect(text).not.toMatch(/--scope\s+machine/i);
  });

  // FR-108 AC-132 AC-133: 実行内容の事前表示・表示だけの指定・ログへの記録を備える
  it.concurrent('FR-108 AC-132 AC-133 事前表示・表示だけの指定・logs/setup.log への記録を備える', () => {
    const ps = read('scripts', 'setup.ps1');
    const sh = read('scripts', 'setup.sh');
    expect(ps).toContain('$DryRun');
    expect(sh).toContain('--dry-run');
    for (const t of [ps, sh]) {
      expect(t).toContain('行う内容');
      expect(t).toMatch(/logs[\\/]setup\.log/);
      expect(t).toContain('原因:');
      expect(t).toContain('対処:');
    }
  });

  // FR-107: Windows PowerShell 5.1 は BOM なしの UTF-8 を ANSI として読むので、日本語を含む .ps1 は BOM つきにする
  it.concurrent('FR-107 setup.ps1 は BOM つきの UTF-8（Windows PowerShell 5.1 でも日本語が文字化けしない）', () => {
    const b = fs.readFileSync(path.join(REPO, 'scripts', 'setup.ps1'));
    expect([b[0], b[1], b[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  // FR-107: PowerShell は Windows、シェルは macOS
  it.concurrent('FR-107 Windows は PowerShell、macOS はシェルスクリプトで提供し、README と配布の説明から案内している', () => {
    expect(fs.existsSync(path.join(REPO, 'scripts', 'setup.ps1'))).toBe(true);
    expect(read('scripts', 'setup.sh').startsWith('#!/usr/bin/env bash')).toBe(true);
    const readme = read('README.md');
    expect(readme).toContain('scripts\\setup.ps1');
    expect(readme).toContain('scripts/setup.sh');
  });
});

// NFR-MAINT-003 AC-184（見出しの確認。README の手順どおりの起動は docs/manual-tests.md の手順で確かめる）
describe('README', () => {
  // NFR-MAINT-003 AC-184
  it('NFR-MAINT-003 AC-184 README に 6 つの手順・概要の見出しがある', () => {
    const headings = read('README.md').split(/\r?\n/).filter((l) => /^##\s/.test(l));
    for (const h of [
      /セットアップスクリプトの使い方/,
      /起動手順/,
      /ブランド調査結果の概要（出典つき）/,
      /ブランド（色・ロゴ・フォント・BGM）の差し替え手順/,
      /顧客パックの作成手順/,
      /iPad 実機での確認手順/,
    ]) expect(headings.some((l) => h.test(l)), `${h} の見出し`).toBe(true);
  });

  // NFR-MAINT-003 AC-184: ブランド調査結果の概要に出典（URL）がある
  it('NFR-MAINT-003 AC-184 ブランド調査結果の概要に、出典の URL がある', () => {
    const text = read('README.md');
    const sec = text.slice(text.indexOf('## 3. ブランド調査結果の概要'), text.indexOf('## 4.'));
    expect(sec.match(/https:\/\/[^\s)]+/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  // NFR-ENV-001: 対応ブラウザーと端末を明記する
  it('NFR-ENV-001 README に対応ブラウザー（Edge・Chrome・iPad の Safari）を明記している', () => {
    const text = read('README.md');
    expect(text).toMatch(/Edge/);
    expect(text).toMatch(/Chrome/);
    expect(text).toMatch(/iPad の Safari/);
  });
});
