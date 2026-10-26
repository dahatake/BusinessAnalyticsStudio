// Copilot SDK 中継プロセス（FR-010・FR-011・FR-132）。
// - 127.0.0.1 / ::1 だけで待ち受ける（ループバック以外の host は起動を拒否する）。
// - LLM を使う 5 種類の処理は、すべて POST /ask の 1 つの呼び出し口を通る。
// - 実接続を明示的に有効にした顧客パックの要求にだけ SDK を呼ぶ。それ以外はモックで答え、SDK は 0 回。
// - Copilot の API キー・トークンは持たない。認証は利用者の GitHub Copilot のサインインを使う（SDK 側）。
// - 音声合成の API キーだけは、暗号化して PC 内に保管し、読み上げを中継する（FR-168・NFR-SEC-005。speech-vault.ts）。
import http from 'node:http';
import { openAiProvider, type AiProviderStore, type CopilotConfig } from './ai-provider';
import { createCopilotSignin, type CopilotSignin } from './copilot-signin';
import { CopilotError } from './copilot-adapter';
import type { AddressInfo } from 'node:net';
import { AZURE_FEATURES, MAX_IMAGE_BASE64_CHARS, MAX_SPEECH_TEXT_CHARS, isValidBase64, isValidStrokeCount, AzureServiceError, type AzureFeature, type AzureServices } from './azure-services';
import { openSpeechVault, type SpeechVault } from './speech-vault';
import { CAUSE_STATUS, buildPrompt, parseJsonText, FOUNDRY_MAX_INPUT_CHARS, createFoundryService, FoundryError as GenAiFoundryError, type FoundryService } from './genai-foundry';
import { openFoundryVault, type FoundryVault } from './foundry-vault';
import { callFoundry, callFoundryWithInput, FoundryError, importWithFoundry, TOKEN_UNAVAILABLE_MESSAGE, type TokenProvider } from './foundry';
import { buildReviewPrompt, parseReviewComponents, parseReviewReply } from './foundry-review';

export const AI_KINDS = ['structure', 'summary', 'recommend', 'chat', 'exec-summary'] as const;
export type AiKind = (typeof AI_KINDS)[number];

/** Copilot SDK の薄い差し替え口。実体は copilot-adapter.ts、検査ではスタブをつなぐ。 */
export interface CopilotSdk {
  /** サインイン済み・利用可能か */
  status(config?: CopilotConfig): Promise<{ signedIn: boolean }>;
  complete(kind: AiKind, prompt: string, config?: CopilotConfig, canSend?: () => boolean, options?: { maxOutputTokens?: number }): Promise<string>;
}

export interface RelayOptions {
  sdk: CopilotSdk | null;
  aiProvider?: AiProviderStore;
  copilotSignin?: CopilotSignin;
  /** 音声合成・手書き認識の接続部品（FR-182）。なければ常にモック */
  azure?: AzureServices;
  /** 生成AIの活用分析の Foundry 接続部品（FR-285）の差し替え口。省略すると既定（共通接続の保管庫の値で、foundryFetch・foundryTimeoutMs を使って呼ぶ） */
  foundry?: FoundryService;
  host?: string;
  port?: number;
  /** 音声合成のキーの保管庫（FR-168）。省略すると既定のデータフォルダー */
  speechVault?: SpeechVault;
  /** 音声合成の接続先への送信口。検査ではモックを渡す */
  speechFetch?: typeof fetch;
  /** Foundry の接続情報の保管庫（FR-275）。省略すると既定のデータフォルダー */
  foundryVault?: FoundryVault;
  /** Foundry への送信口（差し替え部品）。検査ではスタブを渡す */
  foundryFetch?: typeof fetch;
  foundryTimeoutMs?: number;
  /** Microsoft Entra ID 方式のトークン取得口（FR-289。差し替え部品。なければ取得に失敗として扱う） */
  foundryToken?: TokenProvider;
}

export interface Relay {
  host: string;
  port: number;
  url: string;
  close(): Promise<void>;
}

