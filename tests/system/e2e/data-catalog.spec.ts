// System Test: データカタログ（FR-159〜FR-162）
// 期待値は要求定義書の受入基準（docs/requirements/data-catalog.md）だけから決める。画面の探し方は tests/system/CONTRACT.md §12。
// 標準の検証条件 = お手本パック（mono）の Project。企業データカタログは、画面に出たエンティティの名称・説明から合成して作る。
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Locator } from '@playwright/test';
import { test, expect, reloadAndEnter, openScreen, hook } from '../support/fixtures';
import { TMP_DIR } from '../support/paths';

const COMPANY = '合成株式会社D';
const PROJECT = 'DC案件1';

async function registerCompany(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '企業を登録' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: '企業名' }).fill(name);
  await dlg.getByRole('button', { name: '登録' }).click();
  await expect(dlg).toBeHidden();
}
async function createProject(page: Page, company: string, name: string): Promise<void> {
  await page.getByRole('region', { name: `企業 ${company}` }).getByRole('button', { name: 'Project を作成' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: 'Project 名' }).fill(name);
  await dlg.getByRole('button', { name: '作成' }).click();
  await expect(dlg).toBeHidden();
}
async function openProject(page: Page, company: string, project: string): Promise<void> {
  await page.getByRole('region', { name: `企業 ${company}` }).getByRole('link', { name: project }).click();
  await expect(page.getByTestId('stepper')).toBeVisible();
}
async function openNewProject(page: Page, company = COMPANY, project = PROJECT): Promise<void> {
  await registerCompany(page, company);
  await createProject(page, company, project);
  await openProject(page, company, project);
}
/** 導出の候補を 1 件登録してユースケースを作る（導出元 `source` つきのユースケースになる） */
async function registerDerivedUseCase(page: Page): Promise<string> {
  await page.getByTestId('stepper').getByRole('button', { name: 'ユースケース作成' }).click();
  const cand = page.getByTestId('usecase-candidates').getByRole('listitem').first();
  await expect(cand).toBeVisible();
  await cand.getByRole('button', { name: '登録', exact: true }).click();
  const li = page.getByTestId('usecase-list').getByRole('listitem').first();
  await expect(li).toBeVisible();
  return ((await li.getAttribute('data-usecase-name')) ?? '').trim();
}
async function openCatalog(page: Page): Promise<Locator> {
  return openScreen(page, 'data-catalog');
}

interface Ent { name: string; description: string }
async function readEntities(page: Page): Promise<Ent[]> {
  const rows = page.getByTestId('entity-list').getByRole('listitem');
  await expect(rows.first()).toBeVisible();
  const n = await rows.count();
  const out: Ent[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      name: ((await rows.nth(i).getAttribute('data-entity-name')) ?? '').trim(),
      description: ((await rows.nth(i).getAttribute('data-entity-description')) ?? '').trim(),
    });
  }
  return out;
}
function writeCatalog(file: string, content: string): string {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const p = path.join(TMP_DIR, file);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}
async function importCatalog(page: Page, file: string): Promise<void> {
  await page.getByLabel('企業データカタログのファイル').setInputFiles(file);
}
async function categories(page: Page): Promise<Record<string, string>> {
  const rows = page.getByTestId('reconcile-table').locator('tr[data-entity-name]');
  const n = await rows.count();
  const out: Record<string, string> = {};
  for (let i = 0; i < n; i++) out[(await rows.nth(i).getAttribute('data-entity-name')) ?? ''] = (await rows.nth(i).getAttribute('data-category')) ?? '';
  return out;
}
/** 画面のエンティティから、一致 1・差異 1・BASのみ 2（残りは BAS のうち末尾 2 件を除く）・カタログのみ 1 の企業データカタログを作る */
function buildCatalog(ents: Ent[]): { json: string; matched: Ent; diff: Ent; onlyBas: Ent[]; extra: string } {
  const keep = ents.slice(0, ents.length - 2);
  const extra = '合成カタログ専用データX';
  const items = keep.map((e, i) => ({ name: e.name, description: i === 1 ? `${e.description}（異なる説明）` : e.description }));
  items.push({ name: extra, description: '合成の説明' });
  return { json: JSON.stringify({ entities: items }), matched: keep[0], diff: keep[1], onlyBas: ents.slice(-2), extra };
}

