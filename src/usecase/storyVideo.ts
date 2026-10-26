// ユースケースの「ストーリー動画」（FR-291）と作成 1 回の予算（FR-292）の純関数。画面・通信を持たない。
// - 生成AIは FR-275 の共通接続（中継プロセス）だけを通る。送るのはユースケースの名称・概要・対象ペルソナ・手順・期待する効果だけ。
// - 生成した HTML は検査（動画ファイル・外部 URL・fetch・XMLHttpRequest・eval などの不在）を通ったものだけ採用し、
//   同一オリジンの許可のない sandbox の iframe（srcdoc）に入れる。
// - 予算: 1 回の上限 PARAM-128（1,000 円）と月の予算の残額（PARAM-117）の小さいほうを超えない。見積り→事前の制御→実行中の制御→超過時の中止。
import { SETTINGS_GUIDE, BUDGET_STOP_PERCENT, BUDGET_YEN, type Usage } from '../ai/aiImportLogic';
import type { FoundryView } from '../ai/foundryClient';
import { signature, type UseCaseDraft } from './model';

/** PARAM-128: 作成 1 回あたりの予算の上限（円） */
export const STORY_VIDEO_BUDGET_YEN = 1000;
/** PARAM-129: 見積りの安全係数（提案値・承認待ち Q-065） */
export const STORY_VIDEO_SAFETY_FACTOR = 1.2;
/** PARAM-131: 1 回の作成で行う生成の呼び出しの最大回数（再試行・修復を含む。提案値・承認待ち Q-065） */
export const STORY_VIDEO_MAX_CALLS = 3;
/** PARAM-130: 単価（円／100万トークン）。値は未確定（Q-065）のため仮置きの既定値。利用者が確認・変更できる */
export interface Prices { inPerM: number; outPerM: number }
export const DEFAULT_PRICES: Prices = { inPerM: 500, outPerM: 2000 };
/** 依頼に指定する出力のトークンの上限（既定。見積りで超えるときは下げる） */
export const DEFAULT_OUT_LIMITS = { storyboard: 2000, animation: 6000 } as const;
const MIN_OUT_TOKENS = 500;
/** 指示文の概算の文字数（入力の概算に足す） */
const PROMPT_OVERHEAD_CHARS = 800;
const MAX_HTML_CHARS = 200_000;

export const yen = (n: number): string => `${(Math.round(n * 100) / 100).toLocaleString('ja-JP', { maximumFractionDigits: 2 })} 円`;

// ---- 送信内容 ----
export interface StoryVideoPayload { name: string; summary: string; persona: string; steps: { title: string; description: string }[]; effect: string }
/** 送るのは、選んだユースケースの名称・概要・対象ペルソナ・手順・期待する効果だけ（id・導出元などは含めない） */
export function toPayload(uc: UseCaseDraft): StoryVideoPayload {
  return { name: uc.name, summary: uc.summary, persona: uc.persona, effect: uc.effect, steps: uc.steps.map((s) => ({ title: s.title, description: s.description })) };
}

export interface StoryVideoScene { scene: string; person: string; trouble: string; change: string }
export interface StoryVideo { scenes: StoryVideoScene[]; html: string; signature: string; createdAt: string }
export type StoryVideoState = 'none' | 'latest' | 'stale';
export function storyVideoState(uc: UseCaseDraft, v: StoryVideo | undefined): StoryVideoState {
  if (!v) return 'none';
  return v.signature === signature(uc) ? 'latest' : 'stale';
}

// ---- 利用できる条件（FR-275 の外部送信の条件。欠けると呼び出し 0 回） ----
export type StoryVideoMissing = '設定' | '有効化' | '了承' | '接続先';
export interface StoryVideoAvailability { available: boolean; missing: StoryVideoMissing[]; guide: string }
export function storyVideoAvailability(view: FoundryView | null, consentGranted: boolean): StoryVideoAvailability {
  if (view?.provider === 'copilot') {
    return { available: false, missing: ['接続先'], guide: 'ストーリー動画は使えません（欠けている条件: 接続先）。GitHub Copilot SDK では費用を円で制御できないため、Foundry を選んだときだけ使えます。設定画面の「生成AIの接続先」で Microsoft Foundry を選択してください。' };
  }
  const missing: StoryVideoMissing[] = [];
  if (!view?.configured) missing.push('設定');
  if (!view?.enabled) missing.push('有効化');
  if (!consentGranted) missing.push('了承');
  if (missing.length === 0) return { available: true, missing, guide: '' };
  const parts = missing.map((m) => (m === '設定' ? 'Foundry の接続情報が設定されていません' : m === '有効化' ? 'Foundry の実接続（送信）が有効になっていません' : 'この案件に顧客の了承の記録がありません'));
  const where = missing.includes('了承') ? `${SETTINGS_GUIDE}顧客の了承は設定画面の「了承の記録」で入力します。` : SETTINGS_GUIDE;
  return { available: false, missing, guide: `ストーリー動画は使えません（欠けている条件: ${missing.join('・')}）。${parts.join('。')}。${where}` };
}

