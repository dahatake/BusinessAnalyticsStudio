// System Test: 「Copilot で分析実行」と「Copilot の案」（FR-278〜283。AC-715・717・718・719・721・725・727）
// 期待値は要求定義書の受入基準（docs/requirements/app-core.md）だけから決める。Foundry は差し替え部品（support/copilot-review-stub.ts）。
// API キーの値はダミー。画面の探し方は tests/system/CONTRACT.md §26（実装はこれに合わせる）。
import type { Page, Locator } from '@playwright/test';
import { test, expect, selectPersona, openScreen, settingsDialog, closeSettings, recordExportConsent, continuePersonConfirm, component, reloadAndEnter } from '../support/fixtures';
import { startCopilotReviewStub } from '../support/copilot-review-stub';
import type { ReviewStub } from '../support/copilot-review-stub';

const runButton = (page: Page): Locator => page.getByRole('button', { name: 'Copilot で分析実行', exact: true });
const draftOf = (comp: Locator): Locator => comp.getByTestId('copilot-draft');

/** 標準の検証条件: 設定済みの差し替え部品・了承の記録あり・複数のコンポーネントを開いた状態にする */
async function prepare(page: Page, start: (o?: Record<string, unknown>) => Promise<unknown>, relay: ReviewStub): Promise<void> {
  await start({ relayUrl: relay.url });
  await selectPersona(page, '事業部門');
  await recordExportConsent(page);
  await openScreen(page, 'table');
  await openScreen(page, 'issue-solution');
}

/** 実行→送る内容の確認で承認→完了まで待つ */
async function runAnalysis(page: Page): Promise<void> {
  await runButton(page).click();
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog').filter({ hasText: /送信/ })).first();
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.getByRole('button', { name: /送信|実行|続行/ }).first().click();
  }
  await continuePersonConfirm(page);
}

async function bodyWithoutDraft(comp: Locator): Promise<string> {
  return comp.evaluate((el) => {
    const c = el.cloneNode(true) as HTMLElement;
    c.querySelectorAll('[data-testid="copilot-draft"]').forEach((n) => n.remove());
    return c.innerText ?? c.textContent ?? '';
  });
}

test.describe('FR-278 「Copilot で分析実行」', () => {
  // FR-278 AC-715
  test('FR-278 AC-715 画面上部に「Copilot で分析実行」が見え、押すと進行中が表示され、その間もほかのコンポーネントを操作でき、完了すると各コンポーネントに「Copilot の案」が出る。通信先は localhost だけ', async ({ page, start }) => {
    const relay = await startCopilotReviewStub({ delayMs: 1500 });
    const hosts = new Set<string>();
    page.on('request', (r) => { try { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol)) hosts.add(u.hostname); } catch { /* 無視 */ } });
    try {
      await prepare(page, start, relay);
      const btn = runButton(page);
      await expect(btn).toBeVisible();
      expect((await btn.boundingBox())!.y, 'ボタンが画面上部にない').toBeLessThan(200);

      await btn.click();
      const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog').filter({ hasText: /送信/ })).first();
      if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: /送信|実行|続行/ }).first().click();
      await continuePersonConfirm(page);
      // 進行中の表示（状態のメッセージ）
      await expect(page.getByRole('status').filter({ hasText: /実行中|進行中|分析中/ }).first()).toBeVisible();
      // その間もほかのコンポーネントを操作できる（画面が固まらない）
      const other = component(page, 'table');
      await expect(other).toBeVisible();
      await other.click({ position: { x: 5, y: 5 }, trial: true });
      // 完了すると対象の各コンポーネントに案が出る
      await expect(draftOf(component(page, 'issue-solution'))).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('region', { name: /Copilot の案/ }).first()).toBeVisible();
      expect(relay.reviewCalls()).toBe(1);
      for (const h of hosts) expect(['localhost', '127.0.0.1', '[::1]', '::1']).toContain(h);
    } finally {
      await relay.close();
    }
  });
});

