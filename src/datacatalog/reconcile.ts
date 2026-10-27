// 企業データカタログの取り込み（FR-161）と突合、未掲載エンティティの ToDo 化（FR-162）の純関数。
// すべて端末内で完結し、ネットワークには接続しない（NFR-SEC-004）。URL は出典として文字列で持つだけで、アクセスしない。
import { parseCsv } from '../edit/model';
import { tr } from '../i18n';
import { displayName, normalizeKey, toColumns, type DataColumn, type DataEntity } from './model';

/** PARAM-050: 取り込めるファイルの大きさの上限（5 MB） */
export const MAX_CATALOG_BYTES = 5 * 1024 * 1024;
/** PARAM-051: 取り込める項目数の上限 */
export const MAX_CATALOG_ITEMS = 5000;

/** 企業データカタログの項目。名称は必須。basId は BAS のデータエンティティの ID を示す任意の欄 */
export interface CatalogItem { name: string; description: string; id?: string; basId?: string; /** 列（FR-172）。なければ列なし */ columns?: DataColumn[]; /** ドメイン名（FR-172） */ domain?: string }

export type ParseResult = { ok: true; items: CatalogItem[] } | { ok: false; errors: string[] };

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const opt = (v: unknown): string | undefined => { const s = str(v).trim(); return s ? s : undefined; };

type ItemResult = { item: CatalogItem } | { error: string } | undefined;
function fromRecord(r: Record<string, unknown>): ItemResult {
  const pick = (...keys: string[]): unknown => { for (const k of keys) if (r[k] !== undefined) return r[k]; return undefined; };
  const name = displayName(str(pick('name', '名称')));
  if (!name) return undefined;
  const id = opt(pick('id', 'ID'));
  const basId = opt(pick('basId', 'basid', 'BASID'));
  const domainRaw = opt(pick('domain', 'ドメイン'));
  const domain = domainRaw ? displayName(domainRaw) : undefined;
  const cols = toColumns(pick('columns', '列'));
  if (!cols.ok) return { error: cols.error };
  return { item: { name, description: str(pick('description', '説明')).trim(), ...(id ? { id } : {}), ...(basId ? { basId } : {}), ...(cols.columns.length ? { columns: cols.columns } : {}), ...(domain ? { domain } : {}) } };
}

function finish(items: CatalogItem[]): ParseResult {
  if (items.length > MAX_CATALOG_ITEMS) {
    return { ok: false, errors: [tr('項目が {n} 件あり、上限の {max} 件を超えています。ファイルを分割して取り込み直してください。', { n: items.length, max: MAX_CATALOG_ITEMS })] };
  }
  return { ok: true, items };
}

function parseJson(text: string): ParseResult {
  let data: unknown;
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (e) {
    return { ok: false, errors: [tr('JSON として読み込めません（{reason}）。ファイルが壊れていないか確認してください。', { reason: e instanceof Error ? e.message : tr('形式が不正です') })] };
  }
  const arr = Array.isArray(data) ? data
    : typeof data === 'object' && data !== null && Array.isArray((data as { entities?: unknown }).entities) ? (data as { entities: unknown[] }).entities
      : undefined;
  if (!arr) return { ok: false, errors: [tr('JSON の形式が不正です。項目の配列、または entities の配列を持つオブジェクトにしてください。')] };
  if (arr.length > MAX_CATALOG_ITEMS) return finish(arr.map(() => ({ name: '', description: '' })));
  const items: CatalogItem[] = [];
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i];
    const res = typeof r === 'object' && r !== null && !Array.isArray(r) ? fromRecord(r as Record<string, unknown>) : undefined;
    if (!res) return { ok: false, errors: [tr('{n} 件目に名称（name）がありません。すべての項目に名称を入れてください。', { n: i + 1 })] };
    if ('error' in res) return { ok: false, errors: [tr('{n} 件目: {error}', { n: i + 1, error: res.error })] };
    items.push(res.item);
  }
  return finish(items);
}

