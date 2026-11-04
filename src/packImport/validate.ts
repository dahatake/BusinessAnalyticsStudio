// アップロードされた顧客パックの検証（FR-303）。`validatePackDir`（CLI）と同じ `validateLayout`・`validatePack` を再利用し、
// verify:pack のファイルで判定する項目（1・3 の AA・4 の JSON 側・5）と `disableInvalidItems` の結果を日本語でまとめる。
// 純粋な関数だけで書く（Node 専用の API は使わない）。
import { tr } from '../i18n';
import {
  DATA_FILE_NAMES, REQUIRED_PATHS, countUnclassified, disableInvalidItems, validateLayout, validatePack,
  type BrandProfile, type PackData, type PackError, type PackErrorCode, type PackFiles,
} from '../schema';
import { judgePrimary, splitPackErrors, type Finding } from './judge';
import { MAX_FILE_BYTES, REQUIRED_SLOTS, slotPath, type ClassifiedFiles, type PackSlot } from './classify';

export type UploadErrorCode = PackErrorCode | 'json-syntax' | 'duplicate-file' | 'file-too-large';

export interface UploadError {
  code: UploadErrorCode;
  /** パック内の相対パス（例: `public/data/issues.json`）。重複・サイズ超過・構文エラーでは、選ばれたファイル名も message に含む */
  file: string;
  /** JSON 内の位置（例: `issues[2].parentId`）。ファイル全体の誤りでは空 */
  path: string;
  id?: string;
  /** 日本語の内容 */
  message: string;
  /** 日本語の直し方 */
  remedy: string;
  /** 構文エラーの位置（分かるときだけ。1 始まり） */
  line?: number;
  column?: number;
}

export interface UploadCheck extends Finding {
  /** verify:pack の項目の ID */
  id: 'schema' | 'primary' | 'names' | 'sources';
  name: string;
}

export interface UploadValidation {
  /** エラーが 0 件で、4 項目がすべて合格のとき true（取り込める） */
  ok: boolean;
  errors: UploadError[];
  /** 合否に含めない警告（区分なしの件数・Primary 色の補正・判別できなかったファイルなど） */
  warnings: string[];
  /** verify:pack の 9 項目のうち、ファイルで判定する 4 項目 */
  checks: UploadCheck[];
  /** 出典のない数値項目の件数（`validatePack` と同じ） */
  unsourcedNumbers: number;
  /** `disableInvalidItems` が無効にする項目の ID（連鎖して無効になる下位の項目を含む）。検証エラーがなければ空 */
  disabledIds: string[];
  /** 項目を特定できないエラー（ファイルの欠け・設定ファイルの誤りなど）があって起動できないとき true */
  fatal: boolean;
  /** 起動して判定する項目（2・6・7・8）はアップロード時の合否に含めない旨 */
  notJudged: string;
  /** ok のときだけ入る */
  data?: PackData;
  brand?: BrandProfile;
}

export const NOT_JUDGED_NOTE = '起動して判定する項目（2 ページエラー・6 サンプル表示・7 キー操作・8 エクスポートと復元）は、取り込み後に通常どおり起動して確かめてください。アップロード時の合否には含めません。';

const REMEDY: Record<UploadErrorCode, string> = {
  'missing-file': 'このファイルを選びに加えてください（必須: 9 つの JSON と brand-profile.json）。',
  schema: 'schema/ の定義に合うように、該当の位置の値を直してください。',
  'duplicate-id': 'ID を、パック内で重複しない値に直してください。',
  'dangling-reference': '参照先の ID を、存在する ID に直すか、参照を取り除いてください。',
  'missing-source': '該当の数値項目に、調査の出典（sourceIds）を付けてください。確かめられない数値は、削除するか推定として扱ってください（FR-115）。',
  'json-syntax': 'JSON の構文（カンマ・引用符・括弧の対応）を直してください。',
  'duplicate-file': '同じ種類のファイルが複数あります。使うファイルを 1 つだけ選んでください。',
  'file-too-large': '1 ファイルの上限（5MB）を超えています。ファイルを小さくしてください。',
};

const toUploadError = (e: PackError): UploadError => ({ ...e, remedy: REMEDY[e.code] });

