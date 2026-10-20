// 顧客パックのエンティティの世界区分・種別・ツイン関係（FR-213・FR-214。分類の正本は要求定義書 §3.7）。
// 世界区分・種別・ツイン関係はいずれも任意の項目で、ないエンティティは「区分なし」として扱う（既存の顧客パックを壊さない）。
// このモジュールは画面の部品を参照しない（NFR-MAINT-001）。
import { z } from 'zod';

/** 世界区分（FR-213）。real＝現実世界（ビジネス）、digital＝デジタル世界（Digital Twin） */
export const WORLDS = ['real', 'digital'] as const;
export type World = (typeof WORLDS)[number];
export const WorldSchema = z.enum(WORLDS);

export const WORLD_LABELS: Record<World, string> = { real: '現実世界', digital: 'デジタル世界' };
/** 世界区分のないエンティティの表示名 */
export const UNCLASSIFIED_LABEL = '区分なし';

/** 世界区分ごとの種別（§3.7 の分類の体系）。値は英小文字の識別子、表示名は ENTITY_KIND_LABELS */
export const REAL_KINDS = ['site', 'equipment', 'person', 'organization', 'operation', 'thing', 'event', 'floor', 'room'] as const;
export const DIGITAL_KINDS = ['data', 'model', 'system', 'ui-component', 'metric'] as const;
export const ENTITY_KINDS = [...REAL_KINDS, ...DIGITAL_KINDS] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];
export const EntityKindSchema = z.enum(ENTITY_KINDS);

export const KINDS_BY_WORLD: Record<World, readonly EntityKind[]> = { real: REAL_KINDS, digital: DIGITAL_KINDS };

export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  site: '拠点',
  equipment: '設備',
  person: '人',
  organization: '組織',
  operation: '業務',
  thing: 'モノ',
  event: 'コト',
  floor: 'フロア',
  room: '部屋',
  data: 'データ',
  model: 'モデル',
  system: 'システム',
  'ui-component': '画面コンポーネント',
  metric: 'センサー/指標',
};

/** 種別が属する世界区分 */
export const worldOfKind = (kind: EntityKind): World => ((REAL_KINDS as readonly string[]).includes(kind) ? 'real' : 'digital');

/**
 * §3.7 のエンティティの分類表の世界区分のうち、世界区分の項目を持たないデータ（課題・原因・解決策など）と、
 * 1 つの世界の画面が当てる行（FR-218・A-57）。世界区分を当てる唯一の表で、グラフの節（src/selection/graph.ts）と
 * 画面の登録の宣言（src/screens/registry.ts）はここから引く。行を足すときは §3.7 の分類表と同じ値にする。
 */
export const TABLE_WORLDS: Readonly<Record<string, World>> = {
  工程: 'real',
  ユースケース: 'real',
  課題: 'real',
  原因: 'real',
  解決策: 'real',
  効果: 'real',
  議題: 'real',
  // 中核オブジェクトの種別（モノ／コト）は顧客パックの種別に従うが、どちらも現実世界（Q-038 A・A-59）
  中核オブジェクト: 'real',
  // 改善要望（FR-131）はアプリへの改善の希望の記録で、デジタル世界（データ）。顧客パックのファイルにはない（Q-038 A・A-59）
  改善要望: 'digital',
  出典: 'digital',
  アーキテクチャ: 'digital',
  議論ツリー: 'digital',
  KPI: 'digital',
  OKR: 'digital',
  企業データカタログ: 'digital',
  データエンティティ: 'digital',
  議論テーマ: 'digital',
  ストローク: 'digital',
  付箋: 'digital',
  Feature: 'digital',
  'Microsoft 製品': 'digital',
  チャプター: 'digital',
  モック: 'digital',
};

/** §3.7 の分類表の行の世界区分。表にない名前は undefined（推測で当てない） */
export const tableWorldOf = (name: string): World | undefined =>
  (Object.prototype.hasOwnProperty.call(TABLE_WORLDS, name) ? TABLE_WORLDS[name] : undefined);

