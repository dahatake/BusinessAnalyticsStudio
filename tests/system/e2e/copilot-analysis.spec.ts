// System Test: 「Copilot で分析実行」・コンポーネントごとの「Copilot の案」・反映・Foundry 接続設定・未設定時の分析実行
// 期待値は要求定義書の受入基準（docs/requirements/app-core.md の FR-278 AC-715・717・718、FR-279 AC-719、FR-280 AC-721、FR-282 AC-725、FR-283 AC-727）だけから決める。
// 実装は未了でよい（not_run）。画面の探し方は受入基準の文言（button「Copilot で分析実行」、文字「Copilot の案（AI 生成）」「案なし」）に従う。
import type { Page } from '@playwright/test';
import { test, expect, selectPersona, openScreen, settingsDialog, closeSettings, reloadAndEnter } from '../support/fixtures';
import { startFoundryRelayStub } from '../support/relay-stub';

const runButton = (page: Page) => page.getByRole('button', { name: 'Copilot で分析実行' }).first();

async function configureFoundry(page: Page, relayUrl: string): Promise<void> {
  await page.getByRole('button', { name: /設定/ }).first().click();
  const dlg = settingsDialog(page);
  await dlg.getByLabel('エンドポイント').fill('https://example.invalid/openai');
  await dlg.getByLabel('デプロイ名').fill('dummy-deploy');
  await dlg.getByLabel('API キー').fill('dummy-key-for-test');
  await dlg.getByRole('button', { name: '保存' }).click();
  await expect(dlg.getByText('設定済み')).toBeVisible();
  await closeSettings(page);
  void relayUrl;
}

