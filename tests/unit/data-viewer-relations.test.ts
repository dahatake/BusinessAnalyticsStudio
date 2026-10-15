// データビュアーの関連の導出・簡略表示の判定（FR-170 AC-338、FR-171 AC-341）の単体テスト。
import { describe, expect, it } from 'vitest';
import {
  MAX_DETAIL_COLUMNS, MAX_DETAIL_ENTITIES, decideViewMode, deriveViewerRelations, lineStyleOf, relatedOf, simplifySelection,
} from '../../src/datacatalog/relations';
import { normalizeKey } from '../../src/datacatalog/model';
import type { ViewerEntity } from '../../src/datacatalog/viewer';

const ent = (key: string, over: Partial<ViewerEntity> = {}): ViewerEntity => ({ key, name: key, description: '', columns: [], cluster: 'c', relatedUseCases: [], category: '', ...over });
const input = (entities: ViewerEntity[], extra: Partial<Parameters<typeof deriveViewerRelations>[0]> = {}) => ({ entities, entityLinks: [], catalogItems: [], normalize: normalizeKey, ...extra });

describe('FR-170 AC-338 関連の導出', () => {
  const entities = [
    ent('受注', { relatedUseCases: [{ name: 'UC1', kind: 'derived' }, { name: 'UC2', kind: 'explicit' }], columns: [{ name: '金額' }, { name: '内部' }], category: '差異' }),
    ent('顧客', { category: 'BASのみ' }),
  ];
  const full = input(entities, { entityLinks: [{ from: '受注', to: '顧客', label: '発注' }], catalogItems: [{ name: '受注', columns: [{ name: '金額' }] }] });

  it('①〜④の種類ごとに、端点・種類・ラベルが得られる', () => {
    const r = deriveViewerRelations(full);
    expect(r.filter((x) => x.kind === 'entity').map((x) => [x.from, x.to, x.label])).toEqual([['e:受注', 'e:顧客', '発注']]);
    expect(r.filter((x) => x.kind === 'usecase').map((x) => [x.to, x.state])).toEqual([['u:UC1', '導出'], ['u:UC2', '明示']]);
    expect(r.filter((x) => x.kind === 'column')).toHaveLength(1); // 金額だけが対応する
    expect(r.filter((x) => x.kind === 'reconcile').map((x) => x.state).sort()).toEqual(['BASのみ', '差異']);
  });
  it('同じ入力から同じ結果になる', () => {
    expect(deriveViewerRelations(full)).toEqual(deriveViewerRelations({ ...full }));
  });
  it('端点が存在しない関連は作らない（自己参照も作らない）', () => {
    const r = deriveViewerRelations(input(entities, { entityLinks: [{ from: '受注', to: '存在しない' }, { from: '受注', to: '受注' }] }));
    expect(r.filter((x) => x.kind === 'entity')).toHaveLength(0);
  });
  it('入力が空のとき 0 件', () => {
    expect(deriveViewerRelations(input([]))).toEqual([]);
  });
  it('種類・導出／明示・区分は、線の種類でも区別できる（AC-340 の元）', () => {
    const styles = [
      lineStyleOf({ kind: 'entity', state: '' }), lineStyleOf({ kind: 'usecase', state: '導出' }), lineStyleOf({ kind: 'usecase', state: '明示' }), lineStyleOf({ kind: 'column', state: '' }),
      ...['一致', '差異', 'BASのみ', 'カタログのみ'].map((state) => lineStyleOf({ kind: 'reconcile', state })),
    ];
    expect(new Set(styles.map((s) => `${s.dash}|${s.width}`)).size).toBe(styles.length);
  });
  it('選択に関連する対象（ユースケースを共有するものを含む）が得られ、選択なしは null', () => {
    const es = [ent('a', { relatedUseCases: [{ name: 'U', kind: 'derived' }] }), ent('b', { relatedUseCases: [{ name: 'U', kind: 'explicit' }] }), ent('c')];
    const rels = deriveViewerRelations(input(es));
    expect([...relatedOf(rels, { entityKey: 'a' })!.entityKeys].sort()).toEqual(['a', 'b']);
    expect([...relatedOf(rels, { useCase: 'U' })!.entityKeys].sort()).toEqual(['a', 'b']);
    expect(relatedOf(rels, {})).toBeNull();
  });
});

describe('FR-171 AC-341 表示の切替の判定', () => {
  it('上限ちょうどは通常、+1 で簡略（エンティティ・列のどちらでも）', () => {
    expect(decideViewMode(MAX_DETAIL_ENTITIES, MAX_DETAIL_COLUMNS).simplified).toBe(false);
    expect(decideViewMode(MAX_DETAIL_ENTITIES + 1, 0).simplified).toBe(true);
    expect(decideViewMode(0, MAX_DETAIL_COLUMNS + 1).simplified).toBe(true);
    expect(decideViewMode(MAX_DETAIL_ENTITIES + 1, 0).reason).toContain('上限');
  });
  it('上限は PARAM-055=300・PARAM-056=3000', () => {
    expect([MAX_DETAIL_ENTITIES, MAX_DETAIL_COLUMNS]).toEqual([300, 3000]);
  });
  it('簡略表示では選択と近傍だけを詳細にし、残りを件数で集約する', () => {
    const all = ['a', 'b', 'c', 'd'].map((k) => ent(k));
    const r = simplifySelection(all, all, 'a', new Set(['b']), false);
    expect([...r.detailKeys].sort()).toEqual(['a', 'b']);
    expect(r.aggregated).toBe(2);
    expect(simplifySelection(all, [all[3]!], null, new Set(), true).detailKeys.has('d')).toBe(true);
  });
});
