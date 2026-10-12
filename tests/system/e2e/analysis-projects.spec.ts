// System Test: 分析手法・業務改善ステッパー・企業別 Project 管理
// 期待値は要求定義書の受入基準（docs/requirements/analysis-projects.md）だけから決める。
// 画面の探し方は tests/system/CONTRACT.md §8。AC-207 は BLOCKED（Q-009）のため対象外。
import { test, expect } from '../support/fixtures';
import type { Page, Locator } from '@playwright/test';

const STEPS = ['課題定義', '現状分析', 'KPI 測定', 'ユースケース作成', '施策計画']; // PARAM-030 = 5
const METHODS = ['SWOT 分析', 'ファイブフォース分析', 'バリューチェーン分析', '3C 分析', 'バランスト・スコアカード'];
const REFLECT_MS = 2_000; // PARAM-032 = 2 秒

async function registerCompany(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '企業を登録' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: '企業名' }).fill(name);
  await dlg.getByRole('button', { name: '登録' }).click();
  await expect(dlg).toBeHidden();
}

async function createProject(page: Page, company: string, name: string): Promise<void> {
  await page.getByRole('region', { name: `企業 ${company}` }).getByRole('button', { name: 'Project を作成' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: 'Project 名' }).fill(name);
  await dlg.getByRole('button', { name: '作成' }).click();
  await expect(dlg).toBeHidden();
}

/** 企業と Project を作って Project を開く */
async function openNewProject(page: Page, company = '合成株式会社A', project = '業務改善 2026'): Promise<void> {
  await registerCompany(page, company);
  await createProject(page, company, project);
  await page.getByRole('region', { name: `企業 ${company}` }).getByRole('link', { name: project }).click();
  await expect(page.getByTestId('stepper')).toBeVisible();
}

function stepper(page: Page): Locator {
  return page.getByTestId('stepper');
}

async function startAnalysis(page: Page, method: string): Promise<Locator> {
  await page.getByRole('button', { name: '分析を開始' }).click();
  await page.getByRole('listbox', { name: '分析手法' }).getByRole('option', { name: method }).click();
  const analysis = page.getByTestId('analysis');
  await expect(analysis).toBeVisible();
  return analysis;
}

test.describe('FR-133 分析手法の選択と開始', () => {
  // FR-133 AC-195
  test('FR-133 AC-195 手法の一覧に 5 手法があり、1 つを選ぶとその手法の入力欄を持つ分析が始まる', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    await page.getByRole('button', { name: '分析を開始' }).click();
    const list = page.getByRole('listbox', { name: '分析手法' });
    for (const m of METHODS) await expect(list.getByRole('option', { name: m }), `${m} が一覧にない`).toHaveCount(1);
    await list.getByRole('option', { name: '3C 分析' }).click();
    const analysis = page.getByTestId('analysis');
    await expect(analysis).toContainText('3C 分析');
    // 入力欄がある（値・重み・分類のいずれかを入力できる）
    await expect(analysis.getByTestId('analysis-params').locator('input, select, textarea').first()).toBeVisible();
  });

  // FR-133 AC-195（異常系: 手法を選ぶまでは分析が始まらない）
  test('FR-133 AC-195 手法を選ばずに一覧を閉じると分析は始まらない', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    await page.getByRole('button', { name: '分析を開始' }).click();
    await expect(page.getByRole('listbox', { name: '分析手法' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('analysis')).toHaveCount(0);
  });
});

test.describe('FR-134 パラメーターの編集と結果の更新', () => {
  // FR-134 AC-197
  test('FR-134 AC-197 パラメーターを変更すると 2 秒以内に結果へ反映される', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    const analysis = await startAnalysis(page, 'SWOT 分析');
    const input = analysis.getByTestId('analysis-params').getByRole('spinbutton').first();
    const result = analysis.getByTestId('analysis-result');
    await expect(result).toBeVisible();
    const before = await result.innerText();
    await input.fill('7');
    await input.blur();
    await expect(result).toContainText('7', { timeout: REFLECT_MS });
    expect(await result.innerText()).not.toBe(before);
  });

  // FR-134 AC-197（異常系: 範囲外の値では結果が変わらない）
  test('FR-134 AC-197 範囲外の値を入れても結果は直前の有効な状態のまま', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    const analysis = await startAnalysis(page, 'SWOT 分析');
    const input = analysis.getByTestId('analysis-params').getByRole('spinbutton').first();
    const result = analysis.getByTestId('analysis-result');
    await input.fill('3');
    await input.blur();
    await expect(result).toContainText('3', { timeout: REFLECT_MS });
    const valid = await result.innerText();
    await input.fill('-99999999');
    await input.blur();
    await expect(analysis.getByRole('alert')).toBeVisible({ timeout: REFLECT_MS });
    expect(await result.innerText()).toBe(valid);
  });
});

