// 機密区分 `internal` の項目の匿名化（FR-117、エクスポートの FR-054 が使う）。
// 規則は要求定義書 §10.3 の [ASSUMPTION] A-08: `internal` の値を丸ごと「［社内情報・匿名化］」に置き換える。
// 純粋な関数だけで書く（ブラウザーでも Node でも同じ結果になる）。画面の部品を参照しない（NFR-MAINT-001）。
import { REFERENCE_KEYS } from './common';

/** 置き換えの表記（A-08） */
export const ANONYMIZED_LABEL = '［社内情報・匿名化］';

/** 構造・参照・メタ情報の項目。`internal` の項目でも置き換えない（置き換えると ID による参照が壊れるため）。 */
const KEEP_KEYS: ReadonlySet<string> = new Set([
  'id', 'createdBy', 'classification', 'kind', 'type', 'confidence', 'retrievedAt', ...REFERENCE_KEYS,
]);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 値の葉（文字列・数値・真偽値）を表記に置き換える。構造は残す。 */
function maskValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(maskValue);
  if (isObj(v)) return maskObject(v);
  return v === null || v === undefined ? v : ANONYMIZED_LABEL;
}

function maskObject(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = KEEP_KEYS.has(k) ? v : maskValue(v);
  return out;
}

/**
 * 値を深く辿り、機密区分が `internal` の項目の値を A-08 の表記に置き換えた複製を返す。
 * `shareable` と機密区分のない項目は変えない。入力は変更しない。
 */
export function anonymizeInternal<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!isObj(v)) return v;
    if (v.classification === 'internal') return maskObject(v);
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = walk(x);
    return out;
  };
  return walk(value) as T;
}

/**
 * 値を深く辿り、機密区分が `internal` の項目の件数を数える（NFR-SEC-003。顧客に見せる前の機密確認に使う）。
 * `internal` の項目の中にさらに `internal` の項目があれば、それも数える。入力は変更しない。
 */
export function countInternal(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((n, v) => n + countInternal(v), 0);
  if (!isObj(value)) return 0;
  let n = value.classification === 'internal' ? 1 : 0;
  for (const v of Object.values(value)) n += countInternal(v);
  return n;
}
