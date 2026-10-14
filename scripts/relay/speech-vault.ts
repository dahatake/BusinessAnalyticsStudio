// 音声合成の API キーの保管庫（FR-168・NFR-SEC-005）。中継プロセスの中だけで使う。
// - AES-256-GCM で暗号化して、利用者の PC のデータフォルダー（既定はホーム直下。リポジトリの外＝git の管理対象外）にだけ置く。
// - 平文のキーは、保存時の受け取りと接続先への送信の瞬間だけメモリーに現れる。画面・応答・ログ・エラーには出さない。
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface SpeechSettingsView {
  configured: boolean;
  endpoint: string;
  host: string;
  region: string;
  /** 伏せ字。長いキーのときだけ末尾 4 文字を添える。値そのものは返さない */
  keyMask: string;
}

interface Stored {
  endpoint: string;
  region: string;
  key: string;
}

export interface SpeechVault {
  view(): SpeechSettingsView;
  /** key を省略すると、保存済みのキーを変えずに接続先・リージョンだけ更新する */
  save(input: { endpoint: string; region?: string; key?: string }): SpeechSettingsView;
  remove(): void;
  /** 接続先へ送るための値。中継の内部だけで使う */
  secret(): { endpoint: string; key: string } | null;
}

export function isAllowedEndpoint(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'));
  } catch {
    return false;
  }
}

export function maskKey(key: string): string {
  return key.length >= 16 ? `${'•'.repeat(12)}${key.slice(-4)}` : '•'.repeat(12);
}

export function defaultDataDir(): string {
  return process.env.EDB_RELAY_DATA || path.join(os.homedir(), '.ebak-relay');
}

/** マスター鍵を OS の鍵保護でラップ／展開する。wrap の戻り値だけがディスクの鍵ファイルに残る */
export interface KeyProtector {
  readonly name: string;
  /** true のとき、OS の保護がなく鍵ファイルのアクセス権だけが頼り（起動時に警告する） */
  readonly weak?: boolean;
  wrap(key: Buffer): string;
  unwrap(wrapped: string): Buffer;
}

const KC_SERVICE = 'ebak-relay-speech';
const run = (cmd: string, args: string[], input?: string): string =>
  execFileSync(cmd, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }).trim();

/** Windows: DPAPI（CurrentUser）。鍵は stdin で渡し、引数には出さない */
export const dpapiProtector: KeyProtector = (() => {
  const ps = (mode: 'Protect' | 'Unprotect', b64: string) =>
    run('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      `Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); ` +
      `[Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::${mode}($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser))`], b64);
  return {
    name: 'dpapi',
    wrap: (k) => ps('Protect', k.toString('base64')),
    unwrap: (w) => Buffer.from(ps('Unprotect', w), 'base64'),
  };
})();

/** macOS: Keychain（鍵そのものを Keychain に置き、ファイルには参照だけ） */
export const keychainProtector: KeyProtector = {
  name: 'keychain',
  wrap(k) {
    run('security', ['add-generic-password', '-U', '-a', os.userInfo().username, '-s', KC_SERVICE, '-w', k.toString('base64')]);
    return 'keychain-ref';
  },
  unwrap: () => Buffer.from(run('security', ['find-generic-password', '-a', os.userInfo().username, '-s', KC_SERVICE, '-w']), 'base64'),
};

/** Linux: secret-tool（libsecret）。鍵は stdin で渡す */
export const secretToolProtector: KeyProtector = {
  name: 'secret-tool',
  wrap(k) {
    run('secret-tool', ['store', '--label=EBAK relay speech master key', 'service', KC_SERVICE], k.toString('base64'));
    return 'secret-tool-ref';
  },
  unwrap: () => Buffer.from(run('secret-tool', ['lookup', 'service', KC_SERVICE]), 'base64'),
};

/** OS の保護が使えないとき。0600 の鍵ファイルだけが頼り（残りリスク。docs に明記） */
export const fileProtector: KeyProtector = {
  name: 'file', weak: true,
  wrap: (k) => k.toString('base64'),
  unwrap: (w) => Buffer.from(w, 'base64'),
};

export function defaultKeyProtector(): KeyProtector {
  if (process.platform === 'win32') return dpapiProtector;
  if (process.platform === 'darwin') return keychainProtector;
  try { run('secret-tool', ['--version']); return secretToolProtector; } catch { return fileProtector; }
}

