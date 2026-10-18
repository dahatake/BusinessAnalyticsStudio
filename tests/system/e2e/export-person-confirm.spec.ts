// System Test: FR-219 種別「人」を含む顧客パックのエクスポート前の確認（AC-514）。外部送信（AC-511・512）・エクスポートの詳細（AC-513）は integration の範囲でここでは扱わない。
// 期待値は受入基準（FR-219 AC-514）だけから決める。お手本パック mono は種別「人」（kind: person）のエンティティを含む（CONTRACT.md §22）。
import type { Page, Locator } from '@playwright/test';
import { test, expect, openScreen } from '../support/fixtures';
import { examplePack } from '../support/packs';

const mono = examplePack('mono');
const people = mono.entities().filter((e: any) => e.kind === 'person');

async function openExport(page: Page): Promise<Locator> {
  await page.keyboard.press('Control+Shift+E');
  const dlg = page.getByRole('dialog', { name: /エクスポート/ });
  await expect(dlg).toBeVisible();
  return dlg;
}

/** 確認（CONTRACT.md §22）。エクスポートの画面とは別の、種別「人」の件数を示すダイアログ */
function confirmDialog(page: Page): Locator {
  return page.locator('[role="alertdialog"], [role="dialog"]').filter({ hasText: /種別「人」/ }).filter({ hasText: /了承/ });
}

async function recordConsent(page: Page) {
  const settings = await openScreen(page, 'settings');
  const note = settings.getByRole('textbox', { name: /了承.*(メモ|役割)|(メモ|役割).*了承|確認した相手/ }).first();
  await note.focus();
  await page.keyboard.type('顧客側の担当役員（口頭）');
  const save = settings.getByRole('button', { name: /了承.*保存|保存.*了承/ }).first();
  await save.focus();
  await page.keyboard.press('Enter');
  await expect(settings.getByText('顧客側の担当役員（口頭）').first()).toBeVisible();
}

/** Tab だけで対象のボタンへフォーカスを移す（最大 40 回） */
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 40; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target, 'キーボードの Tab だけで到達できない').toBeFocused();
}

function countDownloads(page: Page): () => number {
  let n = 0;
  page.on('download', () => { n++; });
  return () => n;
}

test.describe('FR-219 種別「人」を含むパックのエクスポート前の確認', () => {
  test('前提: mono は種別「人」を 1 件以上含む', () => {
    expect(people.length).toBeGreaterThan(0);
  });

  // FR-219 AC-514（異常系: 了承の記録がない）
  test('FR-219 AC-514 了承の記録がないとき、確認に件数と「了承の記録なし」が文字で出て、続行できず、ファイルが作られない', async ({ page, start }) => {
    await start();
    const downloads = countDownloads(page);
    const dlg = await openExport(page);
    await dlg.getByRole('button', { name: 'エクスポート', exact: true }).click();
    const confirm = confirmDialog(page);
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(new RegExp(`${people.length}\\s*件`));
    await expect(confirm).toContainText(/了承の記録(は)?(なし|ありません|がありません|がない)|記録なし/);
    // 個人名・連絡先の値は表示しない
    for (const p of people) {
      for (const v of [p.name, p.title, p.label].filter((x) => typeof x === 'string' && x.length >= 2)) {
        await expect(confirm).not.toContainText(v as string);
      }
    }
    // 続行できない（続行の操作がないか、無効）
    const proceed = confirm.getByRole('button', { name: /続行|出力する|エクスポートする/ });
    if (await proceed.count()) await expect(proceed.first()).toBeDisabled();
    // 中止はキーボードだけでできる
    const cancel = confirm.getByRole('button', { name: /中止|キャンセル|閉じる/ }).first();
    await tabTo(page, cancel);
    await page.keyboard.press('Enter');
    await expect(confirm).toBeHidden();
    await page.waitForTimeout(800);
    expect(downloads(), '了承の記録がないのにファイルが生成された').toBe(0);
  });

  // FR-219 AC-514（了承あり: キーボードだけで中止・続行）
  test('FR-219 AC-514 了承の記録があるとき、確認に件数と確認日が出て、キーボードだけで中止でき（ファイルなし）、続行でファイルが作られる', async ({ page, start }) => {
    await start();
    await recordConsent(page);
    const downloads = countDownloads(page);
    const dlg = await openExport(page);
    await dlg.getByRole('button', { name: 'エクスポート', exact: true }).click();
    const confirm = confirmDialog(page);
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(new RegExp(`${people.length}\\s*件`));
    await expect(confirm).toContainText(/\d{4}[-/年]\s*\d{1,2}[-/月]\s*\d{1,2}/); // 確認日
    await expect(confirm).not.toContainText(/了承の記録(は)?(なし|ありません)/);
    // 確認が開くとフォーカスは確認の中にある
    expect(await confirm.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    // 中止: キーボードだけ
    const cancel = confirm.getByRole('button', { name: /中止|キャンセル/ }).first();
    await tabTo(page, cancel);
    await page.keyboard.press('Enter');
    await expect(confirm).toBeHidden();
    await page.waitForTimeout(800);
    expect(downloads(), '中止したのにファイルが生成された').toBe(0);
    // 続行: キーボードだけ
    const dlg2 = await openExport(page);
    await dlg2.getByRole('button', { name: 'エクスポート', exact: true }).click();
    const confirm2 = confirmDialog(page);
    await expect(confirm2).toBeVisible();
    const proceed = confirm2.getByRole('button', { name: /続行|出力する|エクスポートする/ }).first();
    await tabTo(page, proceed);
    const dl = page.waitForEvent('download', { timeout: 30_000 });
    await page.keyboard.press('Enter');
    await dl;
    expect(downloads()).toBe(1);
  });

  // FR-219 AC-514 / A-59（頻度: 中止の後は再び出る。続行の後、了承の記録・パックの内容が変わらない間は同じ確認を繰り返さない）
  test('FR-219 AC-514 確認の頻度: 中止後は再び出る。続行後は同じ内容・了承の記録のまま続けて出力しても再確認せずファイルが作られる', async ({ page, start }) => {
    await start();
    await recordConsent(page);
    const downloads = countDownloads(page);
    // 1 回目: 中止（ファイルなし）
    let dlg = await openExport(page);
    await dlg.getByRole('button', { name: 'エクスポート', exact: true }).click();
    let confirm = confirmDialog(page);
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: /中止|キャンセル/ }).first().focus();
    await page.keyboard.press('Enter');
    await expect(confirm).toBeHidden();
    // 2 回目: 中止は引き継がれず、操作ごとに確認が出る。続行する
    dlg = await openExport(page);
    await dlg.getByRole('button', { name: 'エクスポート', exact: true }).click();
    confirm = confirmDialog(page);
    await expect(confirm).toBeVisible();
    const dl1 = page.waitForEvent('download', { timeout: 30_000 });
    await confirm.getByRole('button', { name: /続行|出力する|エクスポートする/ }).first().focus();
    await page.keyboard.press('Enter');
    await dl1;
    expect(downloads()).toBe(1);
    // 3 回目: 同じ内容・同じ了承の記録のまま同じ操作 → 確認は繰り返さず、ファイルが作られる
    const dl2 = page.waitForEvent('download', { timeout: 30_000 });
    dlg = await openExport(page);
    await dlg.getByRole('button', { name: 'エクスポート', exact: true }).click();
    await dl2;
    expect(downloads(), '続行の選択が引き継がれず、ファイルが作られない').toBe(2);
    await expect(confirmDialog(page), '同じ内容・了承の記録のまま同じ確認が繰り返された').toBeHidden();
  });
});
