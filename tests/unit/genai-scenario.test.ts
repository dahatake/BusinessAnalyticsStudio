// FR-284 AC-735（判定ロジックの単体）・AC-736（入力の検査）、FR-285 AC-737〜739（実接続の切替・失敗時の代替。差し替え部品。本物の Foundry は呼ばない）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONCLUSION_LABELS, CRITERIA, GENAI_MAX_INPUT_CHARS, analyzeRuleBased, parseScenarioResult, validateInput,
} from '../../src/genai/scenario';
import { analyzeViaRelay } from '../../src/genai/foundryClient';
import { putFoundryConfig, setFoundryConnection } from '../../src/ai/foundryClient';
import { isGenAiReal } from '../../src/genai/useGenAi';
import { startRelay, type Relay } from '../../scripts/relay/relay';
import { openFoundryVault } from '../../scripts/relay/foundry-vault';
import { fileProtector } from '../../scripts/relay/speech-vault';
import { isValidFoundryEndpoint } from '../../scripts/relay/genai-foundry';

const DUMMY_KEY = 'dummy-foundry-key-0123456789';
const DEFAULT_FOUNDRY_ENDPOINT = 'https://GraphcRecordingPanel.services.ai.azure.com/openai/v1';
const DEFAULT_FOUNDRY_DEPLOYMENT = 'gpt-chat-latest';
const PACK = 'P';
const dirs: string[] = [];
const open: Relay[] = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

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
  it('AC-737 共通接続が無効・了承なしは実接続にならない（モック）', () => {
    expect(isGenAiReal('A', false, true)).toBe(false);
    expect(isGenAiReal('A', true, false)).toBe(false);
    expect(isGenAiReal('', true, true)).toBe(false);
    expect(isGenAiReal('A', true, true)).toBe(true);
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

/** 共通接続（FR-275）の保管庫に key を保存し、enabled なら当該 Project で有効にした中継。key なしは未設定 */
async function relayWith(key: string | undefined, fetchFn: typeof fetch, timeoutMs?: number, enabled = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genai-test-'));
  dirs.push(dir);
  const foundryVault = openFoundryVault(dir, { protector: fileProtector, restrict: () => {}, warn: () => {} });
  const r = await startRelay({ sdk: null, foundryVault, foundryFetch: fetchFn, ...(timeoutMs ? { foundryTimeoutMs: timeoutMs } : {}), port: 0 });
  open.push(r);
  if (key) {
    expect((await putFoundryConfig(r.url, PACK, { endpoint: DEFAULT_FOUNDRY_ENDPOINT, deployment: DEFAULT_FOUNDRY_DEPLOYMENT, key })).ok).toBe(true);
    if (enabled) expect((await setFoundryConnection(r.url, PACK, true, { consent: true, confirmed: true })).mode).toBe('connected');
  }
  return r;
}
const env = (r: Relay, over: Partial<Parameters<typeof analyzeViaRelay>[0]> = {}) => ({ relayUrl: r.url, packId: PACK, ...over });

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

  it('AC-738 共通接続のエンドポイントとデプロイ名を変えると、その値が使われる（ブラウザーからは送らない）', async () => {
    const up = upstream();
    const r = await relayWith(DUMMY_KEY, up.fetchFn);
    await putFoundryConfig(r.url, PACK, { endpoint: 'https://other.openai.azure.com/openai/v1/', deployment: 'my-deploy', key: '' });
    await analyzeViaRelay(env(r), '文章を要約する');
    expect(up.calls[0]!.url).toBe('https://other.openai.azure.com/openai/v1/responses');
    expect(JSON.parse(up.calls[0]!.body).model).toBe('my-deploy');
  });

  it('AC-738 Azure 以外のエンドポイントへはキーを送らない（bad-request。上流の呼び出し 0 回）', async () => {
    const up = upstream();
    const r = await relayWith(DUMMY_KEY, up.fetchFn);
    await putFoundryConfig(r.url, PACK, { endpoint: 'https://evil.example.com/openai/v1', deployment: 'd', key: '' });
    const out = await analyzeViaRelay(env(r), '文章を要約する');
    expect(out).toMatchObject({ ok: false, cause: 'bad-request' });
    expect(up.calls).toHaveLength(0);
    expect(isValidFoundryEndpoint('http://x.services.ai.azure.com/v1')).toBe(false);
    expect(isValidFoundryEndpoint(DEFAULT_FOUNDRY_ENDPOINT)).toBe(true);
  });

  it('AC-738 リダイレクトは追従しない（redirect: manual）', async () => {
    let redirect: unknown;
    const f = ((_u: string, init: RequestInit) => { redirect = init.redirect; return Promise.resolve(new Response('', { status: 302 })); }) as unknown as typeof fetch;
    const r = await relayWith(DUMMY_KEY, f);
    expect(await analyzeViaRelay(env(r), '文章を要約する')).toMatchObject({ ok: false, cause: 'upstream-status' });
    expect(redirect).toBe('manual');
  });

  it('AC-738 環境変数 FOUNDRY_API_KEY は使われない（保管庫が未設定ならキーなし）。ブラウザーが endpoint・deployment を送っても使われない', async () => {
    const prev = process.env.FOUNDRY_API_KEY;
    process.env.FOUNDRY_API_KEY = DUMMY_KEY;
    try {
      const up = upstream();
      const r = await relayWith(undefined, up.fetchFn);
      expect(await analyzeViaRelay(env(r), '文章を要約する')).toMatchObject({ ok: false, cause: 'key-missing' });
      expect(await (await fetch(`${r.url}/health`)).text()).toContain('"keyConfigured":false');
      expect(up.calls).toHaveLength(0);
      const r2 = await relayWith(DUMMY_KEY, up.fetchFn);
      await fetch(`${r2.url}/foundry/analyze`, { method: 'POST', body: JSON.stringify({ packId: PACK, solution: '文章', endpoint: 'https://evil.openai.azure.com/v1', deployment: 'evil' }) });
      expect(up.calls[0]!.url).toBe(`${DEFAULT_FOUNDRY_ENDPOINT}/responses`);
    } finally {
      if (prev === undefined) delete process.env.FOUNDRY_API_KEY; else process.env.FOUNDRY_API_KEY = prev;
    }
  });
});

describe('FR-285 AC-739 失敗の原因（差し替え部品）', () => {
  it('AC-739 共通接続が無効（enabled でない）: 上流を呼ばず、原因つきで失敗（クライアントはルールベースへ）', async () => {
    const up = upstream();
    const r = await relayWith(DUMMY_KEY, up.fetchFn, undefined, false);
    const out = await analyzeViaRelay(env(r), '文章を要約する');
    expect(out).toMatchObject({ ok: false, cause: 'disabled' });
    if (!out.ok) expect(out.message).toMatch(/有効ではありません/);
    expect(up.calls).toHaveLength(0);
  });
  it('AC-739 キー未設定: 上流を呼ばず、原因つきの文言（キーの値なし）', async () => {
    const up = upstream();
    const r = await relayWith(undefined, up.fetchFn);
    const out = await analyzeViaRelay(env(r), '文章を要約する');
    expect(out).toMatchObject({ ok: false, cause: 'key-missing' });
    if (!out.ok) expect(out.message).toMatch(/接続情報.*設定されていません/);
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
    const out = await analyzeViaRelay({ relayUrl: 'http://127.0.0.1:1', packId: PACK }, '文章');
    expect(out).toMatchObject({ ok: false, cause: 'unreachable' });
  });
});
