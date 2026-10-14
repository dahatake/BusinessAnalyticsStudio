// @vitest-environment jsdom
// 企業データカタログの取り込みと突合（FR-161 AC-300〜304・AC-314）、未掲載の ToDo 一括追加（FR-162 AC-305〜308）の単体・結合テスト。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DataCatalogScreen } from '../../src/screens/DataCatalogScreen';
import { resetProjects, useProjects } from '../../src/store/projects';
import { useUseCases } from '../../src/store/usecases';
import { planTasksOf, useDataCatalog } from '../../src/store/datacatalog';
import { usePackStore } from '../../src/store/pack';
import { restore, startPersistence } from '../../src/store/persist';
import { deriveEntities, normalizeKey, type DataEntity, type PackEntity } from '../../src/datacatalog/model';
import {
  MAX_CATALOG_BYTES, MAX_CATALOG_ITEMS, NO_BAS_ONLY_REASON, NO_CATALOG_REASON, buildTodos, countByCategory, mergeTodos, parseCatalog, reconcile, todoId,
} from '../../src/datacatalog/reconcile';

const mk = (name: string, description: string, id?: string): DataEntity => ({ key: normalizeKey(name), name, description, ...(id ? { id } : {}), origins: [] });
const ok = (text: string, file = 'c.json') => { const r = parseCatalog(text, file, text.length); if (!r.ok) throw new Error(r.errors.join()); return r.items; };

// FR-161 AC-301
describe('FR-161 AC-301 JSON と CSV は同じ企業データカタログになる（単体）', () => {
  it('引用符つきの項目（カンマ・二重引用符・改行）を含む CSV が、同じ内容の JSON と同じ項目・同じ突合の結果になる', () => {
    const items = [{ name: '受注', description: '受注の記録、詳細' }, { name: '顧客', description: '"重要"な\n顧客' }];
    const csv = '名称,説明\n受注,"受注の記録、詳細"\n顧客,"""重要""な\n顧客"\n';
    expect(ok(csv, 'c.csv')).toEqual(ok(JSON.stringify({ entities: items })));
    expect(ok(JSON.stringify(items))).toEqual(ok(csv, 'c.csv'));
    const bas = [mk('受注', '受注の記録、詳細'), mk('在庫', 'x')];
    expect(reconcile(bas, ok(csv, 'c.csv'))).toEqual(reconcile(bas, ok(JSON.stringify(items))));
  });
});

// FR-161 AC-302 AC-314
describe('FR-161 AC-302 AC-314 突合の規則（単体）', () => {
  const cat = (name: string, description: string, id?: string, basId?: string) => ({ name, description, ...(id ? { id } : {}), ...(basId ? { basId } : {}) });
  const cat1 = (e: DataEntity, c: ReturnType<typeof cat>) => reconcile([e], [c])[0]!.category;
  it('名称（表記ゆれ正規化）と説明が同じなら一致。説明が違えば差異', () => {
    expect(cat1(mk('Ａ', 'd'), cat(' a ', 'd'))).toBe('一致');
    expect(cat1(mk('a', 'd'), cat('a', 'e'))).toBe('差異');
  });
  it('名称・説明が同じで ID だけが異なる組は差異。ID が片方にしかない組は一致', () => {
    expect(cat1(mk('a', 'd', 'e1'), cat('a', 'd', 'X'))).toBe('差異');
    expect(cat1(mk('a', 'd', 'e1'), cat('a', 'd'))).toBe('一致');
    expect(cat1(mk('a', 'd'), cat('a', 'd', 'X'))).toBe('一致');
    expect(cat1(mk('a', 'd', 'e1'), cat('a', 'd', 'e1'))).toBe('一致');
  });
  it('名称が異なり basId が ID と一致する組は、説明が同じなら一致、異なれば差異', () => {
    expect(cat1(mk('a', 'd', 'e1'), cat('別名', 'd', undefined, 'e1'))).toBe('一致');
    expect(cat1(mk('a', 'd', 'e1'), cat('別名', 'z', undefined, 'e1'))).toBe('差異');
  });
  it('対応づかないものは BASのみ・カタログのみ。どの組も 1 区分で、件数の合計が組の総数と一致する', () => {
    const bas = [mk('a', 'd', 'e1'), mk('b', 'd'), mk('c', 'd'), mk('d', 'd', 'e4')];
    const items = [cat('a', 'd'), cat('b', 'zz'), cat('x', 'd'), cat('y', 'd', undefined, 'e4')];
    const rows = reconcile(bas, items);
    expect(rows.map((r) => r.category)).toEqual(['一致', '差異', 'BASのみ', '一致', 'カタログのみ']);
    const n = countByCategory(rows);
    expect(n.一致 + n.差異 + n.BASのみ + n.カタログのみ).toBe(rows.length);
    expect(rows.length).toBe(bas.length + items.length - 3); // 対応づいた組が 3 つ
  });
  it('導出したエンティティは顧客パックの ID を持つ（basId の突合用）', () => {
    const d = deriveEntities([{ id: 'e1', name: '受注' }], [{ kind: 'issue', id: 'I', title: 't', entityIds: ['e1'] }] as never);
    expect(d.entities[0]!.id).toBe('e1');
  });
});

