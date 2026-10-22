// System Test: 「Copilot で分析実行」（FR-278 AC-715、FR-279 AC-717・718・719、FR-280 AC-721、FR-282 AC-725、FR-283 AC-727、NFR-SEC-012）
// 期待値は要求定義書の受入基準（docs/requirements/app-core.md）だけから決める。画面の探し方は CONTRACT.md §26。
// 注: NFR-SEC-012 の AC-725 が対応する要求は FR-282（接続設定）。
import type { Page, Locator } from '@playwright/test';
import { test, expect, selectPersona, openScreen, component, recordExportConsent, reloadAndEnter, settingsDialog, closeSettings } from '../support/fixtures';
import { startReviewStub, reviewCalls, REVIEW_TEXT } from '../support/review-stub';

const SCREEN = 'issue-solution';
const runButton = (page: Page): Locator => page.getByRole('button', { name: 'Copilot で分析実行', exact: true }).first();
const proposals = (page: Page): Locator => page.getByTestId('copilot-proposal');

/** 標準の検証条件: 中継は Foundry の差し替え部品（設定済み）・了承の記録あり */
async function setup(page: Page, start: (o?: any) => Promise<unknown>, relayUrl: string): Promise<void> {
  await start({ relayUrl });
  await selectPersona(page, '事業部門');
  await recordExportConsent(page);
  await openScreen(page, SCREEN);
}

async function runAnalysis(page: Page): Promise<void> {
  await runButton(page).click();
  await expect(proposals(page).first()).toBeVisible({ timeout: 15_000 });
}

test.describe('FR-278 「Copilot で分析実行」ボタン', () => {
  // FR-278 AC-715
  test('FR-278 AC-715 ボタンが見え、押すと進行中が表示され、その間もほかのコンポーネントを操作でき、完了すると各コンポーネントに「Copilot の案」が出て、通信先は localhost だけ', async ({ page, start }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (/^https?:$/.test(u.protocol) && !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) external.push(r.url());
    });
    const relay = await startReviewStub({ delayMs: 1500 });
    try {
      await setup(page, start, relay.url);
      const btn = runButton(page);
      await expect(btn).toBeVisible();
      expect((await btn.boundingBox())!.y, 'ボタンが画面上部にない').toBeLessThan(200);
      await btn.click();
      await expect(page.getByRole('status').filter({ hasText: /実行中|進行中/ }).first()).toBeVisible();
      // 進行中でも、ほかのコンポーネント（設定の開閉）を操作できる
      await page.getByRole('button', { name: /設定/ }).first().click();
      await expect(settingsDialog(page)).toBeVisible();
      await closeSettings(page);
      await expect(proposals(page).first()).toBeVisible({ timeout: 15_000 });
      await expect(proposals(page).first()).toContainText('Copilot の案');
      expect(reviewCalls(relay)).toBe(1);
      expect(external, 'localhost 以外へ通信した').toEqual([]);
    } finally {
      await relay.close();
    }
  });
});

test.describe('FR-279 コンポーネントごとの「Copilot の案」', () => {
  // FR-279 AC-717
  test('FR-279 AC-717 案はそのコンポーネントだけに表示され、案が返らないコンポーネントには「案なし」と示される', async ({ page, start }) => {
    const relay = await startReviewStub({ skipKeys: ['kpi-okr'] });
    try {
      await setup(page, start, relay.url);
      await runAnalysis(page);
      const own = component(page, SCREEN).getByTestId('copilot-proposal');
      await expect(own).toContainText(REVIEW_TEXT(SCREEN));
      // ほかのコンポーネントの案の文言は表示されない
      const all = await proposals(page).allInnerTexts();
      for (const t of all) {
        const keys = (t.match(/差し替え部品の案: [\w-]+/g) ?? []);
        expect(keys.length, '1 つの案に複数のコンポーネントの案が混ざっている').toBeLessThanOrEqual(1);
      }
      // 案が返らなかったコンポーネント
      await expect(page.getByTestId('copilot-proposal-none').first()).toContainText('案なし');
    } finally {
      await relay.close();
    }
  });

  // FR-279 AC-718
  test('FR-279 AC-718 完了すると「Copilot の案（AI 生成）」のラベル付きで現在のデータとは別の欄に示され、この時点で表示とデータは実行前と同じ', async ({ page, start }) => {
    const relay = await startReviewStub();
    try {
      await setup(page, start, relay.url);
      const comp = component(page, SCREEN);
      const before = await comp.getByTestId('component-current-data').innerText();
      await runAnalysis(page);
      const p = comp.getByTestId('copilot-proposal');
      await expect(p).toContainText('Copilot の案（AI 生成）');
      // 現在のデータの欄とは別の要素
      await expect(comp.getByTestId('component-current-data').getByTestId('copilot-proposal')).toHaveCount(0);
      expect(await comp.getByTestId('component-current-data').innerText()).toBe(before);
      await expect(comp.getByTestId('component-current-data')).not.toContainText(REVIEW_TEXT(SCREEN));
      // 異常系: 再読み込みしてもデータは実行前と同じ
      await reloadAndEnter(page);
      await openScreen(page, SCREEN);
      expect(await component(page, SCREEN).getByTestId('component-current-data').innerText()).toBe(before);
    } finally {
      await relay.close();
    }
  });

  // FR-279 AC-719
  test('FR-279 AC-719 案を編集すると編集後の内容が表示され、レイアウト変更でも失われず、破棄すると案が消えて表示とデータは実行前と同じ', async ({ page, start }) => {
    const relay = await startReviewStub();
    try {
      await setup(page, start, relay.url);
      const comp = component(page, SCREEN);
      const before = await comp.getByTestId('component-current-data').innerText();
      await runAnalysis(page);
      const edit = comp.getByTestId('copilot-proposal').getByRole('textbox', { name: /案/ });
      await edit.fill('利用者が編集した案です');
      await expect(edit).toHaveValue('利用者が編集した案です');
      // レイアウトの変更（最小化して戻す）をしても失われない
      await comp.getByRole('button', { name: /最小化/ }).first().click();
      await page.getByRole('button', { name: /元に戻す|復元|最小化を解除/ }).first().click();
      await expect(component(page, SCREEN).getByTestId('copilot-proposal').getByRole('textbox', { name: /案/ })).toHaveValue('利用者が編集した案です');
      // 破棄
      await component(page, SCREEN).getByTestId('copilot-proposal').getByRole('button', { name: '破棄' }).click();
      await expect(component(page, SCREEN).getByTestId('copilot-proposal')).toHaveCount(0);
      expect(await component(page, SCREEN).getByTestId('component-current-data').innerText()).toBe(before);
    } finally {
      await relay.close();
    }
  });
});

