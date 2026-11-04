// アップロードされたファイル群の判別（FR-302 → FR-303）。ファイル名（フォルダー名は無視）から、顧客パックのどのファイルかを決める。
// 純粋な関数だけで書く（Node 専用の API は使わない。ブラウザーで動く）。
import { DATA_FILE_NAMES, BRAND_PROFILE_PATH, dataFilePath, type DataFileName } from '../schema';

/** 1 ファイルの上限（PARAM-142: 5MB） */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface UploadFile {
  /** ファイル名（フォルダーつきの相対パスでもよい） */
  name: string;
  text: string;
  /** バイト数（分かるときだけ。なければ text を UTF-8 にした長さ） */
  size?: number;
}

export type PackSlot = DataFileName | 'brandProfile' | 'customerResearch' | 'brandResearch';

/** 必須の JSON（9 つのデータと brand-profile.json）。顧客調査・ブランド調査の .md と assets/ は任意（AC-847） */
export const REQUIRED_SLOTS: readonly PackSlot[] = [...DATA_FILE_NAMES, 'brandProfile'];

/** 取り込み対象の枠 → 顧客パック内の相対パス */
export function slotPath(slot: PackSlot): string {
  if (slot === 'brandProfile') return BRAND_PROFILE_PATH;
  if (slot === 'customerResearch') return 'data/customer-research.md';
  if (slot === 'brandResearch') return 'brand/BRAND-RESEARCH.md';
  return dataFilePath(slot);
}

export interface ClassifiedFiles {
  /** 枠ごとに 1 つに決まったファイル */
  assigned: Partial<Record<PackSlot, UploadFile>>;
  /** 判別できなかったファイル名（取り込みの対象外。警告） */
  unknown: string[];
  /** 画像などの assets/ 配下のファイル名（FR-302 の取り込み対象外。警告にしない） */
  assets: string[];
  /** 同じ枠に当たるファイルが 2 つ以上あるもの（どれを使うか決められない。エラー） */
  duplicates: Array<{ slot: PackSlot; names: string[] }>;
  /** 必須なのに見つからない枠 */
  missing: PackSlot[];
  /** 上限（MAX_FILE_BYTES）を超えたファイル（エラー。中身は読まない） */
  oversize: Array<{ slot?: PackSlot; name: string; bytes: number }>;
}

const baseName = (name: string): string => name.replaceAll('\\', '/').split('/').filter(Boolean).pop() ?? name;

const SLOT_BY_BASENAME: ReadonlyMap<string, PackSlot> = new Map<string, PackSlot>([
  ...DATA_FILE_NAMES.map((n): [string, PackSlot] => [`${n}.json`, n]),
  ['brand-profile.json', 'brandProfile'],
  ['customer-research.md', 'customerResearch'],
  ['brand-research.md', 'brandResearch'],
]);

/** ファイルのバイト数。size があればそれを使い、なければ UTF-8 の長さを数える */
export function byteLength(f: UploadFile): number {
  return f.size ?? new TextEncoder().encode(f.text).length;
}

/** 枠の表示名（一覧の「種別」の列）。9 つの JSON は拡張子なしの名前、設定ファイルは brand-profile、調査メモは日本語 */
export function slotKindLabel(slot: PackSlot): string {
  if (slot === 'brandProfile') return 'brand-profile';
  if (slot === 'customerResearch') return '顧客調査';
  if (slot === 'brandResearch') return 'ブランド調査';
  return slot;
}

/** 中身（JSON の最上位のキー）から枠を決めるための目印。いずれかの組が、すべて含まれていればその枠 */
const CONTENT_SIGNATURES: ReadonlyArray<[PackSlot, ReadonlyArray<readonly string[]>]> = [
  ['customer', [['name', 'projectName']]],
  ['entities', [['entities']]],
  ['issues', [['issues']]],
  ['products', [['products']]],
  ['plan', [['features']]],
  ['architecture', [['nodes'], ['asis', 'tobe']]],
  ['mocks', [['mocks']]],
  ['show', [['chapters']]],
  ['sources', [['sources']]],
  ['brandProfile', [['colors', 'logo']]],
];

/** ファイル名で決まらない JSON を、中身から判別する。1 つに決まらないとき・JSON でないときは undefined */
function slotFromJson(text: string): PackSlot | undefined {
  let json: unknown;
  try { json = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { return undefined; }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return undefined;
  const keys = new Set(Object.keys(json));
  const hits = CONTENT_SIGNATURES.filter(([, groups]) => groups.some((g) => g.every((k) => keys.has(k)))).map(([s]) => s);
  return hits.length === 1 ? hits[0] : undefined;
}

/** ファイル名で決まらない .md を、先頭の見出しから判別する（「ブランド」を含めばブランド調査、「顧客」を含めば顧客調査） */
function slotFromMarkdown(text: string): PackSlot | undefined {
  const head = text.replace(/^\uFEFF/, '').split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  if (/ブランド|brand/i.test(head)) return 'brandResearch';
  if (/顧客|customer/i.test(head)) return 'customerResearch';
  return undefined;
}

/** 枠を決める。assets/ 配下は枠に当てない。ファイル名で決まらないときは、中身で決める（AC-838） */
function slotOf(f: UploadFile): PackSlot | 'asset' | undefined {
  const norm = f.name.replaceAll('\\', '/');
  if (/(^|\/)assets\//i.test(norm)) return 'asset';
  const byName = SLOT_BY_BASENAME.get(baseName(norm).toLowerCase());
  if (byName) return byName;
  if (/\.json$/i.test(norm)) return slotFromJson(f.text);
  if (/\.(md|markdown)$/i.test(norm)) return slotFromMarkdown(f.text);
  return undefined;
}
/** アップロードされたファイルを、顧客パックの種別ごとに割り当てる（判別不能・重複・欠け・サイズ超過を分けて返す） */
export function classifyFiles(files: readonly UploadFile[]): ClassifiedFiles {
  const bySlot = new Map<PackSlot, UploadFile[]>();
  const unknown: string[] = [];
  const assets: string[] = [];
  const oversize: ClassifiedFiles['oversize'] = [];
  for (const f of files) {
    const slot = slotOf(f);
    if (slot === 'asset') { assets.push(f.name); continue; }
    const bytes = byteLength(f);
    if (bytes > MAX_FILE_BYTES) { oversize.push({ ...(slot ? { slot } : {}), name: f.name, bytes }); continue; }
    if (!slot) { unknown.push(f.name); continue; }
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), f]);
  }
  const assigned: ClassifiedFiles['assigned'] = {};
  const duplicates: ClassifiedFiles['duplicates'] = [];
  for (const [slot, list] of bySlot) {
    if (list.length === 1) assigned[slot] = list[0]!;
    else duplicates.push({ slot, names: list.map((f) => f.name) });
  }
  const accounted = (slot: PackSlot): boolean =>
    slot in assigned || duplicates.some((d) => d.slot === slot) || oversize.some((o) => o.slot === slot);
  const missing = REQUIRED_SLOTS.filter((s) => !accounted(s));
  return { assigned, unknown, assets, duplicates, missing, oversize };
}
