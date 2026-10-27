// データカタログの導出（FR-159）と、エンティティ×ユースケースの対応表・明示の紐づけ（FR-160）の純関数。
// 端末内だけで完結し、AI には接続しない。データエンティティと「導出」の対応は保存しない（保存するのは「明示」の紐づけだけ）。
import type { UseCase } from '../usecase/model';
import { tr } from '../i18n';

/** 顧客パックのエンティティ（entities.json の entities） */
export interface PackEntity { id: string; name: string; description?: string; type?: string; /** 任意の属性欄（FR-172。文字列、または { name, type? } の配列） */ attributes?: unknown }
/** データエンティティの列（属性。FR-172） */
export interface DataColumn { name: string; type?: string }
/** 列がないときの表示（FR-169 の列の詳細度。FR-172） */
export const NO_COLUMNS_LABEL = '列の情報なし';

/** 値を列の配列にする。列名が空・配列でないものは理由を返す（取り込みの検査用）。undefined・null は列なし */
export function toColumns(v: unknown): { ok: true; columns: DataColumn[] } | { ok: false; error: string } {
  if (v === undefined || v === null) return { ok: true, columns: [] };
  if (!Array.isArray(v)) return { ok: false, error: tr('columns は配列で指定してください。') };
  const columns: DataColumn[] = [];
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    const rawName = typeof c === 'string' ? c : typeof c === 'object' && c !== null && !Array.isArray(c) ? (c as { name?: unknown }).name : undefined;
    const name = typeof rawName === 'string' ? displayName(rawName) : '';
    if (!name) return { ok: false, error: tr('columns の {n} 番目に列名（name）がありません。すべての列に列名を入れてください。', { n: i + 1 }) };
    const rawType = typeof c === 'object' && c !== null ? (c as { type?: unknown }).type : undefined;
    const type = typeof rawType === 'string' ? rawType.trim() : '';
    columns.push({ name, ...(type ? { type } : {}) });
  }
  return { ok: true, columns };
}

/** エンティティの列: 取り込んだ列があればそれ、なければ導出した列。どちらもなければ空（列なし） */
export function entityColumns(entity: { columns?: readonly DataColumn[] }, imported?: { columns?: readonly DataColumn[] }): DataColumn[] {
  if (imported?.columns && imported.columns.length > 0) return [...imported.columns];
  return [...(entity.columns ?? [])];
}
/** 列の総数（FR-171 の簡略表示の判定に使う） */
export function totalColumns(lists: readonly (readonly DataColumn[])[]): number { return lists.reduce((n, l) => n + l.length, 0); }
export type OriginKind = 'issue' | 'solution' | 'flow';
export const ORIGIN_LABELS: Record<OriginKind, string> = {
  get issue() { return tr('課題'); }, get solution() { return tr('解決策'); }, get flow() { return tr('フロー'); },
};
/** 課題・解決策・フローの 1 件と、それが参照するエンティティの ID */
export interface OriginRecord { kind: OriginKind; id: string; title: string; entityIds: string[] }
export interface Origin { kind: OriginKind; id: string; title: string }

export interface DataEntity {
  /** 正規化した名称（同一視の鍵） */
  key: string;
  /** 表示名（全角・半角などを正規化し、前後の空白を除いたもの） */
  name: string;
  description: string;
  /** 顧客パックのエンティティの ID（同じ鍵の最初のもの。企業データカタログの basId との突合に使う。FR-161） */
  id?: string;
  /** 顧客パックの属性欄から導出した列（保存しない。FR-172）。なければ列なし */
  columns?: DataColumn[];
  origins: Origin[];
}
export interface EntityDerivation { entities: DataEntity[]; emptyReason?: string }

/** 導出の元がないときの理由（画面でも表示する） */
export const NO_PACK_REASON = 'データエンティティの導出の元がない（顧客パックがない）ため、一覧は 0 件です。';
export const NO_REF_REASON = 'データエンティティの導出の元がない（課題・解決策・フローが参照するエンティティがない）ため、一覧は 0 件です。';
export const NO_USECASE_REASON = '登録済みのユースケースがないため、対応表の列は空です。ユースケース画面で登録すると列が現れます。';

