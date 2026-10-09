// System Test: 議論データの保存と復元・全量エクスポート・出力範囲・匿名化・ZIP・フォローアップ文書・Markdown からの復元・書き込み失敗
// 期待値は要求定義書の受入基準（app-core.md・quality.md）と、[ASSUMPTION] A-08 の置き換え表記から決める。
import JSZip from 'jszip';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, openScreen, entity, captureDownload, setEditMode, failingFsAccess, component } from '../support/fixtures';
import { examplePack, packWithInternal, SYNTHETIC_INTERNAL_TOKEN, ANONYMIZED_LABEL } from '../support/packs';

const mono = examplePack('mono');

function todayTokyo(): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(new Date()).replace(/-/g, '');
}

async function prepareDiscussion(page: Page) {
  await setEditMode(page, true);
  const issue = mono.issues()[0];
  const view = await openScreen(page, 'issue-solution');
  await entity(view, issue.id).first().click();
  await page.getByRole('button', { name: '議論テーマにする' }).click();
  const themes = await openScreen(page, 'themes');
  await themes.getByRole('textbox', { name: '決定事項', exact: true }).fill('決定ST: 段階導入で進める');
  await themes.getByRole('textbox', { name: '未決事項', exact: true }).fill('未決ST: 予算の上限');
  await themes.getByRole('textbox', { name: '選択肢', exact: true }).fill('選択肢ST: A/B');
  await page.waitForTimeout(300);
  return { issue, themes };
}

async function openExport(page: Page) {
  await page.keyboard.press('Control+Shift+E');
  const dlg = page.getByRole('dialog', { name: /エクスポート/ });
  await expect(dlg).toBeVisible();
  return dlg;
}

/** ダウンロードした .md または .zip の中の Markdown をすべて読む */
async function readExport(name: string, data: Buffer): Promise<{ md: Record<string, string>; zip?: JSZip }> {
  if (/\.md$/i.test(name)) return { md: { [name]: data.toString('utf8') } };
  const zip = await JSZip.loadAsync(data);
  const md: Record<string, string> = {};
  for (const f of Object.keys(zip.files)) if (/\.md$/i.test(f)) md[f] = await zip.files[f].async('string');
  return { md, zip };
}

test.describe('FR-051 議論データの保存と復元', () => {
  // FR-051 AC-063
  test('FR-051 AC-063 保存の既定のファイル名が日付・顧客名・Project 名で組み立てられ、空のアプリで読み込むと元どおり', async ({ page, start, browser }) => {
    const app = await start();
    await prepareDiscussion(page);
    const downloadP = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: '保存' }).first().click();
    const expected = `${todayTokyo()}-${mono.customerName}-${mono.projectName}-discussion-memo.md`;
    const dlg = page.getByRole('dialog', { name: /保存/ });
    if (await dlg.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true).catch(() => false)) {
      // 既定のファイル名が提示される
      await expect(dlg.getByRole('textbox', { name: /ファイル名/ })).toHaveValue(expected);
      await dlg.getByRole('button', { name: /保存|ダウンロード/ }).last().click();
    }
    const download = await downloadP;
    const file = { name: download.suggestedFilename(), data: (await import('node:fs')).readFileSync((await download.path())!) };
    expect(file.name).toBe(expected);
    // 空の状態のアプリ（別のブラウザーのプロファイル）で読み込む
    const ctx = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
    const p2 = await ctx.newPage();
    await p2.goto(app.url);
    await p2.keyboard.press('Escape');
    await p2.getByTestId('workspace').waitFor();
    const [chooser] = await Promise.all([p2.waitForEvent('filechooser'), p2.getByRole('button', { name: /開く|読み込む/ }).first().click()]);
    await chooser.setFiles({ name: file.name, mimeType: 'text/markdown', buffer: file.data });
    await p2.getByTestId('nav-themes').click();
    const themes = p2.getByTestId('component-themes');
    await themes.getByRole('listitem').filter({ hasText: mono.issues()[0].title }).click();
    await expect(themes.getByRole('textbox', { name: '決定事項', exact: true })).toHaveValue('決定ST: 段階導入で進める');
    await expect(themes.getByRole('textbox', { name: '未決事項', exact: true })).toHaveValue('未決ST: 予算の上限');
    await ctx.close();
  });
});

