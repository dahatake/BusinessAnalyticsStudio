// FR-284 AC-735（判定ロジックの単体）・AC-736（入力の検査）、FR-285 AC-737〜739（実接続の切替・失敗時の代替。差し替え部品。本物の Foundry は呼ばない）
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONCLUSION_LABELS, CRITERIA, GENAI_MAX_INPUT_CHARS, analyzeRuleBased, parseScenarioResult, validateInput,
} from '../../src/genai/scenario';
import { DEFAULT_FOUNDRY_DEPLOYMENT, DEFAULT_FOUNDRY_ENDPOINT, analyzeViaRelay } from '../../src/genai/foundryClient';
import { isGenAiReal } from '../../src/genai/useGenAi';
import { startRelay, type Relay } from '../../scripts/relay/relay';
import { createFoundryService, foundryConfigFromEnv, isValidFoundryEndpoint } from '../../scripts/relay/genai-foundry';

const DUMMY_KEY = 'dummy-foundry-key-0123456789';
const open: Relay[] = [];
afterEach(async () => { while (open.length) await open.pop()!.close(); });

describe('FR-284 AC-735 適合性の判定ロジック（単体）', () => {
  it('AC-735 規則化できる定型処理は「不要・不向き」で、代替案と根拠の文が付く', () => {
    for (const t of ['毎月の請求金額を計算する。', '定型の承認フローを自動化する。']) {
      const r = analyzeRuleBased(t);
      expect(r.conclusion, t).toBe('unsuitable');
      expect(r.reason).toContain('使わない理由');
      expect(r.alternatives.length).toBeGreaterThan(0);
      expect(r.alternatives.join('')).toMatch(/ルール|既存|業務改善|統計|機械学習/);
      expect(r.criteria).toHaveLength(CRITERIA.length);
      for (const c of r.criteria) expect(c.reason.length).toBeGreaterThan(5);
    }
  });

  it('AC-735 非定型の大量の文章の要約・分類は「適する」または「条件付きで適する」で、根拠の文が付く', () => {
    const r = analyzeRuleBased('問い合わせメールの大量の文章を要約し、分類して担当部署へ振り分ける。');
    expect(['suitable', 'conditional']).toContain(r.conclusion);
    expect(r.reason).toContain('使う具体的な理由');
    expect(r.alternatives.length).toBeGreaterThan(0);
    expect(CONCLUSION_LABELS[r.conclusion]).toMatch(/適する/);
    for (const c of r.criteria) expect(c.reason.length).toBeGreaterThan(5);
  });

  it('AC-735 個人情報を含む場合は機密性が条件付きになり、同じ入力は同じ結果（再現できる）', () => {
    const t = '顧客情報を含む大量の日報の文章を要約する。';
    const r = analyzeRuleBased(t);
    expect(r.criteria.find((c) => c.id === 'confidentiality')!.verdict).toBe('partial');
    expect(analyzeRuleBased(t)).toEqual(r);
  });
});

describe('FR-284 AC-736 入力の検査', () => {
  it('AC-736 空は実行せず、理由と対処（入力する）を返す', () => {
    const v = validateInput('   ');
    expect(v.ok).toBe(false);
    if (!v.ok) { expect(v.reason).toContain('入力されていない'); expect(v.action).toContain('入力'); }
  });
  it('AC-736 PARAM-122（8000 文字）ちょうどは通り、超えると理由と対処（短くする）を返す', () => {
    expect(GENAI_MAX_INPUT_CHARS).toBe(8000);
    expect(validateInput('あ'.repeat(8000)).ok).toBe(true);
    const v = validateInput('あ'.repeat(8001));
    expect(v.ok).toBe(false);
    if (!v.ok) { expect(v.reason).toContain('8000'); expect(v.action).toContain('短く'); }
  });
});