// ---- 見積り（FR-292 (1)(2)） ----
export const estimateTokens = (chars: number): number => Math.ceil(chars / 1.5); // 日本語でも過少にならない保守的な見積り（英数字 4 文字/トークンより多め）
export function callCostYen(inputTokens: number, outputTokens: number, prices: Prices, safety = STORY_VIDEO_SAFETY_FACTOR): number {
  return safety * ((inputTokens * prices.inPerM + outputTokens * prices.outPerM) / 1_000_000);
}
export interface OutLimits { storyboard: number; animation: number }
export type CallKind = 'storyboard' | 'animation';

/** 1 回の呼び出しの入力のトークン数の概算（文字数 ÷ 4 の切り上げ） */
export const inputTokensOf = (p: StoryVideoPayload): number => estimateTokens(JSON.stringify(p).length + PROMPT_OVERHEAD_CHARS);
export const callEstimateYen = (p: StoryVideoPayload, kind: CallKind, limits: OutLimits, prices: Prices): number => callCostYen(inputTokensOf(p), limits[kind], prices);
/** 作成 1 回の見積り（ストーリーボード 1 回 + アニメーション 1 回。修復の再試行は実行中に上限を見て判断する） */
export const totalEstimateYen = (p: StoryVideoPayload, limits: OutLimits, prices: Prices): number =>
  callEstimateYen(p, 'storyboard', limits, prices) + callEstimateYen(p, 'animation', limits, prices);

export interface PlanOk {
  ok: true; payload: StoryVideoPayload; limits: OutLimits; estimateYen: number; limitYen: number; monthRemainingYen: number;
  truncated: boolean; truncatedNote: string;
}
export interface PlanNg { ok: false; reason: 'budget' | 'month'; message: string; estimateYen: number; limitYen: number; monthRemainingYen: number }
export type Plan = PlanOk | PlanNg;

export const monthRemainingYen = (u: Usage): number => Math.max(0, BUDGET_YEN - u.costYen);
/** 上限の理由: 月の残額が 1 回の上限より小さければ月の予算 */
export const limitOf = (monthRemaining: number): { limitYen: number; reason: 'budget' | 'month' } =>
  monthRemaining < STORY_VIDEO_BUDGET_YEN ? { limitYen: monthRemaining, reason: 'month' } : { limitYen: STORY_VIDEO_BUDGET_YEN, reason: 'budget' };

/** 入力の切り詰め（優先順）: 0 全文 → 1 各説明を 80 文字まで → 2 手順を先頭から半分 → 3 手順を先頭 1 件 */
function trimmed(p: StoryVideoPayload, level: number): StoryVideoPayload {
  if (level <= 0) return p;
  const cut = { ...p, steps: p.steps.map((s) => ({ title: s.title, description: s.description.slice(0, 80) })) };
  if (level === 1) return cut;
  const n = level === 2 ? Math.max(1, Math.ceil(p.steps.length / 2)) : 1;
  return { ...cut, steps: cut.steps.slice(0, n) };
}

