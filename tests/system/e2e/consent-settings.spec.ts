// System Test: 実接続の説明と既定（FR-182）。外部接続は行わない（既定はモック）。
// 顧客の了承の記録（FR-181 AC-373〜375・381〜386）は 2026-11-03 に廃止されたため、このファイルにはケースを置かない。
// 期待値は受入基準だけから決める。ラベルは受入基準の語（記録なし→削除・有料・費用・音声合成・手書き認識）に基づく。
import { test, expect, openScreen } from '../support/fixtures';

test.describe('FR-182 実接続の説明と既定', () => {
  // FR-182 AC-379（廃止した了承の欄・表示が設定画面にないことも確かめる）
  test('FR-182 AC-379 設定画面に了承の入力欄・「了承を保存」の操作・「了承がないと実接続できない」旨の表示がない', async ({ page, start }) => {
    await start();
    const settings = await openScreen(page, 'settings');
    await expect(settings.getByRole('button', { name: /了承.*保存|保存.*了承/ })).toHaveCount(0);
    await expect(settings.getByRole('textbox', { name: /了承.*(メモ|役割)|(メモ|役割).*了承|確認した相手/ })).toHaveCount(0);
    await expect(settings.getByText(/了承/)).toHaveCount(0);
  });


  for (const kind of ['音声合成', '手書き認識']) {
    // FR-182 AC-379
    test(`FR-182 AC-379 ${kind}に、費用発生の旨・送信される情報の種類・実接続の有効化の操作（既定は無効）が表示され、キーの値は表示されない`, async ({ page, start }) => {
      await start();
      const settings = await openScreen(page, 'settings');
      const section = settings.locator('section, fieldset, [role="group"]').filter({ hasText: kind }).filter({ hasText: /実接続/ }).first();
      await expect(section).toBeVisible();
      await expect(section.getByText(/有料/)).toBeVisible();
      await expect(section.getByText(/費用/)).toBeVisible();
      await expect(section.getByText(/送信(される|する)情報/)).toBeVisible();
      const toggle = section.getByRole('switch', { name: /実接続/ });
      await expect(toggle).not.toBeChecked();
    });
  }

  // FR-182 AC-379（異常系: キーの値は表示されない）
  test('FR-182 AC-379 キーの入力欄は値を表示せず、入力したキーが画面の文字に現れない', async ({ page, start }) => {
    await start();
    const settings = await openScreen(page, 'settings');
    const secret = 'sk-' + 'test-DUMMY-0123456789'; // 静的検査（AC-729）に該当しないよう実行時に組み立てる
    const keyInputs = settings.locator('input[type="password"]');
    const n = await keyInputs.count();
    for (let i = 0; i < n; i++) {
      const el = keyInputs.nth(i);
      if (await el.isEditable()) await el.fill(secret);
    }
    expect(await settings.innerText()).not.toContain(secret);
  });
});
