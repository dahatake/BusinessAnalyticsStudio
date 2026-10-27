// 実接続の有効化で利用者が確認した「送信される情報の種類」の記録（FR-275 AC-703・FR-290 AC-777）。端末内（localStorage）に案件ごとに残す。
// 種類が増えた（例: FR-290 のプレゼンテーションの材料）のに、有効化の確認がそれより前なら、増えた種類を示して再確認するまで送らない。
// 残すのは種類の ID だけで、送る内容・キーは持たない。
import { tr } from '../i18n';

export const KIND_PRESENTATION = 'presentation-story';

/** 現在の送信される情報の種類（有効化の確認で示すもの） */
export const SEND_KINDS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'screen', label: '現在画面に表示している課題・解決策・KPI/OKR の文章' },
  { id: 'genai-scenario', label: '活用シナリオの分析で入力した解決策の文章' },
  { id: 'chat', label: 'チャットの質問・直近の履歴・顧客パックの根拠' },
  { id: KIND_PRESENTATION, label: 'プレゼンテーションの生成 AI による作成で選んだペルソナと材料（解決策・優先順位・ROI・コスト・KPI/OKR・ユースケース・番組構成）' },
];

/** 有効化の確認の文に入れる、送信される情報の種類の列挙 */
export const SEND_KINDS_TEXT = SEND_KINDS.map((k) => k.label).join('、');

const KEY = 'edb.ai.confirmedSendKinds';

function load(): Record<string, string[]> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const j = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return j && typeof j === 'object' ? (j as Record<string, string[]>) : {};
  } catch { return {}; }
}
function save(v: Record<string, string[]>): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* 保存できなくても送信の判定は安全側（再確認）になる */ }
}

export function confirmedSendKinds(packId: string): string[] {
  const v = load()[packId];
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

/** 有効化の確認（または再確認）で、現在の種類をすべて確認したと記録する */
export function recordConfirmedSendKinds(packId: string): void {
  if (!packId) return;
  save({ ...load(), [packId]: SEND_KINDS.map((k) => k.id) });
}

export function clearConfirmedSendKinds(packId: string): void {
  const v = load();
  if (!(packId in v)) return;
  delete v[packId];
  save(v);
}

/** 確認済みの種類に含まれない種類（確認が必要なもの） */
export function missingSendKinds(confirmed: readonly string[], needed: readonly string[]): Array<{ id: string; label: string }> {
  return SEND_KINDS.filter((k) => needed.includes(k.id) && !confirmed.includes(k.id)).map((k) => ({ id: k.id, label: tr(k.label) }));
}
