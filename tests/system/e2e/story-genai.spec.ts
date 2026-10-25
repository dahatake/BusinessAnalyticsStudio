// System Test: プレゼンテーション — 生成 AI によるストーリーのその場での作成（FR-290 AC-775）
// 期待値は要求定義書の受入基準（docs/requirements/app-experience.md の FR-290 AC-775、FR-177 の①〜④、FR-275 の接続先）だけから決める。
// 画面の探し方は CONTRACT.md §12（ストーリー）と §31（生成 AI で作成）。生成AIの接続先は差し替え部品（support/genai-relay.ts）。
// AC-776・AC-777 は検証レベル integration（結合テストの範囲）。ここでは AC-775 の異常系として「条件が欠けると呼ばない・代替で開始できる」だけを確かめる。
import type { Page } from '@playwright/test';
import { test, expect, recordExportConsent, continuePersonConfirm } from '../support/fixtures';
import { startGenaiRelay, chooseProvider, enableCommonConnection } from '../support/genai-relay';

/** 差し替え部品が返すストーリー（CONTRACT.md §31 の形: scenes[].part・heading・narration） */
function storyText(tag: string): string {
  return JSON.stringify({
    // 材料にない数値を含む文は表示されない（AC-776）ため、見出し・語りに数字を含めない
    scenes: ['A', 'B', 'C', 'D'].map((k, i) => ({ part: i + 1, heading: `${tag}見出し${k}`, narration: `${tag}語り${k}です。` })),
  });
}
const F = 'STFOUNDRY';
const C = 'STCOPILOT';

/** 「プレゼンテーションを開始」→ ペルソナの選択。genai なら「生成 AI で作成」を選ぶ（既定は選ばない） */
async function beginStory(page: Page, genai: boolean, persona = '経営層'): Promise<void> {
  await page.getByRole('button', { name: 'プレゼンテーションを開始' }).click();
  const dlg = page.getByRole('dialog', { name: 'ペルソナの選択' });
  await expect(dlg).toBeVisible();
  const opt = dlg.getByRole('checkbox', { name: '生成 AI で作成' }).or(dlg.getByRole('switch', { name: '生成 AI で作成' }));
  await expect(opt, '「生成 AI で作成」の選択肢がない').toBeVisible();
  await expect(opt, '「生成 AI で作成」が既定で選ばれている').not.toBeChecked();
  if (genai) {
    await opt.click();
    await expect(opt).toBeChecked();
  }
  await dlg.getByRole('button', { name: persona, exact: true }).click();
}

/** → で最後まで進めながら、各シーンの part と文字を集める */
async function collectScenes(page: Page): Promise<Array<{ part: number; text: string }>> {
  const out: Array<{ part: number; text: string }> = [];
  const pos = page.getByTestId('story-position');
  for (let i = 0; i < 60; i++) {
    const s = page.getByTestId('story-scene');
    out.push({ part: Number(await s.getAttribute('data-story-part')), text: (await s.innerText()).trim() });
    const m = /(\d+)\s*\/\s*(\d+)/.exec((await pos.innerText()) ?? '');
    if (!m || Number(m[1]) >= Number(m[2])) break;
    await page.keyboard.press('ArrowRight');
  }
  return out;
}

async function endStory(page: Page): Promise<void> {
  for (let i = 0; i < 3 && (await page.getByTestId('story-scene').count()) > 0; i++) await page.keyboard.press('Escape');
  await expect(page.getByTestId('story-scene')).toHaveCount(0);
}

/** 生成 AI で作成して、作成中の表示の後にストーリーが始まるのを確かめ、シーンを返す */
async function generateAndCheck(page: Page, tag: string, providerName: string): Promise<void> {
  await beginStory(page, true);
  // 有効化で確認した送信情報の種類に FR-290 の材料が含まれていなければ再確認が出る（AC-777）。出たら確認する
  const reconfirm = page.getByRole('alertdialog').or(page.getByRole('dialog').filter({ hasText: /再確認|送信される情報|増え/ })).filter({ hasNotText: 'ペルソナの選択' }).last();
  if (await reconfirm.isVisible({ timeout: 1_500 }).catch(() => false)) {
    const ok = reconfirm.getByRole('button', { name: /確認|同意|続行|有効にする/ }).first();
    if (await ok.isVisible().catch(() => false)) await ok.click();
  }
  const generating = page.getByTestId('story-generating');
  const personConfirm = page.locator('[role="alertdialog"], [role="dialog"]').filter({ hasText: /種別「人」/ }).filter({ hasText: /了承/ });
  await expect(personConfirm.or(generating).first()).toBeVisible();
  await continuePersonConfirm(page, () => false, 1_500);
  // 作成中の進行状況が示される
  await expect(generating, '作成中の進行状況が示されない').toBeVisible();
  await expect(page.getByTestId('story-scene')).toBeVisible({ timeout: 30_000 });
  const story = page.getByTestId('story');
  await expect(story, '「AI 生成」の表示がない').toContainText('AI 生成');
  await expect(story, `使った接続先「${providerName}」の表示がない`).toContainText(providerName);
  // →/← で次／前のシーンへ移れる
  const pos = page.getByTestId('story-position');
  await expect(pos).toContainText(/^\s*1\s*\/\s*\d+/);
  await page.keyboard.press('ArrowRight');
  await expect(pos).toContainText(/^\s*2\s*\/\s*\d+/);
  await page.keyboard.press('ArrowLeft');
  await expect(pos).toContainText(/^\s*1\s*\/\s*\d+/);
  const scenes = await collectScenes(page);
  const parts = scenes.map((s) => s.part);
  const firstIdx = [1, 2, 3, 4].map((p) => parts.indexOf(p));
  expect(firstIdx.every((i) => i >= 0), `①〜④がすべて含まれる（${parts.join(',')}）`).toBe(true);
  expect([...firstIdx].sort((a, b) => a - b), '①〜④の順').toEqual(firstIdx);
  const all = scenes.map((s) => s.text).join('\n');
  expect(all, '差し替え部品が返した見出しがない').toContain(`${tag}見出し`);
  expect(all, '差し替え部品が返した語りの文章がない').toContain(`${tag}語り`);
  expect(all, 'もう一方の接続先の文章が混ざる').not.toContain(tag === F ? C : F);
  await endStory(page);
}

