// 表現が成り立たない項目の分け方（FR-113）。React に依存しない。
// 情報表現に必要な属性（地図の位置・3D の形状・ガントの日付など）がない項目は、その表現に出さず、理由と件数を示し、表で見られるようにする。
export interface FallbackReason {
  /** 理由の語（「位置情報なし」など。画面には `<label>: N 件` と出る） */
  label: string;
}

/** 表現ごとの理由。画面側はこの語を使い、表記をそろえる。 */
export const FALLBACK_REASONS = {
  location: { label: '位置情報なし' },
  geometry: { label: '3D 形状なし' },
  schedule: { label: '日付なし' },
} as const satisfies Record<string, FallbackReason>;

export interface Partitioned<T> {
  /** その表現に出せる項目 */
  renderable: T[];
  /** 必要な属性がなく、その表現には出せない項目 */
  missing: T[];
}

/** 必要な属性があるか（canRender）で分ける。順序は保つ。黙って捨てず、missing として返す。 */
export function partitionRenderable<T>(items: readonly T[], canRender: (item: T) => boolean): Partitioned<T> {
  const renderable: T[] = [];
  const missing: T[] = [];
  for (const it of items) (canRender(it) ? renderable : missing).push(it);
  return { renderable, missing };
}

/** 「位置情報なし: 2 件」の形の文言。 */
export function fallbackLabel(reason: FallbackReason | string, count: number): string {
  const label = typeof reason === 'string' ? reason : reason.label;
  return `${label}: ${count} 件`;
}

/** 緯度・経度が有限の数か（地図に置ける位置か）。 */
export function hasLocation(loc: unknown): boolean {
  if (!loc || typeof loc !== 'object') return false;
  const { lat, lng, lon } = loc as { lat?: unknown; lng?: unknown; lon?: unknown };
  const x = lng ?? lon;
  return typeof lat === 'number' && Number.isFinite(lat) && typeof x === 'number' && Number.isFinite(x);
}
