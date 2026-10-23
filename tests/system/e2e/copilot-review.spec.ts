// System Test: 「Copilot で分析実行」と Copilot の案（FR-278〜283 AC-715・717・718・719・721・725・727）
// 期待値は要求定義書の受入基準だけから決める。画面の探し方は CONTRACT.md §27。
// Foundry は差し替え部品の中継（support/review-stub.ts）。本物は呼ばない。
import type { Page, Locator } from '@playwright/test';
import { test, expect, openScreen, reloadAndEnter, recordExportConsent, continuePersonConfirm, settingsDialog, selectPersona } from '../support/fixtures';
import { startReviewStub } from '../support/review-stub';

const runButton = (page: Page): Locator => page.getByRole('button', { name: 'Copilot で分析実行', exact: true }).first();
const proposals = (page: Page): Locator => page.getByTestId('copilot-proposal');

/** ボタンを押し、送信前の確認（FR-278）が出れば続行する */
async function runAnalysis(page: Page): Promise<void> {
  await runButton(page).click();
  const dlg = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: /送信/ })).first();
  if (await dlg.isVisible({ timeout: 1500 }).catch(() => false)) {
    await dlg.getByRole('button', { name: /送信する|続行|実行/ }).first().click();
  }
  await continuePersonConfirm(page, () => false, 1000);
}

test.describe('FR-278 Copilot で分析実行', () => {
  // FR-278 AC-715
  test('FR-278 AC-715 画面上部に「Copilot で分析実行」が見え、押すと進行中が表示され、その間もほかを操作でき、完了すると各コンポーネントに案が出て、通信先は localhost だけ', async ({ page, start }) => {
    const relay = await startReviewStub({ delayMs: 1500 });
    try {
      const external: string[] = [];
      page.on('request', (r) => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && /^https?:$/.test(u.protocol)) external.push(r.url()); });
      await start({ relayUrl: relay.url });
      await recordExportConsent(page);
      await selectPersona(page, '事業部門');
      await openScreen(page, 'table');
      const btn = runButton(page);
      await expect(btn).toBeVisible();
      expect((await btn.boundingBox())!.y, 'ボタンが画面上部にない').toBeLessThan(200);
      await runAnalysis(page);
      await expect(page.getByTestId('copilot-running')).toBeVisible();
      // 進行中もほかのコンポーネントを操作できる（画面を切り替えられる）
      await openScreen(page, 'issue-solution');
      await expect(proposals(page).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('copilot-running')).toBeHidden();
      expect(external, `localhost 以外への通信: ${external.join(', ')}`).toEqual([]);
    } finally {
      await relay.close();
    }
  });
});

test.describe('FR-278 結果の振り分け・案の表示', () => {
  // FR-278 AC-717
  test('FR-278 AC-717 結果はコンポーネントごとにそのコンポーネントの案としてだけ表示され、案が返らないコンポーネントには「案なし」と示される', async ({ page, start }) => {
    const relay = await startReviewStub({ skipIds: ['table'] });
    try {
      await start({ relayUrl: relay.url });
      await recordExportConsent(page);
      await openScreen(page, 'table');
      await runAnalysis(page);
      const table = page.getByTestId('component-table');
      await expect(table.getByTestId('copilot-proposal')).toHaveCount(0);
      await expect(table.getByText('案なし')).toBeVisible({ timeout: 15_000 });
      // 案が返ったほかのコンポーネントでは、そのコンポーネント自身の案だけが表示される
      await openScreen(page, 'issue-solution');
      const other = page.getByTestId('component-issue-solution');
      await expect(other.getByTestId('copilot-proposal').first()).toContainText('RMARKER-issue-solution-X');
      await expect(other).not.toContainText('RMARKER-table-X');
    } finally {
      await relay.close();
    }
  });

  // FR-279 AC-718
  test('FR-279 AC-718 完了すると「Copilot の案（AI 生成）」のラベル付きで案が現在のデータとは別の欄に表示され、表示とデータは実行前と同じ', async ({ page, start }) => {
    const relay = await startReviewStub();
    try {
      await start({ relayUrl: relay.url });
      await recordExportConsent(page);
      await openScreen(page, 'table');
      const table = page.getByTestId('component-table');
      const before = await table.getByTestId('component-data').innerText();
      await runAnalysis(page);
      const p = table.getByTestId('copilot-proposal');
      await expect(p).toBeVisible({ timeout: 15_000 });
      await expect(p).toContainText('Copilot の案（AI 生成）');
      expect(await table.getByTestId('component-data').innerText(), '現在のデータが変わった').toBe(before);
      expect(await table.getByTestId('component-data').locator('[data-testid="copilot-proposal"]').count(), '案が現在のデータの欄の中にある').toBe(0);
    } finally {
      await relay.close();
    }
  });

  // FR-279 AC-719
  test('FR-279 AC-719 案を編集すると編集後の内容が表示され、レイアウト変更でも失われない。破棄すると案が消え表示とデータは実行前と同じ', async ({ page, start }) => {
    const relay = await startReviewStub();
    try {
      await start({ relayUrl: relay.url });
      await recordExportConsent(page);
      await openScreen(page, 'table');
      const table = page.getByTestId('component-table');
      const before = await table.getByTestId('component-data').innerText();
      await runAnalysis(page);
      const p = table.getByTestId('copilot-proposal');
      await expect(p).toBeVisible({ timeout: 15_000 });
      const edit = p.getByRole('textbox').first();
      await edit.fill('EDITED-PROPOSAL-0001');
      await expect(edit).toHaveValue('EDITED-PROPOSAL-0001');
      // レイアウト変更（最小化して戻す）でも編集内容が残る
      await table.getByRole('button', { name: /最小化/ }).first().click();
      await table.getByRole('button', { name: /元に戻す|復元|最小化を解除/ }).first().click();
      await expect(table.getByTestId('copilot-proposal').getByRole('textbox').first()).toHaveValue('EDITED-PROPOSAL-0001');
      // 破棄
      await table.getByRole('button', { name: '破棄', exact: true }).click();
      await expect(table.getByTestId('copilot-proposal')).toHaveCount(0);
      expect(await table.getByTestId('component-data').innerText()).toBe(before);
    } finally {
      await relay.close();
    }
  });

  // FR-280 AC-721
  test('FR-280 AC-721 端末内に保存されるデータを持つコンポーネントの案を編集して「反映」を押すと表示が編集後の内容に変わり、再読み込み後も復元される', async ({ page, start }) => {
    const relay = await startReviewStub();
    try {
      await start({ relayUrl: relay.url });
      await recordExportConsent(page);
      await openScreen(page, 'memo');
      const memo = page.getByTestId('component-memo');
      await runAnalysis(page);
      const p = memo.getByTestId('copilot-proposal');
      await expect(p).toBeVisible({ timeout: 15_000 });
      await p.getByRole('textbox').first().fill('REFLECTED-CONTENT-0001');
      await memo.getByRole('button', { name: '反映', exact: true }).click();
      await expect(memo.getByTestId('component-data')).toContainText('REFLECTED-CONTENT-0001');
      await reloadAndEnter(page);
      await openScreen(page, 'memo');
      await expect(page.getByTestId('component-memo').getByTestId('component-data')).toContainText('REFLECTED-CONTENT-0001');
    } finally {
      await relay.close();
    }
  });
});

