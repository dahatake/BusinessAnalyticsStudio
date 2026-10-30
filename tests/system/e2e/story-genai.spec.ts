// System Test: プレゼンテーション — 生成 AI によるストーリーのその場での作成（FR-290 AC-775）
// 期待値は要求定義書の受入基準（docs/requirements/app-experience.md の FR-290 AC-775、FR-177 の①〜④、FR-275 の接続先）だけから決める。
// 画面の探し方は CONTRACT.md §12（ストーリー）と §31（生成 AI で作成）。生成AIの接続先は差し替え部品（support/genai-relay.ts）。
// AC-785（integration）は企業の許可との結合を、実物の中継と差し替え部品で確かめる（末尾の describe）。
// AC-776・AC-777 は検証レベル integration（結合テストの範囲）。ここでは AC-775 の異常系として「条件が欠けると呼ばない・代替で開始できる」だけを確かめる。
import type { Locator, Page } from '@playwright/test';
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

// ---- FR-290 AC-785: 企業の外部 AI への送信の許可（FR-140）と生成 AI の作成 ----
// 期待値は AC-785 の本文だけから決める。企業・Project の画面の探し方は CONTRACT.md §8・§15（region「企業 <企業名>」・「Project を作成」・Project の link・「メイン画面へ戻る」）。
// 企業の許可の操作は、region「企業 <企業名>」の中の checkbox「外部 AI への送信を許可する」（FR-140 AC-219）。
const CO_DENY = '不許可合成社QA85';
const PJ_DENY = '不許可案件QA85';
const CO_ALLOW = '許可合成社QB96';
const PJ_ALLOW = '許可案件QB96';
const WAIT_BETWEEN_MS = 5_500; // PARAM-116（5 秒）以上あける（AC-777 の間隔の制限に当たらないように）

async function registerCompany(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '企業を登録' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: '企業名' }).fill(name);
  await dlg.getByRole('button', { name: '登録' }).click();
  await expect(dlg).toBeHidden();
}

/** region「企業 <企業名>」。分析画面で見えなければ「メイン画面へ戻る」で戻ってから探す */
async function companyRegion(page: Page, company: string) {
  const region = page.getByRole('region', { name: `企業 ${company}` });
  if (!(await region.isVisible().catch(() => false))) {
    const back = page.getByRole('button', { name: 'メイン画面へ戻る' });
    if (await back.isVisible().catch(() => false)) await back.click();
  }
  await expect(region).toBeVisible();
  return region;
}

async function createProject(page: Page, company: string, name: string): Promise<void> {
  await (await companyRegion(page, company)).getByRole('button', { name: 'Project を作成' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: 'Project 名' }).fill(name);
  await dlg.getByRole('button', { name: '作成' }).click();
  await expect(dlg).toBeHidden();
}

async function openProject(page: Page, company: string, name: string): Promise<void> {
  await (await companyRegion(page, company)).getByRole('link', { name }).click();
  await expect(page.getByTestId('stepper')).toBeVisible();
}

function aiAllowedBox(region: Locator): Locator {
  return region.getByRole('checkbox', { name: /外部 ?AI への送信を許可/ });
}

/** 「生成 AI で作成」の後に出うる確認（材料の種類の再確認・種別「人」の確認）を、出ていれば進める */
async function passOptionalConfirms(page: Page): Promise<void> {
  const reconfirm = page.getByRole('alertdialog').or(page.getByRole('dialog').filter({ hasText: /再確認|送信される情報|増え/ })).filter({ hasNotText: 'ペルソナの選択' }).last();
  if (await reconfirm.isVisible({ timeout: 1_500 }).catch(() => false)) {
    const ok = reconfirm.getByRole('button', { name: /確認|同意|続行|有効にする/ }).first();
    if (await ok.isVisible().catch(() => false)) await ok.click();
  }
  await continuePersonConfirm(page, () => false, 1_500);
}

/** 呼び出しの本文を、JSON ならエスケープを戻した文字列にする */
function bodyText(c: { body: string }): string {
  try {
    return JSON.stringify(JSON.parse(c.body));
  } catch {
    return c.body;
  }
}

/** 企業の許可がないので生成 AI を呼ばず、理由と「生成 AI を使わずに開始」が示されることを確かめる */
async function expectDeniedByCompany(page: Page): Promise<void> {
  await beginStory(page, true);
  await passOptionalConfirms(page);
  const err = page.getByTestId('story-genai-error');
  await expect(err, '企業が外部 AI への送信を許可していない理由が示されない').toBeVisible({ timeout: 15_000 });
  await expect(err).toContainText(/許可/);
  await expect(page.getByRole('button', { name: '生成 AI を使わずに開始' })).toBeVisible();
}

