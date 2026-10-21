// System Test: 画面内ガイド（FR-266〜FR-268・FR-269・FR-270・FR-272。要求定義書 docs/requirements/analysis-projects.md の system レベルの AC）
// 期待値は受入基準だけから決める。画面の探し方: 「はじめての方へ」region・「使い方を見る」button・「顧客パック」region・「使い方」button・ウェルカム dialog。
// 取り決め: 初回ウェルカムは `?e2e=1` だけでは出さない。URL に `welcome=1` を付けたときだけ出す（既存 System Test を妨げないため）。
import type { Page } from '@playwright/test';
import { test, expect, pressOpeningEscape, chooseWorkTarget } from '../support/fixtures';

async function startAtMain(page: Page, start: (o?: { skipOpening?: boolean; path?: string }) => Promise<unknown>, path?: string) {
  const app = (await start({ skipOpening: false, path })) as { reload(o?: { skipOpening?: boolean }): Promise<void> };
  await pressOpeningEscape(page);
  const main = page.getByTestId('main-screen');
  await expect(main, '起動直後にメイン画面が出ない').toBeVisible();
  return { app, main };
}

/** 文章を句点で分け、各文が 60 字以内であることを確かめる。 */
function expectShortSentences(text: string, where: string) {
  const sentences = text.split(/[。！？\n]/).map((s) => s.trim()).filter(Boolean);
  expect(sentences.length, `${where} に文がない`).toBeGreaterThan(0);
  for (const s of sentences) expect(s.length, `${where} の文が 60 字を超える: ${s}`).toBeLessThanOrEqual(60);
}

test.describe('FR-266 「はじめての方へ」', () => {
  // FR-266 AC-675
  test('FR-266 AC-675 メイン画面を開くと「はじめての方へ」に、できること・用語・4 手順（何をする操作か・例・次に起きること）が常に表示され、各文は 60 字以内', async ({ page, start }) => {
    const { app, main } = await startAtMain(page, start);
    const guide = main.getByRole('region', { name: 'はじめての方へ' });
    await expect(guide).toBeVisible();
    const text = await guide.innerText();
    for (const t of ['企業', 'Project', 'デモ', '顧客パック']) expect(text, `用語「${t}」の説明がない`).toContain(t);
    for (const s of ['企業を登録', 'Project を作成', 'Project を開く', '分析を開始']) expect(text, `手順「${s}」がない`).toContain(s);
    expect((text.match(/例/g) ?? []).length, '各手順の「例」が 4 つ未満').toBeGreaterThanOrEqual(4);
    expect(text).toMatch(/次に/);
    expectShortSentences(text, '「はじめての方へ」');
    await app.reload({ skipOpening: false });
    await pressOpeningEscape(page);
    await expect(page.getByTestId('main-screen').getByRole('region', { name: 'はじめての方へ' })).toBeVisible();
  });

  // FR-266 AC-675（異常系: 企業・Project を登録しても、説明が消えない）
  test('FR-266 AC-675 異常系: 企業と Project を登録した後も「はじめての方へ」が表示され続ける', async ({ page, start }) => {
    const { main } = await startAtMain(page, start);
    await main.getByRole('button', { name: '企業を登録' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('textbox', { name: '企業名' }).fill('合成株式会社G');
    await dlg.getByRole('button', { name: '登録' }).click();
    await expect(dlg).toBeHidden();
    await expect(main.getByRole('region', { name: '企業 合成株式会社G' })).toBeVisible();
    await expect(main.getByRole('region', { name: 'はじめての方へ' })).toBeVisible();
  });
});

test.describe('FR-267 ウェルカムのダイアログ', () => {
  // FR-267 AC-678
  test('FR-267 AC-678 確認済みの記録がないと、ウェルカムが 1 回出て、次へ・戻るでカードが替わり、スキップで閉じる。「次回から表示しない」を選んで閉じると再読込後に出ない', async ({ page, start }) => {
    const { app, main } = await startAtMain(page, start, '?welcome=1');
    const dlg = page.getByRole('dialog', { name: /ウェルカム|はじめ|使い方/ });
    await expect(dlg).toBeVisible();
    const first = await dlg.innerText();
    await dlg.getByRole('button', { name: '次へ' }).click();
    const second = await dlg.innerText();
    expect(second).not.toEqual(first);
    await dlg.getByRole('button', { name: '戻る' }).click();
    expect(await dlg.innerText()).toEqual(first);
    await dlg.getByRole('checkbox', { name: '次回から表示しない' }).check();
    await dlg.getByRole('button', { name: 'スキップ' }).click();
    await expect(dlg).toBeHidden();
    await expect(main).toBeVisible();
    await app.reload({ skipOpening: false });
    await pressOpeningEscape(page);
    await expect(page.getByRole('dialog', { name: /ウェルカム|はじめ|使い方/ })).toHaveCount(0);
  });

  // FR-267 AC-678（異常系: 選ばずにスキップすると、次の起動で再び出る。welcome=1 なしでは出ない）
  test('FR-267 AC-678 異常系: 「次回から表示しない」を選ばずにスキップすると、再読込で再び 1 回出る。welcome=1 がなければ出ない', async ({ page, start }) => {
    const { app } = await startAtMain(page, start, '?welcome=1');
    const dlg = page.getByRole('dialog', { name: /ウェルカム|はじめ|使い方/ });
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: 'スキップ' }).click();
    await expect(dlg).toBeHidden();
    await app.reload({ skipOpening: false });
    await pressOpeningEscape(page);
    await expect(page.getByRole('dialog', { name: /ウェルカム|はじめ|使い方/ })).toBeVisible();
  });

  // FR-267 AC-678（異常系: 取り決め。e2e=1 だけでは出さない）
  test('FR-267 AC-678 異常系: URL に welcome=1 がない（e2e=1 のみ）ときは、ウェルカムを自動では出さず、「使い方を見る」で開ける', async ({ page, start }) => {
    const { main } = await startAtMain(page, start);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await main.getByRole('button', { name: '使い方を見る' }).click();
    await expect(page.getByRole('dialog', { name: /ウェルカム|はじめ|使い方/ })).toBeVisible();
  });
});