// FR-161 AC-303（単体の拒否の規則）
describe('FR-161 AC-303 拒否の規則（単体）', () => {
  it('壊れた JSON・名称のない CSV・名称のない項目・上限超えは、原因つきで拒否される', () => {
    const r1 = parseCatalog('{ "entities": [ { "name": ', 'a.json', 30);
    expect(r1.ok).toBe(false);
    expect(!r1.ok && r1.errors[0]).toContain('JSON');
    const r2 = parseCatalog('説明,ID\nx,1\n', 'a.csv', 20);
    expect(!r2.ok && r2.errors[0]).toContain('名称');
    expect(parseCatalog('[{"description":"x"}]', 'a.json', 20).ok).toBe(false);
    expect(parseCatalog('{"foo":1}', 'a.json', 20).ok).toBe(false);
    const big = parseCatalog('[]', 'a.json', MAX_CATALOG_BYTES + 1);
    expect(!big.ok && big.errors[0]).toContain('5 MB');
    const many = JSON.stringify(Array.from({ length: MAX_CATALOG_ITEMS + 1 }, (_, i) => ({ name: `n${i}` })));
    const r3 = parseCatalog(many, 'a.json', 1000);
    expect(!r3.ok && r3.errors[0]).toContain('5000');
    expect(parseCatalog(JSON.stringify(Array.from({ length: MAX_CATALOG_ITEMS }, (_, i) => ({ name: `n${i}` }))), 'a.json', 1000).ok).toBe(true);
  });
});

// FR-162 AC-306
describe('FR-162 AC-306 ToDo の冪等な追加（単体）', () => {
  it('繰り返しても増えず内容も変わらず、増えた 1 件だけが追加される。ID は data-catalog:<正規化名>', () => {
    const bas = [mk('Ａ', 'd'), mk('b', 'd'), mk('c', 'd')];
    const rows = reconcile(bas, [{ name: 'c', description: 'd' }]);
    const t1 = buildTodos(rows, (e) => (e.key === 'a' ? [] : ['UC1', 'UC2']));
    expect(t1.map((t) => t.id)).toEqual(['data-catalog:a', 'data-catalog:b']);
    expect(todoId('abc')).toBe('data-catalog:abc');
    expect(t1[1]!.title + t1[1]!.description).toContain('UC1、UC2');
    expect(t1[0]!.description).toContain('Ａ');
    const m1 = mergeTodos([{ id: 'x', title: 't', description: 'd' }], t1);
    expect(m1.added).toBe(2);
    const changed = t1.map((t) => ({ ...t, description: '別' }));
    const m2 = mergeTodos(m1.tasks, changed);
    expect(m2.added).toBe(0);
    expect(m2.tasks).toEqual(m1.tasks);
    const more = buildTodos(reconcile([...bas, mk('d', 'd')], [{ name: 'c', description: 'd' }]), () => []);
    const m3 = mergeTodos(m2.tasks, more);
    expect(m3.added).toBe(1);
    expect(m3.tasks.length).toBe(m1.tasks.length + 1);
  });
});