test.describe('FR-159 データカタログの画面', () => {
  // FR-159 AC-294
  test('FR-159 AC-294 お手本パックの Project で左メニューの「データカタログ」を開くと一覧が出て、行を選ぶと詳細に名称・説明・導出元・関連するユースケースが出て、開き直しても同じ導出結果', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    await registerDerivedUseCase(page);
    await openCatalog(page);
    const ents = await readEntities(page);
    expect(ents.length).toBeGreaterThan(0);
    const rows = page.getByTestId('entity-list').getByRole('listitem');
    await rows.first().click();
    const detail = page.getByTestId('entity-detail');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(ents[0].name);
    for (const label of ['名称', '説明', '導出元', '関連するユースケース']) await expect(detail).toContainText(label);
    await expect(detail).toContainText(ents[0].description);
    // 閉じて開き直しても、同じ導出結果
    await reloadAndEnter(page, COMPANY);
    await openProject(page, COMPANY, PROJECT);
    await openCatalog(page);
    expect(await readEntities(page)).toEqual(ents);
  });

  // FR-159 AC-294（異常系: 導出の元がない Project では、一覧は 0 件で理由が出て、ほかの画面が使える）
  test('FR-159 AC-294 顧客パックがない（導出の元がない）Project では一覧が 0 件で理由が表示され、他の画面を開ける', async ({ page, start }) => {
    await start({ pack: null });
    await openNewProject(page);
    await openCatalog(page);
    await expect(page.getByTestId('entity-list').getByRole('listitem')).toHaveCount(0);
    await expect(page.getByTestId('entity-list-empty-reason')).toContainText(/導出の元がない|顧客パックがない/);
    await openScreen(page, 'settings');
  });
});

test.describe('FR-160 エンティティ×ユースケースの対応表', () => {
  // FR-160 AC-297
  test('FR-160 AC-297 ユースケースを登録した Project の対応表で、導出が「導出」と文字で区別して表示される（明示を足すと「明示」になる）', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    const ucName = await registerDerivedUseCase(page);
    await openCatalog(page);
    const matrix = page.getByTestId('entity-usecase-matrix');
    await expect(matrix).toBeVisible();
    await expect(matrix).toContainText(ucName);
    const derived = matrix.locator('[data-kind="derived"]');
    await expect(derived.first()).toContainText('導出');
    // 色だけに依存しない: 空でないセルはすべて文字で種別を持つ
    const n = await derived.count();
    for (let i = 0; i < n; i++) await expect(derived.nth(i)).toHaveText(/導出/);
    // 空のセルに明示の紐づけを追加すると「明示」になる
    const empty = matrix.locator('[data-kind="none"]').first();
    await expect(empty).toBeVisible();
    await empty.getByRole('button', { name: /紐づけを追加/ }).click();
    const explicit = matrix.locator('[data-kind="explicit"]');
    await expect(explicit).toHaveCount(1);
    await expect(explicit.first()).toContainText('明示');
    // 「導出」のセルには削除の操作がない
    await expect(derived.first().getByRole('button', { name: /削除/ })).toHaveCount(0);
  });

  // FR-160 AC-297（異常系: ユースケースが 0 件）
  test('FR-160 AC-297 ユースケースが 0 件のときは列が空で、その理由が表示される', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    await openCatalog(page);
    const matrix = page.getByTestId('entity-usecase-matrix');
    await expect(matrix).toBeVisible();
    await expect(matrix.locator('[data-kind="derived"], [data-kind="explicit"]')).toHaveCount(0);
    await expect(page.getByTestId('matrix-empty-reason')).toContainText('ユースケース');
  });
});

