// Microsoft Entra ID のアクセストークン取得部品（FR-282 AC-761）。中継プロセスだけが使う。
// - Azure CLI のサインインを使う: `az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv`
// - child_process.execFile（シェルを使わない）・タイムアウトつき。トークンの値はログ・エラーに出さない。
// - 取得に失敗したら、値を含まない一般的なエラーを投げる（呼び出し側が「トークンを取得できませんでした」と az login の案内にする）。
import { execFile } from 'node:child_process';
import type { TokenProvider } from './foundry';

export const FOUNDRY_TOKEN_RESOURCE = 'https://cognitiveservices.azure.com';
export const TOKEN_CACHE_MS = 5 * 60_000;
export const TOKEN_TIMEOUT_MS = 20_000;

export type ExecFn = (file: string, args: string[], opts: { timeout: number; windowsHide: boolean; shell: false }) => Promise<string>;

const defaultExec: ExecFn = (file, a, opts) => new Promise((resolve, reject) => {
  // Windows の az は az.cmd（.cmd は直接 execFile できない）。固定の引数だけを cmd.exe /c に渡す（利用者の入力は含めない・shell オプションは使わない）
  const [bin, args] = process.platform === 'win32' && file === 'az' ? ['cmd.exe', ['/d', '/s', '/c', 'az', ...a]] as const : [file, a] as const;
  execFile(bin, [...args], { ...opts, maxBuffer: 64 * 1024, encoding: 'utf8' }, (err, stdout) => (err ? reject(new Error('az command failed')) : resolve(stdout)));
});

export function createAzCliTokenProvider(o: { exec?: ExecFn; now?: () => number; cacheMs?: number; timeoutMs?: number } = {}): TokenProvider {
  const exec = o.exec ?? defaultExec;
  const now = o.now ?? Date.now;
  const cacheMs = o.cacheMs ?? TOKEN_CACHE_MS;
  let cached: { token: string; at: number } | null = null;
  return async () => {
    if (cached && now() - cached.at < cacheMs) return cached.token;
    let out: string;
    try {
      out = await exec('az', ['account', 'get-access-token', '--resource', FOUNDRY_TOKEN_RESOURCE, '--query', 'accessToken', '-o', 'tsv'], { timeout: o.timeoutMs ?? TOKEN_TIMEOUT_MS, windowsHide: true, shell: false });
    } catch {
      throw new Error('token unavailable');
    }
    const token = out.trim();
    if (!token) throw new Error('token unavailable');
    cached = { token, at: now() };
    return token;
  };
}
