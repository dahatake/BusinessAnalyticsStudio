// 生成AIの活用分析（FR-284）の Microsoft Foundry 接続部品（FR-285）。呼ぶ主体は中継プロセス。
// - API キーは中継側の環境変数 FOUNDRY_API_KEY だけ。ブラウザー・応答・ログ・エラーには出さない（NFR-SEC-001）。
// - OpenAI 互換の Responses API（POST {endpoint}/responses、api-key ヘッダー）を呼ぶ。接続先は https かつ Azure の標準ドメインだけ（キーを任意のホストへ送らせない。NFR-SEC-002）。
// - 失敗は原因つき（key-missing / unreachable / timeout / upstream-status / bad-response / bad-request）で投げる。自動の再試行はしない。
// - HTTP 呼び出しは fetchFn として差し替えられる（検査はスタブ。本物の Foundry は検査で呼ばない）。

export const FOUNDRY_TIMEOUT_MS = 60_000; // PARAM-121（60 秒）
export const FOUNDRY_MAX_INPUT_CHARS = 8000; // PARAM-122

export type FoundryCause = 'key-missing' | 'unreachable' | 'timeout' | 'upstream-status' | 'bad-response' | 'bad-request';

export class FoundryError extends Error {
  constructor(readonly kind: FoundryCause, readonly detail: { upstreamStatus?: number; timeoutSeconds?: number } = {}) {
    super(kind);
  }
}

export interface FoundryConfig { apiKey?: string }

export function foundryConfigFromEnv(env: Record<string, string | undefined>): FoundryConfig {
  const k = env.FOUNDRY_API_KEY?.trim();
  return { apiKey: k ? k : undefined };
}

/** https かつ Azure の標準ドメイン（*.services.ai.azure.com / *.openai.azure.com / *.cognitiveservices.azure.com）だけ */
export function isValidFoundryEndpoint(e: unknown): e is string {
  if (typeof e !== 'string') return false;
  try {
    const u = new URL(e);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(services\.ai|openai|cognitiveservices)\.azure\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}
export const isValidDeployment = (d: unknown): d is string => typeof d === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(d);

export interface FoundryService {
  /** キーが設定されているか（値は返さない） */
  hasKey(): boolean;
  analyze(req: { solution: string; endpoint: string; deployment: string }): Promise<unknown>;
}

const CRITERIA_IDS = ['unstructured-input', 'open-output', 'hard-to-ruleify', 'error-tolerance', 'accountability', 'confidentiality', 'cost-benefit'];

/** Foundry へ送る指示。結論は 3 区分で、生成AIを無理に使わず「不要／不向き」も正当な結論とする */
export function buildPrompt(solution: string): string {
  return [
    'あなたは業務改善と AI 活用の助言者です。次の解決策に生成AIを使うべきかを、客観的に判定してください。生成AIを無理に使ってはいけません。生成AI以外（ルール・既存のソフトウェア・業務改善・統計／従来の機械学習）の方がよいなら「unsuitable」としてください。',
    `判断基準（id）: ${CRITERIA_IDS.join('、')}。各基準を verdict（yes=生成AI向き / partial=条件付き / no=向かない）で判定し、根拠を日本語で 1 文書いてください。`,
    '出力は次の JSON だけにしてください: {"conclusion":"suitable|conditional|unsuitable","criteria":[{"id":"…","verdict":"yes|partial|no","reason":"…"}],"reason":"生成AIを使う具体的な理由、または使わない理由","alternatives":["生成AI以外の代替案"]}',
    '--- 解決策（ここから） ---',
    solution,
    '--- 解決策（ここまで） ---',
  ].join('\n');
}

/** Responses API の応答から本文のテキストを取り出す */
export function extractOutputText(j: unknown): string | undefined {
  const o = j as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }> };
  if (typeof o?.output_text === 'string' && o.output_text) return o.output_text;
  const parts: string[] = [];
  for (const item of o?.output ?? []) for (const c of item.content ?? []) if (typeof c.text === 'string' && (c.type === 'output_text' || c.type === undefined)) parts.push(c.text);
  return parts.length ? parts.join('') : undefined;
}

export function parseJsonText(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  return JSON.parse(a >= 0 && b > a ? t.slice(a, b + 1) : t);
}

export function createFoundryService(
  config: FoundryConfig,
  opts: { fetchFn?: typeof fetch; timeoutMs?: number } = {},
): FoundryService {
  const fetchFn = opts.fetchFn ?? ((u, i) => fetch(u, i));
  const timeoutMs = opts.timeoutMs ?? FOUNDRY_TIMEOUT_MS;
  return {
    hasKey: () => !!config.apiKey,
    async analyze({ solution, endpoint, deployment }) {
      if (!config.apiKey) throw new FoundryError('key-missing');
      if (!isValidFoundryEndpoint(endpoint) || !isValidDeployment(deployment) || solution.length === 0 || solution.length > FOUNDRY_MAX_INPUT_CHARS) throw new FoundryError('bad-request');
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetchFn(`${endpoint.replace(/\/+$/, '')}/responses`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'api-key': config.apiKey },
          body: JSON.stringify({ model: deployment, input: buildPrompt(solution) }),
          signal: ctl.signal,
        });
        if (!res.ok) throw new FoundryError('upstream-status', { upstreamStatus: res.status });
        const text = extractOutputText(await res.json().catch(() => undefined));
        if (!text) throw new FoundryError('bad-response');
        try {
          return parseJsonText(text);
        } catch {
          throw new FoundryError('bad-response');
        }
      } catch (e) {
        if (e instanceof FoundryError) throw e;
        if (e instanceof Error && e.name === 'AbortError') throw new FoundryError('timeout', { timeoutSeconds: Math.round(timeoutMs / 1000) });
        throw new FoundryError('unreachable');
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** 原因ごとの HTTP の状態（ブラウザー向けの応答。キーの値・上流の本文は含めない） */
export const CAUSE_STATUS: Record<FoundryCause, number> = {
  'key-missing': 503, unreachable: 502, timeout: 504, 'upstream-status': 502, 'bad-response': 502, 'bad-request': 400,
};