test.describe('FR-290 生成 AI の作成と企業の外部 AI への送信の許可（FR-140）', () => {
  // FR-290 AC-785
  test('FR-290 AC-785 FR-275 の条件をそろえても、外部 AI への送信を許可していない企業（既定）の Project では呼び出し 0 回で理由と「生成 AI を使わずに開始」が示され、許可した企業の Project では選んでいる接続先だけが 1 回呼ばれ入力に他方の企業・Project を含まず、許可を取り消すと次の作成から 0 回になる', async ({ page, start }) => {
    test.setTimeout(240_000);
    const g = await startGenaiRelay({ foundryText: storyText(F), copilotText: storyText(C), delayMs: 1_000 });
    try {
      await g.saveFoundryConfig();
      await start({ relayUrl: g.url });
      // FR-275 の条件: 了承の記録・接続先（Microsoft Foundry）・接続情報・実接続の有効化と確認。「人」の確認は作成時に出れば進める
      await recordExportConsent(page);
      await chooseProvider(page, 'foundry');
      await enableCommonConnection(page);

      // 2 つの企業と Project。企業の既定は許可なし
      await registerCompany(page, CO_DENY);
      await createProject(page, CO_DENY, PJ_DENY);
      await registerCompany(page, CO_ALLOW);
      await createProject(page, CO_ALLOW, PJ_ALLOW);
      await expect(aiAllowedBox(await companyRegion(page, CO_DENY)), '企業の既定が「許可」になっている').not.toBeChecked();
      const allowBox = aiAllowedBox(await companyRegion(page, CO_ALLOW));
      await expect(allowBox, '企業の既定が「許可」になっている').not.toBeChecked();
      await allowBox.check();
      await expect(allowBox).toBeChecked();

      // 許可していない企業の Project: 呼び出し 0 回、理由と「生成 AI を使わずに開始」。それで FR-179 のストーリーが始まる
      await openProject(page, CO_DENY, PJ_DENY);
      await expectDeniedByCompany(page);
      await page.getByRole('button', { name: '生成 AI を使わずに開始' }).click();
      await expect(page.getByTestId('story-scene')).toBeVisible({ timeout: 15_000 });
      await endStory(page);
      expect(g.foundryCalls.length, '許可していない企業の Project で Microsoft Foundry が呼ばれた').toBe(0);
      expect(g.copilotCalls.length, '許可していない企業の Project で GitHub Copilot SDK が呼ばれた').toBe(0);

      // 許可した企業の Project: 選んでいる接続先（Microsoft Foundry）だけが 1 回呼ばれる
      await page.waitForTimeout(WAIT_BETWEEN_MS);
      await openProject(page, CO_ALLOW, PJ_ALLOW);
      await beginStory(page, true);
      await passOptionalConfirms(page);
      await expect(page.getByTestId('story-scene')).toBeVisible({ timeout: 30_000 });
      const story = page.getByTestId('story');
      await expect(story, '「AI 生成」の表示がない').toContainText('AI 生成');
      await expect(story, '使った接続先の名前がない').toContainText('Microsoft Foundry');
      await endStory(page);
      expect(g.foundryCalls.length, '許可した企業の Project で Microsoft Foundry がちょうど 1 回呼ばれない').toBe(1);
      expect(g.copilotCalls.length, '選んでいない GitHub Copilot SDK が呼ばれた').toBe(0);
      // 受け取った入力: 選んだペルソナを含み、もう一方の企業・Project の名称を含まない
      const input = bodyText(g.foundryCalls[0]);
      expect(input, '選んだペルソナが入力にない').toContain('経営層');
      for (const other of [CO_DENY, PJ_DENY, 'QA85']) {
        expect(input, `もう一方の企業・Project の名称「${other}」が入力に含まれた`).not.toContain(other);
      }

      // 許可を取り消すと、次の作成から呼び出しは 0 回
      const revoke = aiAllowedBox(await companyRegion(page, CO_ALLOW));
      await revoke.uncheck();
      await expect(revoke).not.toBeChecked();
      await page.waitForTimeout(WAIT_BETWEEN_MS);
      await openProject(page, CO_ALLOW, PJ_ALLOW);
      await expectDeniedByCompany(page);
      expect(g.foundryCalls.length, '許可を取り消した後に Microsoft Foundry が呼ばれた').toBe(1);
      expect(g.copilotCalls.length, '許可を取り消した後に GitHub Copilot SDK が呼ばれた').toBe(0);
    } finally {
      await g.close();
    }
  });
});