function parseCsvCatalog(text: string): ParseResult {
  const { records, error } = parseCsv(text);
  if (error) return { ok: false, errors: [tr('CSV の形式が不正です（{line} 行目: {message}）。', { line: error.line, message: error.message })] };
  if (records.length === 0) return { ok: false, errors: [tr('CSV が空です。先頭行に見出し（名称、説明）を書いてください。')] };
  const header = records[0]!.cells.map((h) => h.trim().toLowerCase());
  const col = (...names: string[]): number => header.findIndex((h) => names.includes(h));
  const iName = col('名称', 'name');
  if (iName < 0) return { ok: false, errors: [tr('CSV の見出しに「名称」（または name）の列がありません。先頭行に名称の列を追加してください。')] };
  const iDesc = col('説明', 'description'); const iId = col('id'); const iBas = col('basid');
  const iCols = col('columns', '列'); const iDom = col('domain', 'ドメイン');
  if (records.length - 1 > MAX_CATALOG_ITEMS) return finish(new Array<CatalogItem>(records.length - 1).fill({ name: '', description: '' }));
  const items: CatalogItem[] = [];
  for (const rec of records.slice(1)) {
    const cell = (i: number): string => (i >= 0 ? rec.cells[i] ?? '' : '');
    const name = displayName(cell(iName));
    if (!name) return { ok: false, errors: [tr('CSV の {line} 行目に名称がありません。すべての行に名称を入れてください。', { line: rec.line })] };
    const id = cell(iId).trim(); const basId = cell(iBas).trim();
    const domain = displayName(cell(iDom));
    // CSV の列の欄は「列名:型」を ; で区切る（型は省略可。例: 受注ID:文字列;金額:数値）
    const colText = cell(iCols).trim();
    const cols = toColumns(colText ? colText.split(';').map((seg) => { const k = seg.indexOf(':'); return k < 0 ? { name: seg } : { name: seg.slice(0, k), type: seg.slice(k + 1) }; }) : undefined);
    if (!cols.ok) return { ok: false, errors: [tr('CSV の {line} 行目: {error}', { line: rec.line, error: cols.error })] };
    items.push({ name, description: cell(iDesc).trim(), ...(id ? { id } : {}), ...(basId ? { basId } : {}), ...(cols.columns.length ? { columns: cols.columns } : {}), ...(domain ? { domain } : {}) });
  }
  return finish(items);
}

/** ファイルの内容を企業データカタログとして読む。拒否のときは原因と直し方を返す（呼び出し側は既存の内容を変えない） */
export function parseCatalog(text: string, fileName: string, sizeBytes: number): ParseResult {
  if (sizeBytes > MAX_CATALOG_BYTES) {
    return { ok: false, errors: [tr('ファイルの大きさが上限の {mb} MB を超えています。ファイルを分割するか、不要な項目を減らしてください。', { mb: MAX_CATALOG_BYTES / 1024 / 1024 })] };
  }
  const lower = fileName.toLowerCase();
  const head = text.replace(/^\uFEFF/, '').trimStart()[0];
  const asJson = lower.endsWith('.json') || (!lower.endsWith('.csv') && (head === '{' || head === '['));
  return asJson ? parseJson(text) : parseCsvCatalog(text);
}

export type Category = '一致' | '差異' | 'BASのみ' | 'カタログのみ';
export const CATEGORIES: readonly Category[] = ['一致', '差異', 'BASのみ', 'カタログのみ'];
export interface ReconcileRow { category: Category; name: string; entity?: DataEntity; item?: CatalogItem }

const PLACEHOLDER = '（説明なし）';
const descKey = (s: string): string => { const d = displayName(s); return d === PLACEHOLDER ? '' : d; };

