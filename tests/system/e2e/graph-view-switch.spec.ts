// System Test: 表示形式「Graph」の追加（2D / 3D / Graph の往復）
// 期待値は要求定義書の受入基準（docs/requirements/graph-twin.md の FR-238 AC-562、PARAM-080 = 2000 ミリ秒）だけから決める。
// 画面の探し方は CONTRACT.md §21（見出しの「ビュー」ボタン、menuitemradio「2D」「3D」「Graph」、フック t.view.state(key)）。
// Graph の表現を持つ画面は、画面の登録を走査して「Graph」の選択肢が有効なものとして求める（画面の key を決め打ちしない）。
import type { Locator, Page } from '@playwright/test';
import { test, expect, component, selectPersona, openScreen, hook, closeSettings } from '../support/fixtures';
import { listScreenKeys, gotoScreen, openViewMenu, viewButton, type ViewState } from '../support/screens';

/** PARAM-080: 表示形式を切り替えてから表示が替わるまでの時間の上限（ミリ秒） */
const SWITCH_LIMIT_MS = 2000;
/** FR-238: Graph の表現を持つ画面の数 */
const GRAPH_SCREEN_COUNT = 6;

type Form = '2D' | '3D' | 'Graph';
const viewState = (page: Page, key: string) => hook<ViewState>(page, 't.view.state(a)', key);

/** 選択・絞り込み・期間・時刻（NFR-UX-001 の保持の対象）を読む */
async function keptState(page: Page) {
  const period = page
    .getByRole('combobox', { name: /期間/, includeHidden: true })
    .or(page.getByRole('slider', { name: /期間/, includeHidden: true }))
    .first();
  return {
    selection: await page.getByTestId('selection-indicator').innerText(),
    filter: await component(page, 'table').getByRole('textbox', { name: /絞り込み/, includeHidden: true }).inputValue(),
    time: await page.getByRole('slider', { name: '時間軸' }).first().getAttribute('aria-valuenow'),
    period: (await period.count()) ? ((await period.getAttribute('aria-valuenow')) ?? (await period.inputValue().catch(() => ''))) : null,
  };
}

/** 一覧表で項目を選び、絞り込みを入れ、時刻を動かす */
async function prepareSelection(page: Page): Promise<void> {
  const table = await openScreen(page, 'table');
  const row = table.locator('[role="row"][data-entity-id]').first();
  await row.click();
  const id = await row.getAttribute('data-entity-id');
  expect(id, '選んだ行に data-entity-id がない').toBeTruthy();
  await table.getByRole('textbox', { name: /絞り込み/ }).fill(id!);
  const slider = page.getByRole('slider', { name: '時間軸' }).first();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
}

/** 「Graph」の選択肢が有効な（Graph の表現を持つ）画面の key を、画面の登録を走査して求める */
async function graphScreens(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const key of await listScreenKeys(page)) {
    const c = await gotoScreen(page, key);
    // AC-562 の対象は「Graph の表現を持つ画面」。見出しに「ビュー」を持たない画面（FR-223 のモーダルの設定など）は表現の切替がないので対象外
    if ((await viewButton(c).count()) === 0) {
      await closeSettings(page);
      continue;
    }
    const menu = await openViewMenu(page, c);
    const g =  menu.getByRole('menuitemradio', { name: 'Graph', exact: true });
    if ((await g.count()) && (await g.isEnabled())) out.push(key);
    await page.keyboard.press('Escape');
  }
  return out;
}

/** 表示形式を選び、「ビュー」ボタンに文字で示されるまでの時間（ミリ秒）を返す */
async function chooseForm(page: Page, c: Locator, form: Form): Promise<number> {
  const menu = await openViewMenu(page, c);
  const opt = menu.getByRole('menuitemradio', { name: form, exact: true });
  await expect(opt, `${form} が選べない`).toBeEnabled();
  const t0 = Date.now();
  await opt.click();
  await expect(viewButton(c), `「ビュー」ボタンに現在の表示「${form}」が文字で示されない`).toContainText(form, { timeout: SWITCH_LIMIT_MS * 5 });
  return Date.now() - t0;
}