test.describe('FR-280 案の反映', () => {
  // FR-280 AC-721
  test('FR-280 AC-721 保存データを持つコンポーネントの案を編集して「反映」を押すと表示が案の内容に変わり、再読み込みしても復元される', async ({ page, start }) => {
    const relay = await startReviewStub();
    try {
      await setup(page, start, relay.url);
      await runAnalysis(page);
      const edited = '反映する編集後の案';
      const comp = component(page, SCREEN);
      await comp.getByTestId('copilot-proposal').getByRole('textbox', { name: /案/ }).fill(edited);
      await comp.getByTestId('copilot-proposal').getByRole('button', { name: '反映' }).click();
      await expect(comp.getByTestId('component-current-data')).toContainText(edited);
      await reloadAndEnter(page);
      await openScreen(page, SCREEN);
      await expect(component(page, SCREEN).getByTestId('component-current-data')).toContainText(edited);
    } finally {
      await relay.close();
    }
  });
});

test.describe('FR-282 Foundry の接続設定', () => {
  // FR-282 AC-725 NFR-SEC-012
  test('FR-282 AC-725 設定画面に接続設定の欄があり、保存・変更・削除ができ「設定済み」「未設定」と示され、キーボードだけで操作でき、各欄がアクセシブルな名前を持つ', async ({ page, start }) => {
    const relay = await startReviewStub({ configured: false });
    try {
      await start({ relayUrl: relay.url });
      await selectPersona(page, '事業部門');
      const settings = await openScreen(page, 'settings');
      const f = settings.getByTestId('foundry-settings');
      await expect(f).toBeVisible();
      for (const name of [/エンドポイント/, /デプロイ名/, /認証方式/, /API キー/]) {
        await expect(f.getByLabel(name).first(), `欄 ${name} がアクセシブルな名前を持たない`).toBeVisible();
      }
      await expect(f.getByTestId('foundry-status')).toContainText('未設定');
      // キーボードだけで入力・保存
      await f.getByLabel(/エンドポイント/).focus();
      await page.keyboard.type('https://example.invalid/');
      await page.keyboard.press('Tab');
      await page.keyboard.type('dummy-deploy');
      await f.getByLabel(/API キー/).focus();
      await page.keyboard.type('dummy-key-for-system-test-0000');
      const save = f.getByRole('button', { name: /保存/ }).first();
      await save.focus();
      await page.keyboard.press('Enter');
      await expect(f.getByTestId('foundry-status')).toContainText('設定済み');
      await expect(settingsDialog(page)).not.toContainText('dummy-key-for-system-test-0000');
      // 削除
      const del = f.getByRole('button', { name: /削除/ }).first();
      await del.focus();
      await page.keyboard.press('Enter');
      await expect(f.getByTestId('foundry-status')).toContainText('未設定');
    } finally {
      await relay.close();
    }
  });
});

test.describe('FR-283 未設定のときの実行', () => {
  // FR-283 AC-727
  test('FR-283 AC-727 接続設定が未設定のまま「Copilot で分析実行」を押すと、呼び出しは 0 回で、未設定と設定画面への案内が示され、表示とデータは変わらない', async ({ page, start }) => {
    const relay = await startReviewStub({ configured: false });
    try {
      await start({ relayUrl: relay.url });
      await selectPersona(page, '事業部門');
      await recordExportConsent(page);
      await openScreen(page, SCREEN);
      const comp = component(page, SCREEN);
      const before = await comp.getByTestId('component-current-data').innerText();
      await runButton(page).click();
      const msg = page.getByRole('alert').or(page.getByRole('status')).filter({ hasText: /未設定/ }).first();
      await expect(msg).toBeVisible();
      await expect(msg).toContainText(/設定画面|設定を開く|設定/);
      await expect(page.getByRole('button', { name: /設定を開く|設定画面/ }).or(page.getByRole('link', { name: /設定/ })).first()).toBeVisible();
      expect(reviewCalls(relay), '未設定なのに Foundry への呼び出しがあった').toBe(0);
      await expect(proposals(page)).toHaveCount(0);
      expect(await comp.getByTestId('component-current-data').innerText()).toBe(before);
    } finally {
      await relay.close();
    }
  });
});
