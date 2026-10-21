// Microsoft Foundry（OpenAI 互換の Responses API）への送信口（FR-275）。呼ぶのは中継プロセスだけ。
// - 送信先は、設定したエンドポイント配下の /responses だけ。リダイレクトは追わない（キーを別の宛先へ送らない。NFR-SEC-005 ⑤）。
// - エラー・応答の文字列にキーの値は含めない。
export class FoundryError extends Error {
  constructor(message: string, readonly kind: 'timeout' | 'http' | 'network' | 'format') { super(message); }
}

export const FOUNDRY_TIMEOUT_MS = 30_000;

export interface FoundrySecret { endpoint: string; deployment: string; key: string }

export function responsesUrl(endpoint: string): string {
  return `${endpoint.trim().replace(/\/+$/, '')}/responses`;
}

function extractText(j: unknown): string | null {
  const o = j as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }> };
  if (typeof o?.output_text === 'string' && o.output_text) return o.output_text;
  const parts: string[] = [];
  for (const item of o?.output ?? []) for (const c of item.content ?? []) if (typeof c.text === 'string') parts.push(c.text);
  return parts.length ? parts.join('') : null;
}

export async function callFoundry(
  s: FoundrySecret, input: string, f: typeof fetch = (u, i) => fetch(u, i), timeoutMs = FOUNDRY_TIMEOUT_MS,
): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await f(responsesUrl(s.endpoint), {
      method: 'POST',
      redirect: 'error',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${s.key}`, 'api-key': s.key },
      body: JSON.stringify({ model: s.deployment, input }),
    });
    if (!res.ok) throw new FoundryError(`Foundry がエラーを返しました（HTTP ${res.status}）`, 'http');
    const text = extractText(await res.json().catch(() => null));
    if (!text) throw new FoundryError('Foundry の応答の形式が想定と異なります', 'format');
    return text;
  } catch (e) {
    if (e instanceof FoundryError) throw e;
    if (ctl.signal.aborted) throw new FoundryError('Foundry の応答がタイムアウトしました', 'timeout');
    throw new FoundryError('Foundry に接続できませんでした', 'network');
  } finally {
    clearTimeout(timer);
  }
}
