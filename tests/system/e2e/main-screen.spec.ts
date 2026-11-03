// System Test: メイン画面（QuickStart・チュートリアルの手順だけの画面）と、分析画面からメイン画面へ戻るボタン（FR-186・FR-187）
// 期待値は要求定義書の受入基準（docs/requirements/analysis-projects.md の FR-186・FR-187）だけから決める。
// 画面の探し方は tests/system/CONTRACT.md §15。
import type { Page } from '@playwright/test';
import { test, expect, pressOpeningEscape } from '../support/fixtures';

const STEPS = ['企業を登録', 'Project を作成', 'Project を開く', '分析を開始'] as const;

/** 起動直後のメイン画面（オープニングは Esc で飛ばす）。 */
async function startAtMain(page: Page, start: (o?: { skipOpening?: boolean }) => Promise<unknown>) {
  const app = (await start({ skipOpening: false })) as { reload(o?: { skipOpening?: boolean }): Promise<void> };
  await pressOpeningEscape(page);
  const main = page.getByTestId('main-screen');
  await expect(main, '起動直後にメイン画面が出ない').toBeVisible();
  return { app, main };
}

async function registerCompanyAndProjects(page: Page, company: string, names: string[]): Promise<void> {
  const main = page.getByTestId('main-screen');
  await main.getByRole('button', { name: '企業を登録' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: '企業名' }).fill(company);
  await dlg.getByRole('button', { name: '登録' }).click();
  await expect(dlg).toBeHidden();
  for (const n of names) {
    await main.getByRole('region', { name: `企業 ${company}` }).getByRole('button', { name: 'Project を作成' }).click();
    await dlg.getByRole('textbox', { name: 'Project 名' }).fill(n);
    await dlg.getByRole('button', { name: '作成' }).click();
    await expect(dlg).toBeHidden();
  }
}

async function openProject(page: Page, company: string, project: string): Promise<void> {
  await page.getByTestId('main-screen').getByRole('button', { name: 'Project を開く' }).click();
  const picker = page.getByRole('dialog', { name: '作業先の選択' });
  await picker.getByRole('option', { name: new RegExp(`${company}.*${project}`) }).click();
  await expect(picker).toBeHidden();
}

