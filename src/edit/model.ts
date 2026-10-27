// データ編集の純粋なロジック（FR-044 編集・追加・複製・削除、FR-046 入力検証・CSV/JSON の取り込み）。
// DOM・React・ストアを参照しない。入力の PackData を書き換えず、新しい PackData を返す（元に戻す・全ビューへの反映の土台）。
// 値を編集したら作成者の種別は human になる（FR-116: applyEdit）。
import { EVALUATION_LABELS } from '../analysis/model';
import {
  BRAND_PROFILE_PATH, DATA_FILE_NAMES, DATA_SCHEMAS, REFERENCE_KEYS, applyEdit, disableInvalidItems, formatPackError, validatePack,
  type BrandProfile, type DataFileName, type PackData, type PackError, type PackFiles,
} from '../schema';
import { KIND_LABELS, type NodeKind } from '../selection/graph';
import { tr } from '../i18n';

type Rec = Record<string, unknown>;

export type ChangeOp = 'update' | 'add' | 'duplicate' | 'delete' | 'import' | 'reset' | 'undo' | 'redo';

/** 変更履歴の 1 行になる内容（誰が・いつ は、記録するストア側が足す） */
export interface DataChange {
  op: ChangeOp;
  entityId?: string;
  /** 対象の表示名 */
  entityLabel: string;
  /** 何を（項目名） */
  fieldLabel: string;
  before: string;
  after: string;
}

export type EditResult =
  | { ok: true; data: PackData; changes: DataChange[]; /** 操作の後に選ぶ ID */ select?: string[]; warnings?: string[] }
  | { ok: false; message: string; details?: string[] };

// ---- 項目の場所 ----

interface Def { kind: NodeKind; file: DataFileName; key: string; nameKey: 'title' | 'name' | 'label' }

const DEFS: readonly Def[] = [
  { kind: 'entity', file: 'entities', key: 'entities', nameKey: 'name' },
  { kind: 'issue', file: 'issues', key: 'issues', nameKey: 'title' },
  { kind: 'solution', file: 'issues', key: 'solutions', nameKey: 'title' },
  { kind: 'product', file: 'products', key: 'products', nameKey: 'name' },
  { kind: 'feature', file: 'plan', key: 'features', nameKey: 'title' },
  { kind: 'task', file: 'plan', key: 'tasks', nameKey: 'title' },
  { kind: 'architecture', file: 'architecture', key: 'nodes', nameKey: 'label' },
  { kind: 'mock', file: 'mocks', key: 'mocks', nameKey: 'title' },
  { kind: 'chapter', file: 'show', key: 'chapters', nameKey: 'title' },
  { kind: 'source', file: 'sources', key: 'sources', nameKey: 'title' },
];
const ISSUE_DEF = DEFS[1]!;
const CHAPTER = DEFS.find((d) => d.kind === 'chapter')!;
const TOPIC: Def = { kind: 'topic', file: 'show', key: 'chapters', nameKey: 'title' };

interface Loc {
  def: Def;
  /** 論点のとき、所属する章の位置 */
  chapter?: number;
  index: number;
  rec: Rec;
}

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const files = (d: PackData): Record<string, Rec> => d as unknown as Record<string, Rec>;

function listOf(d: PackData, def: Def): Rec[] {
  const v = files(d)[def.file]?.[def.key];
  return Array.isArray(v) ? (v as Rec[]) : [];
}

function withList(d: PackData, file: DataFileName, key: string, list: Rec[]): PackData {
  return { ...d, [file]: { ...files(d)[file], [key]: list } } as unknown as PackData;
}

/** ID から項目を探す。見つからなければ undefined */
export function locate(d: PackData, id: string): Loc | undefined {
  for (const def of DEFS) {
    const list = listOf(d, def);
    const index = list.findIndex((r) => r.id === id);
    if (index >= 0) return { def, index, rec: list[index]! };
  }
  const chapters = listOf(d, CHAPTER);
  for (let c = 0; c < chapters.length; c++) {
    const topics = Array.isArray(chapters[c]!.topics) ? (chapters[c]!.topics as Rec[]) : [];
    const index = topics.findIndex((r) => r.id === id);
    if (index >= 0) return { def: TOPIC, chapter: c, index, rec: topics[index]! };
  }
  return undefined;
}

