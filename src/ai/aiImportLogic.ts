// AI 取り込み（FR-289）。生成 AI（Microsoft Foundry）でファイルを取り込む。
// - 選べる条件: 接続設定が「設定済み」（API キー・Entra ID のどちらでも）・実接続が有効・了承の記録がある。欠けるときは理由と設定画面への案内を返し、呼び出しは 0 回。
// - 送るのは中継プロセス（localhost）だけ。API キーはブラウザーに来ないので、要求にも応答にも含まれない（NFR-SEC-012）。
// - 費用: FR-276 の月の予算（PARAM-117）・警告（PARAM-118）・停止（PARAM-119）の概算に算入する。
import { isLoopbackUrl } from './client';
import type { FoundryView } from './foundryClient';

/** PARAM-125: AI 取り込みで送れるファイル 1 件の大きさ（MB） */
export const AI_IMPORT_MAX_MB = 10;
export const AI_IMPORT_MAX_BYTES = AI_IMPORT_MAX_MB * 1024 * 1024;
/** PARAM-117 / 118 / 119（FR-276） */
export const BUDGET_YEN = 100000;
export const BUDGET_WARN_PERCENT = 80;
export const BUDGET_STOP_PERCENT = 100;
/** 概算の単価（仮置き。入力 1,000 トークンあたりの円。出力は固定の上限で数える）。FR-276 の設定画面で変更できるようになるまでの既定値 */
export const YEN_PER_1K_INPUT_TOKENS = 0.5;
export const YEN_PER_1K_OUTPUT_TOKENS = 2;
export const IMPORT_OUTPUT_TOKENS = 4000;

export const SETTINGS_GUIDE = '設定画面の「Microsoft Foundry」で接続情報を設定し、送信を有効にしてください。';

export type MissingCondition = '設定' | '有効化' | '了承' | '接続先';

export interface Availability {
  available: boolean;
  missing: MissingCondition[];
  /** 欠けているときの案内文（設定画面への案内を含む）。そろっているときは空 */
  guide: string;
}

/** 3 つの条件（設定済み・実接続の有効化・了承の記録）がそろうときだけ選べる */
export function aiImportAvailability(view: FoundryView | null, consentGranted: boolean): Availability {
  const missing: MissingCondition[] = [];
  // FR-289 AC-757: 接続先が Copilot SDK のときは、ほかの条件がそろっていても選べない（欠けている条件「接続先」）
  if (view?.provider === 'copilot') return { available: false, missing: ['接続先'], guide: 'AI 取り込みは使えません（欠けている条件: 接続先）。Copilot SDK では未対応です。AI 取り込み・ファイル添付には、設定画面の「生成AIの接続先」で Microsoft Foundry を選択してください。' };
  if (!view?.configured) missing.push('設定');
  if (!view?.enabled) missing.push('有効化');
  if (!consentGranted) missing.push('了承');
  if (missing.length === 0) return { available: true, missing, guide: '' };
  const parts = missing.map((m) => (m === '設定' ? 'Foundry の接続情報が設定されていません' : m === '有効化' ? 'Foundry の実接続（送信）が有効になっていません' : 'この案件に顧客の了承の記録がありません'));
  const where = missing.includes('了承') ? `${SETTINGS_GUIDE}顧客の了承は設定画面の「了承の記録」で入力します。` : SETTINGS_GUIDE;
  return { available: false, missing, guide: `AI 取り込みは使えません（欠けている条件: ${missing.join('・')}）。${parts.join('。')}。${where}` };
}

export function checkSize(bytes: number): { ok: true } | { ok: false; message: string } {
  return bytes > AI_IMPORT_MAX_BYTES
    ? { ok: false, message: `ファイルの大きさが上限の ${AI_IMPORT_MAX_MB} MB を超えているため、送信しません。ファイルを小さくするか分割して、選び直してください。` }
    : { ok: true };
}

// ---- 月の概算費用（端末のローカルの暦月。月初にリセット。ファイルの内容は記録しない） ----
export interface Usage { month: string; calls: number; costYen: number }
export interface UsageStore { get(): Usage | null; set(u: Usage): void }

const KEY = 'edb.foundryImportUsage';
export const browserUsageStore: UsageStore = {
  get() {
    try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Usage | null; } catch { return null; }
  },
  set(u) { try { localStorage.setItem(KEY, JSON.stringify(u)); } catch { /* 保存できなくても動作は続ける */ } },
};

export const monthOf = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function estimateCostYen(bytes: number): number {
  const inputTokens = Math.ceil(bytes / 4);
  return (inputTokens / 1000) * YEN_PER_1K_INPUT_TOKENS + (IMPORT_OUTPUT_TOKENS / 1000) * YEN_PER_1K_OUTPUT_TOKENS;
}

export function currentUsage(store: UsageStore, now: Date): Usage {
  const u = store.get();
  return u && u.month === monthOf(now) ? u : { month: monthOf(now), calls: 0, costYen: 0 };
}