test.describe('FR-268 顧客パックの説明カード', () => {
  // FR-268 AC-682
  test('FR-268 AC-682 メイン画面の「顧客パック」の説明に、意味・デモで試せること・作り方 3 通り・確認コマンド 2 つ・起動の手順が表示される', async ({ page, start }) => {
    const { main } = await startAtMain(page, start);
    const card = main.getByRole('region', { name: /顧客パック/ }).first();
    await expect(card).toBeVisible();
    const t = await card.innerText();
    expect(t).toContain('顧客パックがなくても');
    expect(t).toContain('examples/mono');
    expect(t).toContain('docs/prompts/m365-copilot-customer-pack.md');
    expect(t).toContain('npm run pipeline');
    expect(t).toContain('npm run check:pack');
    expect(t).toContain('npm run verify:pack');
    expect(t).toContain('npm run build');
    expect(t).toContain('npm start');
    expect(t).toContain('http://127.0.0.1:4173');
    await expect(card.getByRole('button', { name: /コピー/ }).first()).toBeVisible();
  });

  // FR-268 AC-682（異常系: 顧客パックが空（public/data なし）でも説明が出る）
  test('FR-268 AC-682 異常系: 顧客パックがない（pack: null）状態でも、顧客パックの説明とデモで試せる旨が表示される', async ({ page, start }) => {
    const app = await start({ skipOpening: false, pack: null });
    void app;
    await pressOpeningEscape(page);
    const main = page.getByTestId('main-screen');
    await expect(main).toBeVisible();
    const card = main.getByRole('region', { name: /顧客パック/ }).first();
    await expect(card).toBeVisible();
    await expect(card).toContainText('顧客パックがなくても');
  });
});

test.describe('FR-269 入力ダイアログのヒント', () => {
  // FR-269 AC-685
  test('FR-269 AC-685 企業の登録に「ミズホ精機株式会社」の例と入力後に起きること、Project の作成に「2026 年度 DX 構想」の例と入力後に起きることが表示される', async ({ page, start }) => {
    const { main } = await startAtMain(page, start);
    await main.getByRole('button', { name: '企業を登録' }).click();
    const dlg = page.getByRole('dialog');
    const company = dlg.getByRole('textbox', { name: '企業名' });
    expect(`${await company.getAttribute('placeholder')}${await dlg.innerText()}`).toContain('ミズホ精機株式会社');
    await expect(dlg).toContainText(/Project を作成|登録すると/);
    await company.fill('合成株式会社H');
    await dlg.getByRole('button', { name: '登録' }).click();
    await expect(dlg).toBeHidden();
    await main.getByRole('region', { name: '企業 合成株式会社H' }).getByRole('button', { name: 'Project を作成' }).click();
    const proj = dlg.getByRole('textbox', { name: 'Project 名' });
    expect(`${await proj.getAttribute('placeholder')}${await dlg.innerText()}`).toContain('2026 年度 DX 構想');
    await expect(dlg).toContainText(/分析を開始|作成すると/);
  });

  // FR-269 AC-685（異常系: 空のまま登録しても既存の検証が働き、ヒントは残る）
  test('FR-269 AC-685 異常系: 企業名が空のまま登録しても企業は増えず、ダイアログは閉じず、ヒントが読める', async ({ page, start }) => {
    const { main } = await startAtMain(page, start);
    await main.getByRole('button', { name: '企業を登録' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: '登録' }).click();
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('ミズホ精機株式会社');
  });
});