/** 項目のある配列を書き換えた新しい PackData */
function mapList(d: PackData, loc: Pick<Loc, 'def' | 'chapter'>, fn: (list: Rec[]) => Rec[]): PackData {
  if (loc.chapter === undefined) return withList(d, loc.def.file, loc.def.key, fn(listOf(d, loc.def)));
  const chapters = listOf(d, CHAPTER);
  const ch = chapters[loc.chapter]!;
  const topics = Array.isArray(ch.topics) ? (ch.topics as Rec[]) : [];
  const next = { ...ch, topics: fn(topics) };
  return withList(d, 'show', 'chapters', chapters.map((c, i) => (i === loc.chapter ? next : c)));
}

function nameOf(rec: Rec, nameKey: Def['nameKey']): string {
  const v = rec[nameKey];
  return isStr(v) ? v : String(rec.id);
}

/** 項目の種類（見つからなければ undefined） */
export function kindOf(d: PackData, id: string): NodeKind | undefined {
  return locate(d, id)?.def.kind;
}

// ---- ID ----

function walk(v: unknown, fn: (o: Rec) => void): void {
  if (Array.isArray(v)) { for (const x of v) walk(x, fn); return; }
  if (!isRec(v)) return;
  fn(v);
  for (const x of Object.values(v)) walk(x, fn);
}

/** パック全体の ID（ID はパック全体で一意: FR-114） */
export function allIds(d: PackData): Set<string> {
  const ids = new Set<string>();
  for (const name of DATA_FILE_NAMES) walk(files(d)[name], (o) => { if (isStr(o.id)) ids.add(o.id); });
  return ids;
}

function uniqueId(used: Set<string>, base: string): string {
  const b = base.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+/, '') || 'item';
  let candidate = b;
  for (let n = 2; used.has(candidate); n++) candidate = `${b}-${n}`;
  used.add(candidate);
  return candidate;
}

// ---- 値の編集 ----

/** 名前（title / name / label）の項目の表示名 */
export const NAME_FIELD_LABEL = '名前（タイトル）';

function fieldLabelOf(path: readonly string[], nameKey: Def['nameKey']): string {
  if (path.length === 1 && path[0] === nameKey) return tr(NAME_FIELD_LABEL);
  if (path[0] === 'evaluation' && path[1]) {
    const base = (EVALUATION_LABELS as Record<string, string>)[path[1]] ?? path[1];
    return path[2] && path[2] !== 'value' ? `${base}（${path[2]}）` : base;
  }
  if (path.length === 1 && path[0] === 'type') return tr('タイプ');
  return path.join('.');
}

function getIn(o: unknown, path: readonly string[]): unknown {
  let c: unknown = o;
  for (const k of path) {
    if (!isRec(c)) return undefined;
    c = c[k];
  }
  return c;
}

function setIn(o: Rec, path: readonly string[], v: unknown): Rec {
  const [k, ...rest] = path;
  if (k === undefined) return o;
  return { ...o, [k]: rest.length ? setIn(isRec(o[k]) ? (o[k] as Rec) : {}, rest, v) : v };
}

