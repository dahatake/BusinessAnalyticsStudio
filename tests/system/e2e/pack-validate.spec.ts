// System Test: 顧客パックのブラウザー内の検証（FR-303。要求定義書 docs/requirements/customer-pack.md の system レベルの AC）
// 期待値は受入基準だけから決める。入力は examples/mono の public/data の JSON 9 個と brand-profile.json（FR-302 の対象ファイル）。
// 取り込み画面は「はじめての方へ」の顧客パックの節の入口（FR-268 AC-856）から開く。ファイルは input[type=file] へ渡す（複数選択と同じ）。
// 画面の探し方（契約に載るまでの暫定）: 取り込み画面＝ファイル入力と「取り込む」ボタンのある領域。結果は画面の本文の文言で見る。
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../support/fixtures';
import { examplePack, PACK_FILES } from '../support/packs';
import { openUploadScreen, startAtMain, reloadAtMain, selectFiles, storedPacks } from '../support/pack-upload';

type Upload = { name: string; mimeType: string; buffer: Buffer };

/** お手本パック（mono）のファイル群。overrides のキー（例: issues.json）は中身を差し替え、null は欠かす。 */
function monoFiles(overrides: Record<string, string | null> = {}): Upload[] {
  const pack = examplePack('mono');
  const out: Upload[] = [];
  const entries: Array<[string, string]> = [
    ...PACK_FILES.map((n) => [`${n}.json`, pack.file(n)] as [string, string]),
    ['brand-profile.json', path.join(pack.root, 'public', 'brand', 'brand-profile.json')],
  ];
  for (const [name, file] of entries) {
    const ov = overrides[name];
    if (ov === null) continue;
    out.push({ name, mimeType: 'application/json', buffer: Buffer.from(ov ?? fs.readFileSync(file, 'utf8'), 'utf8') });
  }
  return out;
}

const body = (page: Page) => page.locator('body');

test.describe('FR-303 ブラウザー内の顧客パックの検証', () => {
  // FR-303 AC-846 AC-849
  test('FR-303 AC-846 AC-849 壊れた JSON は名前と位置が日本語で示され取り込めずほかの検証も続く。結果は 合否・無効になる項目・警告 に分かれ、起動して判定する項目は合否に含めない旨が出る。正常なパックは取り込める', async ({ page, start }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    const app = await startAtMain(page, start);
    const upload = await openUploadScreen(page);
    const importBtn = upload.getByRole('button', { name: '取り込む' });
    const box = upload.getByRole('checkbox', { name: '確かめました' });

    // ── 異常系（AC-846）: 2 つの JSON が構文エラー、ほかは正常
    await selectFiles(upload, monoFiles({
      'issues.json': '{ "issues": [ { "id": "ISS-1", ',
      'plan.json': '{ "features": [ 1, 2, ',
    }));
    await expect(body(page)).toContainText('issues.json');
    await expect(body(page)).toContainText('plan.json');
    const t = await body(page).innerText();
    // 構文エラーであること（日本語）と、位置（行・桁、または位置）
    expect(t, '構文エラーであることが日本語で示されない').toMatch(/構文|JSON として読めません|解釈できません/);
    expect(t, '構文エラーの位置（行・桁・位置）が示されない').toMatch(/行|桁|位置/);
    // 2 ファイルとも（ほかのファイルの検証は続き、まとめて示される）
    expect((t.match(/issues\.json/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((t.match(/plan\.json/g) ?? []).length).toBeGreaterThanOrEqual(1);
    await expect(importBtn, 'エラーがあるのに取り込める').toBeDisabled();
    expect(pageErrors, 'ページエラーになった').toEqual([]);

    // ── 正常（AC-849）: 結果が区分けされ、日本語で表示される
    await selectFiles(upload, monoFiles());
    const ok = body(page);
    await expect(ok).toContainText(/起動して(判定|確か)/);      // 起動して判定する項目は合否に含めない旨
    await expect(ok).toContainText(/合否/);
    await expect(ok).toContainText(/警告/);
    await expect(ok).toContainText(/無効/);                       // 無効になる項目（なければ 0 件と示す）
    const t2 = await ok.innerText();
    for (const s of [/スキーマ/, /Primary|プライマリ/, /AA/, /出典/, /顧客名/]) expect(t2, `検査項目 ${s} の表示がない`).toMatch(s);
    expect(t2, '古い構文エラーの結果が残っている').not.toMatch(/issues\.json[^\n]*(構文|JSON として読めません)/);
    // 取り込み前の確認（AC-851・855）: 「確かめました」を選ぶまで「取り込む」は押せず、選んでから取り込める
    await upload.getByRole('radio', { name: '新規 Project を作成' }).check();
    await expect(box).not.toBeChecked();
    await expect(importBtn, '確かめる前に「取り込む」が押せる').toBeDisabled();
    await box.check();
    await expect(importBtn, 'エラー 0 件のお手本パックで、確かめたのに取り込めない').toBeEnabled();
    expect(pageErrors, 'ページエラーになった').toEqual([]);

    // ── 異常系（AC-849）: 顧客名が空 → 原因（ファイル名・位置・直し方）が日本語で示され、取り込めない
    const customer = JSON.parse(fs.readFileSync(examplePack('mono').file('customer'), 'utf8'));
    customer.name = '';
    await selectFiles(upload, monoFiles({ 'customer.json': JSON.stringify(customer) }));
    await expect(body(page)).toContainText('customer.json');
    await expect(body(page)).toContainText(/顧客名|name/);
    await expect(importBtn).toBeDisabled();

    // ── 正常（AC-851・855）: お手本パックを選び直し、確かめてから取り込む
    await selectFiles(upload, monoFiles());
    await expect(box).not.toBeChecked();
    await expect(importBtn, '確かめる前に「取り込む」が押せる').toBeDisabled();
    await box.check();
    await expect(importBtn).toBeEnabled();
    await importBtn.click();
    await expect.poll(async () => (await storedPacks(page)).length, { message: 'お手本パックが取り込まれない' }).toBeGreaterThan(0);
    expect(pageErrors, 'ページエラーになった').toEqual([]);
  });
});
