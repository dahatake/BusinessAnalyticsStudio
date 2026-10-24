// System Test: 「現状の説明」ボタンとサイドパネル・Foundry 接続設定・課金の安全策の表示・AI が使えないときの代替説明
// 期待値は要求定義書の受入基準（docs/requirements/app-core.md の FR-274 AC-699・AC-702、FR-275 AC-703、FR-276 AC-712、FR-277 AC-713）だけから決める。
// 画面の探し方は CONTRACT.md §25（button「現状の説明」、complementary「現状の説明」＝data-testid="explain-panel"、設定の Foundry 欄・利用量の欄）。
import type { Page, Locator } from '@playwright/test';
import { test, expect, selectPersona, openScreen, settingsDialog } from '../support/fixtures';
import { startRelayStub } from '../support/relay-stub';
const explainButton = (page: Page): Locator => page.getByRole('button', { name: '現状の説明', exact: true }).first();
const explainPanel = (page: Page): Locator => page.getByTestId('explain-panel');

test.describe('FR-274 現状の説明（サイドパネル）', () => {
  // FR-274 AC-699
  test('FR-274 AC-699 画面上部に読み取り専用のボタン「現状の説明」が見え、押すとサイドパネルが開き、本体を隠さず、キーボードだけで開閉でき、Esc で閉じて焦点がボタンに戻る', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const table = await openScreen(page, 'table');

    const btn = explainButton(page);
    await expect(btn).toBeVisible();
    // 画面の上部（ヘッダー帯）にある
    const box = (await btn.boundingBox())!;
    expect(box.y, 'ボタンが画面上部にない').toBeLessThan(200);

    // キーボードだけで開く
    await btn.focus();
    await page.keyboard.press('Enter');
    const panel = explainPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/AI は使えません|AI 生成/).first()).toBeVisible();

    // 画面の本体を隠さない（本体は見えたまま、パネルと重ならない）
    await expect(table).toBeVisible();
    const tb = (await table.boundingBox())!;
    const pb = (await panel.boundingBox())!;
    const overlapX = Math.min(tb.x + tb.width, pb.x + pb.width) - Math.max(tb.x, pb.x);
    expect(overlapX, '本体とサイドパネルが重なっている').toBeLessThanOrEqual(1);

    // Esc で閉じて焦点がボタンに戻る
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(btn).toBeFocused();

    // 再度開き、閉じるボタンでも閉じて焦点がボタンに戻る
    await btn.click();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: /閉じる/ }).click();
    await expect(panel).toBeHidden();
    await expect(btn).toBeFocused();
  });

  // FR-274 AC-702
  test('FR-274 AC-702 画面を切り替えると、サイドパネルは新しい画面の情報で作り直す操作を示し、前の画面の説明を新しい画面の説明として表示し続けない', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    await openScreen(page, 'table');
    await explainButton(page).click();
    const panel = explainPanel(page);
    await expect(panel).toBeVisible();
    const before = await panel.getByTestId('explain-body').innerText();
    expect(before.trim().length, '説明の本文が空').toBeGreaterThan(0);

    await openScreen(page, 'issue-solution');
    await expect(panel).toBeVisible();
    // 作り直す操作が示され、前の画面の説明本文は残らない
    await expect(panel.getByRole('button', { name: /作り直|再生成|もう一度|更新/ }).first()).toBeVisible();
    await expect(panel.getByTestId('explain-body')).not.toHaveText(before);
    await expect(panel).toHaveAttribute('data-screen', /issue-solution/);
  });
});