test.describe('FR-238 表示形式 Graph の追加（2D/3D/Graph の切替）', () => {
  // FR-238 AC-562
  test('FR-238 AC-562 Graph の表現を持つ各画面で、選択・絞り込みのまま 2D→3D→Graph→2D と往復すると、そのつど 2000 ミリ秒以内に替わり、選択・絞り込み・期間・時刻と項目の件数が 3 つの表現で変わらない', async ({ page, start }) => {
    test.setTimeout(600_000);
    await start();
    await selectPersona(page, '事業部門');
    const screens = await graphScreens(page);
    expect(screens.length, `Graph の表現を持つ画面が ${GRAPH_SCREEN_COUNT} 画面ない: ${screens.join(',')}`).toBe(GRAPH_SCREEN_COUNT);
    await prepareSelection(page);
    const kept = await keptState(page);
    for (const key of screens) {
      const c = await gotoScreen(page, key);
      const times: Record<string, number> = {};
      times['2D'] = await chooseForm(page, c, '2D');
      const s2 = await viewState(page, key);
      expect(s2.mode, `${key}: 2D にならない`).toBe('2d');
      times['3D'] = await chooseForm(page, c, '3D');
      const s3 = await viewState(page, key);
      expect(s3.mode, `${key}: 3D にならない`).toBe('3d');
      times['Graph'] = await chooseForm(page, c, 'Graph');
      const sg = await viewState(page, key);
      expect(String(sg.mode), `${key}: Graph にならない`).toBe('graph');
      times['2D 戻り'] = await chooseForm(page, c, '2D');
      const back = await viewState(page, key);
      for (const [name, ms] of Object.entries(times)) {
        expect(ms, `${key}: ${name} への切替が ${SWITCH_LIMIT_MS}ms を超えた`).toBeLessThanOrEqual(SWITCH_LIMIT_MS);
      }
      for (const [name, st] of [['3D', s3], ['Graph', sg], ['2D 戻り', back]] as const) {
        expect(st.itemIds.length, `${key}: ${name} で項目の件数が変わる`).toBe(s2.itemIds.length);
        expect([...st.selectedIds].sort(), `${key}: ${name} で選択中の項目が変わる`).toEqual([...s2.selectedIds].sort());
      }
      expect(await keptState(page), `${key}: 往復で選択・絞り込み・期間・時刻が変わる`).toEqual(kept);
    }
  });

  // FR-238 AC-562（異常系: メニューを選ばず Esc で閉じる／入力中の内容）
  test('FR-238 AC-562 異常系: 絞り込みの入力中（未確定）に Graph へ切り替えて戻しても入力中の内容が消えず、メニューを選ばずに Esc で閉じると表示形式・件数・選択が変わらない', async ({ page, start }) => {
    test.setTimeout(600_000);
    await start();
    await selectPersona(page, '事業部門');
    const screens = await graphScreens(page);
    expect(screens.length, 'Graph の表現を持つ画面がない').toBeGreaterThan(0);
    const table = await openScreen(page, 'table');
    const box = table.getByRole('textbox', { name: /絞り込み/ });
    await box.fill('abc');
    for (const key of screens) {
      const c = await gotoScreen(page, key);
      await chooseForm(page, c, '2D');
      const before = await viewState(page, key);
      // Esc で閉じても変わらない
      await openViewMenu(page, c);
      await page.keyboard.press('Escape');
      const afterEsc = await viewState(page, key);
      expect(afterEsc.mode, `${key}: Esc で表示形式が変わる`).toBe(before.mode);
      expect(afterEsc.itemIds.length, `${key}: Esc で件数が変わる`).toBe(before.itemIds.length);
      expect([...afterEsc.selectedIds].sort(), `${key}: Esc で選択が変わる`).toEqual([...before.selectedIds].sort());
      // Graph を経由して戻しても入力中の内容は残る
      await chooseForm(page, c, 'Graph');
      await chooseForm(page, c, '2D');
      expect(
        await component(page, 'table').getByRole('textbox', { name: /絞り込み/, includeHidden: true }).inputValue(),
        `${key}: 入力中の絞り込みの内容が失われた`,
      ).toBe('abc');
    }
  });
});