test.describe('FR-135 ビュアーの切替と結果の確認', () => {
  // FR-135 AC-200
  test('FR-135 AC-200 ビュアーを切り替えても選択中の項目・絞り込み・結果の値が保たれる', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    const analysis = await startAnalysis(page, 'SWOT 分析');
    const viewers = analysis.getByRole('radiogroup', { name: 'ビュアー' }).getByRole('radio');
    expect(await viewers.count()).toBeGreaterThanOrEqual(2);
    const items = analysis.getByTestId('result-item');
    await expect(items.first()).toBeVisible();
    const target = items.first();
    const targetId = await target.getAttribute('data-entity-id');
    expect(targetId).toBeTruthy();
    await target.click();
    const filter = analysis.getByRole('searchbox', { name: '絞り込み' });
    await filter.fill('a');
    const values = async () => (await analysis.getByTestId('result-item').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-entity-id')}=${e.getAttribute('data-value')}`))).sort();
    const before = await values();
    expect(before.length).toBeGreaterThan(0);
    await viewers.nth(1).check();
    await expect(filter).toHaveValue('a');
    await expect(analysis.locator(`[data-testid="result-item"][data-entity-id="${targetId}"]`).first()).toHaveAttribute('aria-selected', 'true');
    expect(await values()).toEqual(before);
    // 元のビュアーへ戻しても同じ
    await viewers.nth(0).check();
    expect(await values()).toEqual(before);
  });

  // FR-135 AC-200（異常系: 絞り込みで 0 件でもビュアーを切り替えられ、絞り込みが消えない）
  test('FR-135 AC-200 絞り込みが 0 件でもビュアーを切り替えると絞り込みが保たれる', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    const analysis = await startAnalysis(page, 'SWOT 分析');
    const filter = analysis.getByRole('searchbox', { name: '絞り込み' });
    await filter.fill('存在しない語句zzzz');
    await expect(analysis.getByTestId('result-item')).toHaveCount(0);
    await analysis.getByRole('radiogroup', { name: 'ビュアー' }).getByRole('radio').nth(1).check();
    await expect(filter).toHaveValue('存在しない語句zzzz');
    await expect(analysis.getByTestId('result-item')).toHaveCount(0);
  });
});

test.describe('FR-136 業務改善ステッパー', () => {
  // FR-136 AC-202
  test('FR-136 AC-202 5 ステップが順に並び、現在・完了・未着手が識別できる', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    const items = stepper(page).getByRole('listitem');
    await expect(items).toHaveCount(STEPS.length);
    for (let i = 0; i < STEPS.length; i++) await expect(items.nth(i)).toContainText(STEPS[i]);
    // 現在のステップはちょうど 1 つで、他の状態と区別できる
    await expect(stepper(page).locator('[data-step-state="current"]')).toHaveCount(1);
    const states = await items.evaluateAll((els) => els.map((e) => e.getAttribute('data-step-state')));
    for (const s of states) expect(['not-started', 'current', 'done']).toContain(s);
    // 開いたばかりの Project に完了済みはなく、現在より後は未着手
    expect(states).not.toContain('done');
    const cur = states.indexOf('current');
    states.slice(cur + 1).forEach((s) => expect(s).toBe('not-started'));
  });

  // FR-136 AC-202（異常系: 別 Project を開いても進捗が引き継がれない＝初期状態で表示される）
  test('FR-136 AC-202 新しい Project のステッパーは完了済みなしの初期状態で、ステップ数が欠けない', async ({ page, start }) => {
    await start();
    await openNewProject(page, '合成株式会社B', '新規 Project');
    await expect(stepper(page).getByRole('listitem')).toHaveCount(5);
    await expect(stepper(page).locator('[data-step-state="done"]')).toHaveCount(0);
  });

  // FR-136 AC-203
  test('FR-136 AC-203 別の画面へ移動してもステッパーが表示され続け、対応するステップが現在になる', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    for (const step of ['KPI 測定', 'ユースケース作成', '現状分析']) {
      await stepper(page).getByRole('button', { name: step }).click();
      await expect(stepper(page)).toBeVisible();
      await expect(stepper(page).locator('[data-step-state="current"]')).toHaveCount(1);
      await expect(stepper(page).locator('[data-step-state="current"]')).toContainText(step);
    }
  });

  // FR-136 AC-203（異常系: 分析画面でも現在の位置が失われない）
  test('FR-136 AC-203 分析を開始した画面でもステッパーが表示され、現在のステップが 1 つだけ示される', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    await startAnalysis(page, '3C 分析');
    await expect(stepper(page)).toBeVisible();
    await expect(stepper(page).locator('[data-step-state="current"]')).toHaveCount(1);
  });
});

test.describe('FR-137 企業の登録と複数 Project の管理', () => {
  // FR-137 AC-205
  test('FR-137 AC-205 企業に 2 つ以上の Project を作ると企業ごとの一覧に表示される', async ({ page, start }) => {
    await start();
    await registerCompany(page, '合成株式会社A');
    await createProject(page, '合成株式会社A', '案件1');
    await createProject(page, '合成株式会社A', '案件2');
    const region = page.getByRole('region', { name: '企業 合成株式会社A' });
    await expect(region.getByRole('link', { name: '案件1' })).toBeVisible();
    await expect(region.getByRole('link', { name: '案件2' })).toBeVisible();
  });

  // FR-137 AC-205（異常系: 別企業の一覧に混ざらない）
  test('FR-137 AC-205 ある企業の Project は別の企業の一覧に表示されない', async ({ page, start }) => {
    await start();
    await registerCompany(page, '合成株式会社A');
    await registerCompany(page, '合成株式会社B');
    await createProject(page, '合成株式会社A', '案件A1');
    await createProject(page, '合成株式会社B', '案件B1');
    await expect(page.getByRole('region', { name: '企業 合成株式会社A' }).getByRole('link', { name: '案件B1' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: '企業 合成株式会社B' }).getByRole('link', { name: '案件A1' })).toHaveCount(0);
  });
});
