// 顧客パックのエンティティの世界区分・種別・上位（FR-213）と、ツイン関係（FR-214）のスキーマの単体テスト
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validatePack, type PackError, type PackFiles } from '../../src/schema';
import { REPO_ROOT, readPackFiles } from '../../scripts/lib/pack-fs';

const mono = path.join(REPO_ROOT, 'examples', 'mono');
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const ENT = 'public/data/entities.json';

/** お手本パック（mono）の entities.json を書き換えて検証し、entities.json のエラーだけを返す */
function errorsAfter(edit: (j: any) => void): PackError[] { // eslint-disable-line @typescript-eslint/no-explicit-any
  const files: PackFiles = clone(readPackFiles(mono));
  edit(files.entities);
  return validatePack(files).errors.filter((e) => e.file === ENT);
}
const idx = (j: any, id: string): number => j.entities.findIndex((e: any) => e.id === id); // eslint-disable-line @typescript-eslint/no-explicit-any

describe('FR-213 顧客パックのエンティティの世界区分・種別・階層', () => {
  // FR-213 AC-489
  it('FR-213 AC-489 世界区分・種別・上位が正しいエンティティは合格する', () => {
    expect(errorsAfter(() => {})).toEqual([]);
  });

  // FR-213 AC-489
  it('FR-213 AC-489 世界区分・種別がないエンティティは合格する（区分なし）', () => {
    expect(errorsAfter((j) => {
      delete j.twins;
      for (const e of j.entities) { delete e.world; delete e.kind; }
    })).toEqual([]);
    // 一部だけ区分なしでも合格する
    expect(errorsAfter((j) => { const e = j.entities[idx(j, 'ent-mono-leader')]; delete e.world; delete e.kind; })).toEqual([]);
  });

  // FR-213 AC-489
  it('FR-213 AC-489 許容値にない世界区分は、項目の位置を示す検証エラーになる', () => {
    const errs = errorsAfter((j) => { j.entities[idx(j, 'ent-mono-robot')].world = 'virtual'; });
    const i = errs.find((e) => e.path.endsWith('.world'));
    expect(i, JSON.stringify(errs)).toBeTruthy();
    expect(i!.code).toBe('schema');
    expect(i!.id).toBe('ent-mono-robot');
  });

  // FR-213 AC-489
  it('FR-213 AC-489 許容値にない種別は、項目の位置を示す検証エラーになる', () => {
    let at = -1;
    const errs = errorsAfter((j) => { at = idx(j, 'ent-mono-robot'); j.entities[at].kind = 'machine'; });
    expect(errs.some((e) => e.path === `entities[${at}].kind` && e.id === 'ent-mono-robot')).toBe(true);
  });

  // FR-213 AC-489
  it('FR-213 AC-489 世界区分と種別の組み合わせの誤り（現実世界に「データ」）は検証エラーになる', () => {
    let at = -1;
    const errs = errorsAfter((j) => { at = idx(j, 'ent-mono-robot'); j.entities[at].kind = 'data'; });
    const e = errs.find((x) => x.path === `entities[${at}].kind`);
    expect(e, JSON.stringify(errs)).toBeTruthy();
    expect(e!.message).toContain('データ');
    expect(e!.message).toContain('現実世界');
  });

  // FR-213 AC-489
  it('FR-213 AC-489 種別だけで世界区分のないものは検証エラーになる', () => {
    let at = -1;
    const errs = errorsAfter((j) => { at = idx(j, 'ent-mono-leader'); delete j.entities[at].world; });
    expect(errs.some((x) => x.path === `entities[${at}].world`)).toBe(true);
  });

  // FR-213 AC-489
  it('FR-213 AC-489 存在しない上位は、項目の位置を示す検証エラーになる', () => {
    let at = -1;
    const errs = errorsAfter((j) => { at = idx(j, 'ent-mono-motor'); j.entities[at].parentId = 'ent-mono-no-such'; });
    const e = errs.find((x) => x.path === `entities[${at}].parentId`);
    expect(e, JSON.stringify(errs)).toBeTruthy();
    expect(e!.code).toBe('dangling-reference');
  });

  // FR-213 AC-489
  it('FR-213 AC-489 循環する上位は、項目の位置を示す検証エラーになる', () => {
    let a = -1; let b = -1;
    const errs = errorsAfter((j) => {
      a = idx(j, 'ent-mono-plant'); b = idx(j, 'ent-mono-line-a');
      j.entities[a].parentId = 'ent-mono-robot'; // plant → robot → line-a → plant
    });
    const cyc = errs.filter((x) => /循環/.test(x.message));
    expect(cyc.map((x) => x.path)).toEqual(expect.arrayContaining([`entities[${a}].parentId`, `entities[${b}].parentId`]));
  });

  // FR-213 AC-489
  it('FR-213 AC-489 世界区分の異なる上位は、項目の位置を示す検証エラーになる', () => {
    let at = -1;
    const errs = errorsAfter((j) => { at = idx(j, 'ent-mono-dt-mes'); j.entities[at].parentId = 'ent-mono-plant'; });
    const e = errs.find((x) => x.path === `entities[${at}].parentId`);
    expect(e, JSON.stringify(errs)).toBeTruthy();
    expect(e!.message).toContain('世界区分');
  });
});