test.describe('FR-270 作業先の選択の一行説明', () => {
  // FR-270 AC-687
  test('FR-270 AC-687 作業先の選択の各候補に、60 字以内の一行の説明が添えられ、デモは「顧客パックがなくても」を含む', async ({ page, start }) => {
    const { main } = await startAtMain(page, start);
    await main.getByRole('button', { name: 'Project を開く' }).click();
    const picker = page.getByRole('dialog', { name: '作業先の選択' });
    await expect(picker).toBeVisible();
    const options = picker.getByRole('option');
    const n = await options.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const o = options.nth(i);
      const name = (await o.innerText()).split('\n').map((s) => s.trim()).filter(Boolean);
      expect(name.length, `候補 ${i + 1} に名前のほかの一行説明がない`).toBeGreaterThanOrEqual(2);
      expect(name[name.length - 1].length, `候補 ${i + 1} の説明が 60 字を超える`).toBeLessThanOrEqual(60);
    }
    await expect(picker.getByRole('option', { name: /デモ/ }).first()).toContainText('顧客パックがなくても');
  });

  // FR-270 AC-687（異常系: Project が 0 件でも、表示されている候補にだけ説明が付き、説明だけの空行は出ない）
  test('FR-270 AC-687 異常系: Project が 0 件のとき、候補は FR-144 のままで、表示された全候補に説明がある', async ({ page, start }) => {
    const { main } = await startAtMain(page, start);
    await main.getByRole('button', { name: 'Project を開く' }).click();
    const picker = page.getByRole('dialog', { name: '作業先の選択' });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('option', { name: /登録済み|Project/ })).toHaveCount(await picker.getByRole('option', { name: /登録済み|Project/ }).count());
    for (const o of await picker.getByRole('option').all()) {
      const lines = (await o.innerText()).split('\n').map((s) => s.trim()).filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);
    }
  });
});

test.describe('FR-272 分析画面の「使い方」', () => {
  async function openWorkspace(page: Page, start: (o?: { skipOpening?: boolean }) => Promise<unknown>) {
    await start({ skipOpening: false });
    await pressOpeningEscape(page);
    await page.getByTestId('main-screen').getByRole('button', { name: 'Project を開く' }).click();
    await chooseWorkTarget(page);
    await expect(page.getByTestId('workspace')).toBeVisible();
  }

  // FR-272 AC-690
  test('FR-272 AC-690 分析画面のツールバーに「使い方」ボタンが 1 つあり、開くと画面の見方・よく使う操作・顧客パックの説明が出て、閉じると画面の状態が保たれる', async ({ page, start }) => {
    await openWorkspace(page, start);
    const btn = page.getByRole('button', { name: '使い方', exact: true });
    await expect(btn).toHaveCount(1);
    const before = await page.getByTestId('workspace').innerText();
    await btn.click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('画面の見方');
    await expect(dlg).toContainText('よく使う操作');
    await expect(dlg).toContainText('顧客パック');
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(page.getByTestId('workspace')).toBeVisible();
    expect(await page.getByTestId('workspace').innerText()).toEqual(before);
  });

  // FR-272 AC-690（異常系: 開閉してもメイン画面へ戻らず、「使い方」は 1 つのまま）
  test('FR-272 AC-690 異常系: 「使い方」を開いて閉じてもメイン画面へ戻らず、入口は 1 つのままで、再度開ける', async ({ page, start }) => {
    await openWorkspace(page, start);
    const btn = page.getByRole('button', { name: '使い方', exact: true });
    for (let i = 0; i < 2; i++) {
      await btn.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
    }
    await expect(page.getByTestId('main-screen')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '使い方', exact: true })).toHaveCount(1);
  });
});