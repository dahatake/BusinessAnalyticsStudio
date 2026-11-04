// @vitest-environment jsdom
// FR-302 顧客パックの取り込み（AC-838・842・844）と FR-304（AC-851・852・853）の結合テスト。jsdom + testing-library。
// 保存の途中失敗の原子性、検証エラー時の取り込み不可、5 MB 超の拒否（読み込まない）、アップロード中の通信 0 件を確かめる。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../../scripts/lib/pack-fs';
import { classifyFiles, validateUpload, type UploadFile } from '../../src/packImport';
import { importPack } from '../../src/projects/importPack';
import { PackUpload } from '../../src/projects/PackUpload';
import { PROJECT_PACKS_KEY, saveProjectPackStrict } from '../../src/store/projectPacks';
import { resetProjects, useProjects } from '../../src/store/projects';

const MONO = path.join(REPO_ROOT, 'examples', 'mono');
const NAMES = ['customer', 'entities', 'issues', 'products', 'plan', 'architecture', 'mocks', 'show', 'sources'];

const upload = (): UploadFile[] => [
  ...NAMES.map((n) => ({ name: `${n}.json`, text: fs.readFileSync(path.join(MONO, 'public', 'data', `${n}.json`), 'utf8') })),
  { name: 'brand-profile.json', text: fs.readFileSync(path.join(MONO, 'public', 'brand', 'brand-profile.json'), 'utf8') },
];
const goodData = () => {
  const v = validateUpload(classifyFiles(upload()));
  if (!v.ok || !v.data) throw new Error('前提: お手本パックは取り込める');
  return v.data;
};

/** jsdom の File は text() を持たないので足す（読んだ回数も数える） */
function makeFile(f: UploadFile, spy?: () => void): File {
  const file = new File([f.text], f.name, { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => { spy?.(); return f.text; } });
  return file;
}
const wrap = () => render(<FluentProvider theme={webLightTheme}><PackUpload /></FluentProvider>);
const choose = async (files: File[]) => {
  const input = screen.getByLabelText('顧客パックのファイル') as HTMLInputElement;
  await act(async () => { fireEvent.change(input, { target: { files } }); });
};
const snapshot = () => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]));

beforeEach(() => {
  localStorage.clear(); resetProjects();
  // Fluent の MessageBar が使う（jsdom にはない）
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('FR-302 取り込みの保存（原子性）', () => {
  // FR-302 AC-842
  it('FR-302 AC-842 新規: 保存に失敗したら、企業・Project も端末内の保存も取り込み前のまま、原因と次の行動を返す', () => {
    useProjects.getState().addCompany('既存株式会社');
    const before = snapshot();
    const state = useProjects.getState();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    const r = importPack({ mode: 'new', data: goodData(), company: '新規株式会社', project: '新規 Project' });
    spy.mockRestore();
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toContain('保存できませんでした'); expect(r.remedy).not.toBe(''); }
    expect(useProjects.getState().companies).toEqual(state.companies);
    expect(useProjects.getState().projects).toEqual(state.projects);
    expect(useProjects.getState().seq).toBe(state.seq);
    expect(snapshot()).toBe(before);
  });

  it('FR-302 AC-842 読み戻しが一致しない保存も失敗として、保存前の内容に戻す', () => {
    localStorage.setItem(PROJECT_PACKS_KEY, '{"p1":{"keep":true}}');
    const orig = Storage.prototype.getItem;
    let calls = 0;
    // 書き込み後の読み戻し（保存前の読み出し 2 回のあと）だけを壊す
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) {
      const v = orig.call(this, k);
      if (k === PROJECT_PACKS_KEY) { calls++; if (calls >= 3) return `${v}x`; }
      return v;
    });
    const r = saveProjectPackStrict('p2', goodData());
    vi.restoreAllMocks();
    expect(r.ok).toBe(false);
    expect(localStorage.getItem(PROJECT_PACKS_KEY)).toBe('{"p1":{"keep":true}}');
  });

  it('FR-302 AC-842 置き換え: 保存に失敗したら、現在の顧客パックはバイト単位で変わらない', () => {
    const a = useProjects.getState().addCompany('A 株式会社');
    if (!a.ok) throw new Error();
    const p = useProjects.getState().addProject(a.id, 'P');
    if (!p.ok) throw new Error();
    expect(importPack({ mode: 'replace', data: goodData(), projectId: p.id }).ok).toBe(true);
    const before = snapshot();
    const orig = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === PROJECT_PACKS_KEY) throw new DOMException('quota', 'QuotaExceededError');
      return orig.call(this, k, v);
    });
    const r = importPack({ mode: 'replace', data: { ...goodData(), customer: { ...(goodData().customer as object), name: '別' } } as never, projectId: p.id });
    expect(r.ok).toBe(false);
    expect(snapshot()).toBe(before);
  });

  it('FR-302 AC-841 新規の取り込みは Project を増やし、顧客パックを Project ごとに保存する（ブランドは保存しない）', () => {
    const r = importPack({ mode: 'new', data: goodData(), company: '新規株式会社', project: '新規 Project' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(useProjects.getState().projects.map((x) => x.name)).toContain('新規 Project');
    const stored = JSON.parse(localStorage.getItem(PROJECT_PACKS_KEY) ?? '{}');
    expect(Object.keys(stored)).toEqual([r.projectId]);
    expect(stored[r.projectId].brandProfile).toBeUndefined();
    expect(Object.keys(stored[r.projectId]).sort()).toEqual([...NAMES].sort());
  });
});

