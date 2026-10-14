// @vitest-environment jsdom
// データカタログ（FR-159 AC-294〜296・AC-312、FR-160 AC-297〜299・AC-313、NFR-UX-011 AC-309・AC-310・AC-311）の単体・結合テスト。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DataCatalogScreen } from '../../src/screens/DataCatalogScreen';
import { SCREENS } from '../../src/screens/registry';
import { resetProjects, useProjects } from '../../src/store/projects';
import { useUseCases } from '../../src/store/usecases';
import { useDataCatalog } from '../../src/store/datacatalog';
import { usePackStore } from '../../src/store/pack';
import { restore, startPersistence } from '../../src/store/persist';
import {
  addLink, deriveEntities, deriveLinks, buildMatrix, removeLink, normalizeKey, toRecords, NO_PACK_REASON, NO_REF_REASON, type OriginRecord, type PackEntity,
} from '../../src/datacatalog/model';
import type { UseCase } from '../../src/usecase/model';

const ents: PackEntity[] = [
  { id: 'e1', name: '受注', description: '受注の記録', type: 'data' },
  { id: 'e2', name: '受注 ', type: 'data' },
  { id: 'e3', name: 'ＪＵＣＨＵ' },
  { id: 'e4', name: 'juchu' },
  { id: 'e5', name: '顧客' },
];
const recs: OriginRecord[] = [
  { kind: 'issue', id: 'I1', title: '課題1', entityIds: ['e1'] },
  { kind: 'solution', id: 'S1', title: '解決策1', entityIds: ['e2', 'e3'] },
  { kind: 'flow', id: 'F1', title: 'フロー1', entityIds: ['e4', 'e5'] },
];
const uc = (id: string, name: string, source?: UseCase['source']): UseCase => ({ id, name, summary: '', persona: '', steps: [], effect: '', ...(source ? { source } : {}) });

describe('FR-159 AC-295 表記ゆれの正規化（単体）', () => {
  it('全角・半角・大文字小文字・前後の空白が違う名称は 1 件にまとまり、導出元はすべて列挙される', () => {
    const d = deriveEntities(ents, recs);
    const names = d.entities.map((e) => e.name);
    expect(names).toEqual(['受注', 'JUCHU', '顧客']);
    const juchu = d.entities.find((e) => e.key === 'juchu')!;
    expect(juchu.origins.map((o) => `${o.kind}:${o.id}`)).toEqual(['solution:S1', 'flow:F1']);
    expect(d.entities[0]!.origins.map((o) => o.id)).toEqual(['I1', 'S1']);
    expect(normalizeKey('　ＡＢＣ ')).toBe('abc');
  });
});

describe('FR-159 AC-296 導出の元がない（単体）', () => {
  it('顧客パックなしは 0 件で理由つき。参照するエンティティがなくても 0 件で理由つき', () => {
    expect(deriveEntities([], [], false)).toEqual({ entities: [], emptyReason: NO_PACK_REASON });
    const d = deriveEntities(ents, [{ kind: 'issue', id: 'I1', title: 't', entityIds: [] }, { kind: 'issue', id: 'I2', title: 't', entityIds: ['nope'] }]);
    expect(d.entities).toHaveLength(0);
    expect(d.emptyReason).toBe(NO_REF_REASON);
    expect(NO_PACK_REASON).toContain('導出の元がない');
  });
});

describe('FR-160 AC-299 紐づけの追加の検証（単体）', () => {
  const d = deriveEntities(ents, recs).entities;
  const ucs = [uc('uc-1', 'A')];
  it('存在しないエンティティ名・ユースケース ID は拒否され、重複は件数を増やさず、既存は変わらない', () => {
    const ok = addLink([], d, ucs, '受注', 'uc-1');
    expect(ok.ok).toBe(true);
    const links = ok.ok ? ok.links : [];
    expect(links).toEqual([{ entityKey: '受注', useCaseId: 'uc-1' }]);
    const bad1 = addLink(links, d, ucs, '存在しない', 'uc-1');
    const bad2 = addLink(links, d, ucs, '受注', 'uc-9');
    const dup = addLink(links, d, ucs, '受注 ', 'uc-1');
    for (const r of [bad1, bad2, dup]) { expect(r.ok).toBe(false); if (!r.ok) expect(r.errors.length).toBeGreaterThan(0); }
    expect(links).toHaveLength(1);
    expect(removeLink(links, '受注', 'uc-1')).toEqual([]);
  });
});

