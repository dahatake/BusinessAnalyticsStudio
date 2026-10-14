// データエンティティの列（属性）の保持（FR-172 AC-343・AC-344）の単体・結合テスト。
import { beforeEach, describe, expect, it } from 'vitest';
import { useDataCatalog } from '../../src/store/datacatalog';
import { resetProjects } from '../../src/store/projects';
import { restore, startPersistence, snapshot, STORAGE_KEY } from '../../src/store/persist';
import { NO_COLUMNS_LABEL, deriveEntities, entityColumns, totalColumns, type PackEntity } from '../../src/datacatalog/model';
import { MAX_CATALOG_ITEMS, parseCatalog, reconcile, countByCategory } from '../../src/datacatalog/reconcile';

const parse = (text: string, file: string) => parseCatalog(text, file, text.length);
const okItems = (text: string, file: string) => { const r = parse(text, file); if (!r.ok) throw new Error(r.errors.join()); return r.items; };

// FR-172 AC-343
describe('FR-172 AC-343 columns・domain の解析（単体）', () => {
  it('JSON と CSV が同じ列とドメインの企業データカタログになる', () => {
    const json = JSON.stringify([{ name: '受注', description: 'd', domain: '販売', columns: [{ name: '受注ID', type: '文字列' }, '金額'] }, { name: '在庫' }]);
    const csv = '名称,説明,ドメイン,columns\n受注,d,販売,受注ID:文字列;金額\n在庫,,,\n';
    const a = okItems(json, 'c.json');
    expect(a).toEqual(okItems(csv, 'c.csv'));
    expect(a[0]).toMatchObject({ domain: '販売', columns: [{ name: '受注ID', type: '文字列' }, { name: '金額' }] });
    expect(a[1]!.columns).toBeUndefined(); // columns なしは列なし
    expect(a[1]!.domain).toBeUndefined();
  });

  it('列名が空・columns が配列でない入力は拒否され、原因が返る（JSON・CSV）', () => {
    for (const [t, f] of [
      [JSON.stringify([{ name: 'A', columns: [{ name: ' ' }] }]), 'c.json'],
      [JSON.stringify([{ name: 'A', columns: 'x' }]), 'c.json'],
      [JSON.stringify([{ name: 'A', columns: {} }]), 'c.json'],
      ['名称,columns\nA,a;;b\n', 'c.csv'],
    ] as const) {
      const r = parse(t, f);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toMatch(/columns|列/);
    }
  });

  it('列・ドメインは突合に影響せず、既存の項目（列なし）の解析は変わらない', () => {
    const plain = okItems('名称,説明\n受注,x\n', 'c.csv');
    expect(plain).toEqual([{ name: '受注', description: 'x' }]);
    const withCols = okItems(JSON.stringify([{ name: '受注', description: 'x', domain: 'D', columns: ['a'] }]), 'c.json');
    const ents = [{ key: '受注', name: '受注', description: 'x', origins: [] }];
    expect(reconcile(ents, withCols).map((r) => r.category)).toEqual(reconcile(ents, plain).map((r) => r.category));
  });

  it('列の総数が PARAM-056（3000）を超えても取り込みは拒否されない', () => {
    const columns = Array.from({ length: 3001 }, (_, i) => `c${i}`);
    const r = parse(JSON.stringify([{ name: 'A', columns }]), 'c.json');
    expect(r.ok).toBe(true);
    expect(MAX_CATALOG_ITEMS).toBe(5000);
    if (r.ok) expect(totalColumns(r.items.map((i) => i.columns ?? []))).toBe(3001);
  });

  it('顧客パックのエンティティの属性欄から列を導出する（保存しない。属性欄が不正なら列なし）', () => {
    const pack: PackEntity[] = [
      { id: 'e1', name: '受注', attributes: [{ name: '受注ID', type: 'string' }, '金額'] },
      { id: 'e2', name: '在庫', attributes: 'bad' },
      { id: 'e3', name: '顧客' },
    ];
    const d = deriveEntities(pack, [{ kind: 'issue', id: 'i1', title: 't', entityIds: ['e1', 'e2', 'e3'] }]);
    const by = (n: string) => d.entities.find((e) => e.name === n)!;
    expect(by('受注').columns).toEqual([{ name: '受注ID', type: 'string' }, { name: '金額' }]);
    expect(by('在庫').columns).toBeUndefined();
    expect(by('顧客').columns).toBeUndefined();
    expect(entityColumns(by('顧客'))).toEqual([]);
    expect(entityColumns(by('受注'), { columns: [{ name: '取込' }] })).toEqual([{ name: '取込' }]);
    expect(NO_COLUMNS_LABEL).toBe('列の情報なし');
  });
});