/**
 * 突合（FR-161 AC-302）。①名称の正規化後の一致、またはカタログの basId とエンティティの ID の一致で対応づけ（1 対 1）、
 * ②対応づく組は、説明が同じで ID が両方にあるときは同じなら「一致」、それ以外は「差異」、③片方にしかないものは「BASのみ」「カタログのみ」。
 * ID がどちらか一方にしかないことは差異の理由にしない。1 つの組は必ず 1 区分だけになる。
 */
export function reconcile(entities: readonly DataEntity[], items: readonly CatalogItem[]): ReconcileRow[] {
  const used = new Set<number>();
  const rows: ReconcileRow[] = [];
  const claim = (pred: (it: CatalogItem) => boolean): number => {
    const i = items.findIndex((it, idx) => !used.has(idx) && pred(it));
    if (i >= 0) used.add(i);
    return i;
  };
  for (const e of entities) {
    let i = claim((it) => normalizeKey(it.name) === e.key);
    if (i < 0 && e.id) i = claim((it) => it.basId === e.id);
    if (i < 0) { rows.push({ category: 'BASのみ', name: e.name, entity: e }); continue; }
    const it = items[i]!;
    const idDiffers = !!e.id && !!it.id && it.id !== e.id && it.basId !== e.id;
    const same = descKey(e.description) === descKey(it.description) && !idDiffers;
    rows.push({ category: same ? '一致' : '差異', name: e.name, entity: e, item: it });
  }
  items.forEach((it, idx) => { if (!used.has(idx)) rows.push({ category: 'カタログのみ', name: displayName(it.name), item: it }); });
  return rows;
}

export function countByCategory(rows: readonly ReconcileRow[]): Record<Category, number> {
  const c: Record<Category, number> = { 一致: 0, 差異: 0, BASのみ: 0, カタログのみ: 0 };
  for (const r of rows) c[r.category]++;
  return c;
}

/** Project の plan の tasks に足す ToDo（顧客パックの schema/plan.json には書かない。FR-162） */
export interface ProjectTask { id: string; title: string; description: string }
export const TODO_PREFIX = 'data-catalog:';
export const todoId = (entityKey: string): string => `${TODO_PREFIX}${entityKey}`;

export const NO_CATALOG_REASON = '企業データカタログを取り込んでいないため、ToDo を追加できません。先にファイルを取り込んでください（追加 0 件）。';
export const NO_BAS_ONLY_REASON = '「BASのみ」のデータエンティティが 0 件のため、追加できません（追加 0 件）。';

export function buildTodos(rows: readonly ReconcileRow[], related: (e: DataEntity) => string[]): ProjectTask[] {
  return rows.filter((r) => r.category === 'BASのみ' && r.entity).map((r) => {
    const e = r.entity!;
    const ucs = related(e);
    return {
      id: todoId(e.key),
      title: `企業データカタログ未掲載の確認: ${e.name}`,
      description: `データエンティティ「${e.name}」は企業データカタログに載っていません。関連するユースケース: ${ucs.length ? ucs.join('、') : '（なし）'}。掲載の要否を確認してください。`,
    };
  });
}

/** 冪等の追加: 同じ ID（data-catalog:<正規化名>）がすでにあるものは追加せず、内容も変えない */
export function mergeTodos(existing: readonly ProjectTask[], todos: readonly ProjectTask[]): { tasks: ProjectTask[]; added: number } {
  const ids = new Set(existing.map((t) => t.id));
  const fresh = todos.filter((t) => !ids.has(t.id) && ids.add(t.id));
  return { tasks: [...existing.map((t) => ({ ...t })), ...fresh], added: fresh.length };
}

/** 出典の URL（任意）。記録するだけで、アクセスしない */
export function checkSourceUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const v = raw.trim();
  if (!v) return { ok: true, url: '' };
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('scheme');
    return { ok: true, url: v };
  } catch { return { ok: false, error: tr('出典の URL は http:// または https:// で始まる形式で入力してください。') }; }
}