/** 事前の見積りと制御（FR-292 (1)(2)）。上限以内に収まる最初の組み合わせ（入力の切り詰め × 出力の上限の引き下げ）を選ぶ */
export function planStoryVideo(uc: UseCaseDraft, prices: Prices, usage: Usage): Plan {
  const full = toPayload(uc);
  const remaining = monthRemainingYen(usage);
  const { limitYen, reason } = limitOf(remaining);
  const fullEstimate = totalEstimateYen(full, { ...DEFAULT_OUT_LIMITS }, prices);
  const stopped = (usage.costYen / BUDGET_YEN) * 100 >= BUDGET_STOP_PERCENT;
  if (stopped || limitYen <= 0) {
    return { ok: false, reason: 'month', estimateYen: fullEstimate, limitYen: 0, monthRemainingYen: remaining, message: `今月の概算費用が月の予算（${yen(BUDGET_YEN)}）に達しているため、ストーリー動画は作成しません（呼び出し 0 回）。来月（月初）に再開するか、月の予算の設定を確認してください。` };
  }
  for (let level = 0; level <= 3; level++) {
    if (level > 0 && full.steps.length <= 1 && level >= 2) break;
    const payload = trimmed(full, level);
    for (const factor of [1, 0.5, 0.25]) {
      const limits: OutLimits = {
        storyboard: Math.max(MIN_OUT_TOKENS, Math.floor(DEFAULT_OUT_LIMITS.storyboard * factor)),
        animation: Math.max(MIN_OUT_TOKENS, Math.floor(DEFAULT_OUT_LIMITS.animation * factor)),
      };
      const estimate = totalEstimateYen(payload, limits, prices);
      if (estimate <= limitYen) {
        const notes: string[] = [];
        if (level === 1) notes.push('手順の説明を 80 文字までに切り詰めました');
        if (level >= 2) notes.push(`手順を先頭の ${payload.steps.length} 件に切り詰めました`);
        if (factor < 1) notes.push('出力の上限を下げました');
        return {
          ok: true, payload, limits, estimateYen: estimate, limitYen, monthRemainingYen: remaining,
          truncated: notes.length > 0, truncatedNote: notes.length > 0 ? `見積りが上限を超えるため切り詰めました（${notes.join('・')}）。` : '',
        };
      }
    }
  }
  const message = reason === 'month'
    ? `見積り（${yen(fullEstimate)}）が月の予算の残額（${yen(remaining)}）を超えるため、呼び出しません（呼び出し 0 回。理由: 月の予算）。月の予算の設定を確認するか、来月（月初）に再開してください。`
    : `入力を切り詰めても見積り（${yen(fullEstimate)}）が 1 回の上限（${yen(STORY_VIDEO_BUDGET_YEN)}）を超えるため、呼び出しません（呼び出し 0 回）。手順の数や説明を減らすか、単価の設定（安い配備）を確認してください。`;
  return { ok: false, reason, message, estimateYen: fullEstimate, limitYen, monthRemainingYen: remaining };
}