test.describe('FR-275 Microsoft Foundry の接続設定', () => {
  // FR-275 AC-703
  test('FR-275 AC-703 設定画面に Foundry の欄（エンドポイント・デプロイ名・API キー）があり、キーは伏せ字・保存後は「設定済み」だけで再表示せず、変更と削除ができ、実接続の既定は無効で、費用と送信情報の種類が表示される', async ({ page, start }) => {
      // FR-275: 接続情報の保存先は中継側だけ。stub の中継（GET/PUT/DELETE /foundry/config）に向けて保存→設定済みを確かめる
      const relay = await startRelayStub();
      try {
      await start({ relayUrl: relay.url });
      await selectPersona(page, '事業部門');
      const settings = await openScreen(page, 'settings');
      const foundry = settings.getByTestId('foundry-settings');
    await expect(foundry).toBeVisible();
    // 設定パネルは共通接続の 1 つだけ（FR-275 の改訂 2026-10-22）。見出しと共通の旨の説明。独自のパネルはない
    await expect(settings.getByTestId('foundry-settings')).toHaveCount(1);
    await expect(settings.getByRole('region', { name: 'Microsoft Foundry（生成AI機能の共通接続）' })).toHaveCount(1);
    await expect(settings.getByText('Microsoft Foundry（生成AI機能の共通接続）').first()).toBeVisible();
    await expect(foundry).toContainText(/共通/);
    await expect(foundry).toContainText(/現状の説明/);
    await expect(foundry).toContainText(/活用シナリオ/);
    await expect(settings.getByRole('region', { name: '生成AIの活用分析の接続' })).toHaveCount(0);
    await expect(settings.getByText(/生成AIの効果的な活用シナリオの分析（Microsoft Foundry）/)).toHaveCount(0);
    await expect(settings.getByRole('textbox', { name: 'エンドポイント', exact: true })).toHaveCount(1);
    await expect(settings.getByRole('textbox', { name: 'デプロイ名', exact: true })).toHaveCount(1);
    await expect(settings.getByRole('switch', { name: '実接続を有効にする', exact: true }).or(settings.getByRole('checkbox', { name: /Foundry.*(実接続|有効)/ }))).toHaveCount(1);
    await expect(foundry.getByLabel(/エンドポイント/)).toBeVisible();
    await expect(foundry.getByLabel(/デプロイ名/)).toBeVisible();
    const key = foundry.getByLabel(/API キー/);
    await expect(key).toBeVisible();
    await expect(key).toHaveAttribute('type', 'password');

    // 実接続の既定は無効
    const enable = foundry.getByRole('checkbox', { name: /実接続|有効/ }).or(foundry.getByRole('switch', { name: /実接続|有効/ })).first();
    await expect(enable).not.toBeChecked();
    // 有料サービスで費用が発生する旨と、送信される情報の種類
    await expect(foundry).toContainText(/有料/);
    await expect(foundry).toContainText(/費用/);
    await expect(foundry).toContainText(/課題/);
    await expect(foundry).toContainText(/KPI/);
    await expect(foundry).toContainText(/OKR/);
    // AC-703（改訂）: チャットの質問・直近の履歴・顧客パックの根拠も送信される情報として示される
    await expect(foundry).toContainText(/質問/);
    await expect(foundry).toContainText(/履歴/);
    await expect(foundry).toContainText(/根拠/);

    // ダミーのキーを保存すると「設定済み」だけが表示され、値は再表示されない
    const dummy = 'dummy-key-for-system-test-0000';
    await foundry.getByLabel(/エンドポイント/).fill('https://dummy.openai.azure.com/openai/v1');
    await foundry.getByLabel(/デプロイ名/).fill('dummy-deploy');
    await key.fill(dummy);
    await foundry.getByRole('button', { name: /保存/ }).first().click();
    await expect(foundry.getByText('設定済み').first()).toBeVisible();
    await expect(settingsDialog(page)).not.toContainText(dummy);
    expect(await foundry.getByLabel(/API キー/).inputValue()).not.toContain(dummy);
    // キーはマスク表示（末尾以外は伏せ字）で、保存したキーは中継へだけ送られている
    await expect(foundry.getByTestId('foundry-key-mask')).toBeVisible();
    await expect(foundry.getByTestId('foundry-key-mask')).not.toContainText(dummy);
    expect(relay.received.some((r) => r.method === 'PUT' && r.path === '/foundry/config' && r.body.includes(dummy))).toBe(true);

    // 変更（新しいキーで保存し直す）と削除をいつでもできる
    const changed = 'dummy-key-for-system-test-1111';
    await foundry.getByLabel(/API キー/).fill(changed);
    await foundry.getByRole('button', { name: /保存/ }).first().click();
    await expect(foundry.getByTestId('foundry-key-mask')).toContainText('1111');
    await expect(settingsDialog(page)).not.toContainText(changed);
    await foundry.getByRole('button', { name: /削除/ }).first().click();
    await expect(foundry.getByText('設定済み')).toHaveCount(0);
    await expect(foundry.getByTestId('foundry-status')).toContainText('未設定');
    } finally {
      await relay.close();
    }
  });
});

test.describe('FR-276 課金の安全策の表示', () => {
  // FR-276 AC-712
  test('FR-276 AC-712 設定画面に当日の回数と上限・今月の概算費用と予算・警告と停止の状態・単価が表示され、上限と予算を上げる変更では確認が求められる', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const settings = await openScreen(page, 'settings');
    const usage = settings.getByTestId('ai-usage');
    await expect(usage).toBeVisible();
    await expect(usage).toContainText(/当日|本日|今日/);
    await expect(usage).toContainText(/上限/);
    await expect(usage).toContainText(/概算/);
    await expect(usage).toContainText(/予算/);
    await expect(usage).toContainText(/警告/);
    await expect(usage).toContainText(/停止/);
    await expect(usage).toContainText(/単価/);

    // 上限を上げる変更では確認が求められる
    const limit = usage.getByLabel(/1 日.*(上限|回数)|(上限|回数).*1 日/).first();
    await expect(limit).toBeVisible();
    const current = Number(await limit.inputValue());
    expect(Number.isFinite(current)).toBe(true);
    await limit.fill(String(current + 1));
    await usage.getByRole('button', { name: /保存|適用/ }).first().click();
    await expect(page.getByRole('alertdialog').or(page.getByRole('dialog', { name: /確認/ })).first()).toBeVisible();
  });
});

test.describe('FR-277 AI が使えないときの代替説明', () => {
  // FR-277 AC-713
  test('FR-277 AC-713 既定の状態で「現状の説明」を押すと、「AI は使えません」と理由が表示され、画面の情報だけの代替説明が出て、外部への呼び出しが 0 回で、押し直しても同じ文面で、AI 生成のラベルは付かない', async ({ page, start }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) && /^https?:$/.test(u.protocol)) external.push(r.url());
    });
    await start();
    await selectPersona(page, '事業部門');
    await openScreen(page, 'issue-solution');

    const panel = explainPanel(page);
    await explainButton(page).click();
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('AI は使えません');
    await expect(panel.getByTestId('explain-reason')).not.toBeEmpty();
    await expect(panel.getByTestId('ai-generated-label')).toHaveCount(0);
    await expect(panel).toContainText(/AI 生成ではない/);
    const first = await panel.getByTestId('explain-body').innerText();
    expect(first.trim().length, '代替の説明が空').toBeGreaterThan(0);

    // 押し直しても同じ文面
    await page.keyboard.press('Escape');
    await explainButton(page).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('explain-body')).toHaveText(first);
    expect(external, `外部への通信: ${external.join(', ')}`).toEqual([]);
  });
});