describe('FR-302 取り込み画面', () => {
  // FR-302 AC-838（判別）の画面側
  it('FR-302 AC-838 ファイル名が違っても中身から判別し、判別できないファイルは名前つきで示して対象から外す', async () => {
    wrap();
    const files = upload().map((f) => (f.name === 'plan.json' ? { ...f, name: 'my-plan-v2.json' } : f));
    files.push({ name: 'memo.json', text: '{"unrelated": true}' });
    await choose(files.map((f) => makeFile(f)));
    const table = await screen.findByRole('table', { name: '受け付けたファイル' });
    expect(within(table).getByText('my-plan-v2.json').closest('tr')?.textContent).toContain('plan');
    expect(within(table).getByText('memo.json').closest('tr')?.textContent).toContain('判別できません');
    const list = screen.getByRole('list', { name: 'ファイルの確認' });
    expect(list.textContent).toContain('memo.json');
  });

  // FR-302 AC-840・FR-304 AC-851
  it('FR-302 AC-840 FR-304 AC-851 検証エラーがあるときは確認欄を出さず「取り込む」は押せない。エラーがなければ確認欄が出て、確かめるまで押せない', async () => {
    wrap();
    const broken = upload().map((f) => (f.name === 'plan.json' ? { ...f, text: '{ "features": [ ' } : f));
    await choose(broken.map((f) => makeFile(f)));
    await screen.findByRole('list', { name: '検証の結果' });
    expect(screen.queryByRole('region', { name: '取り込み前に確かめること' })).toBeNull();
    expect(screen.getByRole('button', { name: '取り込む' }).getAttribute('aria-disabled')).toBe('true');
    expect(document.body.textContent).toContain('plan.json');

    await choose(upload().map((f) => makeFile(f)));
    const region = await screen.findByRole('region', { name: '取り込み前に確かめること' });
    expect(region.textContent).toMatch(/出典のない数値 0 件/);
    expect(region.textContent).toMatch(/internal \d+ 件/);
    expect(region.textContent).toMatch(/shareable \d+ 件/);
    const submit = screen.getByRole('button', { name: '取り込む' });
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('checkbox', { name: '確かめました' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '取り込む' }).getAttribute('aria-disabled')).not.toBe('true'));
  });

  // FR-302 AC-840: エラーのまま押しても保存は変わらない
  it('FR-302 AC-840 エラーのまま「取り込む」を押しても、保存は変わらない', async () => {
    wrap();
    const before = snapshot();
    await choose(upload().filter((f) => f.name !== 'sources.json').map((f) => makeFile(f)));
    await screen.findByRole('list', { name: '検証の結果' });
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }));
    expect(snapshot()).toBe(before);
    expect(useProjects.getState().projects).toHaveLength(0);
  });

  // FR-302 AC-839・842: 確認で取り消すと何も変わらない
  it('FR-302 AC-839 AC-842 置き換えの確認で「やめる」を選ぶと、何も変わらない', async () => {
    const a = useProjects.getState().addCompany('A 株式会社');
    if (!a.ok) throw new Error();
    const p = useProjects.getState().addProject(a.id, '置換先');
    if (!p.ok) throw new Error();
    wrap();
    await choose(upload().map((f) => makeFile(f)));
    await screen.findByRole('region', { name: '取り込み前に確かめること' });
    fireEvent.click(screen.getByRole('radio', { name: '既存の Project の顧客パックを置き換える' }));
    fireEvent.change(screen.getByRole('combobox', { name: '置き換える Project' }), { target: { value: p.id } });
    fireEvent.click(screen.getByRole('checkbox', { name: '確かめました' }));
    const before = snapshot();
    await waitFor(() => expect(screen.getByRole('button', { name: '取り込む' }).getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }));
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg.textContent).toContain('置換先');
    expect(dlg.textContent).toMatch(/失われ/);
    fireEvent.click(within(dlg).getByRole('button', { name: 'やめる' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(snapshot()).toBe(before);
    // 「置き換える」を選ぶと実行される
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '置き換える' }));
    await waitFor(() => expect(Object.keys(JSON.parse(localStorage.getItem(PROJECT_PACKS_KEY) ?? '{}'))).toEqual([p.id]));
  });

  // FR-302 AC-844
  it('FR-302 AC-844 5 MB を超えるファイルは読み込まず、名前・サイズ・上限を示して拒否し、取り込めない。処理中にネットワーク要求は 0 件', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const xhr = vi.fn();
    vi.stubGlobal('XMLHttpRequest', xhr);
    const beacon = vi.fn();
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    wrap();
    let bigRead = 0;
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'issues.json', { type: 'application/json' });
    Object.defineProperty(big, 'text', { value: async () => { bigRead++; return ''; } });
    const others = upload().filter((f) => f.name !== 'issues.json').map((f) => makeFile(f));
    await choose([big, ...others]);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('issues.json');
    expect(alert.textContent).toMatch(/5\.0 MB/);
    expect(alert.textContent).toContain('上限 5 MB');
    expect(bigRead, '上限を超えるファイルを読み込んだ').toBe(0);
    expect(screen.getByRole('button', { name: '取り込む' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByRole('region', { name: '取り込み前に確かめること' })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });

  // FR-302 AC-844: 正常な取り込みの間も通信しない
  it('FR-302 AC-844 正常なパックを選んで取り込むまでの間、ネットワーク要求は 0 件', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    wrap();
    await choose(upload().map((f) => makeFile(f)));
    await screen.findByRole('region', { name: '取り込み前に確かめること' });
    fireEvent.click(screen.getByRole('checkbox', { name: '確かめました' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '取り込む' }).getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }));
    await waitFor(() => expect(useProjects.getState().projects).toHaveLength(1));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
