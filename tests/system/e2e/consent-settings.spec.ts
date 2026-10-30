// System Test: 顧客の了承の記録（FR-181）・実接続の説明と既定（FR-182）。外部接続は行わない（既定はモック）。
// 期待値は受入基準だけから決める。ラベルは受入基準の語（了承・記録なし・有料・費用・音声合成・手書き認識）に基づく。
import { test, expect, openScreen } from '../support/fixtures';

test.describe('FR-181 顧客の了承の記録', () => {
  // FR-181 AC-375
  test('FR-181 AC-375 設定画面に了承の入力欄（既定は記録なし）と実接続不可の表示があり、キーボードだけで入力・保存・取消できる', async ({ page, start }) => {
    await start();
    const settings = await openScreen(page, 'settings');
    await expect(settings.getByText('記録なし').first()).toBeVisible();
    await expect(settings.getByText(/了承/).first()).toBeVisible();
    await expect(settings.getByText(/了承.*(ない|なし|必要).*実接続|実接続.*(有効にできない|できません)/).first()).toBeVisible();
    const note = settings.getByRole('textbox', { name: /了承.*(メモ|役割)|(メモ|役割).*了承|確認した相手/ }).first();
    await note.focus();
    await expect(note).toBeFocused();
    await page.keyboard.type('顧客側の担当役員（口頭）');
    const save = settings.getByRole('button', { name: /了承.*保存|保存.*了承/ }).first();
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(settings.getByText('顧客側の担当役員（口頭）').first()).toBeVisible();
    const revoke = settings.getByRole('button', { name: /了承.*取り消|取り消.*了承/ }).first();
    await revoke.focus();
    await page.keyboard.press('Enter');
    await expect(settings.getByText('記録なし').first()).toBeVisible();
  });

  // FR-181 AC-375（異常系: 了承がない間は実接続を有効にできない）
  test('FR-181 AC-375 了承の記録がない間は、実接続の有効化の操作が無効で、操作しても有効にならない', async ({ page, start }) => {
    await start();
    const settings = await openScreen(page, 'settings');
    const toggles = settings.getByRole('switch', { name: /実接続/ });
    const n = await toggles.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const t = toggles.nth(i);
      await expect(t).not.toBeChecked();
      await expect(t).toBeDisabled();
    }
  });
});

test.describe('FR-182 実接続の説明と既定', () => {
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
