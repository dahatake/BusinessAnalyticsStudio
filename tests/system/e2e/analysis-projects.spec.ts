// System Test: 分析手法・業務改善ステッパー・企業別 Project 管理
// 期待値は要求定義書の受入基準（docs/requirements/analysis-projects.md）だけから決める。
// 画面の探し方は tests/system/CONTRACT.md §8。AC-207 は Q-009 A（端末内保存）で承認済み。
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, reloadAndEnter, gotoAndEnter } from '../support/fixtures';
import { DIST_DIR } from '../support/server';
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

async function reopenProject(page: Page, company: string, project: string): Promise<void> {
  if (!(await page.getByTestId('stepper').isVisible())) {
    await page.getByRole('region', { name: `企業 ${company}` }).getByRole('link', { name: project }).click();
  }
  await expect(page.getByTestId('stepper')).toBeVisible();
}

async function backToList(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Project 一覧へ' }).click();
}

function listAllFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listAllFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

test.describe('FR-137 端末内保存と復元', () => {
  // FR-137 AC-207
  test('FR-137 AC-207 開き直しても企業・Project・ステッパーの位置・分析の入力値が復元される', async ({ page, start }) => {
    await start();
    await openNewProject(page, '復元株式会社', '復元案件');
    await stepper(page).getByRole('button', { name: 'KPI 測定' }).click();
    const analysis = await startAnalysis(page, 'SWOT 分析');
    const input = analysis.getByTestId('analysis-params').getByRole('spinbutton').first();
    await input.fill('7');
    await input.blur();
    await expect(analysis.getByTestId('analysis-result')).toContainText('7', { timeout: REFLECT_MS });
    await reloadAndEnter(page, '復元株式会社');
    await expect(page.getByRole('region', { name: '企業 復元株式会社' })).toBeVisible();
    await reopenProject(page, '復元株式会社', '復元案件');
    await expect(stepper(page).locator('[data-step-state="current"]')).toContainText('KPI 測定');
    const restored = page.getByTestId('analysis');
    await expect(restored).toContainText('SWOT 分析');
    await expect(restored.getByTestId('analysis-params').getByRole('spinbutton').first()).toHaveValue('7');
  });

  // FR-137 AC-207（異常系: 保存はサーバーへ送られず、別の端末＝別の browser context には引き継がれない）
  test('FR-137 AC-207 データはサーバーへ送られず、別の端末（別の文脈）では復元されない', async ({ page, start, browser }) => {
    const sent: string[] = [];
    page.on('request', (r) => {
      if (r.method() !== 'GET' && r.method() !== 'HEAD') sent.push(`${r.method()} ${r.url()} ${r.postData() ?? ''}`);
    });
    const app = await start();
    await registerCompany(page, '端末限定株式会社');
    await createProject(page, '端末限定株式会社', '端末限定案件');
    await reloadAndEnter(page, '端末限定株式会社');
    await expect(page.getByRole('region', { name: '企業 端末限定株式会社' })).toBeVisible();
    expect(sent.filter((s) => s.includes('端末限定') || s.includes(encodeURIComponent('端末限定'))), `送信された: ${sent.join(' | ')}`).toEqual([]);
    const other = await browser.newContext();
    const p2 = await other.newPage();
    await gotoAndEnter(p2, app.url);
    await expect(p2.getByRole('region', { name: '企業 端末限定株式会社' })).toHaveCount(0);
    await other.close();
  });
});

