// System Test: 画面内ガイド（FR-266〜FR-268・FR-269・FR-270・FR-272。要求定義書 docs/requirements/analysis-projects.md の system レベルの AC）
// 期待値は受入基準だけから決める。画面の探し方: 「はじめての方へ」region・「使い方を見る」button・「顧客パック」region・「使い方」button・ウェルカム dialog。
// 取り決め: ウェルカムは起動時に自動では出さない（FR-267 改訂 2026-11-03）。メイン画面の右上のアイコン（名前「使い方を見る」）から開く。
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
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
  test('FR-266 AC-675 AC-820 AC-821 「はじめての方へ」は既定で閉じ、開閉ボタンは常に見えて aria-expanded が変わり Enter・Space で開閉できる。開くと、できること・用語・4 手順が表示され各文は 60 字以内。開閉は 500ms 以内の動きで、動きの軽減では即時。幅 320 では本文の下へ回る', async ({ page, start }) => {
    const { app, main } = await startAtMain(page, start);
    const toggle = main.getByRole('button', { name: 'はじめての方へ' });
    const guide = main.getByRole('region', { name: 'はじめての方へ' });
    // 既定（起動直後）は閉じた状態: ボタンは見え、aria-expanded=false、説明は表示されない
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(guide).toBeHidden();
    // キーボード: Enter で開き、Space で閉じる（aria-expanded が開閉に合わせて変わる）
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(guide).toBeVisible();
    await page.keyboard.press(' ');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(guide).toBeHidden();
    await expect(toggle, '閉じた状態でもボタンは見える').toBeVisible();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(guide).toBeVisible();
    const text = await guide.innerText();
    for (const t of ['企業', 'Project', 'デモ', '顧客パック']) expect(text, `用語「${t}」の説明がない`).toContain(t);
    for (const s of ['企業を登録', 'Project を作成', 'Project を開く', '分析を開始']) expect(text, `手順「${s}」がない`).toContain(s);
    expect((text.match(/例/g) ?? []).length, '各手順の「例」が 4 つ未満').toBeGreaterThanOrEqual(4);
    expect(text).toMatch(/次に/);
    // 同じパネルにある「顧客パックとは」（FR-268）は Prompt の全文を含むので、60 字の対象は「はじめての方へ」の説明だけにする
    const ownText = await guide.evaluate((el) => {
      const pack = el.querySelector<HTMLElement>('[data-testid="pack-guide"]');
      const prev = pack?.style.display ?? '';
      if (pack) pack.style.display = 'none';
      const out = (el as HTMLElement).innerText;
      if (pack) pack.style.display = prev;
      return out;
    });
    expectShortSentences(ownText, '「はじめての方へ」');

    // FR-266 AC-820: 開閉の動きの所要時間は 500ms（PARAM-074）以内。動きの軽減（reduce）では 0 で即時に切り替わり、状態は変わらず伝わる
    const maxMotionMs = () => guide.evaluate((el) => {
      let worst = 0;
      const toMs = (v: string) => Math.max(...v.split(',').map((s) => (s.trim().endsWith('ms') ? parseFloat(s) : parseFloat(s) * 1000) || 0));
      for (let e: Element | null = el; e && e.getAttribute('data-testid') !== 'main-screen'; e = e.parentElement) {
        const cs = getComputedStyle(e);
        worst = Math.max(worst, toMs(cs.transitionDuration) + toMs(cs.transitionDelay), toMs(cs.animationDuration) + toMs(cs.animationDelay));
      }
      return worst;
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const normalMs = await maxMotionMs();
    expect(normalMs, '開閉がアニメーションになっていない').toBeGreaterThan(0);
    expect(normalMs, '開閉の所要時間が 500ms を超える').toBeLessThanOrEqual(500);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await maxMotionMs(), '動きの軽減で動きが残っている').toBe(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(guide).toBeHidden({ timeout: 300 });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(guide).toBeVisible({ timeout: 300 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // FR-266 AC-821: 広い画面では手順の案内の右側、幅 320（PARAM-029）では本文の下。横スクロールなしで開閉・全操作ができる
    const open = main.getByRole('button', { name: 'Project を開く' });
    const wide = (await guide.boundingBox())!;
    const openBox = (await open.boundingBox())!;
    expect(wide.x, '広い画面でパネルが手順の案内の右側にない').toBeGreaterThanOrEqual(openBox.x + openBox.width - 1);
    await page.setViewportSize({ width: 320, height: 800 });
    await expect(toggle).toBeVisible();
    await expect.poll(async () => (await guide.boundingBox())!.y, { message: '狭い画面でパネルが本文の下へ回らない' }).toBeGreaterThanOrEqual((await open.boundingBox())!.y + (await open.boundingBox())!.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), '横スクロールが出る').toBe(true);
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(main.getByRole('button', { name: '企業を登録' })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 720 });

    // 再読込後は、開いていても既定の閉じた状態に戻る
    await app.reload({ skipOpening: false });
    await pressOpeningEscape(page);
    const again = page.getByTestId('main-screen');
    await expect(again.getByRole('button', { name: 'はじめての方へ' })).toHaveAttribute('aria-expanded', 'false');
    await expect(again.getByRole('region', { name: 'はじめての方へ' })).toBeHidden();
  });

  // FR-266 AC-675（異常系: 企業・Project を登録しても、既定は閉じたまま。開閉は登録の有無によらず同じに動く）
  test('FR-266 AC-675 異常系: 企業と Project を登録した後も「はじめての方へ」は閉じた状態で、ボタンで開くと説明が表示される', async ({ page, start }) => {
    const { main } = await startAtMain(page, start);
    await main.getByRole('button', { name: '企業を登録' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('textbox', { name: '企業名' }).fill('合成株式会社G');
    await dlg.getByRole('button', { name: '登録' }).click();
    await expect(dlg).toBeHidden();
    await expect(main.getByRole('region', { name: '企業 合成株式会社G' })).toBeVisible();
    const toggle = main.getByRole('button', { name: 'はじめての方へ' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(main.getByRole('region', { name: 'はじめての方へ' })).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(main.getByRole('region', { name: 'はじめての方へ' })).toBeVisible();
  });
});

test.describe('FR-267 ウェルカムのウィザードの起動アイコン', () => {
  // FR-267 AC-678（起動時は自動表示なし。右上のアイコンから開始。確認済みの記録・「次回から表示しない」はない）
  test('FR-267 AC-678 起動すると最初はメイン画面でウェルカムは自動では出ず、右上のアイコン「使い方を見る」で開き、次へ・戻るでカードが替わり、スキップで閉じる。再読込でも自動では出ず、アイコンから再度開ける', async ({ page, start }) => {
    const { app, main } = await startAtMain(page, start);
    const wizard = () => page.getByRole('dialog', { name: /ウェルカム|はじめ|使い方/ });
    // 初回起動（端末内に何も保存されていない）でも自動では出ない
    await expect(wizard()).toHaveCount(0);
    const icon = main.getByRole('button', { name: '使い方を見る' }).first();
    await expect(icon).toBeVisible();
    // 画面の右上にある（右半分・上部）
    const box = (await icon.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.x + box.width / 2, 'アイコンが右半分にない').toBeGreaterThan(vp.width / 2);
    expect(box.y, 'アイコンが上部にない').toBeLessThan(vp.height / 4);
    // ツールチップ・ラベル
    expect((await icon.getAttribute('title')) ?? (await icon.getAttribute('aria-describedby')) ?? (await icon.getAttribute('aria-label')), 'ツールチップ・ラベルがない').toBeTruthy();
    await icon.click();
    const dlg = wizard();
    await expect(dlg).toBeVisible();
    const first = await dlg.innerText();
    await dlg.getByRole('button', { name: '次へ' }).click();
    expect(await dlg.innerText()).not.toEqual(first);
    await dlg.getByRole('button', { name: '戻る' }).click();
    expect(await dlg.innerText()).toEqual(first);
    // 「次回から表示しない」の選択肢はない（異常系: 廃止した機能が残っていない）
    await expect(dlg.getByRole('checkbox', { name: '次回から表示しない' })).toHaveCount(0);
    await dlg.getByRole('button', { name: 'スキップ' }).click();
    await expect(dlg).toBeHidden();
    await expect(main).toBeVisible();
    // 再読込・再起動でも自動では出ない
    await app.reload({ skipOpening: false });
    await pressOpeningEscape(page);
    await expect(wizard()).toHaveCount(0);
    // アイコンからいつでも再表示できる。Esc で閉じても次の起動で自動表示されない
    await page.getByTestId('main-screen').getByRole('button', { name: '使い方を見る' }).first().click();
    await expect(wizard()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(wizard()).toBeHidden();
    await app.reload({ skipOpening: false });
    await pressOpeningEscape(page);
    await expect(wizard()).toHaveCount(0);
  });

  // FR-267 AC-678（異常系: 旧取り決めの welcome=1 を付けても自動では出ない）
  test('FR-267 AC-678 異常系: URL に welcome=1 を付けても、ウェルカムは自動では出ず、「使い方を見る」で開ける', async ({ page, start }) => {
    const { main } = await startAtMain(page, start, '?welcome=1');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await main.getByRole('button', { name: '使い方を見る' }).first().click();
    await expect(page.getByRole('dialog', { name: /ウェルカム|はじめ|使い方/ })).toBeVisible();
  });
});


test.describe('FR-268 顧客パックの説明カード', () => {
  // FR-268 AC-682
  test('FR-268 AC-682 メイン画面の「顧客パック」の説明に、意味・デモで試せること・作り方 3 通り・確認コマンド 2 つ・起動の手順が表示される', async ({ page, start }) => {
    const { main } = await startAtMain(page, start);
    // 補足パネル（既定は閉じた状態）を開いてから、パネルの中の説明カードを確かめる
    await main.getByRole('button', { name: 'はじめての方へ' }).click();
    const panel = main.getByRole('region', { name: 'はじめての方へ' });
    await expect(panel).toBeVisible();
    const card = panel.getByRole('region', { name: /顧客パック/ }).first();
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

  // FR-268 AC-682（AC-830 の画面側。AC-830 は integration 層のため台帳の対象外）
  test('FR-268 AC-682 メイン画面の「はじめての方へ」／「顧客パックとは」に、①準備〜⑥画面への反映の完全な手順が、コピーできるコマンド（npm install・npm run pack:kit）と kit の場所つきで表示される', async ({ page, start }) => {
    const { main } = await startAtMain(page, start);
    await main.getByRole('button', { name: 'はじめての方へ' }).click();
    const card = main.getByRole('region', { name: 'はじめての方へ' }).getByRole('region', { name: /顧客パック/ }).first();
    await expect(card).toBeVisible();
    const t = await card.innerText();
    for (const s of ['準備', '方法 A', '方法 B', '方法 C', '検証', '画面への反映']) expect(t, `手順「${s}」がない`).toContain(s);
    for (const s of ['npm install', 'npm run pack:kit', 'tools/envisioning/_attach/customer-pack-kit.md', 'public/data', 'public/brand', 'npm run build', 'npm start', 'npm run check:pack', 'npm run verify:pack']) {
      expect(t, `「${s}」の記述がない`).toContain(s);
    }
    // 異常系: エラーが出たときの直し方
    expect(t, 'エラーが出たときの直し方がない').toMatch(/エラー/);
    // コピーできる: npm install と npm run pack:kit のコピーボタンがある
    await expect(card.getByRole('button', { name: /コピー/ }).nth(1), 'コピーボタンが足りない').toBeVisible();
    expect(await card.getByRole('button', { name: /コピー/ }).count()).toBeGreaterThanOrEqual(7);
  });

  // FR-268 AC-682（異常系: 顧客パックが空（public/data なし）でも説明が出る）
  test('FR-268 AC-682 異常系: 顧客パックがない（pack: null）状態でも、顧客パックの説明とデモで試せる旨が表示される', async ({ page, start }) => {
    const app = await start({ skipOpening: false, pack: null });
    void app;
    await pressOpeningEscape(page);
    const main = page.getByTestId('main-screen');
    await expect(main).toBeVisible();
    await main.getByRole('button', { name: 'はじめての方へ' }).click();
    const card = main.getByRole('region', { name: 'はじめての方へ' }).getByRole('region', { name: /顧客パック/ }).first();
    await expect(card).toBeVisible();
    await expect(card).toContainText('顧客パックがなくても');
  });

  // FR-268 AC-834（kit の折りたたみ表示・コピー・貼り付け手順。AC-835 の画面側: 画面の kit = 正本ファイル）
  test('FR-268 AC-834 AC-835 「はじめての方へ」の顧客パックの節に kit の折りたたみ表示（既定は閉）があり、開くと kit の全文が正本ファイルと一致し、「コピー」でクリップボードに全文が入り「コピーしました」が通知される。貼り付け手順も書かれている', async ({ page, context, start }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const kit = fs.readFileSync(path.join(process.cwd(), '..', '..', 'tools', 'envisioning', '_attach', 'customer-pack-kit.md'), 'utf8').replace(/\r\n/g, '\n');
    const { main } = await startAtMain(page, start);
    await main.getByRole('button', { name: 'はじめての方へ' }).click();
    const card = main.getByRole('region', { name: 'はじめての方へ' }).getByRole('region', { name: /顧客パック/ }).first();
    await expect(card).toBeVisible();
    const toggle = card.locator('summary, button[aria-expanded]').filter({ hasText: /kit/i }).first();
    await expect(toggle, 'kit の折りたたみ表示がない').toBeVisible();
    const kitBox = card.locator('details').filter({ has: toggle }).first();
    const isDetails = (await kitBox.count()) > 0;
    const expanded = async () => (isDetails ? await kitBox.evaluate((e) => (e as HTMLDetailsElement).open) : (await toggle.getAttribute('aria-expanded')) === 'true');
    expect(await expanded(), '既定は閉じた状態').toBe(false);
    // 貼り付け手順（Prompt と kit を貼る）が画面に書かれている
    const t = await card.innerText();
    expect(t, 'kit を貼り付ける手順がない').toMatch(/貼り付け/);
    // 開くと kit の全文が読める。正本ファイルと一致する（AC-835）
    await toggle.click();
    expect(await expanded(), 'クリックで開かない').toBe(true);
    const shown = card.locator('pre, textarea').filter({ hasText: /schema\/.*\.json|customer-pack-kit/ }).first();
    await expect(shown, 'kit の本文が表示されない').toBeVisible();
    const body = (await shown.evaluate((e) => (e instanceof HTMLTextAreaElement ? e.value : (e as HTMLElement).textContent ?? ''))).replace(/\r\n/g, '\n');
    expect(body.trim(), '画面の kit が tools の kit と一致しない').toBe(kit.trim());
    // コピー: クリップボードに全文が入り、支援技術に「コピーしました」が伝わる
    const copyBtn = card.locator('details, div, section').filter({ has: page.locator('pre, textarea').filter({ hasText: /schema\/.*\.json|customer-pack-kit/ }) }).last().getByRole('button', { name: /コピー/ }).first();
    await copyBtn.click();
    const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    expect(copied.trim(), 'コピーした内容が kit の全文でない').toBe(kit.trim());
    await expect(page.locator('[role="status"], [aria-live]').filter({ hasText: 'コピーしました' }).first(), '「コピーしました」が支援技術に伝わらない').toBeAttached();
  });

  // FR-268 AC-834（異常系: クリップボードが使えない）
  test('FR-268 AC-834 異常系: クリップボードが使えないとき、kit の文字列は選択できる状態で示され、原因と次の行動が表示される', async ({ page, start }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')), write: () => Promise.reject(new Error('denied')) }, configurable: true });
      (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    });
    const { main } = await startAtMain(page, start);
    await main.getByRole('button', { name: 'はじめての方へ' }).click();
    const card = main.getByRole('region', { name: 'はじめての方へ' }).getByRole('region', { name: /顧客パック/ }).first();
    const toggle = card.locator('summary, button[aria-expanded]').filter({ hasText: /kit/i }).first();
    await toggle.click();
    const shown = card.locator('pre, textarea').filter({ hasText: /schema\/.*\.json|customer-pack-kit/ }).first();
    await expect(shown).toBeVisible();
    await card.locator('details, div, section').filter({ has: page.locator('pre, textarea').filter({ hasText: /schema\/.*\.json|customer-pack-kit/ }) }).last().getByRole('button', { name: /コピー/ }).first().click();
    const alert = card.locator('[role="alert"], [role="status"]').filter({ hasText: /コピーできません|コピーに失敗|クリップボード/ }).first();
    await expect(alert, '原因と次の行動が表示されない').toBeVisible();
    await expect(alert).toContainText(/選択|手動|自分で/);
    const sel = await shown.evaluate((e) => getComputedStyle(e).userSelect);
    expect(sel, '文字列が選択できない').not.toBe('none');
  });

  // FR-268 AC-836（平易な表現。技術用語を主文に使わない。担当者向け更新手順は 1 行だけ別に残る）
  test('FR-268 AC-836 「はじめての方へ」の schema の入手先は平易な表現（kit・コピーして貼り付け・担当者へ依頼）で、担当者向けの更新手順 npm run gen:schema が 1 行だけ別に残る', async ({ page, start }) => {
    const { main } = await startAtMain(page, start);
    await main.getByRole('button', { name: 'はじめての方へ' }).click();
    const card = main.getByRole('region', { name: 'はじめての方へ' }).getByRole('region', { name: /顧客パック/ }).first();
    await expect(card).toBeVisible();
    const t = await card.innerText();
    expect(t, '書式の定義が kit にまとまっている旨がない').toMatch(/書式の定義[\s\S]{0,40}kit/);
    expect(t).toMatch(/コピーして[\s\S]{0,20}貼り付け/);
    expect(t, '書式が古いとき担当者に更新を依頼する旨がない').toMatch(/書式が古い[\s\S]{0,60}担当者[\s\S]{0,20}依頼/);
    const lines = t.split('\n').filter((l) => l.includes('npm run gen:schema'));
    expect(lines.length, '担当者向けの更新手順（npm run gen:schema）が 1 行だけ別にあるはず').toBe(1);
    // 入手先の主文（gen:schema の行以外で「書式の定義」を述べる文）に技術用語がない
    const mainSentences = t.split(/[。\n]/).filter((s) => /書式の定義/.test(s) && !s.includes('npm run'));
    expect(mainSentences.length).toBeGreaterThan(0);
    for (const s of mainSentences) expect(s, `主文に技術用語がある: ${s}`).not.toMatch(/リポジトリ|schema|スキーマ|コマンド|npm|\.json/i);
    // 旧パスは画面に残らない
    // 旧 kit パスと技術表現は残らない（Prompt の出力先 work/envisioning/<顧客>/ は正当なので検査しない）
    expect(t).not.toContain('work/envisioning/_attach');
    expect(t).not.toMatch(/リポジトリの\s*schema/);
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