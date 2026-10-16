// System Test: Project ごとの外部連携の選択（FR-201）
// 期待値は要求定義書の受入基準（docs/requirements/integration.md）だけから決める。
// 画面の探し方は tests/system/CONTRACT.md §20（本ファイル用に追記。実装はこれに合わせる）。
import { test, expect } from '../support/fixtures';
import type { Page, Locator } from '@playwright/test';

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

async function openProject(page: Page, company: string, name: string): Promise<void> {
  await page.getByRole('region', { name: `企業 ${company}` }).getByRole('link', { name }).click();
  await expect(page.getByTestId('stepper')).toBeVisible();
}

function integrations(page: Page): Locator {
  return page.getByRole('region', { name: '外部連携' });
}

/** 選択できる連携（廃止でない）の checkbox の名前を n 個返す */
async function selectableNames(page: Page, n: number): Promise<string[]> {
  const boxes = integrations(page).getByRole('checkbox');
  await expect(boxes.first()).toBeVisible();
  const names: string[] = [];
  const count = await boxes.count();
  for (let i = 0; i < count && names.length < n; i++) {
    if (await boxes.nth(i).isEnabled()) names.push(((await boxes.nth(i).getAttribute('aria-label')) ?? '').trim());
  }
  expect(names.length, `選択できる連携が ${n} 件ない`).toBe(n);
  return names;
}

async function selectAndSave(page: Page, name: string): Promise<void> {
  await integrations(page).getByRole('checkbox', { name, exact: true }).check();
  await integrations(page).getByRole('button', { name: '連携の選択を保存' }).click();
}

async function backToMain(page: Page): Promise<void> {
  await page.reload();
  const company = page.getByRole('region').first();
  await expect(company).toBeVisible();
}

test.describe('FR-201 Project ごとの外部連携の選択', () => {
  // FR-201 AC-440
  test('FR-201 AC-440 Project A は連携 X、B は連携 Y を保存し、開き直すと A には X だけ・B には Y だけが選択されている', async ({ page, start }) => {
    await start();
    const C = '合成株式会社A';
    await registerCompany(page, C);
    await createProject(page, C, 'Project A');
    await createProject(page, C, 'Project B');

    await openProject(page, C, 'Project A');
    const [x, y] = await selectableNames(page, 2);
    await selectAndSave(page, x);
    await page.goBack().catch(() => undefined);
    await backToMain(page);

    await openProject(page, C, 'Project B');
    await selectAndSave(page, y);
    await backToMain(page);

    await openProject(page, C, 'Project A');
    await expect(integrations(page).getByRole('checkbox', { name: x, exact: true })).toBeChecked();
    await expect(integrations(page).getByRole('checkbox', { checked: true })).toHaveCount(1);
    await backToMain(page);

    await openProject(page, C, 'Project B');
    await expect(integrations(page).getByRole('checkbox', { name: y, exact: true })).toBeChecked();
    await expect(integrations(page).getByRole('checkbox', { checked: true })).toHaveCount(1);
  });

  // FR-201 AC-440（異常系: 保存せずに開き直すと選択は残らない）
  test('FR-201 AC-440 保存せずに開き直すと選択は残らない', async ({ page, start }) => {
    await start();
    const C = '合成株式会社A';
    await registerCompany(page, C);
    await createProject(page, C, 'Project A');
    await openProject(page, C, 'Project A');
    const [x] = await selectableNames(page, 1);
    await integrations(page).getByRole('checkbox', { name: x, exact: true }).check();
    await backToMain(page);
    await openProject(page, C, 'Project A');
    await expect(integrations(page).getByRole('checkbox', { checked: true })).toHaveCount(0);
  });
});