/** 名称の表記ゆれ（全角・半角、大文字・小文字、前後・連続の空白）をそろえた鍵（FR-159 AC-295） */
export function normalizeKey(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}
export function displayName(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/**
 * データエンティティを導出する。課題・解決策・フローが参照するエンティティだけを元にし、ユースケースの候補（未登録）は使わない。
 * 同じ鍵（正規化した名称）のエンティティは 1 件にまとめ、導出元は重複なくすべて列挙する。
 * packPresent: 顧客パックがあるか（理由の文言を分ける）。
 */
export function deriveEntities(entities: readonly PackEntity[], records: readonly OriginRecord[], packPresent = true): EntityDerivation {
  if (!packPresent) return { entities: [], emptyReason: tr(NO_PACK_REASON) };
  const byId = new Map(entities.map((e) => [e.id, e]));
  const out = new Map<string, DataEntity>();
  for (const r of records) {
    for (const id of r.entityIds) {
      const e = byId.get(id);
      if (!e || !e.name.trim()) continue;
      const key = normalizeKey(e.name);
      let cur = out.get(key);
      if (!cur) {
        cur = { key, name: displayName(e.name), description: '', id: e.id, origins: [] };
        out.set(key, cur);
      }
      if (!cur.description && e.description?.trim()) cur.description = e.description.trim();
      if (!cur.columns) {
        const cols = toColumns(e.attributes);
        if (cols.ok && cols.columns.length > 0) cur.columns = cols.columns; // 不正な属性欄は列なしとして扱い、壊さない
      }
      if (!cur.origins.some((o) => o.kind === r.kind && o.id === r.id)) cur.origins.push({ kind: r.kind, id: r.id, title: r.title });
    }
  }
  const list = [...out.values()].map((e) => {
    if (e.description) return e;
    const type = entities.find((x) => normalizeKey(x.name) === e.key && x.type)?.type;
    return { ...e, description: type ? `種別: ${type}` : '（説明なし）' };
  });
  if (list.length === 0) return { entities: [], emptyReason: tr(NO_REF_REASON) };
  return { entities: list };
}

/** 明示の紐づけ（保存する。FR-160）。エンティティは正規化した名称、ユースケースは登録済みの ID で持つ */
export interface ExplicitLink { entityKey: string; useCaseId: string }
export type CellKind = 'derived' | 'explicit' | 'none';
export const KIND_LABELS: Record<Exclude<CellKind, 'none'>, string> = {
  get derived() { return tr('導出'); }, get explicit() { return tr('明示'); },
};

export const pairKey = (entityKey: string, useCaseId: string): string => `${entityKey}\u0000${useCaseId}`;

/**
 * 導出の対応: 登録済みユースケースの導出元（source）の解決策・課題が参照するエンティティ。
 * 戻り値は pairKey（エンティティの鍵とユースケース ID）の集合。導出の候補（未登録）は渡されない。
 */
export function deriveLinks(
  entities: readonly DataEntity[], pack: readonly PackEntity[], records: readonly OriginRecord[], useCases: readonly UseCase[],
): Set<string> {
  const packById = new Map(pack.map((e) => [e.id, e]));
  const present = new Set(entities.map((e) => e.key));
  const out = new Set<string>();
  for (const uc of useCases) {
    if (!uc.source) continue;
    const { solutionId, issueId } = uc.source;
    const ids = records
      .filter((r) => (r.kind === 'solution' && r.id === solutionId) || (r.kind === 'issue' && r.id === issueId))
      .flatMap((r) => r.entityIds);
    for (const id of ids) {
      const e = packById.get(id);
      const key = e ? normalizeKey(e.name) : '';
      if (key && present.has(key)) out.add(pairKey(key, uc.id));
    }
  }
  return out;
}

export interface Matrix {
  useCases: { id: string; name: string }[];
  rows: { entity: DataEntity; cells: { useCaseId: string; kind: CellKind }[] }[];
  /** ユースケースが 0 件のときの理由 */
  emptyReason?: string;
}

/** 対応表（行: エンティティ、列: 登録済みのユースケース）。導出が明示に優先して表示される */
export function buildMatrix(entities: readonly DataEntity[], useCases: readonly UseCase[], derived: ReadonlySet<string>, links: readonly ExplicitLink[]): Matrix {
  const explicit = new Set(links.map((l) => pairKey(l.entityKey, l.useCaseId)));
  const rows = entities.map((entity) => ({
    entity,
    cells: useCases.map((u) => {
      const k = pairKey(entity.key, u.id);
      const kind: CellKind = derived.has(k) ? 'derived' : explicit.has(k) ? 'explicit' : 'none';
      return { useCaseId: u.id, kind };
    }),
  }));
  return { useCases: useCases.map((u) => ({ id: u.id, name: u.name })), rows, ...(useCases.length === 0 ? { emptyReason: NO_USECASE_REASON } : {}) };
}

/** あるエンティティに関連するユースケース（導出と明示。登録済みだけ） */
export function relatedUseCases(entity: DataEntity, useCases: readonly UseCase[], derived: ReadonlySet<string>, links: readonly ExplicitLink[]): { id: string; name: string; kind: 'derived' | 'explicit' }[] {
  const explicit = new Set(links.map((l) => pairKey(l.entityKey, l.useCaseId)));
  const out: { id: string; name: string; kind: 'derived' | 'explicit' }[] = [];
  for (const u of useCases) {
    const k = pairKey(entity.key, u.id);
    if (derived.has(k)) out.push({ id: u.id, name: u.name, kind: 'derived' });
    else if (explicit.has(k)) out.push({ id: u.id, name: u.name, kind: 'explicit' });
  }
  return out;
}

export type LinkResult = { ok: true; links: ExplicitLink[] } | { ok: false; errors: string[] };

/**
 * 明示の紐づけを追加する（FR-160 AC-299）。存在しないエンティティ名・ユースケース ID、すでにある同じ組は拒否し、既存の紐づけは変えない。
 */
export function addLink(
  links: readonly ExplicitLink[], entities: readonly DataEntity[], useCases: readonly UseCase[], entityName: string, useCaseId: string,
): LinkResult {
  const errors: string[] = [];
  const key = normalizeKey(entityName);
  if (!entities.some((e) => e.key === key)) errors.push(tr('データエンティティ「{name}」は存在しないため、紐づけを追加できません。', { name: entityName }));
  if (!useCases.some((u) => u.id === useCaseId)) errors.push(tr('ユースケース「{id}」は登録されていないため、紐づけを追加できません。', { id: useCaseId }));
  if (errors.length === 0 && links.some((l) => l.entityKey === key && l.useCaseId === useCaseId)) {
    errors.push(tr('同じデータエンティティとユースケースの紐づけはすでにあります。'));
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, links: [...links.map((l) => ({ ...l })), { entityKey: key, useCaseId }] };
}

/** 明示の紐づけを削除する。ない組を指定しても何も変えない */
export function removeLink(links: readonly ExplicitLink[], entityName: string, useCaseId: string): ExplicitLink[] {
  const key = normalizeKey(entityName);
  return links.filter((l) => !(l.entityKey === key && l.useCaseId === useCaseId)).map((l) => ({ ...l }));
}

/** ユースケースの削除に伴い、そのユースケースへの紐づけを取り除く（FR-160 AC-313。連動削除） */
export function removeLinksOfUseCase(links: readonly ExplicitLink[], useCaseId: string): ExplicitLink[] {
  return links.filter((l) => l.useCaseId !== useCaseId).map((l) => ({ ...l }));
}

/** 顧客パックの課題・解決策・フローを、導出の元（OriginRecord）にする。エンティティへの参照は `entityIds`／`relatedIds`、フローは from・to */
export function toRecords(data: {
  issues?: readonly { id: string; title: string }[];
  solutions?: readonly { id: string; title: string }[];
  flows?: readonly { id: string; label: string; from: string; to: string }[];
} | undefined): OriginRecord[] {
  if (!data) return [];
  const ids = (x: object): string[] => {
    const r = x as Record<string, unknown>;
    const v = [...((Array.isArray(r.entityIds) ? r.entityIds : []) as unknown[]), ...((Array.isArray(r.relatedIds) ? r.relatedIds : []) as unknown[])];
    return v.filter((s): s is string => typeof s === 'string');
  };
  return [
    ...(data.issues ?? []).map((i) => ({ kind: 'issue' as const, id: i.id, title: i.title, entityIds: ids(i) })),
    ...(data.solutions ?? []).map((s) => ({ kind: 'solution' as const, id: s.id, title: s.title, entityIds: ids(s) })),
    ...(data.flows ?? []).map((f) => ({ kind: 'flow' as const, id: f.id, title: f.label, entityIds: [f.from, f.to] })),
  ];
}