function memStore(init?: string) {
  const m = new Map<string, string>(init ? [[STORAGE_KEY, init]] : []);
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

// FR-172 AC-344
describe('FR-172 AC-344 不正な columns の拒否と保存・復元（結合）', () => {
  beforeEach(() => { resetProjects(); useDataCatalog.getState().reset(); });

  it('不正な columns のファイルは拒否され、取り込み済みの内容と突合の結果は変わらない', () => {
    const s = useDataCatalog.getState();
    expect(s.importCatalog('p1', JSON.stringify([{ name: '受注', columns: ['a'] }]), 'ok.json', 100).ok).toBe(true);
    const before = JSON.stringify(useDataCatalog.getState().catalogByProject);
    const r = useDataCatalog.getState().importCatalog('p1', JSON.stringify([{ name: '受注', columns: 'x' }]), 'bad.json', 100);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(useDataCatalog.getState().catalogByProject)).toBe(before);
    const items = useDataCatalog.getState().catalogByProject.p1!.items;
    expect(countByCategory(reconcile([], items))['カタログのみ']).toBe(1);
  });

  it('取り込んだ列は Project ごとに保存・復元され、導出した列は保存されない', () => {
    useDataCatalog.getState().importCatalog('p1', JSON.stringify([{ name: '受注', domain: '販売', columns: [{ name: 'ID', type: 'n' }] }]), 'c.json', 100);
    const st = memStore();
    const stop = startPersistence(st);
    useDataCatalog.getState().importCatalog('p1', JSON.stringify([{ name: '受注', domain: '販売', columns: [{ name: 'ID', type: 'n' }] }]), 'c.json', 100);
    stop();
    const saved = st.getItem(STORAGE_KEY)!;
    expect(saved).toContain('"columns"');
    expect(snapshot().dataCatalogs!.p1!.items[0]).toMatchObject({ domain: '販売', columns: [{ name: 'ID', type: 'n' }] });
    useDataCatalog.getState().reset();
    expect(restore(st)).toBe(true);
    expect(useDataCatalog.getState().catalogByProject.p1!.items[0]).toMatchObject({ domain: '販売', columns: [{ name: 'ID', type: 'n' }] });
  });

  it('古い保存内容（columns・domain なし）や形の壊れた欄でも読めて、列なしになる', () => {
    const base = { v: 1, companies: [], projects: [], openId: null, seq: 0, analyses: {}, steps: {} };
    const old = JSON.stringify({ ...base, dataCatalogs: { p1: { items: [{ name: '受注', description: 'x' }], fileName: 'a.csv', sourceUrl: '' } } });
    expect(restore(memStore(old))).toBe(true);
    expect(useDataCatalog.getState().catalogByProject.p1!.items).toEqual([{ name: '受注', description: 'x' }]);
    const broken = JSON.stringify({ ...base, dataCatalogs: { p1: { items: [{ name: '受注', description: 'x', columns: 'zzz', domain: 5 }], fileName: 'a.csv', sourceUrl: '' } } });
    expect(restore(memStore(broken))).toBe(true);
    expect(useDataCatalog.getState().catalogByProject.p1!.items).toEqual([{ name: '受注', description: 'x' }]);
    expect(entityColumns({}, useDataCatalog.getState().catalogByProject.p1!.items[0])).toEqual([]);
  });
});