test.describe('FR-278 結果の振り分け', () => {
  // FR-278 AC-717
  test('FR-278 AC-717 結果はコンポーネントごとにそのコンポーネントの案としてだけ表示され、案が返らないコンポーネントには「案なし」と文字で示される', async ({ page, start }) => {
    const relay = await startCopilotReviewStub({ omit: ['table'] });
    try {
      await prepare(page, start, relay);
      await runAnalysis(page);
      const keys = relay.requestedKeys();
      expect(keys.length, '送られたコンポーネントがない').toBeGreaterThan(1);
      await expect(draftOf(component(page, 'issue-solution'))).toBeVisible({ timeout: 15_000 });
      // 案が返らなかったコンポーネントは「案なし」
      await expect(component(page, 'table')).toContainText('案なし');
      // 各案は自分のコンポーネントにだけ出る
      for (const k of keys) {
        const comp = component(page, k);
        if ((await comp.count()) === 0 || k === 'table') continue;
        for (const other of keys) {
          if (other === k) continue;
          await expect(comp, `${other} の案が ${k} に出ている`).not.toContainText(`案-${other}-差し替え部品の提案`);
        }
      }
      await expect(component(page, 'issue-solution')).toContainText('案-issue-solution-差し替え部品の提案');
    } finally {
      await relay.close();
    }
  });
});

test.describe('FR-279 「Copilot の案」の表示・編集・破棄', () => {
  // FR-279 AC-718
  test('FR-279 AC-718 完了すると各コンポーネントに「Copilot の案（AI 生成）」の文字のラベルつきで案が現在のデータとは別の欄に出て、表示とアプリが管理するデータは実行前と同じ', async ({ page, start }) => {
    const relay = await startCopilotReviewStub();
    try {
      await prepare(page, start, relay);
      const comp = component(page, 'issue-solution');
      const before = await bodyWithoutDraft(comp);
      const storeBefore = await page.evaluate(() => JSON.stringify({ ...localStorage }));
      await runAnalysis(page);
      const draft = draftOf(comp);
      await expect(draft).toBeVisible({ timeout: 15_000 });
      await expect(draft).toContainText('Copilot の案（AI 生成）');
      expect(await bodyWithoutDraft(comp), '案が現在のデータの欄に混ざった').toBe(before);
      expect(await page.evaluate(() => JSON.stringify({ ...localStorage })), 'アプリが管理するデータが変わった').toBe(storeBefore);
    } finally {
      await relay.close();
    }
  });

  // FR-279 AC-719
  test('FR-279 AC-719 案を編集すると内容が表示され、最小化→元に戻すでも失われない。破棄すると案が消え、表示とデータは実行前と同じ', async ({ page, start }) => {
    const relay = await startCopilotReviewStub();
    try {
      await prepare(page, start, relay);
      const comp = component(page, 'issue-solution');
      const before = await bodyWithoutDraft(comp);
      const storeBefore = await page.evaluate(() => JSON.stringify({ ...localStorage }));
      await runAnalysis(page);
      const draft = draftOf(comp);
      await expect(draft).toBeVisible({ timeout: 15_000 });
      const edit = draft.getByRole('textbox', { name: /案の編集|案/ });
      await edit.fill('編集後の案: 人手のレビュー結果');
      await expect(edit).toHaveValue('編集後の案: 人手のレビュー結果');

      // レイアウトの変更（最小化→元に戻す）で編集内容が失われない
      await comp.click();
      await comp.getByTestId('component-actions').getByRole('button', { name: '最小化' }).click();
      await comp.getByTestId('component-actions').getByRole('button', { name: /元に戻す|通常表示/ }).first().click();
      await expect(draftOf(comp).getByRole('textbox', { name: /案の編集|案/ })).toHaveValue('編集後の案: 人手のレビュー結果');

      // 破棄: 案が消え、表示とデータは実行前と同じ
      await draftOf(comp).getByRole('button', { name: '破棄' }).click();
      await expect(draftOf(comp)).toHaveCount(0);
      expect(await bodyWithoutDraft(comp)).toBe(before);
      expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(storeBefore);
    } finally {
      await relay.close();
    }
  });
});