test.describe('FR-052 全量エクスポート', () => {
  // FR-052 AC-064
  test('FR-052 AC-064 Ctrl+Shift+E でエクスポートの画面が開き、File System Access API がないと ZIP がダウンロードされる', async ({ page, start }) => {
    await start({ disableFileSystemAccess: true });
    const dlg = await openExport(page);
    await dlg.getByRole('radio', { name: '.zip' }).check().catch(() => {});
    const { name, data } = await captureDownload(page, () => dlg.getByRole('button', { name: 'エクスポート', exact: true }).click());
    expect(name).toMatch(/\.zip$/);
    expect(data.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  // FR-052 AC-064（常設ボタン）
  test('FR-052 AC-064 常設のエクスポートボタンからも同じ画面が開く', async ({ page, start }) => {
    await start();
    await page.getByRole('button', { name: 'エクスポート' }).first().click();
    await expect(page.getByRole('dialog', { name: /エクスポート/ })).toBeVisible();
  });
});

test.describe('FR-054 出力範囲・匿名化・形式', () => {
  // FR-054 AC-066
  test('FR-054 AC-066 範囲を「決定事項のみ」にするとプレビューは決定事項の節だけになる', async ({ page, start }) => {
    await start();
    await prepareDiscussion(page);
    const dlg = await openExport(page);
    await dlg.getByRole('radio', { name: '決定事項のみ' }).check();
    const preview = dlg.getByTestId('export-preview');
    await expect(preview).toContainText('決定ST: 段階導入で進める');
    const headings = (await preview.getByRole('heading').allInnerTexts()).map((h) => h.trim()).filter(Boolean);
    expect(headings.length).toBeGreaterThan(0);
    for (const h of headings) expect(h, `決定事項以外の節「${h}」がある`).toMatch(/決定事項|^.*テーマ|^\d{4}/);
    await expect(preview).not.toContainText('未決ST: 予算の上限');
    await expect(preview).not.toContainText('選択肢ST: A/B');
  });

  // FR-054 AC-066（匿名化）
  test('FR-054 AC-066 internal を含むデータで匿名化を ON にすると、出力に internal の値が含まれず置き換えた旨の表記がある', async ({ page, start }) => {
    const pack = packWithInternal('mono');
    await start({ pack });
    const dlg = await openExport(page);
    await dlg.getByRole('radio', { name: '全体' }).check();
    await dlg.getByRole('checkbox', { name: /匿名化/ }).check();
    await expect(dlg.getByTestId('export-preview')).not.toContainText(SYNTHETIC_INTERNAL_TOKEN);
    const { name, data } = await captureDownload(page, () => dlg.getByRole('button', { name: 'エクスポート', exact: true }).click());
    const { md, zip } = await readExport(name, data);
    const all = Object.values(md).join('\n');
    expect(all).not.toContain(SYNTHETIC_INTERNAL_TOKEN);
    expect(all).toContain(ANONYMIZED_LABEL);
    if (zip) for (const f of Object.keys(zip.files)) {
      if (zip.files[f].dir) continue;
      const s = await zip.files[f].async('string');
      expect(s.includes(SYNTHETIC_INTERNAL_TOKEN), `${f} に internal の値がある`).toBe(false);
    }
  });

  // FR-054 AC-066（異常系: 匿名化 OFF なら置き換わらないことの対照）
  test('FR-054 AC-066 異常系: 匿名化が OFF のときは internal の値を含むことをプレビューで確かめられる', async ({ page, start }) => {
    const pack = packWithInternal('mono');
    await start({ pack });
    const dlg = await openExport(page);
    await dlg.getByRole('radio', { name: '全体' }).check();
    await dlg.getByRole('checkbox', { name: /匿名化/ }).uncheck();
    await expect(dlg.getByTestId('export-preview')).toContainText(SYNTHETIC_INTERNAL_TOKEN);
  });

  // FR-054 AC-067
  test('FR-054 AC-067 .zip を選ぶと .md と assets/ の画像を含む ZIP ができ、画像リンクが ZIP 内の相対パスを指す', async ({ page, start }) => {
    await start();
    const dlg = await openExport(page);
    await dlg.getByRole('radio', { name: '全体' }).check();
    await dlg.getByRole('radio', { name: '.zip' }).check();
    const { name, data } = await captureDownload(page, () => dlg.getByRole('button', { name: 'エクスポート', exact: true }).click());
    expect(name).toMatch(/\.zip$/);
    const zip = await JSZip.loadAsync(data);
    const files = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
    const mds = files.filter((f) => f.endsWith('.md'));
    const imgs = files.filter((f) => /(^|\/)assets\/.+\.(png|svg|jpe?g|webp)$/i.test(f));
    expect(mds.length).toBeGreaterThan(0);
    expect(imgs.length).toBeGreaterThan(0);
    let links = 0;
    for (const m of mds) {
      const text = await zip.files[m].async('string');
      for (const [, href] of text.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
        links++;
        expect(href, '画像リンクが絶対パスか URL').not.toMatch(/^(\/|[a-z]+:)/i);
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(m), decodeURI(href)));
        expect(files, `${href} が ZIP 内にない`).toContain(resolved);
      }
    }
    expect(links).toBeGreaterThan(0);
  });
});

test.describe('FR-055 フォローアップ文書', () => {
  // FR-055 AC-068
  test('FR-055 AC-068 フォローアップ文書の生成を選ぶと 3 種類の文書が出力に含まれ、未決事項と決定事項がそれぞれに載る', async ({ page, start }) => {
    await start();
    await prepareDiscussion(page);
    const dlg = await openExport(page);
    await dlg.getByRole('radio', { name: '.zip' }).check();
    await dlg.getByRole('checkbox', { name: /フォローアップ文書/ }).check();
    const { name, data } = await captureDownload(page, () => dlg.getByRole('button', { name: 'エクスポート', exact: true }).click());
    const { md } = await readExport(name, data);
    const find = (re: RegExp) => Object.entries(md).find(([f, t]) => re.test(f) || re.test(t.split('\n').find((l) => l.startsWith('#')) ?? ''));
    const agenda = find(/次回アジェンダ/);
    const requests = find(/確認依頼事項/);
    const summary = find(/合意事項サマリー/);
    expect(agenda, '次回アジェンダがない').toBeTruthy();
    expect(requests, '確認依頼事項がない').toBeTruthy();
    expect(summary, '合意事項サマリーがない').toBeTruthy();
    expect(requests![1]).toContain('未決ST: 予算の上限');
    expect(summary![1]).toContain('決定ST: 段階導入で進める');
  });
});

test.describe('FR-056 Markdown からの復元', () => {
  async function exportFullMd(page: Page) {
    const dlg = await openExport(page);
    await dlg.getByRole('radio', { name: '全体' }).check();
    await dlg.getByRole('radio', { name: '.md' }).check();
    return captureDownload(page, () => dlg.getByRole('button', { name: 'エクスポート', exact: true }).click());
  }
  async function loadMd(page: Page, name: string, data: Buffer) {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /開く|読み込む/ }).first().click()]);
    await chooser.setFiles({ name, mimeType: 'text/markdown', buffer: data });
  }

  // FR-056 AC-069
  test('FR-056 AC-069 編集後の全量 Markdown を、初期状態に戻したアプリで読み込むとデータ・議論・決定事項が元どおり', async ({ page, start }) => {
    await start();
    const { issue } = await prepareDiscussion(page);
    const table = await openScreen(page, 'table');
    const cell = table.getByRole('gridcell').filter({ hasText: issue.title }).first();
    await cell.dblclick();
    await cell.getByRole('textbox').fill(`${issue.title}-復元ST`);
    await page.keyboard.press('Enter');
    const { name, data } = await exportFullMd(page);
    expect(name).toMatch(/\.md$/);
    const text = data.toString('utf8');
    expect(text.startsWith('---'), 'front matter がない').toBe(true);
    expect(text).toMatch(/```json/);
    // 初期状態に戻す
    await page.getByRole('button', { name: 'サンプルに戻す' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /戻す|OK|はい/ }).click().catch(() => {});
    await expect(await openScreen(page, 'table')).not.toContainText(`${issue.title}-復元ST`);
    await loadMd(page, name, data);
    await expect(await openScreen(page, 'table')).toContainText(`${issue.title}-復元ST`);
    const themes = await openScreen(page, 'themes');
    await themes.getByRole('listitem').filter({ hasText: issue.title }).first().click();
    await expect(themes.getByRole('textbox', { name: '決定事項', exact: true })).toHaveValue('決定ST: 段階導入で進める');
    await expect(themes.getByRole('textbox', { name: '未決事項', exact: true })).toHaveValue('未決ST: 予算の上限');
  });

  // FR-056 AC-069（異常系: 壊れた JSON ブロック）
  test('FR-056 AC-069 異常系: 壊れた JSON ブロックを含むファイルは読み込まれず原因が表示され、現在のデータは変わらない', async ({ page, start }) => {
    await start();
    const { issue } = await prepareDiscussion(page);
    const { name, data } = await exportFullMd(page);
    const broken = data.toString('utf8').replace(/```json\s*\{/, '```json\n{ "broken": [ ,,, ');
    expect(broken).not.toBe(data.toString('utf8'));
    const table = await openScreen(page, 'table');
    const cell = table.getByRole('gridcell').filter({ hasText: issue.title }).first();
    await cell.dblclick();
    await cell.getByRole('textbox').fill(`${issue.title}-現在の値`);
    await page.keyboard.press('Enter');
    await loadMd(page, name, Buffer.from(broken, 'utf8'));
    await expect(page.getByRole('alert').first()).toContainText(/JSON/);
    await expect(await openScreen(page, 'table')).toContainText(`${issue.title}-現在の値`);
  });
});