describe('FR-285 AC-737 実接続の条件', () => {
  it('AC-737 既定（無効）・別の顧客パック・了承なしは実接続にならない（モック）', () => {
    expect(isGenAiReal('A', null, true)).toBe(false);
    expect(isGenAiReal('A', 'B', true)).toBe(false);
    expect(isGenAiReal('A', 'A', false)).toBe(false);
    expect(isGenAiReal('', '', true)).toBe(false);
    expect(isGenAiReal('A', 'A', true)).toBe(true);
  });
  it('AC-737 モックの分析は外部へ呼び出さない（純粋関数。fetch を使わない）', () => {
    const f = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => { calls++; return Promise.reject(new Error('no')); }) as typeof fetch;
    try { analyzeRuleBased('文章を要約する'); } finally { globalThis.fetch = f; }
    expect(calls).toBe(0);
  });
});

function upstream(over: { status?: number; body?: unknown; throws?: Error | 'abort'; hang?: boolean } = {}) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const fetchFn = ((url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
    if (over.hang) return new Promise((_, rej) => { init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
    if (over.throws) return Promise.reject(over.throws);
    const body = over.body ?? { output: [{ content: [{ type: 'output_text', text: JSON.stringify({
      conclusion: 'conditional', criteria: [{ id: 'unstructured-input', verdict: 'yes', reason: '文章が中心です。' }], reason: '条件付きで使えます。', alternatives: ['業務改善'],
    }) }] }] };
    return Promise.resolve(new Response(JSON.stringify(body), { status: over.status ?? 200, headers: { 'content-type': 'application/json' } }));
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

async function relayWith(key: string | undefined, fetchFn: typeof fetch, timeoutMs?: number) {
  const foundry = createFoundryService({ apiKey: key }, { fetchFn, ...(timeoutMs ? { timeoutMs } : {}) });
  const r = await startRelay({ sdk: null, foundry, port: 0 });
  open.push(r);
  return r;
}
const env = (r: Relay, over: Partial<Parameters<typeof analyzeViaRelay>[0]> = {}) => ({ relayUrl: r.url, endpoint: DEFAULT_FOUNDRY_ENDPOINT, deployment: DEFAULT_FOUNDRY_DEPLOYMENT, ...over });

describe('FR-285 AC-738 Responses API の呼び出し（差し替え部品）', () => {
  it('AC-738 既定のエンドポイント・デプロイ名で Responses API の要求を 1 回送り、キーは api-key ヘッダーだけ。応答・ブラウザー向けの結果にキーは出ない', async () => {
    const up = upstream();
    const r = await relayWith(DUMMY_KEY, up.fetchFn);
    const out = await analyzeViaRelay(env(r), '問い合わせメールの文章を要約する');
    expect(out.ok).toBe(true);
    expect(up.calls).toHaveLength(1);
    expect(up.calls[0]!.url).toBe('https://GraphcRecordingPanel.services.ai.azure.com/openai/v1/responses');
    expect(up.calls[0]!.headers['api-key']).toBe(DUMMY_KEY);
    const body = JSON.parse(up.calls[0]!.body) as { model: string; input: string };
    expect(body.model).toBe('gpt-chat-latest');
    expect(body.input).toContain('問い合わせメールの文章を要約する');
    expect(JSON.stringify(out)).not.toContain(DUMMY_KEY);
    const health = await (await fetch(`${r.url}/health`)).text();
    expect(health).toContain('"keyConfigured":true');
    expect(health).not.toContain(DUMMY_KEY);
  });

  it('AC-738 設定でエンドポイントとデプロイ名を変えると、その値が使われる', async () => {
    const up = upstream();
    const r = await relayWith(DUMMY_KEY, up.fetchFn);
    await analyzeViaRelay(env(r, { endpoint: 'https://other.openai.azure.com/openai/v1/', deployment: 'my-deploy' }), '文章を要約する');
    expect(up.calls[0]!.url).toBe('https://other.openai.azure.com/openai/v1/responses');
    expect(JSON.parse(up.calls[0]!.body).model).toBe('my-deploy');
  });

  it('AC-738 Azure 以外のエンドポイントへはキーを送らない（bad-request。上流の呼び出し 0 回）', async () => {
    const up = upstream();
    const r = await relayWith(DUMMY_KEY, up.fetchFn);
    const out = await analyzeViaRelay(env(r, { endpoint: 'https://evil.example.com/openai/v1' }), '文章を要約する');
    expect(out).toMatchObject({ ok: false, cause: 'bad-request' });
    expect(up.calls).toHaveLength(0);
    expect(isValidFoundryEndpoint('http://x.services.ai.azure.com/v1')).toBe(false);
    expect(isValidFoundryEndpoint(DEFAULT_FOUNDRY_ENDPOINT)).toBe(true);
  });

  it('AC-738 キーは環境変数 FOUNDRY_API_KEY から読む（空は未設定）', () => {
    expect(foundryConfigFromEnv({ FOUNDRY_API_KEY: ' ' }).apiKey).toBeUndefined();
    expect(foundryConfigFromEnv({ FOUNDRY_API_KEY: 'k' }).apiKey).toBe('k');
  });
});

describe('FR-285 AC-739 失敗の原因（差し替え部品）', () => {
  it('AC-739 キー未設定: 上流を呼ばず、原因つきの文言（キーの値なし）', async () => {
    const up = upstream();
    const r = await relayWith(undefined, up.fetchFn);
    const out = await analyzeViaRelay(env(r), '文章を要約する');
    expect(out).toMatchObject({ ok: false, cause: 'key-missing' });
    if (!out.ok) expect(out.message).toMatch(/キー.*設定されていません/);
    expect(up.calls).toHaveLength(0);
  });
  it('AC-739 接続不可', async () => {
    const r = await relayWith(DUMMY_KEY, upstream({ throws: new Error(`ECONNREFUSED ${DUMMY_KEY}`) }).fetchFn);
    const out = await analyzeViaRelay(env(r), '文章を要約する');
    expect(out).toMatchObject({ ok: false, cause: 'unreachable' });
    if (!out.ok) { expect(out.message).toMatch(/接続できません/); expect(out.message).not.toContain(DUMMY_KEY); }
  });
  it('AC-739 タイムアウト（PARAM-121）: 時間内に応答がなければ原因つきで失敗し、再試行しない', async () => {
    const up = upstream({ hang: true });
    const r = await relayWith(DUMMY_KEY, up.fetchFn, 50);
    const out = await analyzeViaRelay(env(r), '文章を要約する');
    expect(out).toMatchObject({ ok: false, cause: 'timeout' });
    if (!out.ok) expect(out.message).toMatch(/タイムアウト/);
    expect(up.calls).toHaveLength(1);
  });
  it('AC-739 非 2xx: ステータスを示す（上流の本文は出さない）', async () => {
    const r = await relayWith(DUMMY_KEY, upstream({ status: 500, body: { error: `secret ${DUMMY_KEY}` } }).fetchFn);
    const out = await analyzeViaRelay(env(r), '文章を要約する');
    expect(out).toMatchObject({ ok: false, cause: 'upstream-status' });
    if (!out.ok) { expect(out.message).toContain('500'); expect(out.message).not.toContain(DUMMY_KEY); }
  });
  it('AC-739 応答の形式が違う: bad-response。原因ごとの文言はすべて異なる', async () => {
    const r = await relayWith(DUMMY_KEY, upstream({ body: { output: [{ content: [{ type: 'output_text', text: 'JSON ではない' }] }] } }).fetchFn);
    const out = await analyzeViaRelay(env(r), '文章を要約する');
    expect(out).toMatchObject({ ok: false, cause: 'bad-response' });
    expect(parseScenarioResult({ conclusion: 'x' })).toBeUndefined();
  });
  it('AC-739 中継プロセスに届かない（未起動）も接続不可として返す', async () => {
    const out = await analyzeViaRelay({ relayUrl: 'http://127.0.0.1:1', endpoint: DEFAULT_FOUNDRY_ENDPOINT, deployment: 'd' }, '文章');
    expect(out).toMatchObject({ ok: false, cause: 'unreachable' });
  });
});
