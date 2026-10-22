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

// ---- FR-289: AI 取り込み。ファイル（PDF・画像・Office・テキスト）を Responses API の入力として送る。呼ぶのは中継プロセスだけ ----
/** 認証方式が Microsoft Entra ID のときのトークン取得口（差し替え部品）。値はログ・応答に出さない */
export type TokenProvider = () => Promise<string>;

export interface ImportFile { name: string; mime: string; dataBase64: string }

export const IMPORT_INSTRUCTION =
  '添付のファイルから、データエンティティ（名称と説明）を抽出し、次の JSON だけを返してください: {"entities":[{"name":"…","description":"…"}]}。説明のない項目は description を空文字にしてください。';

function importInput(file: ImportFile): unknown {
  const dataUrl = `data:${file.mime || 'application/octet-stream'};base64,${file.dataBase64}`;
  const part = (file.mime || '').startsWith('image/')
    ? { type: 'input_image', image_url: dataUrl }
    : { type: 'input_file', filename: file.name, file_data: dataUrl };
  return [{ role: 'user', content: [{ type: 'input_text', text: IMPORT_INSTRUCTION }, part] }];
}

/** 認証情報を付けて Responses API を呼ぶ。エラー・応答の文字列に認証情報は含めない */
export async function callFoundryWithInput(
  s: FoundrySecret & { authMode?: 'api-key' | 'entra' }, input: unknown,
  f: typeof fetch = (u, i) => fetch(u, i), timeoutMs = FOUNDRY_TIMEOUT_MS, getToken?: TokenProvider,
): Promise<string> {
  let credential = s.key;
  if (s.authMode === 'entra') {
    try { credential = getToken ? await getToken() : ''; } catch { credential = ''; }
    if (!credential) throw new FoundryError('Microsoft Entra ID のトークンを取得できませんでした', 'http');
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json', authorization: ['Bearer', credential].join(' ') };
    if (s.authMode !== 'entra') headers['api-key'] = credential;
    const res = await f(responsesUrl(s.endpoint), {
      method: 'POST', redirect: 'error', signal: ctl.signal, headers, body: JSON.stringify({ model: s.deployment, input }),
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

/** ファイルを送り、取り込んだエンティティを返す。形式が想定と異なるときは FoundryError('format') */
export async function importWithFoundry(
  s: FoundrySecret & { authMode?: 'api-key' | 'entra' }, file: ImportFile,
  f?: typeof fetch, timeoutMs?: number, getToken?: TokenProvider,
): Promise<Array<{ name: string; description: string }>> {
  const text = await callFoundryWithInput(s, importInput(file), f, timeoutMs, getToken);
  const m = /\{[\s\S]*\}/.exec(text);
  let parsed: unknown = null;
  try { parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
  const list = (parsed as { entities?: unknown })?.entities;
  if (!Array.isArray(list)) throw new FoundryError('Foundry の応答の形式が想定と異なります', 'format');
  const out = list
    .map((e) => ({ name: String((e as { name?: unknown })?.name ?? '').trim(), description: String((e as { description?: unknown })?.description ?? '').trim() }))
    .filter((e) => e.name);
  if (out.length === 0) throw new FoundryError('Foundry の応答から取り込める項目が見つかりませんでした', 'format');
  return out;
}