test.describe('NFR-UX-004 エラーの原因と次の行動', () => {
  // NFR-UX-004 AC-188
  test('NFR-UX-004 AC-188 書き込みが失敗する保存先へのエクスポートで原因と「ZIP でダウンロード」が出て、設定と編集中のデータが残る', async ({ page, start }) => {
    await failingFsAccess(page);
    await start({ disableFileSystemAccess: false });
    const { issue } = await prepareDiscussion(page);
    const dlg = await openExport(page);
    await dlg.getByRole('radio', { name: '決定事項のみ' }).check();
    await dlg.getByRole('radio', { name: '.md' }).check();
    await dlg.getByRole('button', { name: 'エクスポート', exact: true }).click();
    const alert = page.getByRole('alert').filter({ hasText: /失敗|できません/ }).first();
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/書き込み|保存先|権限/);
    const zipBtn = page.getByRole('button', { name: 'ZIP でダウンロード' });
    await expect(zipBtn).toBeVisible();
    await expect(page.getByRole('dialog', { name: /エクスポート/ }).getByRole('radio', { name: '決定事項のみ' })).toBeChecked();
    const { name } = await captureDownload(page, () => zipBtn.click());
    expect(name).toMatch(/\.zip$/);
    await page.keyboard.press('Escape');
    const themes = await openScreen(page, 'themes');
    await themes.getByRole('listitem').filter({ hasText: issue.title }).first().click();
    await expect(themes.getByRole('textbox', { name: '決定事項', exact: true })).toHaveValue('決定ST: 段階導入で進める');
    void component;
  });
});