/** 複数の行がすべて同じ世界区分のときの、その世界区分。表にない行や、世界区分の異なる行を含むときは例外（宣言の誤り） */
export function tableWorldOfAll(names: readonly string[]): World {
  const ws = new Set(names.map((n) => {
    const w = tableWorldOf(n);
    if (!w) throw new Error(`§3.7 の分類表に「${n}」の世界区分がありません`);
    return w;
  }));
  if (ws.size !== 1) throw new Error(`「${names.join('・')}」の世界区分が 1 つに決まりません`);
  return [...ws][0]!;
}

/** ツイン関係の種類（FR-214）。デジタル世界の側が、現実世界の側を「表す・計測する・記録する・表示する」 */
export const TWIN_RELATIONS = ['represents', 'measures', 'records', 'displays'] as const;
export type TwinRelation = (typeof TWIN_RELATIONS)[number];
export const TwinRelationSchema = z.enum(TWIN_RELATIONS);
export const TWIN_RELATION_LABELS: Record<TwinRelation, string> = {
  represents: '表す',
  measures: '計測する',
  records: '記録する',
  displays: '表示する',
};

/** ツイン関係の 1 件（entities.json の twins[]） */
export const TwinSchema = z.looseObject({
  realId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'ID は小文字英数字とハイフンだけで書く'),
  digitalId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'ID は小文字英数字とハイフンだけで書く'),
  relation: TwinRelationSchema,
  /** 出典（必須。FR-115 と同じく、対応付けの根拠を示す） */
  sourceIds: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]*$/)).min(1, 'ツイン関係には出典（sourceIds）が 1 件以上必要です'),
});
export type Twin = z.infer<typeof TwinSchema>;

interface EntityLike { id?: unknown; world?: unknown; kind?: unknown; parentId?: unknown }
interface Issue { path: Array<string | number>; message: string }

const isWorld = (v: unknown): v is World => typeof v === 'string' && (WORLDS as readonly string[]).includes(v);
const isKind = (v: unknown): v is EntityKind => typeof v === 'string' && (ENTITY_KINDS as readonly string[]).includes(v);

/**
 * entities.json の中の、項目をまたぐ検査（FR-213 AC-489・FR-214 AC-491）。
 * 種別と世界区分の組み合わせ、種別だけで世界区分がないもの、上位の循環、世界区分の異なる上位、
 * ツイン関係の両端の存在と世界区分。位置（path）は entities.json の中の位置。
 * 許容値にない値・存在しない上位は、スキーマ（zod）と参照の検査（validatePack）が報告するので、ここでは重ねて報告しない。
 */