test.describe('FR-161 企業データカタログの取り込みと突合', () => {
  // FR-161 AC-300
  test('FR-161 AC-300 有効な JSON を取り込むと、エンティティごとに 一致・差異・BASのみ・カタログのみ の 4 区分が文字で示される', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    await openCatalog(page);
    const ents = await readEntities(page);
    expect(ents.length).toBeGreaterThanOrEqual(4);
    const cat = buildCatalog(ents);
    await importCatalog(page, writeCatalog('dc-valid.json', cat.json));
    await expect(page.getByTestId('reconcile-table')).toBeVisible();
    const c = await categories(page);
    expect(c[cat.matched.name]).toBe('一致');
    expect(c[cat.diff.name]).toBe('差異');
    for (const e of cat.onlyBas) expect(c[e.name]).toBe('BASのみ');
    expect(c[cat.extra]).toBe('カタログのみ');
    // 区分は文字で表示される
    const table = page.getByTestId('reconcile-table');
    for (const w of ['一致', '差異', 'BASのみ', 'カタログのみ']) await expect(table).toContainText(w);
  });

  // FR-161 AC-300（異常系: 壊れたファイルは拒否され、取り込み済みの突合の結果は変わらない）
  test('FR-161 AC-300 壊れた JSON は拒否されて原因が表示され、取り込み済みの突合の結果は変わらない', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    await openCatalog(page);
    const ents = await readEntities(page);
    const cat = buildCatalog(ents);
    await importCatalog(page, writeCatalog('dc-ok.json', cat.json));
    await expect(page.getByTestId('reconcile-table')).toBeVisible();
    const before = await categories(page);
    await importCatalog(page, writeCatalog('dc-broken.json', '{ "entities": [ { "name": '));
    await expect(page.getByRole('alert').filter({ hasText: /JSON|形式|読み込め/ })).toBeVisible();
    expect(await categories(page)).toEqual(before);
  });
});

test.describe('FR-162 カタログ未掲載のエンティティの ToDo への一括追加', () => {
  // FR-162 AC-305
  test('FR-162 AC-305 「BASのみ」が 2 件ある Project で「未掲載を ToDo に追加」を実行すると、2 件の ToDo が plan の tasks に入り、名称と説明にエンティティ名と関連ユースケース名が含まれ、件数が表示される', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    const ucName = await registerDerivedUseCase(page);
    await openCatalog(page);
    const ents = await readEntities(page);
    expect(ents.length).toBeGreaterThanOrEqual(4);
    const cat = buildCatalog(ents);
    await importCatalog(page, writeCatalog('dc-todo.json', cat.json));
    await expect(page.getByTestId('reconcile-table')).toBeVisible();
    const before = (await hook<any[]>(page, 't.plan.tasks()')).length;
    await page.getByRole('button', { name: '未掲載を ToDo に追加' }).click();
    await expect(page.getByTestId('todo-add-result')).toContainText('2');
    const tasks = await hook<Array<{ id: string; title: string; description: string }>>(page, 't.plan.tasks()');
    expect(tasks.length).toBe(before + 2);
    for (const e of cat.onlyBas) {
      const t = tasks.find((x) => `${x.title}${x.description}`.includes(e.name));
      expect(t, `ToDo に ${e.name} がある`).toBeTruthy();
    }
    // 関連ユースケースを持つエンティティの ToDo には、そのユースケース名が含まれる（FR-160 の導出と明示の両方）
    const related = await page.getByTestId('entity-usecase-matrix').locator('[data-kind="derived"], [data-kind="explicit"]').evaluateAll((els) =>
      els.map((e) => ({ entity: e.getAttribute('data-entity-name'), uc: e.getAttribute('data-usecase-name') })));
    for (const r of related.filter((x) => cat.onlyBas.some((e) => e.name === x.entity))) {
      const t = tasks.find((x) => `${x.title}${x.description}`.includes(r.entity ?? '##'));
      expect(`${t?.title}${t?.description}`).toContain(r.uc ?? ucName);
    }
  });

  // FR-162 AC-305（異常系: カタログ未取り込みでは追加できず理由が出る）
  test('FR-162 AC-305 企業データカタログを取り込んでいない Project では ToDo は追加されず、理由が表示される', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    await openCatalog(page);
    const before = (await hook<any[]>(page, 't.plan.tasks()')).length;
    const btn = page.getByRole('button', { name: '未掲載を ToDo に追加' });
    if (await btn.isEnabled()) await btn.click();
    await expect(page.getByTestId('todo-add-result')).toContainText(/取り込んで|追加できません|0 件/);
    expect((await hook<any[]>(page, 't.plan.tasks()')).length).toBe(before);
  });

  // FR-162 AC-305（異常系: 繰り返しても重複しない）
  test('FR-162 AC-305 同じ操作を繰り返しても ToDo は重複して作られない', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    await openCatalog(page);
    const cat = buildCatalog(await readEntities(page));
    await importCatalog(page, writeCatalog('dc-todo2.json', cat.json));
    const btn = page.getByRole('button', { name: '未掲載を ToDo に追加' });
    await btn.click();
    const after1 = (await hook<any[]>(page, 't.plan.tasks()')).length;
    if (await btn.isEnabled()) await btn.click();
    expect((await hook<any[]>(page, 't.plan.tasks()')).length).toBe(after1);
  });
});