describe('画面（結合）', () => {
  const ents: PackEntity[] = [
    { id: 'e1', name: '受注', description: '受注の記録' }, { id: 'e2', name: '顧客', description: '顧客の情報' }, { id: 'e3', name: '在庫', description: '在庫' },
  ];
  const packData = () => ({
    issues: { issues: [{ id: 'I1', title: '課題1', audience: 'internal', entityIds: ['e1', 'e2', 'e3'] }], solutions: [] },
    entities: { entities: ents.map((e) => ({ ...e, type: 'data' })), flows: [] },
    products: { products: [] },
    plan: { features: [], tasks: [{ id: 'pack-t1', createdBy: 'sample', title: '既存の工程' }] },
  });
  const setPack = () => usePackStore.setState({ state: { status: 'ready', pack: { data: packData() } as never, warnings: [] } });
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    resetProjects(); useUseCases.getState().reset(); useDataCatalog.getState().reset();
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    Element.prototype.scrollIntoView ??= vi.fn();
    fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
    setPack();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  const open = (name: string) => {
    const co = useProjects.getState().addCompany(`社${name}`);
    const pid = useProjects.getState().addProject(co.ok ? co.id : '', name);
    useProjects.getState().open(pid.ok ? pid.id : '');
    return pid.ok ? pid.id : '';
  };
  const view = () => render(<FluentProvider theme={webLightTheme}><DataCatalogScreen /></FluentProvider>);
  const file = (text: string, name: string) => { const f = new File([text], name); Object.defineProperty(f, 'text', { value: async () => text }); return f; };
  const upload = async (text: string, name = 'c.json') => {
    fireEvent.change(screen.getByLabelText('企業データカタログのファイル'), { target: { files: [file(text, name)] } });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  };
  const cats = () => Object.fromEntries([...screen.getByTestId('reconcile-table').querySelectorAll('tr[data-entity-name]')].map((r) => [r.getAttribute('data-entity-name'), r.getAttribute('data-category')]));
  const CAT = JSON.stringify({ entities: [{ name: '受注', description: '受注の記録' }, { name: '顧客', description: '違う' }, { name: '外部', description: 'x' }] });

  // FR-161 AC-300
  it('FR-161 AC-300 取り込むと 4 区分の件数と一覧が文字で表示される', async () => {
    open('P'); view();
    await upload(CAT);
    expect(cats()).toEqual({ 受注: '一致', 顧客: '差異', 在庫: 'BASのみ', 外部: 'カタログのみ' });
    expect(screen.getByTestId('reconcile-counts').textContent).toBe('一致 1 件、差異 1 件、BASのみ 1 件、カタログのみ 1 件');
    expect(screen.getByTestId('reconcile-table').textContent).toContain('カタログのみ');
  });

  // FR-161 AC-303
  it('FR-161 AC-303 不正なファイルは原因と直し方が表示され、取り込み済みの内容と突合の結果は変わらない', async () => {
    open('P'); view();
    await upload(CAT);
    const before = cats(); const stored = JSON.stringify(useDataCatalog.getState().catalogByProject);
    for (const [text, name, word] of [['{ "entities": [ ', 'x.json', 'JSON'], ['説明\nx\n', 'x.csv', '名称'], [JSON.stringify(Array.from({ length: 5001 }, (_, i) => ({ name: `n${i}` }))), 'big.json', '5000']] as const) {
      await upload(text, name);
      expect(screen.getByRole('alert').textContent).toContain(word);
      expect(screen.getByRole('alert').textContent).toContain('変わっていません');
      expect(cats()).toEqual(before);
      expect(JSON.stringify(useDataCatalog.getState().catalogByProject)).toBe(stored);
    }
    const huge = file('[]', 'huge.json'); Object.defineProperty(huge, 'size', { value: MAX_CATALOG_BYTES + 1 });
    fireEvent.change(screen.getByLabelText('企業データカタログのファイル'), { target: { files: [huge] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('5 MB'));
    expect(cats()).toEqual(before);
  });

  // FR-161 AC-304（NFR-SEC-004）
  it('FR-161 AC-304 取り込みと URL の保存でネットワーク要求は 0 件で、URL は再起動後も出典として表示される', async () => {
    const pid = open('P');
    const st = { data: new Map<string, string>(), getItem(k: string) { return this.data.get(k) ?? null; }, setItem(k: string, v: string) { this.data.set(k, v); } };
    const off = startPersistence(st);
    view();
    await upload(CAT);
    fireEvent.change(screen.getByLabelText(/出典の URL/), { target: { value: 'https://catalog.example.invalid/x' } });
    fireEvent.click(screen.getByRole('button', { name: '出典を保存' }));
    expect(screen.getByTestId('catalog-source-url').textContent).toContain('https://catalog.example.invalid/x');
    expect(fetchSpy).not.toHaveBeenCalled();
    off(); useDataCatalog.getState().reset();
    expect(restore(st)).toBe(true);
    cleanup(); view();
    expect(screen.getByTestId('catalog-source-url').textContent).toContain('https://catalog.example.invalid/x');
    expect(cats()).toEqual({ 受注: '一致', 顧客: '差異', 在庫: 'BASのみ', 外部: 'カタログのみ' });
    expect(useDataCatalog.getState().catalogByProject[pid]).toBeTruthy();
    // URL でない値は保存されない
    fireEvent.change(screen.getByLabelText(/出典の URL/), { target: { value: 'javascript:1' } });
    fireEvent.click(screen.getByRole('button', { name: '出典を保存' }));
    expect(screen.getByText(/http:\/\/ または https:\/\//)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // FR-162 AC-307
  it('FR-162 AC-307 追加した ToDo は plan の tasks と同じ場所に data-catalog:<正規化名> で保存され、再起動後も残り、別の Project に現れず、顧客パックは変わらない', async () => {
    const pidA = open('A');
    const st = { data: new Map<string, string>(), getItem(k: string) { return this.data.get(k) ?? null; }, setItem(k: string, v: string) { this.data.set(k, v); } };
    const off = startPersistence(st);
    view();
    await upload(CAT);
    const packBefore = JSON.stringify(packData().plan);
    fireEvent.click(screen.getByRole('button', { name: '未掲載を ToDo に追加' }));
    expect(screen.getByTestId('todo-add-result').textContent).toContain('1 件');
    const t = planTasksOf(pidA);
    expect(t.map((x) => x.id)).toEqual(['pack-t1', 'data-catalog:在庫']);
    expect(t[1]!.title + t[1]!.description).toContain('在庫');
    // 繰り返しても増えない（AC-306）
    fireEvent.click(screen.getByRole('button', { name: '未掲載を ToDo に追加' }));
    expect(planTasksOf(pidA).length).toBe(2);
    expect(screen.getByTestId('todo-add-result').textContent).toContain('0 件');
    off(); useDataCatalog.getState().reset();
    expect(restore(st)).toBe(true);
    expect(planTasksOf(pidA).map((x) => x.id)).toEqual(['pack-t1', 'data-catalog:在庫']);
    const pidB = open('B');
    expect(planTasksOf(pidB).map((x) => x.id)).toEqual(['pack-t1']);
    const cur = usePackStore.getState().state;
    expect(JSON.stringify(cur.status === 'ready' ? cur.pack.data.plan : null)).toBe(packBefore);
  });

  // FR-162 AC-308
  it('FR-162 AC-308 取り込んでいない Project と BASのみが 0 件の Project では追加されず、理由が表示される', async () => {
    const pid = open('P'); view();
    fireEvent.click(screen.getByRole('button', { name: '未掲載を ToDo に追加' }));
    expect(screen.getByTestId('todo-add-result').textContent).toBe(NO_CATALOG_REASON);
    await upload(JSON.stringify([{ name: '受注' }, { name: '顧客' }, { name: '在庫' }]));
    fireEvent.click(screen.getByRole('button', { name: '未掲載を ToDo に追加' }));
    expect(screen.getByTestId('todo-add-result').textContent).toBe(NO_BAS_ONLY_REASON);
    expect(planTasksOf(pid).map((x) => x.id)).toEqual(['pack-t1']);
  });
});
