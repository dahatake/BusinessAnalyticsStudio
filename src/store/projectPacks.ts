// FR-043 AC-054: 編集・読み込み済みのパックをProjectごとに端末内だけで保持する。
// 旧mocks、解決策の参照、任意の互換データを削らず、元のJSONを丸ごと保存する。
import { validatePack, type BrandProfile, type PackData, type PackFiles } from '../schema';

export const PROJECT_PACKS_KEY = 'eabk.project-packs.v1';
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function read(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PROJECT_PACKS_KEY) ?? '{}');
    return isObject(value) ? value : {};
  } catch { return {}; }
}

export function saveProjectPack(id: string | null, data: PackData): void {
  if (!id) return; // デモの編集を実際のProjectに保存しない。
  try { localStorage.setItem(PROJECT_PACKS_KEY, JSON.stringify({ ...read(), [id]: data })); }
  catch { /* 容量不足・保存無効でも、現在のパックはメモリーに残して操作を続ける。 */ }
}

/**
 * 顧客パックの取り込み（FR-302 AC-842）用の保存。失敗を返し、書いて読み戻して確かめる。
 * 失敗（容量不足・保存無効・読み戻しの不一致）のときは、保存前の内容に戻す（一部だけ保存された状態を残さない）。
 * `saveProjectPack` の挙動は変えない（編集中の保存は、失敗してもメモリー上で続ける）。
 */
export function saveProjectPackStrict(id: string, data: PackData): { ok: true } | { ok: false; reason: string } {
  let before: string | null = null;
  try {
    before = localStorage.getItem(PROJECT_PACKS_KEY);
    const next = JSON.stringify({ ...read(), [id]: data });
    localStorage.setItem(PROJECT_PACKS_KEY, next);
    if (localStorage.getItem(PROJECT_PACKS_KEY) !== next) throw new Error('read-back mismatch');
    return { ok: true };
  } catch (e) {
    try {
      if (before === null) localStorage.removeItem(PROJECT_PACKS_KEY);
      else localStorage.setItem(PROJECT_PACKS_KEY, before);
    } catch { /* 元に戻せないときは、これ以上できない */ }
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export function readProjectPack(id: string | null, brand: BrandProfile): PackData | undefined {
  if (!id) return undefined;
  const value = read()[id];
  if (!isObject(value)) return undefined;
  // 保存内容を信頼せず、通常と同じスキーマ・ID・参照検証を通す。壊れた記録自体は消さない。
  const result = validatePack({ ...value, brandProfile: brand } as PackFiles);
  return result.errors.length === 0 ? value as unknown as PackData : undefined;
}
