// System Test: ユースケースの「ストーリー動画」の生成AIによる作成と表示（FR-291 AC-778）。
// 期待値は要求定義書の受入基準（docs/requirements/app-experience.md）だけから決める。生成AIは呼ばない（中継の差し替え部品 support/ai-import-stub.ts）。
// 画面の探し方は tests/system/CONTRACT.md §32。
import type { Page } from '@playwright/test';
import { test, expect, recordExportConsent, openScreen, closeSettings, continuePersonConfirm } from '../support/fixtures';
import { startAiImportRelayStub } from '../support/ai-import-stub';
import type { AiImportRelayStub } from '../support/ai-import-stub';

const COMPANY = '合成株式会社SV';
const PROJECT = 'SV案件';

interface UseCase { name: string; summary: string; persona: string; steps: { title: string; desc: string }[]; effect: string }
const UC_A: UseCase = {
  name: '受注処理の自動化', summary: '受注入力を減らす', persona: '現場担当者',
  steps: [1, 2, 3].map((i) => ({ title: `A手順${i}`, desc: `A説明${i}` })),
  effect: '入力時間が半分になる',
};
const UC_B: UseCase = {
  name: '請求書の確認', summary: '確認の抜けを防ぐ', persona: '経理担当者',
  steps: [1, 2, 3, 4].map((i) => ({ title: `B手順${i}`, desc: `B説明${i}` })),
  effect: '抜けがなくなる',
};

async function openProjectWithUseCases(page: Page): Promise<void> {
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
  const editor = page.getByTestId('usecase-editor');
  await expect(editor).toBeVisible();
  for (const uc of [UC_A, UC_B]) {
    await editor.getByRole('button', { name: 'ユースケースを追加' }).click();
    const f = page.getByRole('dialog', { name: 'ユースケース' });
    await f.getByRole('textbox', { name: '名称' }).fill(uc.name);
    await f.getByRole('textbox', { name: '概要' }).fill(uc.summary);
    await f.getByRole('textbox', { name: '対象ペルソナ' }).fill(uc.persona);
    await f.getByRole('textbox', { name: '期待する効果' }).fill(uc.effect);
    for (let i = 0; i < uc.steps.length; i++) {
      await f.getByRole('button', { name: '手順を追加' }).click();
      await f.getByRole('textbox', { name: `手順 ${i + 1} の見出し` }).fill(uc.steps[i].title);
      await f.getByRole('textbox', { name: `手順 ${i + 1} の説明` }).fill(uc.steps[i].desc);
    }
    await f.getByRole('button', { name: '保存' }).click();
    await expect(f).toBeHidden();
  }
}