test.describe('FR-186 メイン画面（QuickStart・チュートリアルの手順だけを行う画面）', () => {
  // FR-186 AC-395
  test('FR-186 AC-395 メイン画面に、手順（企業を登録→Project を作成→Project を開く→分析を開始）を順に示す案内と各手順の操作があり、手順外の機能は表示されない', async ({ page, start }) => {
    const { main } = await startAtMain(page, start);
    const guide = main.getByTestId('main-guide');
    await expect(guide).toBeVisible();
    const items = guide.getByRole('listitem');
    await expect(items).toHaveCount(STEPS.length);
    for (let i = 0; i < STEPS.length; i++) await expect(items.nth(i)).toContainText(STEPS[i]);
    for (const s of STEPS) await expect(main.getByRole('button', { name: s }).first(), `手順の操作「${s}」がない`).toBeVisible();
    // 手順に含まれない機能（分析のコンポーネント・ツールバーの各機能）が出ない
    await expect(page.getByTestId('workspace')).toHaveCount(0);
    await expect(page.locator('[data-testid^="nav-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="component-"]')).toHaveCount(0);
    await expect(page.getByTestId('work-target-menu')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'レイアウトを既定に戻す' })).toHaveCount(0);
  });

  // FR-186 AC-395（異常系: Project 未作成で「分析を開始」は手順外の画面へ進まない）
  test('FR-186 AC-395 異常系: 企業・Project が 0 件のまま「分析を開始」を押しても、手順外の画面へ進まず、案内が示される', async ({ page, start }) => {
    const { main } = await startAtMain(page, start);
    await main.getByRole('button', { name: '分析を開始' }).click();
    await expect(page.getByTestId('analysis')).toHaveCount(0);
    await expect(page.getByTestId('workspace')).toHaveCount(0);
    await expect(page.getByRole('alert').or(main.getByTestId('main-guide')).first()).toBeVisible();
  });

  // FR-186 AC-396
  test('FR-186 AC-396 メイン画面で企業を登録し Project を作成して開くと、その Project の分析画面へ移り、最上段の表示が入力した名前と一致し、再読込後も企業・Project が保たれる', async ({ page, start }) => {
    const { app } = await startAtMain(page, start);
    await registerCompanyAndProjects(page, '合成株式会社M', ['メイン画面確認 2026']);
    await openProject(page, '合成株式会社M', 'メイン画面確認 2026');
    await expect(page.getByTestId('main-screen')).toHaveCount(0);
    await expect(page.getByTestId('workspace')).toBeVisible();
    // FR-148 AC-251: 企業名と Project 名は別々のボタン。AC-396 の一致条件は両方に適用する。
    const display = page.getByTestId('work-target-display');
    await expect(display.getByTestId('current-company-menu')).toHaveText('合成株式会社M');
    await expect(display.getByTestId('work-target-menu')).toHaveText(/^(?:-\s*)?メイン画面確認 2026$/);
    await expect(display).toHaveAccessibleName(/合成株式会社M.*メイン画面確認 2026/);
    await app.reload({ skipOpening: false });
    await pressOpeningEscape(page);
    const region = page.getByTestId('main-screen').getByRole('region', { name: '企業 合成株式会社M' });
    await expect(region).toBeVisible();
    await expect(region).toContainText('メイン画面確認 2026');
    await openProject(page, '合成株式会社M', 'メイン画面確認 2026');
    await expect(display.getByTestId('current-company-menu')).toHaveText('合成株式会社M');
    await expect(display.getByTestId('work-target-menu')).toHaveText(/^(?:-\s*)?メイン画面確認 2026$/);
  });

  // FR-186 AC-396（異常系: 複数の Project から別のものを選ぶと、選んだ方が開く）
  test('FR-186 AC-396 異常系: 2 件の Project のうち 2 件目を選んで開くと、2 件目の名前が最上段に出て、1 件目の名前は出ない', async ({ page, start }) => {
    await startAtMain(page, start);
    await registerCompanyAndProjects(page, '合成株式会社M', ['案件一号', '案件二号']);
    await openProject(page, '合成株式会社M', '案件二号');
    await expect(page.getByTestId('work-target-display').getByTestId('current-company-menu')).toHaveText('合成株式会社M');
    await expect(page.getByTestId('work-target-menu')).toContainText('案件二号');
    await expect(page.getByTestId('work-target-menu')).not.toContainText('案件一号');
  });

  // FR-186 AC-819（h1 は開いている Project → 直近に開いた Project → 「メイン画面」の順で決まり、本文より大きい。再読込しても同じ規則）
  test('FR-186 AC-819 メイン画面の h1 は、未登録なら「メイン画面」、開いている Project があればその「企業名-Project名」、開いていなければ直近に開いた Project の「企業名-Project名」で、本文より大きい。再読込後も同じ規則', async ({ page, start }) => {
    const { app, main } = await startAtMain(page, start);
    const h1 = main.getByRole('heading', { level: 1 });
    // 異常系: 企業・Project が未登録で開いた記録もない → 「メイン画面」。再読込しても同じ
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText('メイン画面');
    await app.reload({ skipOpening: false });
    await pressOpeningEscape(page);
    await expect(main.getByRole('heading', { level: 1 })).toHaveText('メイン画面');
    // 企業・Project を登録しただけ（まだ開いていない）なら、開いた記録がないので「メイン画面」のまま
    await registerCompanyAndProjects(page, '合成株式会社N', ['案件一号', '案件二号']);
    await expect(h1).toHaveText('メイン画面');
    // 1 件目 → 2 件目の順に開く。メイン画面へ戻ると、開いている（直近に開いた）2 件目の「企業名-Project名」
    await openProject(page, '合成株式会社N', '案件一号');
    await page.getByRole('button', { name: 'メイン画面へ戻る' }).click();
    await expect(main).toBeVisible();
    await expect(h1).toHaveText('合成株式会社N-案件一号');
    await main.getByRole('button', { name: 'Project を開く' }).click();
    const picker = page.getByRole('dialog', { name: '作業先の選択' });
    await picker.getByRole('option', { name: /合成株式会社N.*案件二号/ }).click();
    await expect(picker).toBeHidden();
    await page.getByRole('button', { name: 'メイン画面へ戻る' }).click();
    await expect(h1).toHaveText('合成株式会社N-案件二号');
    // h1 は見出しの階層の最上位（メイン画面内に h1 より上位の見出しがなく、h1 は 1 つ）で、本文より大きい
    const sizes = await main.evaluate((el) => {
      const px = (e: Element | null) => (e ? parseFloat(getComputedStyle(e).fontSize) : 0);
      return { h1: px(el.querySelector('h1')), body: px(el.querySelector('[data-testid="main-guide"] li') ?? el.querySelector('p')) };
    });
    expect(sizes.body, '本文の文字サイズが取れない').toBeGreaterThan(0);
    expect(sizes.h1, 'h1 が本文より大きくない').toBeGreaterThan(sizes.body);
    // 再読込後（開いている Project はないが、直近に開いた記録が端末内の保存先にある）も、直近の Project を表示する
    await app.reload({ skipOpening: false });
    await pressOpeningEscape(page);
    await expect(page.getByTestId('main-screen').getByRole('heading', { level: 1 })).toHaveText('合成株式会社N-案件二号');
  });
});