test.describe('FR-280 案の反映', () => {
  // FR-280 AC-721
  test('FR-280 AC-721 端末内に保存されるデータを持つコンポーネントの案を編集して「反映」を押すと表示が編集後の内容に変わり、再読み込みしても復元される', async ({ page, start }) => {
    const relay = await startCopilotReviewStub();
    try {
      await prepare(page, start, relay);
      const comp = component(page, 'issue-solution');
      await runAnalysis(page);
      const draft = draftOf(comp);
      await expect(draft).toBeVisible({ timeout: 15_000 });
      const edited = '反映する編集後の内容 AC721';
      await draft.getByRole('textbox', { name: /案の編集|案/ }).fill(edited);
      await draft.getByRole('button', { name: '反映', exact: true }).click();
      await expect(comp).toContainText(edited);
      await reloadAndEnter(page);
      await openScreen(page, 'issue-solution');
      await expect(component(page, 'issue-solution'), '再読み込みで反映後の内容が失われた').toContainText(edited);
    } finally {
      await relay.close();
    }
  });
});

test.describe('FR-282 Foundry の接続設定', () => {
  // FR-282 AC-725
  test('FR-282 AC-725 設定に Foundry の接続設定（エンドポイント・デプロイ名・認証方式・API キー）の入力欄があり、保存・変更・削除でき、「設定済み」「未設定」を文字で示す。キーボードだけで操作でき各欄が名前を持つ', async ({ page, start }) => {
    const relay = await startCopilotReviewStub({ configured: false });
    try {
      await start({ relayUrl: relay.url });
      await selectPersona(page, '事業部門');
      const settings = await openScreen(page, 'settings');
      const foundry = settings.getByTestId('foundry-settings');
      await expect(foundry).toBeVisible();
      const endpoint = foundry.getByRole('textbox', { name: /エンドポイント/ });
      const deploy = foundry.getByRole('textbox', { name: /デプロイ名/ });
      const auth = foundry.getByRole('combobox', { name: /認証方式/ }).or(foundry.getByRole('radiogroup', { name: /認証方式/ })).first();
      const key = foundry.getByLabel(/API キー/);
      for (const f of [endpoint, deploy, auth, key]) await expect(f).toBeVisible();
      await expect(foundry.getByTestId('foundry-status')).toContainText('未設定');

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
      await expect(foundry.getByTestId('foundry-status')).toContainText('設定済み');

      // 変更
      await key.fill('dummy-key-for-system-test-1111');
      await save.click();
      await expect(foundry.getByTestId('foundry-status')).toContainText('設定済み');
      // 削除
      const del = foundry.getByRole('button', { name: /削除/ }).first();
      await del.focus();
      await page.keyboard.press('Enter');
      await expect(foundry.getByTestId('foundry-status')).toContainText('未設定');
      await closeSettings(page);
    } finally {
      await relay.close();
    }
  });
});

test.describe('FR-283 未設定のときの動作', () => {
  // FR-283 AC-727
  test('FR-283 AC-727 Foundry の接続設定が未設定のまま「Copilot で分析実行」を押すと、呼び出しは 0 回で、未設定と設定画面への案内が文字で示され、表示とデータは変わらない', async ({ page, start }) => {
    const relay = await startCopilotReviewStub({ configured: false });
    try {
      await prepare(page, start, relay);
      const comp = component(page, 'issue-solution');
      const before = await bodyWithoutDraft(comp);
      const storeBefore = await page.evaluate(() => JSON.stringify({ ...localStorage }));
      await runButton(page).click();
      const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog').filter({ hasText: /送信/ })).first();
      if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: /送信|実行|続行/ }).first().click();
      await expect(page.getByRole('alert').or(page.getByRole('status')).filter({ hasText: /未設定/ }).first()).toBeVisible();
      await expect(page.getByText(/設定画面|設定を開|設定で/).first()).toBeVisible();
      expect(relay.reviewCalls(), '未設定なのに Foundry を呼んだ').toBe(0);
      await expect(draftOf(comp)).toHaveCount(0);
      expect(await bodyWithoutDraft(comp)).toBe(before);
      expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(storeBefore);
    } finally {
      await relay.close();
    }
  });
});