/** Windows: 継承を外し、現在のユーザーだけに許可する。失敗しても動作は止めず警告だけ */
export function restrictToCurrentUser(target: string, isDir: boolean): void {
  if (process.platform !== 'win32') return;
  const user = process.env.USERNAME || os.userInfo().username;
  run('icacls', [target, '/inheritance:r', '/grant:r', `${user}:${isDir ? '(OI)(CI)F' : 'F'}`]);
}

export interface VaultOptions {
  protector?: KeyProtector;
  /** 権限の絞り込み。既定は Windows の icacls（ほかの OS では mode に任せる）。差し替え可能 */
  restrict?: (target: string, isDir: boolean) => void;
  warn?: (msg: string) => void;
}

export function openSpeechVault(dataDir: string = defaultDataDir(), opts: VaultOptions = {}): SpeechVault {
  const dataFile = path.join(dataDir, 'speech.enc');
  const keyFile = path.join(dataDir, 'master.key');
  const protector = opts.protector ?? defaultKeyProtector();
  const restrict = opts.restrict ?? restrictToCurrentUser;
  const warn = opts.warn ?? ((m: string) => console.warn(`[speech-vault] ${m}`));
  let cached: Buffer | null = null;
  if (protector.weak) warn('OS の鍵保護（DPAPI / Keychain / secret-tool）が使えないため、マスター鍵は 0600 のファイルで保護します。同じアカウントで動く他のプロセスから読める残りリスクがあります');

  const harden = (target: string, isDir: boolean): void => {
    try { restrict(target, isDir); } catch (e) { warn(`アクセス権の絞り込みに失敗しました（${path.basename(target)}）: ${(e as Error).message.split('\n')[0]}`); }
  };

  const masterKey = (create: boolean): Buffer | null => {
    if (cached) return cached;
    if (fs.existsSync(keyFile)) {
      const j = JSON.parse(fs.readFileSync(keyFile, 'utf8')) as { v: number; method: string; wrapped: string };
      if (j.method !== protector.name) throw new Error(`鍵の保護方式が異なります（${j.method}）`);
      return (cached = protector.unwrap(j.wrapped));
    }
    if (!create) return null;
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    harden(dataDir, true);
    const k = crypto.randomBytes(32);
    const wrapped = protector.wrap(k);
    fs.writeFileSync(keyFile, JSON.stringify({ v: 2, method: protector.name, wrapped }), { mode: 0o600 });
    harden(keyFile, false);
    return (cached = k);
  };
  const load = (): Stored | null => {
    try {
      const mk = masterKey(false);
      if (!mk || !fs.existsSync(dataFile)) return null;
      const raw = Buffer.from(fs.readFileSync(dataFile, 'utf8'), 'base64');
      const d = crypto.createDecipheriv('aes-256-gcm', mk, raw.subarray(0, 12));
      d.setAuthTag(raw.subarray(12, 28));
      const plain = Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
      return JSON.parse(plain) as Stored;
    } catch {
      return null;
    }
  };

  const store = (s: Stored): void => {
    const mk = masterKey(true) as Buffer;
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', mk, iv);
    const enc = Buffer.concat([c.update(JSON.stringify(s), 'utf8'), c.final()]);
    fs.writeFileSync(dataFile, Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64'), { mode: 0o600 });
        harden(dataFile, false);
      };

  const toView = (s: Stored | null): SpeechSettingsView => {
    if (!s || !s.key) return { configured: false, endpoint: s?.endpoint ?? '', host: '', region: s?.region ?? '', keyMask: '' };
    let host = '';
    try { host = new URL(s.endpoint).host; } catch { /* 空のまま */ }
    return { configured: !!host, endpoint: s.endpoint, host, region: s.region, keyMask: maskKey(s.key) };
  };

  return {
    view: () => toView(load()),
    save(input) {
      if (!isAllowedEndpoint(input.endpoint)) throw new Error('接続先は https の URL（または手元の localhost）で入力してください');
      const cur = load();
      const key = input.key !== undefined && input.key.trim() !== '' ? input.key.trim() : cur?.key;
      if (!key) throw new Error('API キーを入力してください');
      const next: Stored = { endpoint: input.endpoint, region: (input.region ?? '').trim(), key };
      store(next);
      return toView(next);
    },
    remove() {
      fs.rmSync(dataFile, { force: true });
    },
    secret() {
      const s = load();
      return s && s.key && isAllowedEndpoint(s.endpoint) ? { endpoint: s.endpoint, key: s.key } : null;
    },
  };
}