test.describe('FR-138 Project の切替', () => {
  // FR-138 AC-209
  test('FR-138 AC-209 Project を切り替えると各 Project の分析とステッパーの位置だけが表示される', async ({ page, start }) => {
    await start();
    await registerCompany(page, '切替株式会社');
    await createProject(page, '切替株式会社', '案件A');
    await createProject(page, '切替株式会社', '案件B');
    const region = page.getByRole('region', { name: '企業 切替株式会社' });
    await region.getByRole('link', { name: '案件A' }).click();
    await stepper(page).getByRole('button', { name: '現状分析' }).click();
    let analysis = await startAnalysis(page, 'SWOT 分析');
    let input = analysis.getByTestId('analysis-params').getByRole('spinbutton').first();
    await input.fill('3');
    await input.blur();
    await expect(analysis.getByTestId('analysis-result')).toContainText('3', { timeout: REFLECT_MS });
    await backToList(page);
    await region.getByRole('link', { name: '案件B' }).click();
    await stepper(page).getByRole('button', { name: '施策計画' }).click();
    analysis = await startAnalysis(page, '3C 分析');
    input = analysis.getByTestId('analysis-params').getByRole('spinbutton').first();
    await input.fill('8');
    await input.blur();
    await expect(analysis.getByTestId('analysis-result')).toContainText('8', { timeout: REFLECT_MS });
    await backToList(page);
    await region.getByRole('link', { name: '案件A' }).click();
    await expect(stepper(page).locator('[data-step-state="current"]')).toContainText('現状分析');
    await expect(page.getByTestId('analysis')).toContainText('SWOT 分析');
    await expect(page.getByTestId('analysis')).not.toContainText('3C 分析');
    await expect(page.getByTestId('analysis').getByTestId('analysis-params').getByRole('spinbutton').first()).toHaveValue('3');
    await backToList(page);
    await region.getByRole('link', { name: '案件B' }).click();
    await expect(stepper(page).locator('[data-step-state="current"]')).toContainText('施策計画');
    await expect(page.getByTestId('analysis')).toContainText('3C 分析');
    await expect(page.getByTestId('analysis').getByTestId('analysis-params').getByRole('spinbutton').first()).toHaveValue('8');
  });

  // FR-138 AC-209（異常系: 分析のない新しい Project に他の Project の分析が現れない）
  test('FR-138 AC-209 分析を作っていない Project に他の Project の分析は表示されない', async ({ page, start }) => {
    await start();
    await registerCompany(page, '切替株式会社');
    await createProject(page, '切替株式会社', '案件A');
    await createProject(page, '切替株式会社', '案件C');
    const region = page.getByRole('region', { name: '企業 切替株式会社' });
    await region.getByRole('link', { name: '案件A' }).click();
    await startAnalysis(page, 'SWOT 分析');
    await backToList(page);
    await region.getByRole('link', { name: '案件C' }).click();
    await expect(stepper(page).locator('[data-step-state="done"]')).toHaveCount(0);
    await expect(page.getByTestId('analysis')).toHaveCount(0);
  });
});

