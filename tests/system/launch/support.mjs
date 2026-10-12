// FR-141 起動スクリプトのテスト用の共通部品。
// 要求定義書の受入基準だけから作った。スクリプトの内部実装には依存せず、「npm に何が呼ばれたか」「出力」「exit code」だけを見る。
// 方法: 一時ディレクトリにルートの起動スクリプトをコピーし、PATH の先頭に偽の npm を置く（実際の npm は走らせない）。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..', '..');
export const isWin = process.platform === 'win32';
export const scriptName = isWin ? 'start.cmd' : 'start.sh';
export const scriptFiles = ['start.cmd', 'start.ps1', 'start.sh'];

/** 偽の npm の本体。呼び出しを FAKE_NPM_LOG に 1 行ずつ追記し、install/build は成果物を作る。 */
const shimMjs = `
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const cmd = args.join(' ');
fs.appendFileSync(process.env.FAKE_NPM_LOG, cmd + '\\n');
const failOn = (process.env.FAKE_NPM_FAIL || '').split(',').filter(Boolean);
const key = args[0] === 'run' ? args[1] : args[0];
if (failOn.includes(key)) {
  console.error('npm ERR! simulated failure of ' + key + ' (FAKE-CAUSE-' + key.toUpperCase() + ')');
  process.exit(1);
}
if (key === 'install' || key === 'ci') fs.mkdirSync(path.join(process.cwd(), 'node_modules'), { recursive: true });
if (key === 'build') { fs.mkdirSync(path.join(process.cwd(), 'dist'), { recursive: true }); fs.writeFileSync(path.join(process.cwd(), 'dist', 'index.html'), '<html></html>'); }
if (key === 'start') console.log('  Local:   http://127.0.0.1:4173/');
process.exit(0);
`;

/**
 * 一時ディレクトリを作る。node_modules / dist の有無を指定できる。
 * @param {{nodeModules:boolean, dist:boolean}} state
 */
export function makeSandbox(state) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bas-start-'));
  for (const f of scriptFiles) {
    const src = path.join(repoRoot, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, f));
  }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'sandbox', version: '0.0.0' }));
  if (state.nodeModules) fs.mkdirSync(path.join(dir, 'node_modules'));
  if (state.dist) {
    fs.mkdirSync(path.join(dir, 'dist'));
    fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<html></html>');
  }
  const bin = path.join(dir, '.fakebin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'shim.mjs'), shimMjs);
  const node = JSON.stringify(process.execPath);
  if (isWin) {
    fs.writeFileSync(path.join(bin, 'npm.cmd'), `@echo off\r\n${node} "%~dp0shim.mjs" %*\r\nexit /b %ERRORLEVEL%\r\n`);
  } else {
    const p = path.join(bin, 'npm');
    fs.writeFileSync(p, `#!/bin/sh\nexec ${node} "$(dirname "$0")/shim.mjs" "$@"\n`);
    fs.chmodSync(p, 0o755);
    const sh = path.join(dir, 'start.sh');
    if (fs.existsSync(sh)) fs.chmodSync(sh, 0o755);
  }
  return { dir, bin, log: path.join(dir, 'npm-calls.log') };
}

/** 起動スクリプトを実行して、npm の呼び出し順・出力・exit code を返す。 */
export function runScript(sb, { fail = [] } = {}) {
  const env = {
    ...process.env,
    PATH: sb.bin + path.delimiter + process.env.PATH,
    FAKE_NPM_LOG: sb.log,
    FAKE_NPM_FAIL: fail.join(','),
  };
  const r = isWin
    ? spawnSync('cmd.exe', ['/c', scriptName], { cwd: sb.dir, env, encoding: 'utf8', timeout: 120_000, input: '\n' })
    : spawnSync('bash', [scriptName], { cwd: sb.dir, env, encoding: 'utf8', timeout: 120_000 });
  const calls = fs.existsSync(sb.log) ? fs.readFileSync(sb.log, 'utf8').split(/\r?\n/).filter(Boolean) : [];
  return { status: r.status, output: `${r.stdout ?? ''}\n${r.stderr ?? ''}`, calls, error: r.error };
}

export function cleanup(sb) {
  fs.rmSync(sb.dir, { recursive: true, force: true });
}

/** 実際のリポジトリルートで起動スクリプトを走らせ、URL が出るまで待つ。 */
export async function startReal(timeoutMs = 240_000) {
  const child = isWin
    ? spawn('cmd.exe', ['/c', scriptName], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    : spawn('bash', [scriptName], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let output = '';
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('URL が表示されない:\n' + output.slice(-2000))), timeoutMs);
    const onData = (d) => {
      output += d.toString();
      const m = output.match(/https?:\/\/127\.0\.0\.1:\d+\/?/);
      if (m) { clearTimeout(timer); resolve(m[0]); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`URL 表示前に終了 code=${code}\n` + output.slice(-2000))); });
  });
  const stop = () => {
    child.removeAllListeners('exit');
    if (isWin) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F']);
    else { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* 終了済み */ } }
  };
  return { url, output: () => output, stop };
}

/** LAN 側（内部でない IPv4）のアドレス一覧。 */
export function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}