export type BudgetState = { state: 'ok' } | { state: 'warn'; message: string } | { state: 'stop'; message: string };

/** 今回の呼び出しを足した概算が、停止の水準に達するなら 'stop'（呼ばない）、警告の水準なら 'warn' */
export function budgetState(u: Usage, addYen: number): BudgetState {
  const percent = ((u.costYen + addYen) / BUDGET_YEN) * 100;
  if (percent >= BUDGET_STOP_PERCENT) return { state: 'stop', message: `今月の概算費用が予算（${BUDGET_YEN.toLocaleString('ja-JP')} 円）の ${BUDGET_STOP_PERCENT}% に達するため、AI 取り込みは呼び出しません。来月（月初）に再開するか、予算の設定を確認してください。` };
  if (percent >= BUDGET_WARN_PERCENT) return { state: 'warn', message: `今月の概算費用が予算の ${BUDGET_WARN_PERCENT}% に達しています。` };
  return { state: 'ok' };
}

/** 呼び出しを概算に算入する（失敗した呼び出しも数える。安全側） */
export function recordCall(store: UsageStore, now: Date, addYen: number): Usage {
  const u = currentUsage(store, now);
  const next = { month: u.month, calls: u.calls + 1, costYen: u.costYen + addYen };
  store.set(next);
  return next;
}

// ---- 中継プロセスへの依頼 ----
export interface ImportEntity { name: string; description: string }
export type ImportResult = { ok: true; entities: ImportEntity[] } | { ok: false; message: string };

type F = typeof fetch;
const dflt: F = (u, i) => fetch(u, i);
const NO_RELAY = '中継プロセスに届きませんでした。`npm run relay` で起動しているか確認してください。';

const CAUSE_TEXT: Record<string, string> = {
  consent: '顧客の了承の記録がないため送信できません。設定画面で了承の記録を確認してください。',
  disabled: 'Foundry の実接続が有効ではありません。設定画面で送信を有効にしてください。',
  'key-missing': 'Foundry の接続情報が未設定です。設定画面で接続情報を確認してください。',
  'person-unconfirmed': '種別「人」を含む顧客パックは、送信前の確認が必要です。',
  unconfirmed: '送信前の確認がないため送信できません。',
  'too-large': `ファイルの大きさが上限の ${AI_IMPORT_MAX_MB} MB を超えています。ファイルを小さくして選び直してください。`,
  timeout: 'Foundry の応答がタイムアウトしました。しばらくしてから、もう一度試してください。',
  network: 'Foundry に接続できませんでした。ネットワークと設定画面のエンドポイントを確認し、もう一度試してください。',
  format: 'Foundry の応答から取り込める内容を読み取れませんでした。別のファイルで、もう一度試してください。',
};

/** 失敗の原因と次の行動の文（FR-283 に揃える）。認証情報・上流の本文は含めない */
export function describeFailure(cause: string | undefined, status?: number): string {
  if (cause === 'upstream-status') {
    return `Foundry がエラーを返しました（HTTP ${status ?? '不明'}）。設定画面で接続情報を確認してから、もう一度試してください。取り込み済みのデータは変わっていません。`;
  }
  return `${CAUSE_TEXT[cause ?? ''] ?? 'AI 取り込みに失敗しました。設定画面で接続情報を確認してから、もう一度試してください。'}取り込み済みのデータは変わっていません。`;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** ファイルを中継プロセスへ送る。呼ぶ前に、可用性・大きさ・予算・送信前の確認を済ませておくこと */
export async function requestAiImport(
  relayUrl: string | undefined,
  req: { packId: string; file: File; consent: boolean; includesPerson: boolean; personConfirmed: boolean },
  f: F = dflt,
): Promise<ImportResult> {
  if (!relayUrl || !isLoopbackUrl(relayUrl)) return { ok: false, message: NO_RELAY };
  let dataBase64: string;
  try { dataBase64 = toBase64(await req.file.arrayBuffer()); } catch { return { ok: false, message: 'ファイルを読み込めませんでした。ファイルを確認して、選び直してください。' }; }
  try {
    const r = await f(`${relayUrl}/foundry/import`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        packId: req.packId, consent: req.consent, confirmed: true, includesPerson: req.includesPerson, personConfirmed: req.personConfirmed,
        fileName: req.file.name, mime: req.file.type, size: req.file.size, dataBase64,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { preview?: { entities?: ImportEntity[] }; error?: { cause?: string; status?: number } };
    if (r.ok && Array.isArray(j.preview?.entities) && j.preview.entities.length > 0) return { ok: true, entities: j.preview.entities };
    return { ok: false, message: describeFailure(j.error?.cause ?? (r.ok ? 'format' : undefined), j.error?.status) };
  } catch {
    return { ok: false, message: NO_RELAY };
  }
}
