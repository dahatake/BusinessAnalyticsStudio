// System Test: ユースケースの登録（FR-158）とプレゼン用アニメーション（FR-155・FR-156・FR-157）
// 期待値は要求定義書の受入基準（docs/requirements/app-experience.md）だけから決める。画面の探し方は tests/system/CONTRACT.md §10。
// PARAM-047（1 シーン 5 秒）・PARAM-048（作成から再生可能まで 2 秒）。
import type { Page, Locator } from '@playwright/test';
import { test, expect, reloadAndEnter, hook } from '../support/fixtures';

const SCENE_MS = 5_000; // PARAM-047
const CREATE_MS = 2_000; // PARAM-048

interface UseCase { name: string; summary: string; persona: string; steps: { title: string; desc: string }[]; effect?: string }

const UC_A: UseCase = {
  name: '受注処理の自動化', summary: '受注入力を減らす', persona: '現場担当者',
  steps: [
    { title: 'A手順1 受信', desc: 'A説明1 注文メールを受け取る' },
    { title: 'A手順2 照合', desc: 'A説明2 在庫と照合する' },
    { title: 'A手順3 確定', desc: 'A説明3 受注を確定する' },
  ],
  effect: '入力時間が半分になる',
};
const UC_B: UseCase = {
  name: '請求書の確認', summary: '確認の抜けを防ぐ', persona: '経理担当者',
  steps: [1, 2, 3, 4].map((i) => ({ title: `B手順${i} 見出し`, desc: `B説明${i} 内容` })),
};

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
async function openProject(page: Page, company: string, project: string): Promise<void> {
  await page.getByRole('region', { name: `企業 ${company}` }).getByRole('link', { name: project }).click();
  await expect(page.getByTestId('stepper')).toBeVisible();
}
async function openNewProject(page: Page, company = '合成株式会社U', project = 'UC案件1'): Promise<void> {
  await registerCompany(page, company);
  await createProject(page, company, project);
  await openProject(page, company, project);
}
async function openUseCaseStep(page: Page): Promise<Locator> {
  await page.getByTestId('stepper').getByRole('button', { name: 'ユースケース作成' }).click();
  const editor = page.getByTestId('usecase-editor');
  await expect(editor).toBeVisible();
  return editor;
}
async function fillUseCase(page: Page, uc: UseCase, startIndex = 0): Promise<void> {
  const dlg = page.getByRole('dialog', { name: 'ユースケース' });
  await dlg.getByRole('textbox', { name: '名称' }).fill(uc.name);
  await dlg.getByRole('textbox', { name: '概要' }).fill(uc.summary);
  await dlg.getByRole('textbox', { name: '対象ペルソナ' }).fill(uc.persona);
  if (uc.effect !== undefined) await dlg.getByRole('textbox', { name: '期待する効果' }).fill(uc.effect);
  for (let i = startIndex; i < uc.steps.length; i++) {
    await dlg.getByRole('button', { name: '手順を追加' }).click();
    await dlg.getByRole('textbox', { name: `手順 ${i + 1} の見出し` }).fill(uc.steps[i].title);
    await dlg.getByRole('textbox', { name: `手順 ${i + 1} の説明` }).fill(uc.steps[i].desc);
  }
}
async function addUseCase(page: Page, uc: UseCase): Promise<void> {
  const editor = page.getByTestId('usecase-editor');
  await editor.getByRole('button', { name: 'ユースケースを追加' }).click();
  await fillUseCase(page, uc);
  await page.getByRole('dialog', { name: 'ユースケース' }).getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('dialog', { name: 'ユースケース' })).toBeHidden();
  await expect(editor.getByTestId('usecase-list').getByRole('listitem').filter({ hasText: uc.name })).toBeVisible();
}
function item(page: Page, name: string): Locator {
  return page.getByTestId('usecase-list').getByRole('listitem').filter({ hasText: name });
}
async function createAnimation(page: Page, name: string): Promise<void> {
  await item(page, name).getByRole('button', { name: 'アニメーションを作成' }).click();
}
function player(page: Page): Locator {
  return page.getByTestId('animation-player');
}
async function playAnimation(page: Page, name: string): Promise<Locator> {
  await item(page, name).getByRole('button', { name: 'アニメーションを再生' }).click();
  await expect(player(page)).toBeVisible();
  return player(page);
}
/** 作成して再生画面を開く（A は効果あり） */
async function setupAndPlay(page: Page, uc: UseCase = UC_A): Promise<Locator> {
  await openNewProject(page);
  await openUseCaseStep(page);
  await addUseCase(page, uc);
  await createAnimation(page, uc.name);
  return playAnimation(page, uc.name);
}
async function position(p: Locator): Promise<string> {
  return ((await p.getByTestId('animation-position').textContent()) ?? '').replace(/\s+/g, ' ').trim();
}
async function currentHeading(p: Locator): Promise<string> {
  return ((await p.getByTestId('animation-scene').getByRole('heading').first().textContent()) ?? '').trim();
}

