// 種別「人」を含む顧客パックの外部送信・エクスポート前の確認（FR-219）。
// 判定（確認が要るか・了承がないと続行できない・同じ内容で続行を引き継ぐ）は、ここに集める。確認の画面は PersonConfirmDialog。
// 了承の記録（FR-181）の判定は consent.ts・useConsent を再利用し、確認の表示は了承を検証しない（自己申告）。
// 確認には、件数・範囲・確認日だけを出し、種別「人」の個人名・連絡先の値は渡さない。
import { create } from 'zustand';
import { askAi, type AiEnv, type AiRequest, type AiResult } from './client';
import { consentKeyOf, type ConsentRecord } from './consent';
import { useConsentStore } from './useConsent';
import { tr } from '../i18n';

/** 外部へ出る先の種類 */
export type PersonDestination = 'ai' | 'export';

export const DESTINATION_LABELS: Record<PersonDestination, string> = {
  ai: '外部の AI（Copilot SDK・設定した AI API。中継プロセス経由）',
  export: 'エクスポート（ファイルへの出力）',
};

/** 確認に出す内容。個人名・連絡先の値は持たない */
export interface PersonConfirmRequest {
  destination: PersonDestination;
  /** 送る・出力する範囲（文字） */
  scopeLabel: string;
  /** 種別「人」のエンティティの件数 */
  personCount: number;
  /** 了承の記録の確認日。記録がなければ undefined（続行できない） */
  confirmedOn: string | undefined;
}

export type PersonDecision = 'proceed' | 'cancel';

export interface PersonPackLike {
  customer: { name: string; projectName: string };
  entities: { entities: ReadonlyArray<{ kind?: string }> };
}

export function countPersons(data: Pick<PersonPackLike, 'entities'>): number {
  return data.entities.entities.filter((e) => e.kind === 'person').length;
}

/** 顧客パックの内容の指紋（同じ内容かどうかの判定用。内容が変わると変わる） */
export function contentFingerprint(data: unknown): string {
  const s = JSON.stringify(data) ?? '';
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${s.length}:${h.toString(16)}`;
}

/** 前回の続行の選択の引き継ぎ（メモリー上だけ。アプリを開き直すと消える） */
const proceeded = new Set<string>();
export function resetPersonConfirmMemory(): void { proceeded.clear(); }

export interface PersonGateResult {
  allowed: boolean;
  /** 確認を出したか（引き継ぎで省いたときは false） */
  asked: boolean;
  reason?: string;
}

export const NO_CONSENT_REASON = '顧客の了承の記録がないため、送信・出力しません。設定画面で了承の記録を入力してください。';
export const CANCELLED_REASON = '確認で中止を選んだため、送信・出力しませんでした。';

export interface PersonGateInput {
  destination: PersonDestination;
  scopeLabel: string;
  data: PersonPackLike;
  consent: ConsentRecord | undefined;
  confirm: (req: PersonConfirmRequest) => Promise<PersonDecision>;
  /** 引き継ぎの置き場（既定はアプリ全体で 1 つ） */
  memory?: Set<string>;
}

/**
 * 外部へ送る・出力する前の確認（FR-219）。
 * 種別「人」がなければ確認なし。了承の記録がなければ確認を出して必ず止める。了承があれば続行／中止を選ばせ、
 * 同じ内容（顧客パックの内容・送信先の種類・件数）で了承の記録が変わらない間は、前回の続行を引き継いで確認を繰り返さない。
 */
export async function gatePersonConfirm(g: PersonGateInput): Promise<PersonGateResult> {
  const personCount = countPersons(g.data);
  if (personCount === 0) return { allowed: true, asked: false };
  const memory = g.memory ?? proceeded;
  const req: PersonConfirmRequest = { destination: g.destination, scopeLabel: g.scopeLabel, personCount, confirmedOn: g.consent?.confirmedOn };
  if (!g.consent) {
    await g.confirm(req); // 続行できない確認。閉じるだけ
    return { allowed: false, asked: true, reason: tr(NO_CONSENT_REASON) };
  }
  const sig = [g.destination, personCount, contentFingerprint(g.data), g.consent.confirmedOn, g.consent.note].join('|');
  if (memory.has(sig)) return { allowed: true, asked: false };
  const d = await g.confirm(req);
  if (d !== 'proceed') return { allowed: false, asked: true, reason: tr(CANCELLED_REASON) };
  memory.add(sig);
  return { allowed: true, asked: true };
}

/** 確認の画面の状態。PersonConfirmDialog が request を表示し、答えを返す */
interface PersonConfirmUi {
  request: PersonConfirmRequest | null;
  ask: (req: PersonConfirmRequest) => Promise<PersonDecision>;
  answer: (d: PersonDecision) => void;
}
let pending: ((d: PersonDecision) => void) | null = null;
export const usePersonConfirmUi = create<PersonConfirmUi>((set) => ({
  request: null,
  ask: (request) => new Promise<PersonDecision>((resolve) => {
    pending?.('cancel');
    pending = resolve;
    set({ request });
  }),
  answer: (d) => {
    const r = pending;
    pending = null;
    set({ request: null });
    r?.(d);
  },
}));

/** この案件の了承の記録（画面の外からも読める） */
export function consentOf(data: Pick<PersonPackLike, 'customer'>): ConsentRecord | undefined {
  return useConsentStore.getState().records[consentKeyOf(data.customer.name, data.customer.projectName)];
}

/** 画面の確認を使った確認（実アプリ用） */
export const confirmViaUi = (req: PersonConfirmRequest): Promise<PersonDecision> => usePersonConfirmUi.getState().ask(req);

/** 利用者の操作を待たずに自動で呼ばれる AI の種別 */
const AUTOMATIC_KINDS: ReadonlySet<string> = new Set(['exec-summary']);

export const AI_SCOPE_LABEL = '顧客パックの内容を含む AI への送信（質問と、根拠として添える顧客パックの内容）';

/** AI の呼び出し。実接続（外部へ送る）のときだけ確認を通し、止められたら送信せずに失敗させる（モックは送信がないので確認しない） */
export async function askAiWithPersonConfirm(
  req: AiRequest,
  env: AiEnv,
  ctx: { data: PersonPackLike | undefined; consent: ConsentRecord | undefined; confirm?: PersonGateInput['confirm']; memory?: Set<string> },
): Promise<AiResult> {
  if (env.realEnabled && ctx.data) {
    // 利用者の送信の操作ではない自動の呼び出し（要約の自動更新）は、確認の画面を出さない（A-59: 確認は送信の操作のたび）。
    // 利用者が続行を選んだ内容と同じものだけを送り、未確認なら送らない（呼び出し側はテンプレートのまま）
    const silent = AUTOMATIC_KINDS.has(req.kind);
    const r = await gatePersonConfirm({
      destination: 'ai', scopeLabel: AI_SCOPE_LABEL, data: ctx.data, consent: ctx.consent,
      confirm: ctx.confirm ?? (silent ? async () => 'cancel' : confirmViaUi), ...(ctx.memory ? { memory: ctx.memory } : {}),
    });
    if (!r.allowed) throw new Error(r.reason);
  }
  return askAi(req, env);
}