/** 接続テスト（FR-282 AC-763）: 顧客データを含まない最小の入力・最小の出力上限。連打の間隔は PARAM-116（5 秒） */
const FOUNDRY_TEST_INPUT = 'ping';
const FOUNDRY_TEST_MAX_OUTPUT_TOKENS = 16;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1']);
const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function mockAnswer(kind: AiKind, prompt: string): string {
  const head = prompt.replace(/\s+/g, ' ').slice(0, 60);
  return `（モックの回答）${kind} 「${head}」への回答の例です。実際の AI には送信していません。`;
}

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    return LOOPBACK_NAMES.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

class PayloadTooLarge extends Error {}

/** AI 取り込み（FR-289）で送れるファイル 1 件の大きさ。PARAM-125（10 MB） */
export const AI_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
const IMPORT_BODY_LIMIT = Math.ceil((AI_IMPORT_MAX_BYTES * 4) / 3) + 200_000;

function readBody(req: http.IncomingMessage, limit = 1_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let over = false;
    req.on('data', (c: Buffer) => {
      if (over) return;
      body += c.toString('utf8');
      if (body.length > limit) {
        over = true;
        body = '';
        reject(new PayloadTooLarge('request too large'));
        req.pause();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export async function startRelay(opts: RelayOptions): Promise<Relay> {
  const host = opts.host ?? '127.0.0.1';
  if (!LOOPBACK_HOSTS.has(host)) throw new Error(`中継プロセスはループバック（127.0.0.1 / ::1）だけで待ち受けます: ${host}`);
  /** 実接続を有効にした顧客パックの ID（プロセスの再起動で消える。FR-132 A-15） */
  const enabled = new Set<string>();
  let vault: SpeechVault | null = opts.speechVault ?? null;
  const getVault = (): SpeechVault => (vault ??= openSpeechVault());
  let fvault: FoundryVault | null = opts.foundryVault ?? null;
  const getFoundry = (): FoundryVault => (fvault ??= openFoundryVault());
  /** Foundry の実接続を有効にした顧客パックの ID（再起動で消える） */
  const foundryEnabled = new Set<string>();
  const provider = opts.aiProvider ?? openAiProvider();
  const signin = opts.copilotSignin ?? createCopilotSignin();
  // FR-275 AC-770: async authentication must not outlive the configuration or
  // per-pack authorization which was explicitly confirmed by the user.
  let configRevision = 0;
  const connectionRevisions = new Map<string, number>();
  const nextConnectionRevision = (packId: string) => {
    const revision = (connectionRevisions.get(packId) ?? 0) + 1;
    connectionRevisions.set(packId, revision);
    return revision;
  };
  const invalidateConfiguration = () => { configRevision++; foundryEnabled.clear(); };
  const snapshot = (packId: string) => ({
    provider: provider.provider(), configRevision,
    connectionRevision: connectionRevisions.get(packId) ?? 0,
    config: provider.config(),
  });
  const isCurrent = (packId: string, captured: ReturnType<typeof snapshot>) =>
    captured.configRevision === configRevision && captured.provider === provider.provider()
    && captured.connectionRevision === (connectionRevisions.get(packId) ?? 0);
  const copilotReady = async () => {
    const captured = snapshot('');
    const cfg = captured.config;
    if (!opts.sdk || (cfg.authMethod === 'token' && !cfg.token)) return false;
    const status = await opts.sdk.status(cfg).catch(() => ({ signedIn: false }));
    return isCurrent('', captured) && status.signedIn;
  };
  const copilotComplete = async (packId: string, prompt: string, maxOutputTokens?: number) => {
    const captured = snapshot(packId);
    const canSend = () => captured.provider === 'copilot' && isCurrent(packId, captured) && foundryEnabled.has(packId);
    if (!canSend() || !opts.sdk || (captured.config.authMethod === 'token' && !captured.config.token)) throw new CopilotError('auth');
    const status = await opts.sdk.status(captured.config).catch(() => ({ signedIn: false }));
    if (!canSend() || !status.signedIn) throw new CopilotError('auth');
    // The real adapter repeats this check after its own startup/auth/session awaits.
    // FR-276・FR-290: 出力の上限（PARAM-132 など）は Copilot SDK の経路にも適用する
    return maxOutputTokens ? opts.sdk.complete('chat', prompt, captured.config, canSend, { maxOutputTokens }) : opts.sdk.complete('chat', prompt, captured.config, canSend);
  };
  const genai: FoundryService = opts.foundry ?? createFoundryService({ fetchFn: opts.foundryFetch, timeoutMs: opts.foundryTimeoutMs });
  const speechFetch = opts.speechFetch ?? ((u, i) => fetch(u, i));
  const signedIn = async (): Promise<boolean> => (opts.sdk ? (await opts.sdk.status().catch(() => ({ signedIn: false }))).signedIn : false);

  await copilotReady(); // FR-011 AC-771: startup checks actual SDK auth, never start() alone.
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    const json = (status: number, obj: unknown) => {
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        ...(origin && originAllowed(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}),
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
      });
      res.end(JSON.stringify(obj));
    };
    if (!originAllowed(origin)) return json(403, { error: 'forbidden origin' });
    if (req.method === 'OPTIONS') return json(204, {});
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    void (async () => {
      try {
        if (path === '/ai/provider') {
          if (req.method === 'GET') {
            // FR-275 AC-773: packId を付けたときだけ、その案件の共通接続の実接続が有効か（enabled）も返す（上部の AI の状態表示用。認証情報は含めない）
            const pid = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('packId');
            return json(200, pid === null ? { provider: provider.provider() } : { provider: provider.provider(), enabled: foundryEnabled.has(pid) });
          }
          if (req.method === 'PUT') {
            const b = JSON.parse((await readBody(req)) || '{}');
            if (b.provider !== 'foundry' && b.provider !== 'copilot') return json(400, { error: '接続先を確認してください' });
            const changed = b.provider !== provider.provider();
            provider.setProvider(b.provider);
            if (changed) invalidateConfiguration();
            return json(200, { provider: provider.provider() });
          }
        }
        if (path === '/copilot/config') {
          if (req.method === 'GET') return json(200, { ...provider.view(), signedIn: await copilotReady() });
          if (req.method === 'PUT') {
            const b = JSON.parse((await readBody(req)) || '{}');
            if (!['signin', 'token'].includes(b.authMethod) || typeof b.model !== 'string' || (b.token !== undefined && typeof b.token !== 'string')) return json(400, { error: '認証方式・モデル名を確認してください' });
            try { provider.save({ authMethod: b.authMethod, model: b.model, token: b.token }); invalidateConfiguration(); return json(200, { ...provider.view(), signedIn: await copilotReady() }); }
            catch { return json(400, { error: 'Copilot 設定を保存できませんでした' }); }
          }
          if (req.method === 'DELETE') { provider.removeToken(); invalidateConfiguration(); return json(200, { ...provider.view(), signedIn: false }); }
        }
        if (path === '/copilot/signin') {
          if (req.method === 'POST') return json(200, { ...signin.start(copilotReady), signedIn: await copilotReady() });
          if (req.method === 'GET') return json(200, { ...signin.view(), signedIn: await copilotReady() });
        }
        if (req.method === 'GET' && path === '/health') {
          return json(200, { status: 'ready', copilot: (await signedIn()) ? 'signed-in' : 'signed-out', foundry: { keyConfigured: getFoundry().secret() !== null || getFoundry().entraReady() } });
        }
        // ---- FR-282 AC-763: 接続テスト。保存済みの接続情報で最小の入力を 1 回だけ送る。了承・有効化は問わない。返すのは成功か原因種別だけ（キー・トークン・上流の本文は返さない） ----
        if (req.method === 'POST' && path === '/foundry/test') {
          const secret = getFoundry().importSecret();
          if (!secret) return json(200, { ok: false, cause: 'not-configured', message: 'Foundry の接続情報が未設定です' });
          try {
            await callFoundryWithInput(secret, FOUNDRY_TEST_INPUT, opts.foundryFetch, opts.foundryTimeoutMs, opts.foundryToken, FOUNDRY_TEST_MAX_OUTPUT_TOKENS);
            return json(200, { ok: true, message: '接続できました' });
          } catch (e) {
            const fe = e instanceof FoundryError ? e : null;
            const status = Number(/HTTP (\d+)/.exec(fe?.message ?? '')?.[1] ?? 0);
            if (fe?.kind === 'token') return json(200, { ok: false, cause: 'not-configured', message: TOKEN_UNAVAILABLE_MESSAGE });
            if (fe?.kind === 'timeout') return json(200, { ok: false, cause: 'timeout', message: '接続先の応答がタイムアウトしました' });
            if (fe?.kind === 'network') return json(200, { ok: false, cause: 'endpoint', message: '接続先に届きませんでした。エンドポイントを確認してください' });
            if (status === 401 || status === 403) return json(200, { ok: false, cause: 'auth', message: '認証に失敗しました。API キーまたは Entra ID の権限を確認してください' });
            if (status === 404) return json(200, { ok: false, cause: 'deployment', message: 'デプロイ名が見つかりません。デプロイ名を確認してください' });
            return json(200, { ok: false, cause: 'other', message: '接続を確認できませんでした' });
          }
        }
        // ---- FR-285: 生成AIの活用分析。共通接続（FR-275）の保管庫のエンドポイント・デプロイ名・キーと、packId 単位の有効化だけを使う。応答にキーの値・上流の本文は含めない ----
        if (req.method === 'POST' && path === '/foundry/analyze') {
          const b = JSON.parse((await readBody(req)) || '{}') as { packId?: unknown; solution?: unknown; consent?: boolean; includesPerson?: boolean; personConfirmed?: boolean };
          try {
            if (typeof b.packId !== 'string' || !b.packId || typeof b.solution !== 'string' || !b.solution || b.solution.length > FOUNDRY_MAX_INPUT_CHARS) throw new GenAiFoundryError('bad-request');
            if (provider.provider() === 'foundry' && !getFoundry().importSecret()) throw new GenAiFoundryError('key-missing');
            if (!foundryEnabled.has(b.packId)) throw new GenAiFoundryError('disabled');
            // FR-285 の契約は body に packId・solution だけ（了承は有効化〈/foundry/connection〉で確かめ済み）。
            // 画面が了承の取り消し（consent: false）や「人」の未確認を明示したときだけ、ここでも止める（AC-706）。
            if (b.consent === false || (b.includesPerson && !b.personConfirmed)) return json(403, { error: { cause: 'disabled' } });
            if (provider.provider() === 'copilot') {
              return json(200, parseJsonText(await copilotComplete(b.packId, buildPrompt(b.solution))));
            }
            const secret = getFoundry().importSecret();
            if (!secret) throw new GenAiFoundryError('key-missing');
            return json(200, await genai.analyze({ solution: b.solution, endpoint: secret.endpoint, deployment: secret.deployment, key: secret.key, authMethod: secret.authMethod, getToken: opts.foundryToken }));
          } catch (e) {
            if (e instanceof GenAiFoundryError) return json(CAUSE_STATUS[e.kind], { error: { cause: e.kind, ...e.detail } });
            return json(e instanceof CopilotError && e.kind === 'timeout' ? 504 : 502, { error: { cause: e instanceof CopilotError && e.kind === 'timeout' ? 'timeout' : 'unreachable' } });
          }
        }
        if (path === '/speech/config') {
          if (req.method === 'GET') return json(200, getVault().view());
          if (req.method === 'PUT') {
            const b = JSON.parse((await readBody(req)) || '{}') as { endpoint?: string; region?: string; key?: string };
            try {
              return json(200, getVault().save({ endpoint: String(b.endpoint ?? ''), region: b.region, key: typeof b.key === 'string' ? b.key : undefined }));
            } catch (e) {
              return json(400, { error: '接続情報を保存できませんでした。エンドポイント・デプロイ名・認証方式を確認してください' });
            }
          }
          if (req.method === 'DELETE') {
            getVault().remove();
            return json(200, getVault().view());
          }
        }
        // ---- FR-275: Microsoft Foundry の接続設定（キーは暗号化して中継側だけに保管。応答には伏せ字しか出さない） ----
        if (path === '/foundry/config') {
          const packId = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('packId') ?? '';
          const withMode = async () => ({ ...getFoundry().view(), provider: provider.provider(), enabled: foundryEnabled.has(packId), ...(provider.provider() === 'copilot' ? { configured: await copilotReady(), host: 'GitHub Copilot SDK', endpoint: '', deployment: '', keyMask: '' } : {}) });
          if (req.method === 'GET') return json(200, await withMode());
          if (req.method === 'PUT') {
            const b = JSON.parse((await readBody(req)) || '{}') as { endpoint?: string; deployment?: string; key?: string; authMethod?: string };
            try {
              getFoundry().save({ endpoint: String(b.endpoint ?? ''), deployment: String(b.deployment ?? ''), key: typeof b.key === 'string' ? b.key : undefined, authMethod: b.authMethod === 'entra' ? 'entra' : 'api-key' });
              invalidateConfiguration();
              return json(200, await withMode());
            } catch (e) {
              return json(400, { error: '接続情報を保存できませんでした。エンドポイント・デプロイ名・認証方式を確認してください' });
            }
          }
          if (req.method === 'DELETE') {
            getFoundry().remove();
            invalidateConfiguration();
            return json(200, await withMode());
          }
        }
        if (req.method === 'POST' && path === '/foundry/connection') {
          const b = JSON.parse((await readBody(req)) || '{}') as { packId?: string; enable?: boolean; confirmed?: boolean; consent?: boolean };
          if (typeof b.packId !== 'string' || !b.packId) return json(400, { error: 'packId が必要です' });
          if (!b.enable) { nextConnectionRevision(b.packId); foundryEnabled.delete(b.packId); return json(200, { mode: 'mock' }); }
          if (b.consent !== true) return json(403, { error: '顧客の了承の記録がないため、実接続を有効にできません', mode: 'mock' });
          if (b.confirmed !== true) return json(400, { error: '費用と送信内容の確認が必要です' });
          nextConnectionRevision(b.packId);
          foundryEnabled.delete(b.packId);
          const captured = snapshot(b.packId);
          if (captured.provider === 'copilot') {
            const ready = await copilotReady();
            if (!isCurrent(b.packId, captured)) return json(409, { error: '接続設定または有効化状態が変更されました。再確認して有効にしてください', mode: 'mock' });
            if (!ready) return json(409, { error: 'Copilot SDK が未認証、トークン未保存、または利用できません。Copilot CLI の /login またはトークン方式を確認してください', mode: 'mock' });
          }
          if (!isCurrent(b.packId, captured)) return json(409, { error: '接続設定または有効化状態が変更されました。再確認してください', mode: 'mock' });
          if (captured.provider === 'foundry' && !getFoundry().importSecret()) return json(409, { error: 'Foundry の接続情報が未設定です', mode: 'mock' });
          foundryEnabled.add(b.packId);
          return json(200, { mode: 'connected' });
        }
        // 「現状の説明」などの生成。条件が 1 つでも欠けると Foundry を呼ばない（呼び出し 0 回。FR-275 AC-706）
        if (req.method === 'POST' && path === '/foundry/ask') {
          const b = JSON.parse((await readBody(req)) || '{}') as { packId?: string; prompt?: string; consent?: boolean; includesPerson?: boolean; personConfirmed?: boolean; maxOutputTokens?: unknown; timeoutSeconds?: unknown };
          if (typeof b.packId !== 'string' || !b.packId || typeof b.prompt !== 'string') return json(400, { error: 'packId・prompt が必要です' });
          // FR-276・FR-290: 呼び出し元が出力の上限（PARAM-132 など）と応答待ちの上限（PARAM-127 など）を指定できる。範囲外は無視する
          const askMaxOut = typeof b.maxOutputTokens === 'number' && Number.isFinite(b.maxOutputTokens) && b.maxOutputTokens >= 1 ? Math.min(Math.floor(b.maxOutputTokens), 32000) : undefined;
          const askTimeoutMs = opts.foundryTimeoutMs ?? (typeof b.timeoutSeconds === 'number' && Number.isFinite(b.timeoutSeconds) && b.timeoutSeconds >= 1 ? Math.min(b.timeoutSeconds, 600) * 1000 : undefined);
          const unavailable = (reason: string, message: string, status = 200) => json(status, { mode: 'unavailable', reason, message });
          if (b.consent !== true) return unavailable('consent', '顧客の了承の記録がないため、AI は使えません');
          if (!foundryEnabled.has(b.packId)) return unavailable('disabled', 'Foundry の実接続が有効ではありません');
          const secret = getFoundry().importSecret();
          if (provider.provider() === 'foundry' && !secret) return unavailable('not-configured', 'Foundry の接続情報が未設定です');
          if (b.includesPerson === true && b.personConfirmed !== true) return unavailable('person-unconfirmed', '種別「人」を含む顧客パックは、送信前の確認が必要です');
          try {
            const answer = provider.provider() === 'copilot' ? await copilotComplete(b.packId, b.prompt, askMaxOut) : secret!.authMethod === 'entra'
              ? await callFoundryWithInput(secret!, b.prompt, opts.foundryFetch, askTimeoutMs, opts.foundryToken, askMaxOut)
              : await callFoundry(secret!, b.prompt, opts.foundryFetch, askTimeoutMs, askMaxOut);
            return json(200, { answer, mode: 'connected' });
          } catch (e) {
            const kind = e instanceof FoundryError || e instanceof CopilotError ? e.kind : 'network';
            const msg = (e instanceof CopilotError || e instanceof FoundryError ? e.message : '生成AI に接続できませんでした').split(secret?.key || '\u0000').join('•••');
            return unavailable(kind === 'timeout' ? 'timeout' : 'error', msg, 200);
          }
        }
        // 「Copilot で分析実行」（FR-278）。条件は /foundry/ask と同じ（了承・実接続の有効・設定・種別「人」の確認）。欠けると Foundry を呼ばない
        if (req.method === 'POST' && path === '/foundry/review') {
          const b = JSON.parse((await readBody(req)) || '{}') as { packId?: string; consent?: boolean; includesPerson?: boolean; personConfirmed?: boolean; components?: unknown };
          if (typeof b.packId !== 'string' || !b.packId) return json(400, { error: 'packId が必要です' });
          const comps = parseReviewComponents(b.components);
          if (comps.length === 0) return json(400, { error: 'components が必要です' });
          const unavailable = (reason: string, message: string) => json(200, { mode: 'unavailable', reason, message });
          if (b.consent !== true) return unavailable('consent', '顧客の了承の記録がないため、AI は使えません');
          if (!foundryEnabled.has(b.packId)) return unavailable('disabled', 'Foundry の実接続が有効ではありません');
          const secret = getFoundry().importSecret();
          if (provider.provider() === 'foundry' && !secret) return unavailable('not-configured', 'Foundry の接続情報が未設定です');
          if (b.includesPerson === true && b.personConfirmed !== true) return unavailable('person-unconfirmed', '種別「人」を含む顧客パックは、送信前の確認が必要です');
          try {
            const prompt = buildReviewPrompt(comps);
            const text = provider.provider() === 'copilot' ? await copilotComplete(b.packId, prompt) : secret!.authMethod === 'entra'
              ? await callFoundryWithInput(secret!, prompt, opts.foundryFetch, opts.foundryTimeoutMs, opts.foundryToken)
              : await callFoundry(secret!, prompt, opts.foundryFetch, opts.foundryTimeoutMs);
            const reviews = parseReviewReply(text, comps.map((c) => c.id));
            if (!reviews) return unavailable('error', 'Foundry の応答の形式が想定と異なります');
            return json(200, { reviews, mode: 'connected' });
          } catch (e) {
            const kind = e instanceof FoundryError || e instanceof CopilotError ? e.kind : 'network';
            const msg = (e instanceof CopilotError || e instanceof FoundryError ? e.message : '生成AI に接続できませんでした').split(secret?.key || '\u0000').join('•••');
            return unavailable(kind === 'timeout' ? 'timeout' : 'error', msg);
          }
        }
        // ---- FR-289: AI 取り込み。条件が 1 つでも欠けると Foundry を呼ばない（呼び出し 0 回）。応答・エラーに認証情報は含めない ----
        if (req.method === 'POST' && path === '/foundry/import') {
          if (provider.provider() === 'copilot') return json(409, { error: { cause: 'unsupported', message: 'Copilot SDK では未対応です。AI 取り込みには Microsoft Foundry を選択してください' } });
          const b = JSON.parse((await readBody(req, IMPORT_BODY_LIMIT)) || '{}') as {
            packId?: string; consent?: boolean; confirmed?: boolean; includesPerson?: boolean; personConfirmed?: boolean;
            fileName?: string; mime?: string; size?: number; dataBase64?: string;
          };
          const fail = (status: number, cause: string, extra: Record<string, unknown> = {}, message?: string) => json(status, { error: { cause, ...extra, ...(message ? { message } : {}) } });
          if (typeof b.packId !== 'string' || !b.packId || typeof b.dataBase64 !== 'string' || typeof b.fileName !== 'string') return fail(400, 'bad-request');
          if (b.consent !== true) return fail(403, 'consent');
          if (!foundryEnabled.has(b.packId)) return fail(403, 'disabled');
          const secret = getFoundry().importSecret();
          if (!secret) return fail(503, 'key-missing');
          if (b.includesPerson === true && b.personConfirmed !== true) return fail(403, 'person-unconfirmed');
          if (b.confirmed !== true) return fail(400, 'unconfirmed');
          const bytes = Buffer.byteLength(b.dataBase64, 'base64');
          if (bytes > AI_IMPORT_MAX_BYTES || (typeof b.size === 'number' && b.size > AI_IMPORT_MAX_BYTES)) return fail(413, 'too-large', { limitBytes: AI_IMPORT_MAX_BYTES });
          try {
            const entities = await importWithFoundry(secret, { name: b.fileName, mime: String(b.mime ?? ''), dataBase64: b.dataBase64 }, opts.foundryFetch, opts.foundryTimeoutMs, opts.foundryToken);
            return json(200, { preview: { entities } });
          } catch (e) {
            const kind = e instanceof FoundryError || e instanceof CopilotError ? e.kind : 'network';
            const status = /HTTP (\d+)/.exec(e instanceof Error ? e.message : '')?.[1];
            return fail(kind === 'timeout' ? 504 : 502, kind === 'http' ? 'upstream-status' : kind, status ? { status: Number(status) } : {});
          }
        }
        if (req.method === 'POST' && path === '/speech/synthesize') {
          const b = JSON.parse((await readBody(req)) || '{}') as { ssml?: string };
          const s = getVault().secret();
          if (!s) return json(409, { error: '音声合成の接続先とキーが設定されていません' });
          if (typeof b.ssml !== 'string' || !b.ssml) return json(400, { error: 'ssml が必要です' });
          try {
            const up = await speechFetch(s.endpoint, {
              method: 'POST',
              headers: { 'content-type': 'application/ssml+xml', 'ocp-apim-subscription-key': s.key, 'x-microsoft-outputformat': 'riff-16khz-16bit-mono-pcm' },
              body: b.ssml,
            });
            if (!up.ok) return json(502, { error: '音声合成の接続先がエラーを返しました' });
            const audio = Buffer.from(await up.arrayBuffer());
            res.writeHead(200, { 'content-type': 'audio/wav', ...(origin && originAllowed(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}) });
            return void res.end(audio);
          } catch {
            return json(502, { error: '音声合成の接続先に届きませんでした' });
          }
        }
        if (req.method === 'POST' && path === '/connection') {
          const b = JSON.parse((await readBody(req)) || '{}') as { packId?: string; enable?: boolean;           confirmed?: boolean; consent?: boolean };
          if (typeof b.packId !== 'string' || !b.packId) return json(400, { error: 'packId が必要です' });
          if (b.enable) {
                      // FR-181: 顧客の了承の記録（利用者の自己申告）がない案件は、実接続を有効にできない
                      if (b.consent !== true) return json(403, { error: '顧客の了承の記録がないため、実接続を有効にできません', mode: 'mock' });
                      if (b.confirmed !== true) return json(400, { error: '送信内容の確認が必要です' });
            if (!(await signedIn())) return json(409, { error: 'Copilot にサインインしていません', mode: 'mock' });
            enabled.add(b.packId);
          } else {
            enabled.delete(b.packId);
          }
          return json(200, { mode: enabled.has(b.packId) ? 'connected' : 'mock' });
        }
        // ---- FR-182: 音声合成（Azure AI Speech）・手書き認識（Azure AI Vision）。キーは中継側の環境変数だけ ----
        if (path.startsWith('/azure/')) {
          const az = opts.azure;
          if (req.method === 'POST' && path === '/azure/connection') {
            const b = JSON.parse((await readBody(req)) || '{}') as { feature?: string; packId?: string; enable?: boolean; confirmed?: boolean; consent?: boolean };
            if (!AZURE_FEATURES.includes(b.feature as AzureFeature) || typeof b.packId !== 'string' || !b.packId) return json(400, { error: 'feature・packId が必要です' });
            const feature = b.feature as AzureFeature;
            if (!b.enable) { az?.disable(feature, b.packId); return json(200, { mode: 'mock' }); }
            if (b.consent !== true) return json(403, { error: '顧客の了承の記録がないため、実接続を有効にできません', mode: 'mock' });
            if (b.confirmed !== true) return json(400, { error: '送信内容の確認が必要です' });
            if (!az) return json(200, { mode: 'mock', reason: 'キーが未設定のため、モックのまま動作します' });
            const r = az.enable(feature, b.packId, true);
            return json(200, r.ok ? { mode: 'connected' } : { mode: 'mock', reason: r.reason });
          }
          if (req.method === 'POST' && path === '/azure/speech') {
            const b = JSON.parse((await readBody(req)) || '{}') as { packId?: string; text?: string };
            if (typeof b.packId !== 'string' || typeof b.text !== 'string') return json(400, { error: 'packId・text が必要です' });
            if (b.text.length > MAX_SPEECH_TEXT_CHARS) return json(413, { error: `text は ${MAX_SPEECH_TEXT_CHARS} 文字までです` });
            return json(200, az ? await az.synthesize(b.packId, b.text) : { mode: 'mock', subtitleOnly: true });
          }
          if (req.method === 'POST' && path === '/azure/vision') {
            const b = JSON.parse((await readBody(req, MAX_IMAGE_BASE64_CHARS + 100_000)) || '{}') as { packId?: string; image?: string; strokeCount?: number };
            if (typeof b.packId !== 'string' || typeof b.image !== 'string') return json(400, { error: 'packId・image が必要です' });
            if (b.image.length > MAX_IMAGE_BASE64_CHARS) return json(413, { error: '画像が大きすぎます' });
            if (!isValidBase64(b.image)) return json(400, { error: 'image は base64 で指定してください' });
            const n = b.strokeCount ?? 0;
            if (!isValidStrokeCount(n)) return json(400, { error: 'strokeCount は 0 以上の整数で指定してください' });
            return json(200, az ? await az.recognize(b.packId, b.image, n) : { mode: 'mock', text: `手書きメモ（${n} 画。モックの認識結果）` });
          }
          return json(404, { error: 'not found' });
        }
        if (req.method === 'POST' && path === '/ask') {
          const b = JSON.parse((await readBody(req)) || '{}') as { kind?: string; packId?: string; prompt?: string };
          if (!AI_KINDS.includes(b.kind as AiKind) || typeof b.prompt !== 'string' || typeof b.packId !== 'string') {
            return json(400, { error: 'kind・packId・prompt が必要です' });
          }
          const kind = b.kind as AiKind;
          if (!opts.sdk || !enabled.has(b.packId)) {
            return json(200, { answer: mockAnswer(kind, b.prompt), sourceIds: [], mode: 'mock' });
          }
          const answer = await opts.sdk.complete(kind, b.prompt);
          return json(200, { answer, sourceIds: [], mode: 'connected' });
        }
        return json(404, { error: 'not found' });
      } catch (e) {
        if (e instanceof PayloadTooLarge) {
          res.once('finish', () => req.destroy());
          return json(413, { error: e.message });
        }
        if (e instanceof SyntaxError) return json(400, { error: 'JSON の形式が不正です' });
        if (e instanceof AzureServiceError) return json(502, { error: e.message, mode: 'connected' });
        return json(500, { error: '中継プロセスで処理できませんでした。接続設定と認証状態を確認してください' });
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, host, resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    host,
    port,
    url: `http://${host.includes(':') ? `[${host}]` : host}:${port}`,
    close: () => { invalidateConfiguration(); signin.close(); return new Promise<void>((r) => { server.close(() => r()); server.closeAllConnections?.(); }); },
  };
}