test.describe('FR-278〜283 Copilot で分析実行', () => {
  // FR-278 AC-715
  test('FR-278 AC-715 設定済みで「Copilot で分析実行」を押すと進行中が表示され、その間も他の操作ができ、完了で各コンポーネントに「Copilot の案」が出て、通信先は localhost だけ', async ({ page, start }) => {
    const relay = await startFoundryRelayStub('ok');
    try {
      const hosts = new Set<string>();
      page.on('request', (r) => { try { hosts.add(new URL(r.url()).hostname); } catch { /* ignore */ } });
      await start({ relayUrl: relay.url });
      await selectPersona(page, '事業部門');
      await openScreen(page, 'table');
      await configureFoundry(page, relay.url);
      await expect(runButton(page)).toBeVisible();
      await runButton(page).click();
      await expect(page.getByText(/進行中|分析中|実行中/).first()).toBeVisible();
      await expect(page.getByRole('navigation').first()).toBeEnabled();
      await expect(page.getByText(/Copilot の案/).first()).toBeVisible({ timeout: 30_000 });
      for (const h of hosts) expect(['localhost', '127.0.0.1', '[::1]', '::1', '']).toContain(h);
    } finally { await relay.close(); }
  });

  // FR-278 AC-717
  test('FR-278 AC-717 案はそのコンポーネントにだけ表示され、案が返らない・データを持たないコンポーネントには「案なし」と文字で示される', async ({ page, start }) => {
    const relay = await startFoundryRelayStub('ok');
    try {
      await start({ relayUrl: relay.url });
      await selectPersona(page, '事業部門');
      const table = await openScreen(page, 'table');
      await configureFoundry(page, relay.url);
      await runButton(page).click();
      await expect(table.getByText(/Copilot の案/).first()).toBeVisible({ timeout: 30_000 });
      const proposals = page.getByTestId(/copilot-proposal/);
      const n = await proposals.count();
      expect(n, '案の欄が無い').toBeGreaterThan(0);
      // 案はそれぞれ 1 つのコンポーネントの中にだけある（入れ子にならず、重複しない）
      const texts = await proposals.allInnerTexts();
      expect(new Set(texts).size, '同一の案が複数のコンポーネントに出ている').toBe(texts.length);
      await expect(page.getByText('案なし').first()).toBeVisible();
    } finally { await relay.close(); }
  });

  // FR-278 AC-718
  test('FR-278 AC-718 完了後、案は「Copilot の案（AI 生成）」のラベル付きで現在のデータとは別の欄に出て、表示とデータは実行前と同じ', async ({ page, start }) => {
    const relay = await startFoundryRelayStub('ok');
    try {
      await start({ relayUrl: relay.url });
      await selectPersona(page, '事業部門');
      const table = await openScreen(page, 'table');
      await configureFoundry(page, relay.url);
      const before = await table.innerText();
      const beforeStore = await page.evaluate(() => JSON.stringify({ ...localStorage }));
      await runButton(page).click();
      await expect(page.getByText('Copilot の案（AI 生成）').first()).toBeVisible({ timeout: 30_000 });
      const proposal = table.getByTestId(/copilot-proposal/).first();
      await expect(proposal).toBeVisible();
      // 現在のデータの欄（案の欄の外）は変わらない
      const outside = await table.evaluate((el) => {
        const c = el.cloneNode(true) as HTMLElement;
        c.querySelectorAll('[data-testid^="copilot-proposal"]').forEach((e) => e.remove());
        return c.innerText;
      });
      expect(outside).toBe(before);
      expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(beforeStore);
    } finally { await relay.close(); }
  });

  // FR-279 AC-719
  test('FR-279 AC-719 案を編集すると編集後が表示されレイアウト変更でも失われず、破棄すると案が消えて表示とデータは実行前と同じ', async ({ page, start }) => {
    const relay = await startFoundryRelayStub('ok');
    try {
      await start({ relayUrl: relay.url });
      await selectPersona(page, '事業部門');
      const table = await openScreen(page, 'table');
      await configureFoundry(page, relay.url);
      const before = await table.innerText();
      await runButton(page).click();
      const proposal = table.getByTestId(/copilot-proposal/).first();
      await expect(proposal).toBeVisible({ timeout: 30_000 });
      const box = proposal.getByRole('textbox').first();
      await box.fill('編集後の案 FR279');
      await expect(box).toHaveValue('編集後の案 FR279');
      // レイアウトの変更（最小化して戻す）
      await table.getByRole('button', { name: /最小化/ }).first().click();
      await page.getByRole('button', { name: /元に戻す|復元|最小化を解除/ }).first().click();
      await expect(table.getByTestId(/copilot-proposal/).first().getByRole('textbox').first()).toHaveValue('編集後の案 FR279');
      // 破棄
      await table.getByTestId(/copilot-proposal/).first().getByRole('button', { name: '破棄' }).click();
      await expect(table.getByTestId(/copilot-proposal/)).toHaveCount(0);
      expect(await table.innerText()).toBe(before);
    } finally { await relay.close(); }
  });

  // FR-280 AC-721
  test('FR-280 AC-721 端末内保存データを持つコンポーネントで案を編集して「反映」を押すと表示が変わり、再読み込み後も復元される', async ({ page, start }) => {
    const relay = await startFoundryRelayStub('ok');
    try {
      await start({ relayUrl: relay.url });
      await selectPersona(page, '事業部門');
      const table = await openScreen(page, 'table');
      await configureFoundry(page, relay.url);
      await runButton(page).click();
      const proposal = table.getByTestId(/copilot-proposal/).first();
      await expect(proposal).toBeVisible({ timeout: 30_000 });
      await proposal.getByRole('textbox').first().fill('反映する内容 FR280');
      await proposal.getByRole('button', { name: '反映' }).click();
      await expect(table).toContainText('反映する内容 FR280');
      await reloadAndEnter(page);
      await selectPersona(page, '事業部門');
      const again = await openScreen(page, 'table');
      await expect(again).toContainText('反映する内容 FR280');
    } finally { await relay.close(); }
  });

  // FR-282 AC-725
  test('FR-282 AC-725 設定画面に Foundry の接続設定の入力欄があり、保存・変更・削除ができ「設定済み」「未設定」が文字で示され、キーボードだけで操作でき各欄がアクセシブルな名前を持つ', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    await page.getByRole('button', { name: /設定/ }).first().click();
    const dlg = settingsDialog(page);
    const endpoint = dlg.getByLabel('エンドポイント');
    const deploy = dlg.getByLabel('デプロイ名');
    const key = dlg.getByLabel('API キー');
    await expect(endpoint).toBeVisible();
    await expect(deploy).toBeVisible();
    await expect(key).toBeVisible();
    await expect(dlg.getByLabel(/認証方式/).first()).toBeVisible();
    await expect(dlg.getByText('未設定').first()).toBeVisible();
    // キーボードだけで入力して保存
    await endpoint.focus();
    await page.keyboard.type('https://example.invalid/openai');
    await deploy.focus();
    await page.keyboard.type('dummy-deploy');
    await key.focus();
    await page.keyboard.type('dummy-key-for-test');
    const save = dlg.getByRole('button', { name: '保存' });
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(dlg.getByText('設定済み')).toBeVisible();
    // 変更
    await deploy.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('dummy-deploy-2');
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(deploy).toHaveValue('dummy-deploy-2');
    await expect(dlg.getByText('設定済み')).toBeVisible();
    // 削除
    const del = dlg.getByRole('button', { name: '削除' });
    await del.focus();
    await page.keyboard.press('Enter');
    await expect(dlg.getByText('未設定').first()).toBeVisible();
  });

  // FR-283 AC-727
  test('FR-283 AC-727 接続設定が未設定のまま「Copilot で分析実行」を押すと、Foundry 呼び出しは 0 回で、未設定と設定画面への案内が文字で示され、表示とデータは変わらない', async ({ page, start }) => {
    const relay = await startFoundryRelayStub('ok');
    try {
      await start({ relayUrl: relay.url });
      await selectPersona(page, '事業部門');
      const table = await openScreen(page, 'table');
      const before = await table.innerText();
      const beforeStore = await page.evaluate(() => JSON.stringify({ ...localStorage }));
      let calls = 0;
      await page.route('**/foundry/**', (r) => { calls += 1; return r.continue(); });
      await runButton(page).click();
      await expect(page.getByText(/未設定/).first()).toBeVisible();
      await expect(page.getByText(/設定画面|設定を開|設定で/).first()).toBeVisible();
      expect(calls, 'Foundry への呼び出しが発生した').toBe(0);
      expect(await table.innerText()).toBe(before);
      expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(beforeStore);
    } finally { await relay.close(); }
  });
});