describe('FR-214 顧客パックのツイン関係', () => {
  // FR-214 AC-491
  it('FR-214 AC-491 両端が存在し世界区分が異なるツイン関係は合格し、1 対多・多対 1 も合格する', () => {
    const errs = errorsAfter((j) => {
      j.twins = [
        { realId: 'ent-mono-robot', digitalId: 'ent-mono-dt-robot-model', relation: 'represents', sourceIds: ['src-mono-001'] },
        { realId: 'ent-mono-robot', digitalId: 'ent-mono-dt-robot-metric', relation: 'measures', sourceIds: ['src-mono-001'] }, // 1 対多
        { realId: 'ent-mono-press', digitalId: 'ent-mono-dt-mes', relation: 'records', sourceIds: ['src-mono-001'] },
        { realId: 'ent-mono-conveyor', digitalId: 'ent-mono-dt-mes', relation: 'records', sourceIds: ['src-mono-001'] }, // 多対 1
      ];
    });
    expect(errs).toEqual([]);
  });

  // FR-214 AC-491
  it('FR-214 AC-491 存在しない ID を指すツイン関係は、関係の位置を示す検証エラーになる', () => {
    const errs = errorsAfter((j) => { j.twins[0].digitalId = 'ent-mono-no-such'; });
    expect(errs.some((e) => e.path === 'twins[0].digitalId' && /entities にない/.test(e.message))).toBe(true);
    const errs2 = errorsAfter((j) => { j.twins[1].realId = 'ent-mono-no-such'; });
    expect(errs2.some((e) => e.path === 'twins[1].realId')).toBe(true);
  });

  // FR-214 AC-491
  it('FR-214 AC-491 両端が同じ世界区分のツイン関係は検証エラーになる', () => {
    const errs = errorsAfter((j) => { j.twins[0].digitalId = 'ent-mono-robot'; }); // 現実世界どうし
    expect(errs.some((e) => e.path === 'twins[0].digitalId' && /デジタル世界/.test(e.message))).toBe(true);
    const errs2 = errorsAfter((j) => { j.twins[0].realId = 'ent-mono-dt-mes'; }); // デジタル世界どうし
    expect(errs2.some((e) => e.path === 'twins[0].realId' && /現実世界/.test(e.message))).toBe(true);
  });

  // FR-214 AC-491
  it('FR-214 AC-491 許容値にない関係の種類のツイン関係は検証エラーになる', () => {
    const errs = errorsAfter((j) => { j.twins[2].relation = 'controls'; });
    expect(errs.some((e) => e.path === 'twins[2].relation' && e.code === 'schema')).toBe(true);
  });

  // FR-214 AC-491
  it('FR-214 AC-491 出典のないツイン関係は検証エラーになる', () => {
    expect(errorsAfter((j) => { delete j.twins[3].sourceIds; }).some((e) => e.path === 'twins[3].sourceIds')).toBe(true);
    expect(errorsAfter((j) => { j.twins[3].sourceIds = []; }).some((e) => e.path === 'twins[3].sourceIds')).toBe(true);
  });
});