test.describe('FR-282 Foundry の接続設定・FR-283 未設定のとき', () => {
  // FR-282 AC-725
  test('FR-282 AC-725 設定画面に Foundry の接続設定（エンドポイント・デプロイ名・認証方式・API キー）があり、保存・変更・削除ができ、「設定済み」「未設定」と示され、キーボードだけで操作でき、各欄が名前を持つ', async ({ page, start }) => {
    const relay = await startReviewStub({ foundry: 'not-configured' });
    try {
      await start({ relayUrl: relay.url });
      await selectPersona(page, '事業部門');
      const settings = await openScreen(page, 'settings');
      const foundry = settings.getByTestId('foundry-settings');
      await expect(foundry).toBeVisible();
      await expect(foundry.getByTestId('foundry-status')).toContainText('未設定');
      const endpoint = foundry.getByLabel(/エンドポイント/);
      const deploy = foundry.getByLabel(/デプロイ名/);
      const auth = foundry.getByLabel(/認証方式/);
      const key = foundry.getByLabel(/API キー/);
      for (const f of [endpoint, deploy, auth, key]) await expect(f).toBeVisible();
      // キーボードだけで入力・保存
      await endpoint.focus();
      await page.keyboard.type('https://example.invalid/');
      await deploy.focus();
      await page.keyboard.type('dummy-deploy');
      await key.focus();
      await page.keyboard.type('dummy-key-for-system-test-0000');
      const save = foundry.getByRole('button', { name: /保存/ }).first();
      await save.focus();
      await page.keyboard.press('Enter');
      await expect(foundry.getByText('設定済み').first()).toBeVisible();
      // 変更
      await key.focus();
      await page.keyboard.type('dummy-key-for-system-test-1111');
      await save.focus();
      await page.keyboard.press('Enter');
      await expect(foundry.getByText('設定済み').first()).toBeVisible();
      await expect(settingsDialog(page)).not.toContainText('dummy-key-for-system-test');
      // 削除
      const del = foundry.getByRole('button', { name: /削除/ }).first();
      await del.focus();
      await page.keyboard.press('Enter');
      await expect(foundry.getByTestId('foundry-status')).toContainText('未設定');
    } finally {
      await relay.close();
    }
  });

  // FR-283 AC-727
  test('FR-283 AC-727 Foundry が未設定のまま「Copilot で分析実行」を押すと、Foundry の呼び出しは 0 回で、未設定と設定画面への案内が示され、表示とデータは変わらない', async ({ page, start }) => {
    const relay = await startReviewStub({ foundry: 'not-configured' });
    try {
      await start({ relayUrl: relay.url });
      await recordExportConsent(page);
      await openScreen(page, 'table');
      const table = page.getByTestId('component-table');
      const before = await table.getByTestId('component-data').innerText();
      await runButton(page).click();
      const notice = page.getByTestId('copilot-notice');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText('未設定');
      await expect(notice).toContainText('設定');
      expect(relay.reviewCount(), 'Foundry を呼んだ').toBe(0);
      await expect(page.getByTestId('copilot-proposal')).toHaveCount(0);
      expect(await table.getByTestId('component-data').innerText()).toBe(before);
    } finally {
      await relay.close();
    }
  });
});