test.describe('FR-158 ユースケースの登録と編集', () => {
  // FR-158 AC-285
  test('FR-158 AC-285 ステップから登録・編集・削除でき、一覧に反映され、開き直しで復元され、Project をまたいで混ざらない', async ({ page, start }) => {
    await start();
    await openNewProject(page, '合成株式会社U', 'UC案件1');
    let editor = await openUseCaseStep(page);
    await addUseCase(page, UC_A);
    await addUseCase(page, UC_B);
    // 編集
    await item(page, UC_B.name).getByRole('button', { name: '編集' }).click();
    const dlg = page.getByRole('dialog', { name: 'ユースケース' });
    await dlg.getByRole('textbox', { name: '名称' }).fill('請求書の確認（改）');
    await dlg.getByRole('button', { name: '保存' }).click();
    await expect(item(page, '請求書の確認（改）')).toBeVisible();
    // 削除
    await item(page, '請求書の確認（改）').getByRole('button', { name: '削除' }).click();
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: /削除/ }));
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: /削除/ }).click();
    await expect(item(page, '請求書の確認（改）')).toHaveCount(0);
    await expect(item(page, UC_A.name)).toBeVisible();
    // 開き直しで復元（A の手順も残る）
    await reloadAndEnter(page, '合成株式会社U');
    await openProject(page, '合成株式会社U', 'UC案件1');
    editor = await openUseCaseStep(page);
    await expect(item(page, UC_A.name)).toBeVisible();
    await expect(item(page, '請求書の確認（改）')).toHaveCount(0);
    await item(page, UC_A.name).getByRole('button', { name: '編集' }).click();
    await expect(page.getByRole('dialog', { name: 'ユースケース' }).getByRole('textbox', { name: '手順 3 の見出し' })).toHaveValue(UC_A.steps[2].title);
    await page.keyboard.press('Escape');
    // Project B には表示されない（異常系: 混入しない）
    await page.getByRole('button', { name: 'Project 一覧へ' }).click();
    await createProject(page, '合成株式会社U', 'UC案件2');
    await openProject(page, '合成株式会社U', 'UC案件2');
    editor = await openUseCaseStep(page);
    await expect(editor.getByText(UC_A.name)).toHaveCount(0);
    await expect(page.getByTestId('usecase-list').getByRole('listitem')).toHaveCount(0);
  });

  // FR-158 AC-285（異常系: 名称が空の登録は拒否され、保存されない）
  test('FR-158 AC-285 名称が空の登録は拒否されて一覧に増えず、入力済みの値は残る', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    const editor = await openUseCaseStep(page);
    await editor.getByRole('button', { name: 'ユースケースを追加' }).click();
    const dlg = page.getByRole('dialog', { name: 'ユースケース' });
    await dlg.getByRole('textbox', { name: '概要' }).fill('概要だけ入力');
    await dlg.getByRole('button', { name: '保存' }).click();
    await expect(dlg.getByRole('alert')).toBeVisible();
    await expect(dlg.getByRole('textbox', { name: '概要' })).toHaveValue('概要だけ入力');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('usecase-list').getByRole('listitem')).toHaveCount(0);
  });

  // FR-158 AC-289（導出の候補: 「導出（未登録）」表示つきで一覧に出る。開き直しても未登録のまま。異常系: 登録済みの一覧には現れない）
  test('FR-158 AC-289 お手本パックでは導出の候補が「導出（未登録）」つきで出て、開き直しても登録済みの一覧に現れない', async ({ page, start }) => {
    await start(); // 標準の検証条件（お手本パック mono）
    await openNewProject(page);
    let editor = await openUseCaseStep(page);
    const candidates = () => page.getByTestId('usecase-candidates').getByRole('listitem');
    await expect(candidates().first()).toBeVisible();
    const n = await candidates().count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const c = candidates().nth(i);
      await expect(c).toContainText('導出（未登録）');
      for (const label of ['名称', '概要', '対象ペルソナ', '手順', '期待する効果']) await expect(c).toContainText(label);
      // 各項目に実際の値が入っている（ラベルだけではない）
      expect(((await c.textContent()) ?? '').replace(/\s+/g, '').length).toBeGreaterThan(30);
    }
    // 登録していないので、登録済みの一覧には現れない
    await expect(page.getByTestId('usecase-list').getByRole('listitem')).toHaveCount(0);
    // 開き直しても保存されておらず、再び導出で表示される
    await reloadAndEnter(page, '合成株式会社U');
    await openProject(page, '合成株式会社U', 'UC案件1');
    editor = await openUseCaseStep(page);
    await expect(candidates()).toHaveCount(n);
    await expect(candidates().first()).toContainText('導出（未登録）');
    await expect(editor.getByTestId('usecase-list').getByRole('listitem')).toHaveCount(0);
  });
});