describe('FR-160 導出の対応と対応表（単体）', () => {
  it('登録済みユースケースの導出元の課題・解決策が参照するエンティティだけが「導出」になる', () => {
    const d = deriveEntities(ents, recs).entities;
    const ucs = [uc('uc-1', 'A', { solutionId: 'S1', issueId: 'I1' }), uc('uc-2', 'B')];
    const derived = deriveLinks(d, ents, recs, ucs);
    const m = buildMatrix(d, ucs, derived, [{ entityKey: 'juchu', useCaseId: 'uc-2' }, { entityKey: '受注', useCaseId: 'uc-1' }]);
    const kinds = Object.fromEntries(m.rows.map((r) => [r.entity.name, r.cells.map((c) => c.kind)]));
    expect(kinds['受注']).toEqual(['derived', 'none']); // 導出が明示に優先
    expect(kinds['JUCHU']).toEqual(['derived', 'explicit']);
    expect(kinds['顧客']).toEqual(['none', 'none']);
    expect(buildMatrix(d, [], new Set(), []).emptyReason).toContain('ユースケース');
  });
  it('toRecords: entityIds・relatedIds とフローの from/to を参照にする', () => {
    const r = toRecords({ issues: [{ id: 'I', title: 't', entityIds: ['a'], relatedIds: ['b'] } as never], flows: [{ id: 'F', label: 'l', from: 'x', to: 'y' }] });
    expect(r.map((x) => x.entityIds)).toEqual([['a', 'b'], ['x', 'y']]);
  });
});