/** 数値の入力を数値にする。全角の数字・桁区切りのカンマ・前後の空白を許す。数値でなければ undefined */
export function parseNumberInput(raw: string): number | undefined {
  const s = raw.normalize('NFKC').trim().replaceAll(',', '');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function checkSchema(next: PackData, file: DataFileName): string | undefined {
  const r = DATA_SCHEMAS[file].safeParse(files(next)[file]);
  if (r.success) return undefined;
  const i = r.error.issues[0]!;
  const at = i.path.length ? `（${i.path.join('.')}）` : '';
  return tr('入力が正しくありません{at}: {message}', { at, message: i.message });
}

const show = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** 項目の、編集前の現在の値（編集欄の初期値）。編集できない（存在しない・オブジェクト）なら undefined */
export function currentValue(d: PackData, id: string, path: readonly string[]): string | number | undefined {
  const loc = locate(d, id);
  const cur = loc ? getIn(loc.rec, path) : undefined;
  return typeof cur === 'string' || typeof cur === 'number' ? cur : undefined;
}

/** 項目の名前（title / name / label）。見つからなければ undefined */
export function nameOfId(d: PackData, id: string): string | undefined {
  const loc = locate(d, id);
  return loc ? nameOf(loc.rec, loc.def.nameKey) : undefined;
}

/** 項目の名前の項目名（title / name / label） */
export function nameKeyOf(d: PackData, id: string): string | undefined {
  return locate(d, id)?.def.nameKey;
}

/**
 * 項目の値を 1 つ書き換える。現在の値が数値の項目には数値だけを受け付け、文字の項目には空でない文字列だけを受け付ける（FR-046）。
 * 変更がなければ変更履歴のない成功（changes が空）を返す。
 */
export function updateField(d: PackData, id: string, path: readonly string[], raw: string): EditResult {
  const loc = locate(d, id);
  if (!loc) return { ok: false, message: tr('項目が見つかりません: {id}', { id }) };
  const cur = getIn(loc.rec, path);
  if (typeof cur !== 'string' && typeof cur !== 'number') return { ok: false, message: tr('この項目は編集できません。') };
  let value: string | number;
  if (typeof cur === 'number') {
    const n = parseNumberInput(raw);
    if (n === undefined) return { ok: false, message: tr('数値を入力してください（例: 1200）。') };
    value = n;
  } else {
    const t = raw.trim();
    if (t === '') return { ok: false, message: tr('空にはできません。値を入力してください。') };
    value = t;
  }
  if (value === cur) return { ok: true, data: d, changes: [] };
  const top = path[0]!;
  const patch: Rec = { [top]: path.length === 1 ? value : setIn(isRec(loc.rec[top]) ? (loc.rec[top] as Rec) : {}, path.slice(1), value) };
  const rec = applyEdit(loc.rec as Rec & { createdBy: 'ai' | 'human' | 'sample' }, patch as never) as Rec;
  const next = mapList(d, loc, (list) => list.map((r, i) => (i === loc.index ? rec : r)));
  const problem = checkSchema(next, loc.def.file);
  if (problem) return { ok: false, message: problem };
  return {
    ok: true,
    data: next,
    changes: [{ op: 'update', entityId: id, entityLabel: nameOf(rec, loc.def.nameKey), fieldLabel: fieldLabelOf(path, loc.def.nameKey), before: show(cur), after: show(value) }],
  };
}

/** 項目の名前（title / name / label）を書き換える */
export function renameRecord(d: PackData, id: string, raw: string): EditResult {
  const key = nameKeyOf(d, id);
  return key ? updateField(d, id, [key], raw) : { ok: false, message: tr('項目が見つかりません: {id}', { id }) };
}

// ---- 追加・複製・削除 ----

/** 新規項目の初期名。作成時の言語で生成する（作成済みのデータは変えない） */
function newName(kind: NodeKind): string {
  switch (kind) {
    case 'entity': return tr('新しいエンティティ');
    case 'issue': return tr('新しい課題');
    case 'solution': return tr('新しい解決策');
    case 'product': return tr('新しい製品');
    case 'feature': return tr('新しい機能');
    case 'task': return tr('新しいタスク');
    case 'architecture': return tr('新しいノード');
    case 'mock': return tr('新しいモック');
    case 'chapter': return tr('新しい章');
    case 'topic': return tr('新しい論点');
    case 'source': return tr('新しい出典');
  }
}

function templateFor(d: PackData, kind: NodeKind, sib: Rec | undefined): Rec | string {
  const name = newName(kind);
  switch (kind) {
    case 'entity': return { type: isStr(sib?.type) ? sib.type : 'エンティティ', name };
    case 'issue': return { title: name, audience: sib?.audience === 'external' ? 'external' : 'internal', ...(isStr(sib?.parentId) ? { parentId: sib.parentId } : {}) };
    case 'solution': {
      const issueId = isStr(sib?.issueId) ? sib.issueId : (listOf(d, ISSUE_DEF)[0]?.id as string | undefined);
      return issueId ? { title: name, issueId } : tr('解決策を追加するには、先に課題が必要です。');
    }
    case 'product': return { name };
    case 'feature': return { title: name };
    case 'task': return { title: name, ...(isStr(sib?.featureId) ? { featureId: sib.featureId } : {}) };
    case 'architecture': return { label: name, ...(isStr(sib?.layer) ? { layer: sib.layer } : {}) };
    case 'mock': return { title: name };
    case 'chapter': return { title: name, topics: [] };
    case 'topic': return { title: name };
    case 'source': return { kind: 'sample', title: name, retrievedAt: new Date().toISOString().slice(0, 10), confidence: '推定' };
  }
}

/** 選んだ項目と同じ種類の項目を、すぐ後ろに追加する。何も選んでいなければ課題を末尾に追加する */
export function addRecord(d: PackData, refId?: string): EditResult {
  const ref = refId ? locate(d, refId) : undefined;
  const def = ref?.def ?? ISSUE_DEF;
  const target: Pick<Loc, 'def' | 'chapter'> = ref ?? { def };
  const t = templateFor(d, def.kind, ref?.rec);
  if (typeof t === 'string') return { ok: false, message: t };
  const id = uniqueId(allIds(d), `${def.kind}-new`);
  const rec: Rec = { id, createdBy: 'human', ...t };
  const next = mapList(d, target, (list) => {
    const at = ref ? ref.index + 1 : list.length;
    return [...list.slice(0, at), rec, ...list.slice(at)];
  });
  const problem = checkSchema(next, def.file);
  if (problem) return { ok: false, message: problem };
  const label = nameOf(rec, def.nameKey);
  return {
    ok: true, data: next, select: [id],
    changes: [{ op: 'add', entityId: id, entityLabel: label, fieldLabel: tr('{kind}の追加', { kind: tr(KIND_LABELS[def.kind]) }), before: '', after: label }],
  };
}

function renewIds(v: unknown, used: Set<string>): unknown {
  if (Array.isArray(v)) return v.map((x) => renewIds(x, used));
  if (!isRec(v)) return v;
  const out: Rec = {};
  for (const [k, x] of Object.entries(v)) out[k] = k === 'id' && isStr(x) ? uniqueId(used, `${x}-copy`) : renewIds(x, used);
  return out;
}

/** 項目を複製し、元の項目のすぐ後ろに置く。名前には「（複製）」を足す */
export function duplicateRecord(d: PackData, id: string): EditResult {
  const loc = locate(d, id);
  if (!loc) return { ok: false, message: tr('項目が見つかりません: {id}', { id }) };
  const copy = renewIds(loc.rec, allIds(d)) as Rec;
  const base = nameOf(loc.rec, loc.def.nameKey);
  const name = tr('{base}（複製）', { base });
  copy[loc.def.nameKey] = name;
  copy.createdBy = 'human';
  const next = mapList(d, loc, (list) => [...list.slice(0, loc.index + 1), copy, ...list.slice(loc.index + 1)]);
  const problem = checkSchema(next, loc.def.file);
  if (problem) return { ok: false, message: problem };
  return {
    ok: true, data: next, select: [id, copy.id as string],
    changes: [{ op: 'duplicate', entityId: copy.id as string, entityLabel: name, fieldLabel: tr('{kind}の複製', { kind: tr(KIND_LABELS[loc.def.kind]) }), before: base, after: name }],
  };
}

const REF_KEYS = new Set<string>(REFERENCE_KEYS);

/** 項目の削除の前後で比べる、データ（ブランド以外）の検証エラー */
function dataErrors(d: PackData): PackError[] {
  return validatePack({ ...(d as unknown as PackFiles), brandProfile: {} }).errors.filter((e) => e.file !== BRAND_PROFILE_PATH);
}

interface ScrubTargets {
  /** 削除した課題の子の課題をつなぐ先（削除した課題の親） */
  parent?: string;
  /** 唯一の対象課題を失った解決策をつなぐ先の課題 */
  issue?: string;
}

/** 削除した項目への参照を取り除く。削除した課題の子は、その親につなぐ。端点を失った接続は一緒に取り除く */
function scrub(v: unknown, removed: ReadonlySet<string>, to: ScrubTargets): unknown {
  if (Array.isArray(v)) {
    let changed = false;
    const out: unknown[] = [];
    for (const x of v) {
      if (isRec(x) && isStr(x.from) && isStr(x.to) && (removed.has(x.from) || removed.has(x.to))) { changed = true; continue; }
      const y = scrub(x, removed, to);
      if (y !== x) changed = true;
      out.push(y);
    }
    return changed ? out : v;
  }
  if (!isRec(v)) return v;
  let changed = false;
  const out: Rec = {};
  for (const [k, x] of Object.entries(v)) {
    // 製品ごとの適合理由は、製品を消すと意味を失うので項目ごと外す
    if (k === 'productFits' && Array.isArray(x)) {
      const kept = x.filter((f) => !(isRec(f) && typeof f.productId === 'string' && removed.has(f.productId)));
      if (kept.length !== x.length) { changed = true; out[k] = kept; } else out[k] = x;
      continue;
    }
    if (REF_KEYS.has(k)) {
      if (Array.isArray(x)) {
        const kept = x.filter((t) => !(typeof t === 'string' && removed.has(t)));
        if (kept.length !== x.length) { changed = true; out[k] = kept; } else out[k] = x;
        continue;
      }
      if (typeof x === 'string' && removed.has(x)) {
        changed = true;
        if (k === 'parentId') { out[k] = to.parent ?? null; continue; }
        if (k === 'issueId') {
          // 複数の課題に効く解決策は残る課題へ、唯一の対象課題だった解決策は付け替え先の課題へつなぐ
          const others = Array.isArray(v.issueIds) ? (v.issueIds as unknown[]).filter((t): t is string => typeof t === 'string' && !removed.has(t)) : [];
          out[k] = others[0] ?? to.issue ?? x;
          continue;
        }
        continue; // そのほかの単独の参照は外す
      }
    }
    const y = scrub(x, removed, to);
    if (y !== x) changed = true;
    out[k] = y;
  }
  return changed ? out : v;
}

/**
 * 項目を削除する。ほかの項目の参照は取り除くが、ほかの項目そのものは削除しない。
 * 課題を削除すると、唯一の対象課題がその課題だった解決策は、親の課題、なければ削除した課題のすぐ後ろ（なければ前）の課題へ付け替える（FR-114: 参照を壊さない）。
 * 付け替え先の課題が 1 つもない（最後の課題を、解決策のあるまま削除する）ときは、削除を拒否して理由を返す。
 */
export function deleteRecord(d: PackData, id: string): EditResult {
  const loc = locate(d, id);
  if (!loc) return { ok: false, message: tr('項目が見つかりません: {id}', { id }) };
  const removed = new Set<string>();
  walk(loc.rec, (o) => { if (isStr(o.id)) removed.add(o.id); });
  const parent = isStr(loc.rec.parentId) ? loc.rec.parentId : undefined;
  const reassigned: DataChange[] = [];
  let issueTarget: string | undefined;
  if (loc.def.kind === 'issue') {
    const orphans = (d.issues.solutions as Rec[]).filter((s) => {
      const targets = [s.issueId, ...(Array.isArray(s.issueIds) ? (s.issueIds as unknown[]) : [])].filter(isStr);
      return targets.length > 0 && targets.every((t) => removed.has(t));
    });
    if (orphans.length > 0) {
      const list = listOf(d, ISSUE_DEF);
      const pick = (i: Rec | undefined): string | undefined => (i && isStr(i.id) && !removed.has(i.id) ? i.id : undefined);
      issueTarget = (parent && pick(list.find((i) => i.id === parent)))
        ?? list.slice(loc.index + 1).map(pick).find(Boolean)
        ?? list.slice(0, loc.index).reverse().map(pick).find(Boolean);
      if (!issueTarget) {
        const names = orphans.map((s) => `「${nameOf(s, 'title')}」`).join('、');
        return { ok: false, message: tr('解決策{names}の対象の課題がなくなるため、この課題は削除できません。先に解決策を削除するか、別の課題を追加してください。', { names }) };
      }
      const targetName = nameOf(list.find((i) => i.id === issueTarget)!, 'title');
      for (const s of orphans) {
        reassigned.push({ op: 'update', entityId: s.id as string, entityLabel: nameOf(s, 'title'), fieldLabel: tr('対象の課題（付け替え）'), before: nameOf(loc.rec, 'title'), after: targetName });
      }
    }
  }
  const next = mapList(d, loc, (list) => list.filter((_, i) => i !== loc.index));
  const scrubbed: Rec = {};
  for (const name of DATA_FILE_NAMES) scrubbed[name] = scrub(files(next)[name], removed, { parent, issue: issueTarget });
  const label = nameOf(loc.rec, loc.def.nameKey);
  // 削除で、出典（FR-115）・参照（FR-114）の規則を新しく破るときは拒否する（例: 数値の唯一の出典を消す）
  if (dataErrors(d).length === 0) {
    const broken = dataErrors(scrubbed as unknown as PackData);
    if (broken.length > 0) {
      return { ok: false, message: tr('「{label}」を削除すると、データの規則を満たせなくなるため削除できません。先に、これを参照している項目を編集してください。', { label }), details: broken.slice(0, 5).map(formatPackError) };
    }
  }
  return {
    ok: true, data: scrubbed as unknown as PackData,
    changes: [
      { op: 'delete', entityId: id, entityLabel: label, fieldLabel: tr('{kind}の削除', { kind: tr(KIND_LABELS[loc.def.kind]) }), before: label, after: tr('（削除）') },
      ...reassigned,
    ],
  };
}

// ---- CSV（一覧表）----

export const CSV_HEADER = ['ID', '種別', 'タイプ', '名称'] as const;
const KIND_BY_LABEL = new Map<string, NodeKind>((Object.entries(KIND_LABELS) as Array<[NodeKind, string]>).map(([k, l]) => [l, k]));

const csvCell = (s: string): string => (/[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);

/** 一覧表（ID・種別・タイプ・名称）の CSV。Excel で開けるよう BOM を付ける */
export function exportCsv(d: PackData): string {
  const lines: string[] = [CSV_HEADER.join(',')];
  const row = (def: Def, r: Rec) => {
    if (!isStr(r.id)) return;
    lines.push([r.id, KIND_LABELS[def.kind], def.kind === 'entity' && isStr(r.type) ? r.type : '', nameOf(r, def.nameKey)].map(csvCell).join(','));
  };
  for (const def of DEFS) {
    for (const r of listOf(d, def)) {
      row(def, r);
      if (def.kind === 'chapter' && Array.isArray(r.topics)) for (const t of r.topics as Rec[]) row(TOPIC, t);
    }
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export interface CsvRecord { line: number; cells: string[] }

/** CSV を読む（RFC 4180: 引用符・引用符の中の改行と二重引用符）。行番号は、ファイルの先頭を 1 とする、その行の開始位置 */
export function parseCsv(text: string): { records: CsvRecord[]; error?: { line: number; message: string } } {
  const src = text.replace(/^\uFEFF/, '');
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cur = '';
  let quoted = false;
  let line = 1;
  let startLine = 1;
  let touched = false;
  const endRecord = () => {
    cells.push(cur);
    cur = '';
    if (!(cells.length === 1 && cells[0] === '' && !touched)) records.push({ line: startLine, cells });
    cells = [];
    touched = false;
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else {
        if (c === '\n') line++;
        cur += c;
      }
      continue;
    }
    if (c === '"' && cur === '') { quoted = true; touched = true; continue; }
    if (c === ',') { touched = true; cells.push(cur); cur = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { endRecord(); line++; startLine = line; continue; }
    touched = true;
    cur += c;
  }
  if (quoted) return { records, error: { line: startLine, message: tr('引用符が閉じていません（形式が不正です）') } };
  if (cur !== '' || cells.length > 0 || touched) endRecord();
  return { records };
}

const MAX_REPORTED = 20;
const csvFailed = (): string => tr('CSV を取り込めませんでした。現在のデータは変わっていません。');

/** CSV を取り込む。1 行でも不正なら何も取り込まず、行番号と理由を返す（FR-046）。取り込めるのは既存の項目の名称・タイプ */
export function importCsv(d: PackData, text: string): EditResult {
  const parsed = parseCsv(text);
  if (parsed.error) return { ok: false, message: csvFailed(), details: [tr('{line} 行目: {reason}', { line: parsed.error.line, reason: parsed.error.message })] };
  const [head, ...rows] = parsed.records;
  if (!head || head.cells.length !== CSV_HEADER.length || head.cells.some((c, i) => c !== CSV_HEADER[i])) {
    return { ok: false, message: csvFailed(), details: [tr('{line} 行目: ヘッダーが違います。先頭の行は「{header}」にしてください（形式が不正です）', { line: head?.line ?? 1, header: CSV_HEADER.join(',') })] };
  }
  const errors: string[] = [];
  const fail = (line: number, reason: string) => { if (errors.length < MAX_REPORTED) errors.push(tr('{line} 行目: {reason}', { line, reason })); };
  const seen = new Set<string>();
  const plan: Array<{ line: number; id: string; name: string; type: string }> = [];
  for (const r of rows) {
    if (r.cells.length !== CSV_HEADER.length) {
      fail(r.line, tr('列の数が合いません（{need} 列が必要ですが {got} 列あります）。形式が不正です', { need: CSV_HEADER.length, got: r.cells.length }));
      continue;
    }
    const [id, kindLabel, type, name] = r.cells.map((c) => c.trim()) as [string, string, string, string];
    const loc = locate(d, id);
    if (!loc) { fail(r.line, tr('ID「{id}」の項目がありません（行の追加は取り込めません）', { id })); continue; }
    if (seen.has(id)) { fail(r.line, tr('ID「{id}」が重複しています', { id })); continue; }
    seen.add(id);
    if (KIND_BY_LABEL.get(kindLabel) !== loc.def.kind) { fail(r.line, tr('種別「{kind}」が項目の種別（{expected}）と合いません（不正な値）', { kind: kindLabel, expected: KIND_LABELS[loc.def.kind] })); continue; }
    if (name === '') { fail(r.line, tr('名称が空です（不正な値）')); continue; }
    plan.push({ line: r.line, id, name, type });
  }
  if (errors.length > 0) return { ok: false, message: csvFailed(), details: errors };
  let next = d;
  const changes: DataChange[] = [];
  for (const p of plan) {
    const loc = locate(next, p.id)!;
    const todo: Array<{ path: readonly string[]; value: string }> = [{ path: [loc.def.nameKey], value: p.name }];
    if (loc.def.kind === 'entity' && p.type !== '') todo.push({ path: ['type'], value: p.type });
    for (const t of todo) {
      const r = updateField(next, p.id, t.path, t.value);
      if (!r.ok) { fail(p.line, r.message); continue; }
      next = r.data;
      changes.push(...r.changes);
    }
  }
  if (errors.length > 0) return { ok: false, message: csvFailed(), details: errors };
  return { ok: true, data: next, changes };
}

// ---- JSON（パック全体）----

/** パック全体の JSON */
export function exportJson(d: PackData): string {
  const out: Rec = {};
  for (const name of DATA_FILE_NAMES) out[name] = files(d)[name];
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** JSON を取り込む。起動時と同じ検証をし、問題のある項目だけを無効にして取り込む。特定できない誤りは取り込まない */
export function importJson(text: string, brand: BrandProfile): EditResult {
  const stop = (details: string[]): EditResult => ({ ok: false, message: tr('JSON を取り込めませんでした。現在のデータは変わっていません。'), details });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (e) {
    return stop([tr('JSON として読めません（形式が不正です）: {error}', { error: e instanceof Error ? e.message : String(e) })]);
  }
  if (!isRec(parsed)) return stop([tr('JSON のトップレベルがオブジェクトではありません（形式が不正です）')]);
  const input: PackFiles = { brandProfile: brand };
  for (const name of DATA_FILE_NAMES) if (parsed[name] !== undefined) input[name] = parsed[name];
  const r = disableInvalidItems(input);
  if (r.fatal) return stop(r.issues.map(formatPackError));
  const data: Rec = {};
  for (const name of DATA_FILE_NAMES) data[name] = (r.files as Rec)[name];
  const next = data as unknown as PackData;
  return {
    ok: true,
    data: next,
    changes: [{ op: 'import', entityLabel: tr('データ全体'), fieldLabel: tr('JSON の取り込み'), before: '', after: tr('{n} 件の ID', { n: allIds(next).size }) }],
    warnings: r.issues.map(formatPackError),
  };
}

/** 「サンプルに戻す」の結果（顧客パックの初期値に置き換える） */
export function resetTo(current: PackData, sample: PackData): EditResult {
  return {
    ok: true, data: sample,
    changes: [{ op: 'reset', entityLabel: tr('データ全体'), fieldLabel: tr('サンプルに戻す'), before: tr('{n} 件の ID', { n: allIds(current).size }), after: tr('{n} 件の ID', { n: allIds(sample).size }) }],
  };
}