/** JSON の構文を先頭から調べ、最初の誤りの位置（0 始まりの文字位置）を返す。誤りがなければ undefined（エンジンの違いによらず位置を得るための小さな検査器） */
export function findJsonErrorOffset(text: string): number | undefined {
  let i = 0;
  const ws = (): void => { while (i < text.length && ' \t\n\r'.includes(text[i]!)) i++; };
  const fail = (): never => { throw i; };
  const lit = (w: string): void => { if (text.startsWith(w, i)) i += w.length; else fail(); };
  const str = (): void => {
    i++; // "
    for (;;) {
      if (i >= text.length) fail();
      const ch = text[i]!;
      if (ch === '"') { i++; return; }
      if (ch < ' ') fail();
      if (ch === '\\') {
        const n = text[i + 1];
        if (n === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) { i += 2; fail(); } i += 6; }
        else if (n !== undefined && '"\\/bfnrt'.includes(n)) i += 2;
        else { i++; fail(); }
      } else i++;
    }
  };
  const num = (): void => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail();
    i += m![0].length;
  };
  const value = (): void => {
    ws();
    const ch = text[i];
    if (ch === '{') {
      i++; ws();
      if (text[i] === '}') { i++; return; }
      for (;;) {
        ws(); if (text[i] !== '"') fail();
        str(); ws(); if (text[i] !== ':') fail();
        i++; value(); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return; }
        fail();
      }
    } else if (ch === '[') {
      i++; ws();
      if (text[i] === ']') { i++; return; }
      for (;;) {
        value(); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return; }
        fail();
      }
    } else if (ch === '"') str();
    else if (ch === 't') lit('true');
    else if (ch === 'f') lit('false');
    else if (ch === 'n') lit('null');
    else num();
  };
  try { value(); ws(); if (i < text.length) fail(); } catch (e) { return typeof e === 'number' ? e : undefined; }
  return undefined;
}

/** JSON.parse の例外から、行・桁（1 始まり）を求める。エンジンの例外文に位置がなくても、構文を調べ直して求める */
export function syntaxPosition(text: string, err: unknown): { line?: number; column?: number } {
  const msg = err instanceof Error ? err.message : String(err);
  const lc = /line (\d+) column (\d+)/.exec(msg);
  if (lc) return { line: Number(lc[1]), column: Number(lc[2]) };
  const pos = /position (\d+)/.exec(msg);
  const offset = pos ? Number(pos[1]) : findJsonErrorOffset(text);
  if (offset === undefined) return {};
  const upto = text.slice(0, Math.min(offset, text.length));
  const lines = upto.split(/\r\n|\r|\n/);
  return { line: lines.length, column: lines[lines.length - 1]!.length + 1 };
}

const ALL_PATHS_FOR_OPTIONALS = REQUIRED_PATHS.filter((p) => !REQUIRED_SLOTS.some((s) => slotPath(s) === p));