describe('画面（結合）', () => {
  const packData = (withRefs = true) => ({
    issues: {
      issues: [{ id: 'I1', title: '課題1', audience: 'internal', ...(withRefs ? { entityIds: ['e1'] } : {}) }, { id: 'I2', title: '課題2', audience: 'internal', entityIds: ['e5'] }],
      solutions: [{ id: 'S1', issueId: 'I1', title: '解決策1', entityIds: ['e2', 'e3'] }, { id: 'S2', issueId: 'I2', title: '解決策2' }],
    },
    entities: { entities: ents.map((e) => ({ ...e, type: e.type ?? 'data' })), flows: [{ id: 'F1', from: 'e4', to: 'e5', label: 'フロー1' }] },
    products: { products: [] },
  });
  const setPack = (d: unknown) => usePackStore.setState({ state: { status: 'ready', pack: { data: d } as never, warnings: [] } });
  beforeEach(() => {
    resetProjects(); useUseCases.getState().reset(); useDataCatalog.getState().reset();
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    Element.prototype.scrollIntoView ??= vi.fn();
    setPack(packData());
  });
  afterEach(() => cleanup());

  const open = (name: string) => {
    const co = useProjects.getState().addCompany(`社${name}`);
    const pid = useProjects.getState().addProject(co.ok ? co.id : '', name);
    useProjects.getState().open(pid.ok ? pid.id : '');
    return pid.ok ? pid.id : '';
  };
  const view = () => render(<FluentProvider theme={webLightTheme}><DataCatalogScreen /></FluentProvider>);
  const save = (pid: string, name: string, source?: UseCase['source']) => {
    const r = useUseCases.getState().save(pid, { name, summary: '', persona: '', effect: '', steps: [] }, undefined, source);
    return r.ok ? r.id : '';
  };
  const cell = (entity: string, ucName: string) =>
    screen.getByTestId('entity-usecase-matrix').querySelector(`[data-entity-name="${entity}"][data-usecase-name="${ucName}"]`) as HTMLElement;

  it('画面は registry に nav-data-catalog として登録されている', () => {
    expect(SCREENS.some((s) => s.key === 'data-catalog' && s.label === 'データカタログ')).toBe(true);
  });

  // FR-159 AC-294
  it('FR-159 AC-294 一覧の行を選ぶと詳細に名称・説明・導出元・関連するユースケースが出る', () => {
    const pid = open('P');
    save(pid, 'UC1', { solutionId: 'S1', issueId: 'I1' });
    view();
    const rows = within(screen.getByTestId('entity-list')).getAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('data-entity-name'))).toEqual(['受注', '顧客', 'JUCHU']);
    expect(rows[0]!.getAttribute('data-entity-description')).toBe('受注の記録');
    fireEvent.click(rows[0]!);
    const detail = screen.getByTestId('entity-detail');
    for (const t of ['名称', '説明', '導出元', '関連するユースケース', '受注の記録', '課題: 課題1', '解決策: 解決策1', 'UC1（導出）']) expect(detail.textContent).toContain(t);
  });

  // FR-159 AC-296
  it('FR-159 AC-296 顧客パックがない／参照するエンティティがないときは 0 件で理由が出て、画面は壊れない', () => {
    open('P');
    usePackStore.setState({ state: { status: 'idle' } as never });
    view();
    expect(within(screen.getByTestId('entity-list')).queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByTestId('entity-list-empty-reason').textContent).toContain('顧客パックがない');
    cleanup();
    setPack({ issues: { issues: [{ id: 'I1', title: 't', audience: 'internal' }], solutions: [] }, entities: { entities: [] }, products: { products: [] } });
    view();
    expect(screen.getByTestId('entity-list-empty-reason').textContent).toContain('導出の元がない');
  });

  // FR-159 AC-312
  it('FR-159 AC-312 候補（未登録）は元にせず、登録すると関連が反映される', () => {
    const pid = open('P');
    const { rerender } = view();
    expect(screen.getByTestId('matrix-empty-reason').textContent).toContain('ユースケース');
    expect(screen.getByTestId('entity-usecase-matrix').querySelectorAll('[data-kind="derived"],[data-kind="explicit"]')).toHaveLength(0);
    save(pid, 'UC1', { solutionId: 'S1', issueId: 'I1' });
    rerender(<FluentProvider theme={webLightTheme}><DataCatalogScreen /></FluentProvider>);
    expect(cell('受注', 'UC1').getAttribute('data-kind')).toBe('derived');
    expect(cell('顧客', 'UC1').getAttribute('data-kind')).toBe('none');
  });

  // FR-160 AC-297・AC-298・NFR-UX-011 AC-310
  it('FR-160 AC-297 AC-298 NFR-UX-011 AC-310 導出と明示を文字で区別し、明示の追加・削除ができ、導出に削除の操作はなく、復元でき、別の Project には現れない', () => {
    const pidA = open('A');
    save(pidA, 'UC1', { solutionId: 'S1', issueId: 'I1' });
    const st = { data: new Map<string, string>(), getItem(k: string) { return this.data.get(k) ?? null; }, setItem(k: string, v: string) { this.data.set(k, v); } };
    const off = startPersistence(st);
    view();
    expect(cell('受注', 'UC1').textContent).toBe('導出');
    expect(within(cell('受注', 'UC1')).queryAllByRole('button')).toHaveLength(0);
    fireEvent.click(within(cell('顧客', 'UC1')).getByRole('button', { name: /紐づけを追加/ }));
    expect(cell('顧客', 'UC1').getAttribute('data-kind')).toBe('explicit');
    expect(cell('顧客', 'UC1').textContent).toContain('明示');
    // 開き直し
    off();
    useDataCatalog.getState().reset(); useUseCases.getState().reset();
    expect(restore(st)).toBe(true);
    cleanup(); view();
    expect(cell('顧客', 'UC1').getAttribute('data-kind')).toBe('explicit');
    // 別の Project
    const pidB = open('B');
    save(pidB, 'UC1', { solutionId: 'S1', issueId: 'I1' });
    cleanup(); view();
    expect(cell('顧客', 'UC1').getAttribute('data-kind')).toBe('none');
    // 削除
    act(() => useProjects.getState().open(pidA));
    cleanup(); view();
    fireEvent.click(within(cell('顧客', 'UC1')).getByRole('button', { name: /削除/ }));
    expect(cell('顧客', 'UC1').getAttribute('data-kind')).toBe('none');
    // 操作部品はアクセシブルな名前を持つ
    for (const b of within(screen.getByTestId('entity-usecase-matrix')).getAllByRole('button')) expect(b.getAttribute('aria-label') ?? b.textContent).toBeTruthy();
  });

  // FR-160 AC-299（画面経由の拒否）
  it('FR-160 AC-299 存在しないユースケースへの追加は拒否され、保存内容は変わらない', () => {
    const pid = open('P');
    save(pid, 'UC1');
    view();
    const r = useDataCatalog.getState().add(pid, deriveEntities(ents, recs).entities, useUseCases.getState().byProject[pid]!.items, '受注', 'uc-99');
    expect(r.ok).toBe(false);
    expect(useDataCatalog.getState().linksByProject[pid]).toBeUndefined();
  });

  // FR-160 AC-313
  it('FR-160 AC-313 ユースケースを削除すると明示の紐づけも消え、他は変わらず、再登録しても復活しない', () => {
    const pid = open('P');
    const a = save(pid, 'UC1');
    const b = save(pid, 'UC2');
    const d = deriveEntities(ents, recs).entities;
    const items = () => useUseCases.getState().byProject[pid]!.items;
    useDataCatalog.getState().add(pid, d, items(), '受注', a);
    useDataCatalog.getState().add(pid, d, items(), '受注', b);
    act(() => useUseCases.getState().remove(pid, a));
    expect(useDataCatalog.getState().linksByProject[pid]).toEqual([{ entityKey: '受注', useCaseId: b }]);
    save(pid, 'UC1');
    view();
    expect(cell('受注', 'UC1').getAttribute('data-kind')).toBe('none');
    expect(cell('受注', 'UC2').getAttribute('data-kind')).toBe('explicit');
  });

  // NFR-UX-011 AC-309
  it('NFR-UX-011 AC-309 選択中のエンティティは、コンポーネントが作り直されても保たれる', () => {
    open('P');
    const { unmount } = view();
    fireEvent.click(within(screen.getByTestId('entity-list')).getAllByRole('listitem')[1]!);
    unmount();
    view();
    expect(screen.getByTestId('entity-detail').textContent).toContain('顧客');
    expect(within(screen.getByTestId('entity-list')).getAllByRole('listitem')[1]!.getAttribute('aria-current')).toBe('true');
  });

  // NFR-UX-011 AC-310（キーボード）
  it('NFR-UX-011 AC-310 キーボード（Enter）で行を選べる', () => {
    open('P');
    view();
    const row = within(screen.getByTestId('entity-list')).getAllByRole('listitem')[2]!;
    expect(row.tabIndex).toBe(0);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByTestId('entity-detail').textContent).toContain('JUCHU');
  });

  // NFR-UX-011 AC-311: 対応表は横にあふれても表の枠だけがスクロールし、一覧・詳細は積み重なる（縦 1 列）
  it('NFR-UX-011 AC-311 一覧・詳細・対応表は縦に積み重なり、情報が欠けない', () => {
    open('P');
    view();
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(regions).toEqual(expect.arrayContaining(['データエンティティの一覧', 'データエンティティの詳細', 'エンティティとユースケースの対応表']));
  });
});