test.describe('FR-187 分析画面からメイン画面へ戻るボタン', () => {
  // FR-187 AC-399
  test('FR-187 AC-399 Project を開いた分析画面の上部に「メイン画面へ戻る」が表示され、押すとメイン画面になる。上端は「作業先」「企業を登録」より上にならない', async ({ page, start }) => {
    await startAtMain(page, start);
    await registerCompanyAndProjects(page, '合成株式会社M', ['戻る確認']);
    await openProject(page, '合成株式会社M', '戻る確認');
    const back = page.getByRole('button', { name: 'メイン画面へ戻る' });
    await expect(back).toBeVisible();
    const bb = (await back.boundingBox())!;
    const wt = (await page.getByTestId('work-target-menu').boundingBox())!;
    const reg = (await page.getByRole('button', { name: '企業を登録' }).boundingBox())!;
    expect(bb.y, '「メイン画面へ戻る」が「作業先」より上').toBeGreaterThanOrEqual(wt.y - 1);
    expect(bb.y, '「メイン画面へ戻る」が「企業を登録」より上').toBeGreaterThanOrEqual(reg.y - 1);
    expect(bb.y, '上部の目に付く位置（画面の上 1/3 以内）').toBeLessThanOrEqual((page.viewportSize()?.height ?? 720) / 3);
    await back.click();
    await expect(page.getByTestId('main-screen')).toBeVisible();
  });

  // FR-187 AC-399（異常系: メイン画面自体には戻るボタンがない。戻った後に開き直せる）
  test('FR-187 AC-399 異常系: メイン画面には「メイン画面へ戻る」がなく、戻った後に同じ Project を開き直すと分析画面が表示される', async ({ page, start }) => {
    await startAtMain(page, start);
    await expect(page.getByRole('button', { name: 'メイン画面へ戻る' })).toHaveCount(0);
    await registerCompanyAndProjects(page, '合成株式会社M', ['戻る確認']);
    await openProject(page, '合成株式会社M', '戻る確認');
    await page.getByRole('button', { name: 'メイン画面へ戻る' }).click();
    await expect(page.getByTestId('main-screen')).toBeVisible();
    await expect(page.getByRole('button', { name: 'メイン画面へ戻る' })).toHaveCount(0);
    await openProject(page, '合成株式会社M', '戻る確認');
    await expect(page.getByTestId('workspace')).toBeVisible();
    await expect(page.getByTestId('work-target-menu')).toContainText('戻る確認');
  });
});
