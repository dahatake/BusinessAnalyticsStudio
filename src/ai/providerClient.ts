// FR-275 / FR-011: settings requests stay on the loopback relay; never persist secrets in browser storage.
import { isLoopbackUrl } from './client';
import { notifyFoundryChanged } from './foundryClient';
export type Provider = 'foundry' | 'copilot';
export interface CopilotView { authMethod: 'signin' | 'token'; model: string; tokenConfigured: boolean; tokenMask: string; signedIn: boolean }
export interface SigninView { status: string; signedIn: boolean; code?: string; url?: string; message: string }
export async function providerRequest<T>(relay: string | undefined, path: string, method = 'GET', input?: unknown): Promise<T> {
  if (!relay || !isLoopbackUrl(relay)) throw new Error('ローカルの中継プロセスを起動してください');
  let r: Response;
  try { r = await fetch(`${relay}${path}`, { method, ...(input === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }) }); }
  catch { throw new Error('中継プロセスに接続できませんでした'); }
  // Never surface upstream/raw bodies (could contain a token).
  if (!r.ok) throw new Error('設定・認証を更新できませんでした。中継プロセスと認証状態を確認してください');
  const result = await r.json() as T;
  if (method === 'PUT' || method === 'DELETE') notifyFoundryChanged();
  return result;
}