export function checkWorldStructure(entities: readonly EntityLike[], twins: readonly unknown[] | undefined): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map<string, { e: EntityLike; i: number }>();
  entities.forEach((e, i) => { if (typeof e?.id === 'string' && !byId.has(e.id)) byId.set(e.id, { e, i }); });

  entities.forEach((e, i) => {
    if (!e || typeof e !== 'object') return;
    if (isKind(e.kind)) {
      if (e.world === undefined) {
        issues.push({ path: ['entities', i, 'world'], message: `種別「${ENTITY_KIND_LABELS[e.kind]}」には世界区分（world）が必要です` });
      } else if (isWorld(e.world) && worldOfKind(e.kind) !== e.world) {
        issues.push({
          path: ['entities', i, 'kind'],
          message: `種別「${ENTITY_KIND_LABELS[e.kind]}」は${WORLD_LABELS[worldOfKind(e.kind)]}の種別で、世界区分「${WORLD_LABELS[e.world]}」とは組み合わせられません`,
        });
      }
    }
    if (typeof e.parentId === 'string') {
      const parent = byId.get(e.parentId);
      if (parent && isWorld(e.world) && isWorld(parent.e.world) && parent.e.world !== e.world) {
        issues.push({
          path: ['entities', i, 'parentId'],
          message: `上位 ${e.parentId} の世界区分（${WORLD_LABELS[parent.e.world]}）が、この項目の世界区分（${WORLD_LABELS[e.world]}）と異なります。上位は同じ世界区分の中だけで指します`,
        });
      }
    }
  });

  // 上位の循環（自分自身を上位にたどり着くもの）。循環に含まれる各項目を 1 回ずつ報告する
  const inCycle = new Set<string>();
  for (const [id] of byId) {
    const chain: string[] = [];
    const visited = new Set<string>();
    let cur: string | undefined = id;
    while (cur !== undefined && byId.has(cur) && !visited.has(cur)) {
      visited.add(cur);
      chain.push(cur);
      const p: unknown = byId.get(cur)!.e.parentId;
      cur = typeof p === 'string' ? p : undefined;
    }
    if (cur !== undefined && cur === id) for (const c of chain) inCycle.add(c);
  }
  for (const id of inCycle) {
    const { i } = byId.get(id)!;
    issues.push({ path: ['entities', i, 'parentId'], message: `上位が循環しています（${id} の上位をたどると ${id} に戻ります）` });
  }

  (twins ?? []).forEach((t, i) => {
    if (!t || typeof t !== 'object') return;
    const tw = t as Record<string, unknown>;
    const ends: Array<['realId' | 'digitalId', World]> = [['realId', 'real'], ['digitalId', 'digital']];
    for (const [key, expected] of ends) {
      const id = tw[key];
      if (typeof id !== 'string') continue;
      const hit = byId.get(id);
      if (!hit) {
        issues.push({ path: ['twins', i, key], message: `ツイン関係の ${key} が、entities にない ID を指しています: ${id}` });
      } else if (hit.e.world !== expected) {
        const actual = isWorld(hit.e.world) ? WORLD_LABELS[hit.e.world] : UNCLASSIFIED_LABEL;
        issues.push({ path: ['twins', i, key], message: `ツイン関係の ${key}（${id}）は${WORLD_LABELS[expected]}のエンティティを指します（実際は ${actual}）` });
      }
    }
  });
  return issues;
}

/** 世界区分のないエンティティの件数（verify:pack の警告。FR-213 AC-490） */
export function countUnclassified(entitiesJson: unknown): number {
  const list = (entitiesJson as { entities?: unknown } | undefined)?.entities;
  if (!Array.isArray(list)) return 0;
  return list.filter((e) => !(e && typeof e === 'object' && isWorld((e as EntityLike).world))).length;
}

/**
 * 世界区分（world）か種別（kind）のないエンティティの位置（FR-213 AC-509）。
 * 生成パイプラインが作る顧客パックでは「区分なし」を許さないので、⑤スキーマ検証と ⑥verify がこれをエラーにする。
 * 手作りの顧客パックでは使わない（区分なしは警告だけ。AC-490）。位置（path）は entities.json の中の位置。
 */
export function listUnclassified(entitiesJson: unknown): Array<Issue & { id?: string }> {
  const list = (entitiesJson as { entities?: unknown } | undefined)?.entities;
  if (!Array.isArray(list)) return [];
  const out: Array<Issue & { id?: string }> = [];
  list.forEach((e, i) => {
    const o = (e && typeof e === 'object' ? e : {}) as EntityLike;
    const id = typeof o.id === 'string' ? { id: o.id } : {};
    if (o.world === undefined) {
      out.push({ path: ['entities', i, 'world'], message: `世界区分（world）がありません（${WORLDS.join('／')} のどれかを付けてください）`, ...id });
    }
    if (o.kind === undefined) {
      out.push({ path: ['entities', i, 'kind'], message: `種別（kind）がありません（${ENTITY_KINDS.join('／')} のどれかを付けてください）`, ...id });
    }
  });
  return out;
}

/** エンティティの世界区分（ないものは undefined＝区分なし） */
export const worldOf = (e: { world?: unknown } | undefined): World | undefined => (isWorld(e?.world) ? e!.world as World : undefined);
