// Microsoft Foundry の接続情報（エンドポイント・デプロイ名・API キー）の保管庫（FR-275・NFR-SEC-005）。中継プロセスの中だけで使う。
// - AES-256-GCM で暗号化して、利用者の PC のデータフォルダー（リポジトリの外＝git の管理対象外）にだけ置く。マスター鍵の保護は音声合成の保管庫と同じ。
// - 平文のキーは、保存時の受け取りと接続先への送信の瞬間だけメモリーに現れる。画面・応答・ログ・エラーには出さない。
// - 毎回ファイルから読むので、変更・削除は再起動なしで次の呼び出しから効く（FR-275 AC-705）。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defaultDataDir, defaultKeyProtector, isAllowedEndpoint, maskKey, restrictToCurrentUser, type VaultOptions } from './speech-vault';

export interface FoundrySettingsView {
  configured: boolean;
  endpoint: string;
  host: string;
  deployment: string;
  /** 認証方式（FR-282）。API キー方式は 'api-key'、Microsoft Entra ID 方式は 'entra' */
  authMode: AuthMode;
  /** 伏せ字。値そのものは返さない */
  keyMask: string;
}

export type AuthMode = 'api-key' | 'entra';
interface Stored { endpoint: string; deployment: string; key: string; authMode?: AuthMode }

export interface FoundryVault {
  view(): FoundrySettingsView;
  /** key を省略すると、保存済みのキーを変えずにエンドポイント・デプロイ名だけ更新する */
  save(input: { endpoint: string; deployment: string; key?: string; authMode?: AuthMode }): FoundrySettingsView;
  remove(): void;
  /** 接続先へ送るための値。中継の内部だけで使う */
  secret(): { endpoint: string; deployment: string; key: string; authMode: AuthMode } | null;
}

export function openFoundryVault(dataDir: string = defaultDataDir(), opts: VaultOptions = {}): FoundryVault {
  const dataFile = path.join(dataDir, 'foundry.enc');
  const keyFile = path.join(dataDir, 'master.key');
  const protector = opts.protector ?? defaultKeyProtector();
  const restrict = opts.restrict ?? restrictToCurrentUser;
  const warn = opts.warn ?? ((m: string) => console.warn(`[foundry-vault] ${m}`));
  let cached: Buffer | null = null;
  const harden = (target: string, isDir: boolean): void => {
    try { restrict(target, isDir); } catch (e) { warn(`アクセス権の絞り込みに失敗しました（${path.basename(target)}）: ${(e as Error).message.split('\n')[0]}`); }
  };
  const masterKey = (create: boolean): Buffer | null => {
    if (cached) return cached;
    if (fs.existsSync(keyFile)) {
      const j = JSON.parse(fs.readFileSync(keyFile, 'utf8')) as { method: string; wrapped: string };
      if (j.method !== protector.name) throw new Error(`鍵の保護方式が異なります（${j.method}）`);
      return (cached = protector.unwrap(j.wrapped));
    }
    if (!create) return null;
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    harden(dataDir, true);
    const k = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, JSON.stringify({ v: 2, method: protector.name, wrapped: protector.wrap(k) }), { mode: 0o600 });
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
      return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')) as Stored;
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
  const toView = (s: Stored | null): FoundrySettingsView => {
    const authMode: AuthMode = s?.authMode === 'entra' ? 'entra' : 'api-key';
    if (!s || (authMode === 'api-key' && !s.key)) return { configured: false, endpoint: s?.endpoint ?? '', host: '', deployment: s?.deployment ?? '', authMode, keyMask: '' };
    let host = '';
    try { host = new URL(s.endpoint).host; } catch { /* 空のまま */ }
    return { configured: !!host && !!s.deployment, endpoint: s.endpoint, host, deployment: s.deployment, authMode, keyMask: authMode === 'entra' || !s.key ? '' : maskKey(s.key) };
  };

  return {
    view: () => toView(load()),
    save(input) {
      if (!isAllowedEndpoint(input.endpoint)) throw new Error('エンドポイントは https の URL（または手元の localhost）で入力してください');
      const deployment = input.deployment.trim();
      if (!deployment) throw new Error('デプロイ名を入力してください');
      const cur = load();
      const authMode: AuthMode = input.authMode === 'entra' ? 'entra' : 'api-key';
      const key = authMode === 'entra' ? '' : input.key !== undefined && input.key.trim() !== '' ? input.key.trim() : cur?.key;
      if (authMode === 'api-key' && !key) throw new Error('API キーを入力してください');
      const next: Stored = { endpoint: input.endpoint.trim(), deployment, key: key ?? '', authMode };
      store(next);
      return toView(next);
    },
    remove() { fs.rmSync(dataFile, { force: true }); },
    secret() {
      const s = load();
      const authMode: AuthMode = s?.authMode === 'entra' ? 'entra' : 'api-key';
      return s && (authMode === 'entra' || s.key) && s.deployment && isAllowedEndpoint(s.endpoint) ? { endpoint: s.endpoint, deployment: s.deployment, key: s.key, authMode } : null;
    },
  };
}