test.describe('FR-290 プレゼンテーション: 生成 AI によるストーリーの作成', () => {
  // FR-290 AC-775
  test('FR-290 AC-775 条件をそろえたデモで「生成 AI で作成」と経営層を選ぶと、作成中の表示の後、選んでいる接続先の差し替え部品だけが呼ばれ、その見出しと語りを含む①〜④のストーリーが「AI 生成」と接続先の名前つきで始まり、→/← で移れ、接続先を切り替えるともう一方だけが呼ばれる', async ({ page, start }) => {
    test.setTimeout(180_000);
    const g = await startGenaiRelay({ foundryText: storyText(F), copilotText: storyText(C), delayMs: 3_000 });
    try {
      await g.saveFoundryConfig();
      await start({ relayUrl: g.url });
      await recordExportConsent(page);
      // 接続先 Microsoft Foundry
      await chooseProvider(page, 'foundry');
      await enableCommonConnection(page);
      await generateAndCheck(page, F, 'Microsoft Foundry');
      expect(g.foundryCalls.length, 'Microsoft Foundry の差し替え部品が呼ばれない').toBeGreaterThan(0);
      expect(g.copilotCalls.length, 'GitHub Copilot SDK が呼ばれた').toBe(0);
      const foundryCount = g.foundryCalls.length;
      // 接続先を GitHub Copilot SDK に切り替える（切替で有効化は解除されるので、確認して再び有効にする。FR-275）
      await chooseProvider(page, 'copilot');
      await enableCommonConnection(page);
      // 前回の作成の開始から PARAM-116（5 秒）以上あける（AC-777 の間隔の制限に当たらないように）
      await page.waitForTimeout(5_500);
      await generateAndCheck(page, C, 'GitHub Copilot');
      expect(g.copilotCalls.length, 'GitHub Copilot SDK の差し替え部品が呼ばれない').toBeGreaterThan(0);
      expect(g.foundryCalls.length, 'Copilot SDK を選んでいるのに Microsoft Foundry が呼ばれた').toBe(foundryCount);
    } finally {
      await g.close();
    }
  });

  // FR-290 AC-775（異常系: 了承の記録がなく実接続も無効のとき。AC-777 の一部と FR-179 の既定）
  test('FR-290 AC-775 異常系: 了承の記録がなく実接続が無効のときに「生成 AI で作成」を選ぶと、どちらの接続先も呼ばれず、理由と「生成 AI を使わずに開始」が示され、それでストーリーが始まる。「生成 AI で作成」を選ばずに開始しても呼ばれない', async ({ page, start }) => {
    const g = await startGenaiRelay({ foundryText: storyText(F), copilotText: storyText(C) });
    try {
      await g.saveFoundryConfig();
      await start({ relayUrl: g.url });
      // 既定（選ばない）: 生成 AI を呼ばずに FR-179 のストーリー
      await beginStory(page, false);
      await expect(page.getByTestId('story-scene')).toBeVisible({ timeout: 15_000 });
      await endStory(page);
      // 「生成 AI で作成」: 条件が欠けるので呼ばず、理由と代替の操作
      await beginStory(page, true);
      const err = page.getByTestId('story-genai-error');
      await expect(err, '生成 AI を使えない理由が示されない').toBeVisible({ timeout: 15_000 });
      await expect(err).toContainText(/了承|有効|接続/);
      const fallback = page.getByRole('button', { name: '生成 AI を使わずに開始' });
      await expect(fallback).toBeVisible();
      await fallback.click();
      await expect(page.getByTestId('story-scene')).toBeVisible({ timeout: 15_000 });
      const scenes = await collectScenes(page);
      expect(scenes.map((s) => s.text).join('\n')).not.toMatch(new RegExp(`${F}|${C}`));
      await endStory(page);
      expect(g.foundryCalls.length, '条件が欠けるのに Microsoft Foundry が呼ばれた').toBe(0);
      expect(g.copilotCalls.length, '条件が欠けるのに GitHub Copilot SDK が呼ばれた').toBe(0);
    } finally {
      await g.close();
    }
  });
});