test.describe('FR-155  ユースケースごとのアニメーションの作成', () => {
  // FR-155 AC-275
  test('FR-155 AC-275 A を選んで作成すると、導入 1・A の手順 3（順序どおり）・効果 1 のシーンで、B の内容は含まれない', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    await openUseCaseStep(page);
    await addUseCase(page, UC_A);
    await addUseCase(page, UC_B);
    const t0 = Date.now();
    await createAnimation(page, UC_A.name);
    await expect(item(page, UC_A.name).getByRole('button', { name: 'アニメーションを再生' })).toBeEnabled({ timeout: CREATE_MS });
    expect(Date.now() - t0).toBeLessThanOrEqual(CREATE_MS + 500);
    const p = await playAnimation(page, UC_A.name);
    await p.getByRole('button', { name: '一時停止' }).click();
    const seen: string[] = [];
    const total = 1 + UC_A.steps.length + 1;
    expect(await position(p)).toMatch(/^1\s*\/\s*5$/);
    for (let i = 0; i < total; i++) {
      seen.push(((await p.getByTestId('animation-scene').textContent()) ?? '').trim());
      if (i < total - 1) await p.getByRole('button', { name: '次へ' }).click();
    }
    // 導入: 名称と対象ペルソナ
    expect(seen[0]).toContain(UC_A.name);
    expect(seen[0]).toContain(UC_A.persona);
    // 手順: A の順序どおり、見出しが一致
    UC_A.steps.forEach((s, i) => expect(seen[1 + i]).toContain(s.title));
    // 最後: 効果
    expect(seen[total - 1]).toContain(UC_A.effect!);
    // B の内容は含まれない
    for (const s of seen) {
      expect(s).not.toContain('B手順');
      expect(s).not.toContain(UC_B.name);
    }
  });

  // FR-155 AC-275（異常系・境界: 効果を入力していなければ効果のシーンはない）
  test('FR-155 AC-275 効果が未入力なら効果のシーンは作られない（導入 + 手順のみ）', async ({ page, start }) => {
    await start();
    const p = await setupAndPlay(page, { ...UC_A, effect: undefined });
    await p.getByRole('button', { name: '一時停止' }).click();
    expect(await position(p)).toMatch(/^1\s*\/\s*4$/);
    for (let i = 0; i < 3; i++) await p.getByRole('button', { name: '次へ' }).click();
    expect(await currentHeading(p)).toContain(UC_A.steps[2].title);
  });
});