test.describe('FR-291 ユースケースのストーリー動画（AI 生成・差し替え部品）', () => {
  let relay: AiImportRelayStub;
  test.afterEach(async () => { await relay?.close(); });

  // FR-291 AC-778 / AC-784
  test('FR-291 AC-778 AC-784 単価未入力なら案内して呼び出し 0 回、設定画面で単価を保存後、A で「ストーリー動画を作る」を実行すると、A だけの順序つきシーンのストーリーボードと隔離表示枠のアニメーションが出て再生・一時停止でき、作成だけでは呼び出し 0 回・確認前も 0 回', async ({ page, start }) => {
    relay = await startAiImportRelayStub({ configured: true, enabled: true });
    await start({ relayUrl: relay.url });
    await openProjectWithUseCases(page);
    await recordExportConsent(page);
    // 了承の記録で実接続の有効化が外れるため、設定画面で改めて有効にする（FR-275）
    const settings = await openScreen(page, 'settings');
    await settings.getByTestId('foundry-settings').getByRole('switch', { name: '実接続を有効にする', exact: true }).click();
    await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: '有効にする' }).click();
    await expect(settings.getByTestId('foundry-mode')).toContainText('接続済み');
    await closeSettings(page);
    await page.getByTestId('stepper').getByRole('button', { name: 'ユースケース作成' }).click();
    // ユースケースを作成しただけでは生成AIの呼び出しは 0 回
    await page.waitForTimeout(500);
    expect(relay.storyVideoCalls()).toBe(0);

    const itemA = page.getByTestId('usecase-list').getByRole('listitem').filter({ hasText: UC_A.name });
    // FR-291 AC-784 単価が未入力なら作成を始めず、設定画面での入力を案内し、呼び出し 0 回（確認も出ない）
    await itemA.getByRole('button', { name: 'ストーリー動画を作る' }).click();
    await expect(page.getByText('単価が未入力')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'ストーリー動画の作成の確認' })).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(relay.storyVideoCalls()).toBe(0);
    // 設定画面で単価を保存してから作成する
    const settings2 = await openScreen(page, 'settings');
    const prices = settings2.getByTestId('story-video-prices');
    await prices.getByRole('textbox', { name: 'ストーリー動画の単価・入力（円／100万トークン）' }).fill('500');
    await prices.getByRole('textbox', { name: 'ストーリー動画の単価・出力（円／100万トークン）' }).fill('2000');
    await prices.getByRole('button', { name: '単価を保存' }).click();
    await expect(prices).toContainText('単価を保存しました');
    await closeSettings(page);
    await page.getByTestId('stepper').getByRole('button', { name: 'ユースケース作成' }).click();
    await itemA.getByRole('button', { name: 'ストーリー動画を作る' }).click();
    // 実行前に見積りと上限（1,000 円）が示され、確認までは呼び出し 0 回
    const dlg = page.getByRole('dialog', { name: 'ストーリー動画の作成の確認' });
    await expect(dlg.getByTestId('story-video-estimate')).toContainText('円');
    await expect(dlg.getByTestId('story-video-estimate')).toContainText('1,000 円');
    await page.waitForTimeout(300);
    expect(relay.storyVideoCalls()).toBe(0);
    await dlg.getByRole('button', { name: '実行' }).click();
    // 種別「人」の確認（FR-219）が出たら続行する
    await continuePersonConfirm(page, () => false, 1000);

    // ストーリーボード: A の手順 3 件が順序どおり。場面・登場する人・困りごと・実現後の変化がある
    const board = page.getByTestId('story-video-storyboard');
    await expect(board).toBeVisible();
    const scenes = board.getByRole('listitem');
    await expect(scenes).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const t = (await scenes.nth(i).innerText()).replace(/\s+/g, ' ');
      expect(t).toContain(`A手順${i + 1}`);
      expect(t).toContain(UC_A.persona);
      expect(t).toMatch(/場面/);
      expect(t).toMatch(/困りごと/);
      expect(t).toMatch(/実現後の変化/);
    }
    await expect(page.getByTestId('story-video-status')).toContainText('最新');

    // アニメーション: 隔離した表示枠（sandbox。同一オリジンの許可なし）に表示される
    const frame = page.getByTestId('story-video-frame');
    await expect(frame).toBeVisible();
    const sandbox = (await frame.getAttribute('sandbox')) ?? '';
    expect(await frame.getAttribute('sandbox')).not.toBeNull();
    expect(sandbox).not.toContain('allow-same-origin');
    await expect(page.frameLocator('[data-testid="story-video-frame"]').getByTestId('story-svg')).toBeVisible();

    // 再生・一時停止
    await page.getByRole('button', { name: 'ストーリー動画を再生' }).click();
    await expect(page.getByTestId('story-video-state')).toContainText('再生中');
    await page.getByRole('button', { name: 'ストーリー動画を一時停止' }).click();
    await expect(page.getByTestId('story-video-state')).toContainText('一時停止中');

    // B の手順の内容は、画面にも生成AIへの送信にも含まれない
    const shown = await page.getByTestId('story-video-storyboard').innerText();
    expect(shown).not.toContain('B手順');
    expect(shown).not.toContain('B説明');
    const sent = relay.received.filter((r) => r.path === '/foundry/story-video').map((r) => r.body).join('\n');
    expect(sent).toContain('A手順1');
    expect(sent).not.toContain('B手順');
    expect(sent).not.toContain('dummy-key');
    expect(relay.storyVideoCalls()).toBeGreaterThan(0);
  });
});