test.describe('NFR-UX-006 レイアウトの変更・復元', () => {
  // NFR-UX-006 AC-214
  test('NFR-UX-006 AC-214 レイアウトを変更しても入力・選択・絞り込みが保たれ、再表示で復元され、既定に戻せる', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    const analysis = await startAnalysis(page, 'SWOT 分析');
    const panel = analysis.getByTestId('analysis-result');
    await expect(panel).toBeVisible();
    const filter = analysis.getByRole('searchbox', { name: '絞り込み' });
    await filter.fill('a');
    const item = analysis.getByTestId('result-item').first();
    const itemId = await item.getAttribute('data-entity-id');
    await item.click();
    const initial = (await panel.boundingBox())!;
    const handle = panel.getByTestId('panel-handle');
    const hb = (await handle.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 - 250, hb.y + hb.height / 2 + 150, { steps: 10 });
    await page.mouse.up();
    const moved = (await panel.boundingBox())!;
    expect(Math.abs(moved.x - initial.x) + Math.abs(moved.y - initial.y), 'レイアウトが変わっていない').toBeGreaterThan(20);
    // 変更中に入力・選択・絞り込みが失われない
    await expect(filter).toHaveValue('a');
    await expect(analysis.locator(`[data-testid="result-item"][data-entity-id="${itemId}"]`).first()).toHaveAttribute('aria-selected', 'true');
    // 再表示（開き直し）で復元される
    await reloadAndEnter(page, '合成株式会社A');
    await reopenProject(page, '合成株式会社A', '業務改善 2026');
    const restored = (await page.getByTestId('analysis').getByTestId('analysis-result').boundingBox())!;
    expect(Math.abs(restored.x - moved.x)).toBeLessThan(5);
    expect(Math.abs(restored.y - moved.y)).toBeLessThan(5);
    // 既定に戻す
    await page.getByRole('button', { name: 'レイアウトを既定に戻す' }).click();
    const reset = (await page.getByTestId('analysis').getByTestId('analysis-result').boundingBox())!;
    expect(Math.abs(reset.x - initial.x)).toBeLessThan(5);
    expect(Math.abs(reset.y - initial.y)).toBeLessThan(5);
  });

  // NFR-UX-006 AC-214（異常系: 既定のまま「既定に戻す」を押しても何も壊れない／入力が消えない）
  test('NFR-UX-006 AC-214 既定のレイアウトで既定に戻しても位置と絞り込みが変わらない', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    const analysis = await startAnalysis(page, 'SWOT 分析');
    const panel = analysis.getByTestId('analysis-result');
    const before = (await panel.boundingBox())!;
    const filter = analysis.getByRole('searchbox', { name: '絞り込み' });
    await filter.fill('zz');
    await page.getByRole('button', { name: 'レイアウトを既定に戻す' }).click();
    const after = (await panel.boundingBox())!;
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeLessThan(5);
    await expect(filter).toHaveValue('zz');
  });
});

test.describe('NFR-SEC-004 外部 AI への送信を許可しない既定の状態', () => {
  const COMPANY = '機密合成社ZQ91';
  const PROJECT = '機密案件ZQ91';

  // NFR-SEC-004 AC-218
  test('NFR-SEC-004 AC-218 既定の状態で保存・操作しても、通信に企業・Project の名称やデータが含まれない', async ({ page, start }) => {
    const seen: string[] = [];
    page.on('request', (r) => seen.push(`${r.method()} ${decodeURIComponent(r.url())} ${r.postData() ?? ''}`));
    const app = await start();
    await openNewProject(page, COMPANY, PROJECT);
    const analysis = await startAnalysis(page, 'SWOT 分析');
    const input = analysis.getByTestId('analysis-params').getByRole('spinbutton').first();
    await input.fill('7');
    await input.blur();
    await expect(analysis.getByTestId('analysis-result')).toContainText('7', { timeout: REFLECT_MS });
    await reloadAndEnter(page, COMPANY);
    await expect(page.getByRole('region', { name: `企業 ${COMPANY}` })).toBeVisible();
    const leaks = seen.filter((s) => s.includes('ZQ91') || s.includes(COMPANY) || s.includes(PROJECT));
    expect(leaks, `名称が通信に含まれた: ${leaks.join(' | ')}`).toEqual([]);
    // 中継プロセス（外部 AI への経路）へは何も送られない
    expect(seen.filter((s) => s.includes(app.relayUrl)), '中継プロセスへ送信された').toEqual([]);
  });

  // NFR-SEC-004 AC-218（異常系: 配信物 dist/ に企業・Project の名称やデータが含まれない）
  test('NFR-SEC-004 AC-218 利用者が書き出さない限り、配信物（dist/）に企業・Project の名称が含まれない', async ({ page, start }) => {
    await start();
    await openNewProject(page, COMPANY, PROJECT);
    await startAnalysis(page, 'SWOT 分析');
    await reloadAndEnter(page, COMPANY);
    expect(fs.existsSync(DIST_DIR), 'dist/ がない（npm run build が必要）').toBe(true);
    const hits = listAllFiles(DIST_DIR).filter((f) => {
      const buf = fs.readFileSync(f);
      return buf.includes('ZQ91') || buf.includes(encodeURIComponent(COMPANY));
    });
    expect(hits, `dist/ に含まれる: ${hits.join(', ')}`).toEqual([]);
  });
});