/** 分類した結果を検証する。例外は投げない（壊れたファイルは構文エラーとして結果にまとめる） */
export function validateUpload(c: ClassifiedFiles): UploadValidation {
  const errors: UploadError[] = [];
  const files: PackFiles = {};
  /** 読めなかった（壊れた・重複・大きすぎる）枠。存在はするので「欠け」にはしない */
  const unreadable = new Set<PackSlot>();
  const unreadableDataSlots = new Set<PackSlot>();
  const markUnreadable = (slot: PackSlot): void => {
    unreadable.add(slot);
    if ((DATA_FILE_NAMES as readonly string[]).includes(slot)) unreadableDataSlots.add(slot);
  };

  for (const o of c.oversize) {
    if (o.slot) markUnreadable(o.slot);
    errors.push({
      code: 'file-too-large', file: o.slot ? slotPath(o.slot) : o.name, path: '',
      message: tr('ファイルが大きすぎます: {name}（{mb} MB。上限 {max} MB）', { name: o.name, mb: (o.bytes / 1024 / 1024).toFixed(1), max: String(MAX_FILE_BYTES / 1024 / 1024) }),
      remedy: REMEDY['file-too-large'],
    });
  }
  for (const d of c.duplicates) {
    markUnreadable(d.slot);
    errors.push({
      code: 'duplicate-file', file: slotPath(d.slot), path: '',
      message: tr('同じ種類のファイルが複数あります: {names}', { names: d.names.join('、') }),
      remedy: REMEDY['duplicate-file'],
    });
  }
  for (const [slot, f] of Object.entries(c.assigned) as Array<[PackSlot, NonNullable<ClassifiedFiles['assigned'][PackSlot]>]>) {
    if (slot === 'customerResearch' || slot === 'brandResearch') continue; // 任意の .md は中身を検査しない
    try {
      const json: unknown = JSON.parse(f.text.replace(/^\uFEFF/, ''));
      if (slot === 'brandProfile') files.brandProfile = json;
      else files[slot] = json;
    } catch (err) {
      markUnreadable(slot);
      const pos = syntaxPosition(f.text, err);
      const at = pos.line ? tr('（{line} 行目 {column} 桁目）', { line: String(pos.line), column: String(pos.column ?? 1) }) : '';
      errors.push({
        code: 'json-syntax', file: slotPath(slot), path: '',
        message: tr('JSON の構文エラーです: {name}{at} {detail}', { name: f.name, at, detail: err instanceof Error ? err.message : String(err) }),
        remedy: REMEDY['json-syntax'], ...pos,
      });
    }
  }

  // 構成（FR-119）: アップロードされた枠（読めなかったものも含む）を「ある」ものとして、必須の JSON の欠けだけを挙げる
  // （任意の .md と assets/ は、なくてもエラーにしない。AC-847）
  const present = [
    ...(Object.keys(c.assigned) as PackSlot[]), ...unreadable,
  ].map(slotPath);
  const layout = validateLayout([...present, ...ALL_PATHS_FOR_OPTIONALS, 'assets/brand/_']);
  // 中身（FR-114〜117）。欠けたファイルは構成で報告済みなので、重複を除く
  const content = validatePack(files);
  const reported = new Set([...layout.map((e) => e.file), ...[...unreadable].map(slotPath)]);
  const contentErrors = content.errors.filter((e) =>
    !(e.code === 'missing-file' && reported.has(e.file))
    // 読めなかった JSON の中にある ID は分からないので、参照が存在しないとは言えない
    && !(e.code === 'dangling-reference' && unreadableDataSlots.size > 0));
  errors.push(...layout.map(toUploadError), ...contentErrors.map(toUploadError));

  const { schemaErrors, sourceErrors } = splitPackErrors(errors);
  const list = (es: readonly UploadError[], max = 5): string =>
    es.slice(0, max).map((e) => `${e.file}${e.path ? ` ${e.path}` : ''}${e.id ? ` [${e.id}]` : ''}: ${e.message}`).join(' / ') + (es.length > max ? ` ほか ${es.length - max} 件` : '');

  const brandUnreadable = files.brandProfile === undefined;
  const primary = brandUnreadable
    ? { effective: '', warnings: [] as string[], finding: { ok: false, detail: 'public/brand/brand-profile.json を読めないため、Primary 色を判定できません', remedy: 'brand-profile.json を選び直してください。' } satisfies Finding }
    : judgePrimary(files.brandProfile);
  const customer = files.customer as { name?: unknown; projectName?: unknown } | undefined;
  const nameOk = typeof customer?.name === 'string' && customer.name.trim() !== '' && typeof customer?.projectName === 'string' && customer.projectName.trim() !== '';
  const checks: UploadCheck[] = [
    {
      id: 'schema', name: 'スキーマ検証エラー 0 件',
      ...(schemaErrors.length === 0 ? { ok: true, detail: 'エラー 0 件' } : {
        ok: false, detail: `エラー ${schemaErrors.length} 件: ${list(schemaErrors)}`,
        remedy: '各エラーの位置の値を、schema/ の定義に合わせて直し、ファイルを選び直してください。',
      }),
    },
    { id: 'primary', name: 'Primary 色の AA コントラスト', ...primary.finding },
    {
      id: 'names', name: '顧客名・Project 名（JSON 側）',
      ...(nameOk ? { ok: true, detail: `${String(customer?.name)} / ${String(customer?.projectName)}` } : {
        ok: false, detail: 'public/data/customer.json の name と projectName が、文字列として入っていません',
        remedy: 'customer.json の name（顧客名）と projectName（Project 名）を入れてください。',
      }),
    },
    {
      id: 'sources', name: '出典のない数値項目 0 件',
      ...(sourceErrors.length === 0 ? { ok: true, detail: '出典のない数値項目 0 件' } : {
        ok: false, detail: `出典のない数値項目 ${sourceErrors.length} 件: ${list(sourceErrors)}`, remedy: REMEDY['missing-source'],
      }),
    },
  ];

  const warnings: string[] = [...primary.warnings];
  if (c.unknown.length) warnings.push(tr('判別できなかったファイルは取り込みません: {names}', { names: c.unknown.join('、') }));
  if (files.entities !== undefined) {
    const n = countUnclassified(files.entities);
    if (n > 0) warnings.push(tr('世界区分か種別のないエンティティ（区分なし）が {n} 件あります（合否には含めません）', { n: String(n) }));
  }
  if (!('customerResearch' in c.assigned) || !('brandResearch' in c.assigned)) {
    warnings.push(tr('顧客調査・ブランド調査の .md は選ばれていません（任意なので、取り込みはできます）'));
  }

  const ok = errors.length === 0 && checks.every((k) => k.ok);
  let disabledIds: string[] = [];
  let fatal = false;
  if (errors.length > 0 && unreadable.size === 0 && DATA_FILE_NAMES.every((n) => files[n] !== undefined)) {
    const r = disableInvalidItems(files);
    disabledIds = r.disabledIds;
    fatal = r.fatal;
  } else if (errors.length > 0) {
    fatal = true;
  }

  return {
    ok, errors, warnings, checks, unsourcedNumbers: content.unsourcedNumbers, disabledIds, fatal, notJudged: NOT_JUDGED_NOTE,
    ...(ok ? { data: files as unknown as PackData, brand: files.brandProfile as BrandProfile } : {}),
  };
}
