// System Test: データビュアー（FR-169〜FR-172）。期待値は docs/requirements/data-catalog.md の受入基準だけから決める。
// 画面の探し方は tests/system/CONTRACT.md §14。標準の検証条件 = お手本パック（mono）の Project に、列を含む企業データカタログを取り込む。
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Locator } from '@playwright/test';
import { test, expect, openScreen } from '../support/fixtures';
import { TMP_DIR } from '../support/paths';

const COMPANY = '合成株式会社V';
const PROJECT = 'DV案件1';

async function openNewProject(page: Page): Promise<void> {
  await page.getByRole('button', { name: '企業を登録' }).click();
  let dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: '企業名' }).fill(COMPANY);
  await dlg.getByRole('button', { name: '登録' }).click();
  await expect(dlg).toBeHidden();
  await page.getByRole('region', { name: `企業 ${COMPANY}` }).getByRole('button', { name: 'Project を作成' }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: 'Project 名' }).fill(PROJECT);
  await dlg.getByRole('button', { name: '作成' }).click();
  await expect(dlg).toBeHidden();
  await page.getByRole('region', { name: `企業 ${COMPANY}` }).getByRole('link', { name: PROJECT }).click();
  await expect(page.getByTestId('stepper')).toBeVisible();
  await page.getByTestId('stepper').getByRole('button', { name: 'ユースケース作成' }).click();
  const cand = page.getByTestId('usecase-candidates').getByRole('listitem').first();
  await expect(cand).toBeVisible();
  await cand.getByRole('button', { name: '登録', exact: true }).click();
  await expect(page.getByTestId('usecase-list').getByRole('listitem').first()).toBeVisible();
}

/** 画面の先頭エンティティの名称を読み、列（名称つき）を持つ企業データカタログを取り込む */
async function importCatalogWithColumns(page: Page): Promise<{ entity: string; columns: string[] }> {
  const rows = page.getByTestId('entity-list').getByRole('listitem');
  await expect(rows.first()).toBeVisible();
  const n = await rows.count();
  const items: { name: string; description: string; columns: { name: string; type: string }[] }[] = [];
  const columns = ['合成列A', '合成列B', '合成列C'];
  for (let i = 0; i < n; i++) {
    items.push({
      name: ((await rows.nth(i).getAttribute('data-entity-name')) ?? '').trim(),
      description: ((await rows.nth(i).getAttribute('data-entity-description')) ?? '').trim(),
      columns: columns.map((c) => ({ name: c, type: 'string' })),
    });
  }
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, 'dv-columns.json');
  fs.writeFileSync(file, JSON.stringify({ entities: items }), 'utf8');
  await page.getByLabel('企業データカタログのファイル').setInputFiles(file);
  return { entity: items[0].name, columns };
}

async function zoomTo(viewer: Locator, level: 'bird' | 'entity' | 'column'): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if ((await viewer.getAttribute('data-detail-level')) === level) return;
    const btn = viewer.getByRole('button', { name: level === 'bird' ? '縮小' : '拡大' });
    if (!(await btn.isEnabled())) return; // 上限・下限では無効。待ち続けず、後続の expect で検証する
    await btn.click({ timeout: 5_000 });
  }
}

test.describe('FR-169 データビュアー', () => {
  // FR-169 AC-334
  test('FR-169 AC-334 拡大すると鳥観図→エンティティ→列の順に変わり、最大でエンティティの列名が読め、縮小すると鳥観図に戻る', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    await openScreen(page, 'data-catalog');
    const { entity, columns } = await importCatalogWithColumns(page);
    const viewer = page.getByTestId('data-viewer');
    await expect(viewer).toBeVisible();
    await zoomTo(viewer, 'bird');
    await expect(viewer).toHaveAttribute('data-detail-level', 'bird');
    const seen: string[] = ['bird'];
    for (let i = 0; i < 40; i++) {
      await viewer.getByRole('button', { name: '拡大' }).click();
      const lv = (await viewer.getAttribute('data-detail-level')) ?? '';
      if (lv !== seen[seen.length - 1]) seen.push(lv);
      if (lv === 'column') break;
    }
    expect(seen).toEqual(['bird', 'entity', 'column']);
    const ent = viewer.locator(`[data-viewer-entity="${entity}"]`);
    await expect(ent.locator('[data-viewer-column]').first()).toBeVisible();
    for (const c of columns) await expect(ent).toContainText(c);
    await zoomTo(viewer, 'bird');
    await expect(viewer).toHaveAttribute('data-detail-level', 'bird');
  });

  // FR-169 AC-334
  test('FR-169 AC-334 2D と 3D を切り替えても選んだエンティティは選択されたままで、どちらでも列まで拡大できる', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    await openScreen(page, 'data-catalog');
    const { entity } = await importCatalogWithColumns(page);
    const viewer = page.getByTestId('data-viewer');
    await expect(viewer).toBeVisible();
    await zoomTo(viewer, 'entity');
    await viewer.locator(`[data-viewer-entity="${entity}"]`).click();
    await expect(viewer.locator(`[data-viewer-entity="${entity}"]`)).toHaveAttribute('aria-selected', 'true');
    for (const mode of ['2D', '3D', '2D'] as const) {
      await viewer.getByRole('radiogroup', { name: '表示モード' }).getByRole('radio', { name: mode, exact: true }).check();
      await expect(viewer).toHaveAttribute('data-view-mode', mode.toLowerCase());
      await expect(viewer.locator(`[data-viewer-entity="${entity}"]`)).toHaveAttribute('aria-selected', 'true');
      await zoomTo(viewer, 'column');
      await expect(viewer).toHaveAttribute('data-detail-level', 'column');
      await expect(viewer.locator(`[data-viewer-entity="${entity}"] [data-viewer-column]`).first()).toBeVisible();
    }
  });

  // FR-169 AC-334（異常系: 倍率の上限を超えて拡大しても、列の詳細度のまま画面は壊れない）
  test('FR-169 AC-334 最大に拡大した後にさらに拡大しても列の詳細度のままで、縮小で鳥観図に戻れる', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    await openScreen(page, 'data-catalog');
    const { entity } = await importCatalogWithColumns(page);
    const viewer = page.getByTestId('data-viewer');
    await zoomTo(viewer, 'column');
    for (let i = 0; i < 5; i++) await viewer.getByRole('button', { name: '拡大' }).click();
    await expect(viewer).toBeVisible();
    await expect(viewer).toHaveAttribute('data-detail-level', 'column');
    await expect(viewer.locator(`[data-viewer-entity="${entity}"] [data-viewer-column]`).first()).toBeVisible();
    await zoomTo(viewer, 'bird');
    await expect(viewer).toHaveAttribute('data-detail-level', 'bird');
  });
});