// ---- 生成物の検査（FR-291 AC-779） ----
export type HtmlCheck = { ok: true } | { ok: false; reasons: string[] };
const NS_ALLOWED = /https?:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink|1999\/xhtml)/gi;
const RULES: [RegExp, string][] = [
  [/<\s*(video|audio|source|track)\b/i, '動画・音声の要素（video・audio）'],
  [/\.(mp4|webm|mov|mkv|avi|gif|m3u8|mp3|wav|ogg)\b/i, '動画・音声・GIF のファイル'],
  [/data:\s*(video|audio)\//i, '動画・音声の埋め込み'],
  [/\b(MediaRecorder|captureStream)\b/, '動画の録画の API'],
  [/\bhttps?:\/\//i, '外部 URL'],
  [/\b(wss?|ftp):\/\//i, '外部 URL'],
  [/["'(=]\s*\/\/[a-z0-9-]+(\.[a-z0-9-]+)+/i, '外部 URL（プロトコル省略）'],
  [/\bfetch\s*\(/, 'fetch'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/\beval\s*\(/, 'eval'],
  [/\bnew\s+Function\b|\bFunction\s*\(/, 'Function による実行'],
  [/\bimport\s*\(|@import\b/i, '外部ファイルの読み込み（import）'],
  [/\b(WebSocket|EventSource|sendBeacon)\b/, '外部への通信の API'],
  [/<\s*(link|iframe|object|embed|base|form)\b/i, '外部読み込み・入れ子の要素'],
  [/<\s*script\b[^>]*\bsrc\s*=/i, '外部のスクリプト'],
];
const SAFE_REF = /^(#|data:image\/(png|jpeg|svg\+xml|webp))/i;
/** src・href・url() の参照先は、ページ内（#）と画像の data: だけ許可する */
function badRefs(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/\b(?:src|href|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    if (!SAFE_REF.test((m[1] ?? m[2] ?? m[3] ?? '').trim())) { out.push('許可していない外部読み込み（src・href）'); break; }
  }
  for (const m of body.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
    if (!SAFE_REF.test((m[1] ?? m[2] ?? m[3] ?? '').trim())) { out.push('許可していない外部読み込み（url()）'); break; }
  }
  return out;
}
/** 採用してよい出力か。HTML・CSS・JS・SVG だけで、動画ファイル・外部 URL・fetch・XMLHttpRequest・eval などを含まないこと */
export function validateAnimationHtml(html: unknown): HtmlCheck {
  if (typeof html !== 'string' || !html.trim()) return { ok: false, reasons: ['アニメーションの HTML が空です'] };
  if (html.length > MAX_HTML_CHARS) return { ok: false, reasons: [`HTML が大きすぎます（${MAX_HTML_CHARS.toLocaleString('ja-JP')} 文字まで）`] };
  if (!/<\s*(html|svg|body|div|style)\b/i.test(html)) return { ok: false, reasons: ['HTML として読み取れません'] };
  const body = html.replace(NS_ALLOWED, '');
  const reasons = [...new Set([...RULES.filter(([re]) => re.test(body)).map(([, why]) => why), ...badRefs(body)])];
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/** 表示枠（iframe）の sandbox。スクリプトだけ許可し、同一オリジン・フォーム・ポップアップ・ダウンロードは許可しない */
export const STORY_VIDEO_SANDBOX = 'allow-scripts';
const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";
/** 再生・一時停止を親から受ける小さな制御（postMessage）。外部通信はしない */
const CONTROL = `<script>(function(){var st=document.createElement('style');st.textContent='.sv-paused *{animation-play-state:paused!important;transition:none!important}';document.head.appendChild(st);
window.addEventListener('message',function(e){var a=e&&e.data&&e.data.storyVideo;if(!a)return;var p=a==='pause';document.documentElement.classList.toggle('sv-paused',p);
var s=document.querySelectorAll('svg');for(var i=0;i<s.length;i++){try{p?s[i].pauseAnimations():s[i].unpauseAnimations();}catch(x){}}});})();</script>`;
/** 検査を通った HTML を iframe の srcdoc にする（外部通信を禁じる CSP と、再生・一時停止の制御を足す） */
export function toSrcDoc(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
  const head = /<head(\s[^>]*)?>/i;
  const doc = head.test(html) ? html.replace(head, (m) => `${m}${meta}`) : `<!doctype html><html><head><meta charset="utf-8">${meta}</head><body>${html}</body></html>`;
  return /<\/body>/i.test(doc) ? doc.replace(/<\/body>/i, `${CONTROL}</body>`) : `${doc}${CONTROL}`;
}

// ---- 作成の実行（FR-292 (3)(4)） ----
export interface Usage2 { inputTokens: number; outputTokens: number }
export type CallResult =
  | { ok: true; scenes?: StoryVideoScene[]; html?: string; usage?: Usage2 }
  | { ok: false; cause: string; message: string };
export type AbortReason = 'limit' | 'month' | 'user';
export type RunOutcome =
  | { status: 'done'; scenes: StoryVideoScene[]; html: string; costYen: number; calls: number }
  | { status: 'aborted'; reason: AbortReason; message: string; costYen: number; calls: number }
  | { status: 'failed'; message: string; costYen: number; calls: number };

export interface RunDeps {
  call: (kind: CallKind, payload: StoryVideoPayload, maxOutputTokens: number) => Promise<CallResult>;
  /** 1 回の呼び出しごとに概算費用を月の記録へ算入する（失敗した呼び出しも） */
  recordCost: (yen: number, usage: Usage2) => void;
  isCancelled: () => boolean;
  onProgress?: (cumulativeYen: number, calls: number) => void;
}
export interface RunPlan { payload: StoryVideoPayload; limits: OutLimits; limitYen: number; monthRemainingYen: number; prices: Prices }

const ABORT_TEXT: Record<AbortReason, (cost: number, limit: number) => string> = {
  limit: (c, l) => `概算の費用が上限（${yen(l)}）に達した（または次の呼び出しで超える見込みの）ため、作成を中止しました（累計 ${yen(c)}）。途中の生成物は採用していません。`,
  month: (c) => `月の予算の残額が尽きる（または次の呼び出しで超える見込みの）ため、作成を中止しました（理由: 月の予算。累計 ${yen(c)}）。途中の生成物は採用していません。`,
  user: (c) => `作成を中止しました（累計 ${yen(c)}）。途中の生成物は採用していません。`,
};

/** 作成の実行。呼び出しは最大 PARAM-131 回、1 回ごとに累計を更新し、上限に達する・超える見込みなら以後の呼び出しをただちに止める */
export async function runStoryVideo(plan: RunPlan, deps: RunDeps): Promise<RunOutcome> {
  const { limitYen, monthRemainingYen: monthLeft } = plan;
  const limitReason: AbortReason = monthLeft < STORY_VIDEO_BUDGET_YEN ? 'month' : 'limit';
  let cum = 0;
  let calls = 0;
  let scenes: StoryVideoScene[] | undefined;
  let lastReasons: string[] = [];
  const abort = (reason: AbortReason): RunOutcome => ({ status: 'aborted', reason, message: ABORT_TEXT[reason](cum, limitYen), costYen: cum, calls });

  const sequence: CallKind[] = ['storyboard', 'animation', 'animation', 'animation'];
  for (const kind of sequence) {
    if (kind === 'storyboard' && scenes) continue;
    if (kind === 'animation' && !scenes) break;
    if (deps.isCancelled()) return abort('user');
    if (calls >= STORY_VIDEO_MAX_CALLS) break;
    const est = callEstimateYen(plan.payload, kind, plan.limits, plan.prices);
    if (cum >= limitYen || cum + est > limitYen) return abort(limitReason);
    calls += 1;
    const r = await deps.call(kind, plan.payload, plan.limits[kind]);
    const usage: Usage2 = r.ok && r.usage ? r.usage : { inputTokens: inputTokensOf(plan.payload), outputTokens: plan.limits[kind] };
    const cost = r.ok && r.usage ? callCostYen(usage.inputTokens, usage.outputTokens, plan.prices) : est; // 失敗・使用量なしは見積りで数える（安全側）
    cum += cost;
    deps.recordCost(cost, usage);
    deps.onProgress?.(cum, calls);
    if (cum >= limitYen) return abort(limitReason);
    if (deps.isCancelled()) return abort('user');
    if (!r.ok) return { status: 'failed', message: r.message, costYen: cum, calls };
    if (kind === 'storyboard') {
      if (!Array.isArray(r.scenes) || r.scenes.length === 0) return { status: 'failed', message: '生成AIの応答からストーリーボードを読み取れませんでした。もう一度試してください。', costYen: cum, calls };
      scenes = r.scenes;
      continue;
    }
    const check = validateAnimationHtml(r.html);
    if (check.ok && scenes) return { status: 'done', scenes, html: r.html as string, costYen: cum, calls };
    lastReasons = check.ok ? [] : check.reasons;
  }
  return { status: 'failed', message: `生成されたアニメーションは検査を通らなかったため採用しませんでした（${lastReasons.join('・') || '未生成'}）。もう一度作成してください。`, costYen: cum, calls };
}

// ---- 利用量の記録（端末内。日付・回数・トークン数・概算費用だけ。入力の文章・生成結果は記録しない） ----
export interface UsageLogEntry { date: string; calls: number; inputTokens: number; outputTokens: number; costYen: number; outcome: 'done' | 'limit' | 'month' | 'user' | 'failed' }
export interface LogStore { get(): UsageLogEntry[]; set(v: UsageLogEntry[]): void }
const LOG_KEY = 'edb.storyVideoLog';
const LOG_MAX = 200;
export const browserLogStore: LogStore = {
  get() { try { const v = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]') as unknown; return Array.isArray(v) ? (v as UsageLogEntry[]) : []; } catch { return []; } },
  set(v) { try { localStorage.setItem(LOG_KEY, JSON.stringify(v.slice(-LOG_MAX))); } catch { /* 保存できなくても動作は続ける */ } },
};
export function appendUsageLog(store: LogStore, e: UsageLogEntry): void { store.set([...store.get(), e]); }

// ---- 単価（PARAM-130。端末内に保存。利用者が確認・変更できる） ----
export interface PriceStore { get(): Prices | null; set(p: Prices): void }
const PRICE_KEY = 'edb.storyVideoPrices';
export const browserPriceStore: PriceStore = {
  get() {
    try {
      const v = JSON.parse(localStorage.getItem(PRICE_KEY) ?? 'null') as Partial<Prices> | null;
      return v && Number.isFinite(v.inPerM) && Number.isFinite(v.outPerM) && v.inPerM! >= 0 && v.outPerM! >= 0 ? { inPerM: v.inPerM!, outPerM: v.outPerM! } : null;
    } catch { return null; }
  },
  set(p) { try { localStorage.setItem(PRICE_KEY, JSON.stringify(p)); } catch { /* 保存できなくても動作は続ける */ } },
};
export const currentPrices = (s: PriceStore = browserPriceStore): Prices => s.get() ?? DEFAULT_PRICES;

// ---- 中継プロセスへの依頼（FR-275 の共通接続。新しい接続設定・キー保管なし） ----
type F = typeof fetch;
const dflt: F = (u, i) => fetch(u, i);
const NO_RELAY = '中継プロセスに届きませんでした。`npm run relay` で起動しているか確認してください。';
const CAUSE_TEXT: Record<string, string> = {
  consent: '顧客の了承の記録がないため送信できません。設定画面で了承の記録を確認してください。',
  disabled: 'Foundry の実接続が有効ではありません。設定画面で送信を有効にしてください。',
  'key-missing': 'Foundry の接続情報が未設定です。設定画面で接続情報を確認してください。',
  'person-unconfirmed': '種別「人」を含む顧客パックは、送信前の確認が必要です。',
  unsupported: 'GitHub Copilot SDK では使えません。設定画面の「生成AIの接続先」で Microsoft Foundry を選んでください。',
  timeout: 'Foundry の応答がタイムアウトしました。しばらくしてから、もう一度試してください。',
  network: 'Foundry に接続できませんでした。ネットワークと設定画面のエンドポイントを確認し、もう一度試してください。',
  format: 'Foundry の応答から内容を読み取れませんでした。もう一度試してください。',
};
export function describeStoryVideoFailure(cause: string | undefined, status?: number): string {
  if (cause === 'upstream-status') return `Foundry がエラーを返しました（HTTP ${status ?? '不明'}）。設定画面で接続情報を確認してから、もう一度試してください。`;
  return CAUSE_TEXT[cause ?? ''] ?? 'ストーリー動画の作成に失敗しました。設定画面で接続情報を確認してから、もう一度試してください。';
}

export async function requestStoryVideo(
  relayUrl: string | undefined,
  req: { packId: string; kind: CallKind; usecase: StoryVideoPayload; consent: boolean; includesPerson: boolean; personConfirmed: boolean; maxOutputTokens: number },
  f: F = dflt,
): Promise<CallResult> {
  if (!relayUrl || !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(relayUrl.replace(/\/$/, ''))) return { ok: false, cause: 'relay', message: NO_RELAY };
  try {
    const r = await f(`${relayUrl}/foundry/story-video`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: req.kind, usecase: req.usecase, packId: req.packId, consent: req.consent, confirmed: true,
        includesPerson: req.includesPerson, personConfirmed: req.personConfirmed, maxOutputTokens: req.maxOutputTokens,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { scenes?: unknown; html?: unknown; usage?: { inputTokens?: number; outputTokens?: number }; error?: { cause?: string; status?: number } };
    if (!r.ok) return { ok: false, cause: j.error?.cause ?? 'error', message: describeStoryVideoFailure(j.error?.cause, j.error?.status) };
    const usage = j.usage && Number.isFinite(j.usage.inputTokens) && Number.isFinite(j.usage.outputTokens)
      ? { inputTokens: Number(j.usage.inputTokens), outputTokens: Number(j.usage.outputTokens) } : undefined;
    if (req.kind === 'storyboard') {
      const scenes = Array.isArray(j.scenes) ? (j.scenes as Partial<StoryVideoScene>[]).map((s) => ({
        scene: String(s?.scene ?? ''), person: String(s?.person ?? ''), trouble: String(s?.trouble ?? ''), change: String(s?.change ?? ''),
      })).filter((s) => s.scene) : [];
      return scenes.length > 0 ? { ok: true, scenes, usage } : { ok: false, cause: 'format', message: describeStoryVideoFailure('format') };
    }
    return typeof j.html === 'string' && j.html ? { ok: true, html: j.html, usage } : { ok: false, cause: 'format', message: describeStoryVideoFailure('format') };
  } catch {
    return { ok: false, cause: 'relay', message: NO_RELAY };
  }
}
