// 音声合成の API キーの保管庫（FR-168・NFR-SEC-005）。中継プロセスの中だけで使う。
// - AES-256-GCM で暗号化して、利用者の PC のデータフォルダー（既定はホーム直下。リポジトリの外＝git の管理対象外）にだけ置く。
// - 平文のキーは、保存時の受け取りと接続先への送信の瞬間だけメモリーに現れる。画面・応答・ログ・エラーには出さない。
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

export function openSpeechVault(dataDir: string = defaultDataDir()): SpeechVault {
  const dataFile = path.join(dataDir, 'speech.enc');
  const keyFile = path.join(dataDir, 'master.key');

  const masterKey = (create: boolean): Buffer | null => {
    if (fs.existsSync(keyFile)) return Buffer.from(fs.readFileSync(keyFile, 'utf8'), 'base64');
    if (!create) return null;
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const k = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, k.toString('base64'), { mode: 0o600 });
    return k;
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