test.describe('FR-156 アニメーションの再生と操作', () => {
  // FR-156 AC-279
  test('FR-156 AC-279 再生で 5 秒ごとに自動で進み、一時停止で止まり、次へ・前へで 1 シーンずつ動き、最後の後は終了になる', async ({ page, start }) => {
    test.setTimeout(60_000);
    await start();
    const p = await setupAndPlay(page);
    const total = 5;
    await expect(p).toHaveAttribute('data-animation-state', 'playing');
    expect(await position(p)).toMatch(new RegExp(`^1\\s*/\\s*${total}$`));
    // 自動進行: PARAM-047（5 秒）より前には進まず、その後に進む
    await page.waitForTimeout(SCENE_MS - 1500);
    expect(await position(p)).toMatch(/^1\s*\//);
    await expect.poll(() => position(p), { timeout: 3_500 }).toMatch(/^2\s*\//);
    // 一時停止で止まる
    await p.getByRole('button', { name: '一時停止' }).click();
    await expect(p).toHaveAttribute('data-animation-state', 'paused');
    await page.waitForTimeout(SCENE_MS + 1000);
    expect(await position(p)).toMatch(/^2\s*\//);
    // 次へ・前へは 1 シーンずつ
    await p.getByRole('button', { name: '次へ' }).click();
    expect(await position(p)).toMatch(/^3\s*\//);
    await p.getByRole('button', { name: '前へ' }).click();
    await p.getByRole('button', { name: '前へ' }).click();
    expect(await position(p)).toMatch(/^1\s*\//);
    // 異常系: 先頭でさらに前へしても 1 より前にはならない
    const prev = p.getByRole('button', { name: '前へ' });
    if (await prev.isEnabled()) await prev.click();
    expect(await position(p)).toMatch(/^1\s*\//);
    // 位置の表示が実際のシーンと一致（導入 → 手順 1）
    await p.getByRole('button', { name: '次へ' }).click();
    expect(await position(p)).toMatch(/^2\s*\//);
    expect(await currentHeading(p)).toContain(UC_A.steps[0].title);
    // 最後のシーンまで進めて再生すると、最後の後は終了
    for (let i = 2; i < total; i++) await p.getByRole('button', { name: '次へ' }).click();
    expect(await position(p)).toMatch(new RegExp(`^${total}\\s*/\\s*${total}$`));
    await p.getByRole('button', { name: '再生' }).click();
    await expect(p).toHaveAttribute('data-animation-state', 'ended', { timeout: SCENE_MS + 3_000 });
  });
});

test.describe('FR-157 動きの停止・動きを減らす設定・音声への追従', () => {
  // FR-157 AC-281
  test('FR-157 AC-281 再生中に P で動きと自動進行が止まり、停止中も次へ・前へ・終了ができ、もう一度 P で再開する', async ({ page, start }) => {
    test.setTimeout(60_000);
    await start();
    const p = await setupAndPlay(page);
    await expect(p).toHaveAttribute('data-animation-state', 'playing');
    await page.keyboard.press('p');
    await expect(p).toHaveAttribute('data-motion', 'stopped');
    const pos = await position(p);
    await page.waitForTimeout(SCENE_MS + 1500);
    expect(await position(p)).toBe(pos); // 自動進行が止まっている
    // 停止中も操作できる
    await page.keyboard.press('ArrowRight');
    expect(await position(p)).not.toBe(pos);
    await page.keyboard.press('ArrowLeft');
    expect(await position(p)).toBe(pos);
    // もう一度 P で再開し、自動進行する
    await page.keyboard.press('p');
    await expect(p).toHaveAttribute('data-motion', 'running');
    await expect.poll(() => position(p), { timeout: SCENE_MS + 3_000 }).not.toBe(pos);
    // 停止中の終了
    await page.keyboard.press('p');
    await expect(p).toHaveAttribute('data-motion', 'stopped');
    await page.keyboard.press('Escape');
    await expect(p).toBeHidden();
  });

  // FR-157 AC-282
  test('FR-157 AC-282 動きを減らす設定では、動きなしで表示され、自動で進まず、全シーンの文字が表示され、操作で進め、音は鳴らない', async ({ page, start }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start();
    const p = await setupAndPlay(page);
    await expect(p).toHaveAttribute('data-motion', 'stopped');
    const pos = await position(p);
    await page.waitForTimeout(SCENE_MS + 2000);
    expect(await position(p)).toBe(pos); // 自動で次へ進まない
    // 全シーンの見出しと説明が（動きなしで）すべて文字として表示される
    const text = (await p.textContent()) ?? '';
    for (const s of UC_A.steps) {
      expect(text).toContain(s.title);
      expect(text).toContain(s.desc);
    }
    expect(text).toContain(UC_A.name);
    expect(text).toContain(UC_A.effect!);
    // 利用者の操作で次へ進める
    await p.getByRole('button', { name: '次へ' }).click();
    expect(await position(p)).not.toBe(pos);
    // ミュート（既定）のとき音は鳴らない（異常系: 鳴ってはいけない）
    expect(await hook<boolean>(page, 't.audio.isAudible()')).toBe(false);
  });
});
