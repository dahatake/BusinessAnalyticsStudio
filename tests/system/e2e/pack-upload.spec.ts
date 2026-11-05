// System Test: 顧客パックのファイルのアップロードと Project への取り込み（FR-302。要求定義書 docs/requirements/customer-pack.md。AC-837〜AC-844）
// 期待値は受入基準だけから決める（実装コードは読まない）。画面の探し方は support/pack-upload.ts の先頭（AC の文言から決めた仮の識別子）。
// 種別の表示: 9 つの JSON は拡張子なしの名前（customer・entities …）、brand-profile.json は「brand-profile」、顧客調査 .md は「顧客調査」、ブランド調査 .md は「ブランド調査」を行の中に含める。
// 取り込み後の顧客パックは、端末内保存（localStorage。FR-043 AC-054 の projectPacks）の保存の形に依らず、customer・entities を持つオブジェクトとして探す。
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { examplePack, makeVariant, PACK_FILES } from '../support/packs';
import {
  dropFiles, fileRows, findStored, importAsNew, jsonFile, openUploadScreen, startAtMain, reloadAtMain, packFiles, replaced, selectFiles, storageSnapshot, storedPacks, without,
} from '../support/pack-upload';

const MD_CUSTOMER = { name: 'customer-research.md', mimeType: 'text/markdown', buffer: Buffer.from('# 顧客調査（合成データ）\n\n架空の調査メモ。', 'utf8') };
const MD_BRAND = { name: 'BRAND-RESEARCH.md', mimeType: 'text/markdown', buffer: Buffer.from('# ブランド調査（合成データ）\n\n架空のブランドメモ。', 'utf8') };
const SIZE_TEXT = /\d[\d,.]*\s*(KB|MB|B|バイト|bytes?)/i;

async function backToMain(app: { reload(o?: { skipOpening?: boolean }): Promise<void> }, page: Page): Promise<void> {
  await reloadAtMain(app, page);
}

function confirmDialog(page: Page): Locator {
  return page.getByRole('dialog').or(page.getByRole('alertdialog'));
}

/** 新規 Project として取り込み、保存されるまで待つ（取り込み前の確認があるときは確かめた旨を選ぶ） */
async function importNew(page: Page, upload: Locator, names: { company: string; project: string }): Promise<void> {
  await importAsNew(upload, names);
  await expect(upload.getByRole('alert').filter({ hasText: /失敗|エラー|取り込めません/ }), '取り込みに失敗した').toHaveCount(0);
}

test.describe('FR-302 顧客パックのアップロードと取り込み', () => {
  // FR-302 AC-837
  test('FR-302 AC-837 複数選択・ドラッグ＆ドロップ・キーボードだけのどれでも同じファイル群を受け付け、ファイル名・種別・サイズの一覧で示す', async ({ page, start }) => {
    const app = await startAtMain(page, start);
    const upload = await openUploadScreen(page);
    const files = [...packFiles(examplePack('mono')), MD_CUSTOMER, MD_BRAND];

    const expectList = async (label: string) => {
      const rows = fileRows(upload);
      for (const f of files) {
        const row = rows.filter({ hasText: f.name });
        await expect(row, `${label}: ${f.name} の行がない`).toHaveCount(1);
        const text = await row.innerText();
        const kind = f.name === 'brand-profile.json' ? 'brand-profile' : f.name === MD_CUSTOMER.name ? '顧客調査' : f.name === MD_BRAND.name ? 'ブランド調査' : f.name.replace(/\.json$/, '');
        expect(text, `${label}: ${f.name} の種別（${kind}）がない`).toContain(kind);
        expect(text, `${label}: ${f.name} のサイズがない`).toMatch(SIZE_TEXT);
      }
      await expect(rows.filter({ hasText: /\.(json|md)/ }), `${label}: 一覧の行数`).toHaveCount(files.length);
    };

    // ① ファイル選択ボタン（複数選択）
    await selectFiles(upload, files);
    await expectList('複数選択');

    // ② ドラッグ＆ドロップ（選び直しで置き換わるので、同じ一覧になる）
    await reloadAtMain(app, page);
    const upload2 = await openUploadScreen(page);
    await dropFiles(upload2, files);
    const rows2 = fileRows(upload2);
    await expect(rows2.filter({ hasText: /\.(json|md)/ }), 'ドロップ: 一覧の行数').toHaveCount(files.length);
    for (const f of files) await expect(rows2.filter({ hasText: f.name }), `ドロップ: ${f.name}`).toHaveCount(1);

    // ③ ドロップできない環境（キーボード・支援技術）: 選択ボタンをキーボードだけで操作し、最後まで進める
    await reloadAtMain(app, page);
    const upload3 = await openUploadScreen(page);
    const picker = upload3.getByRole('button', { name: 'ファイルを選ぶ' });
    await picker.focus();
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Enter');
    expect((await chooser).isMultiple(), '選択ダイアログが複数選択でない').toBe(true);
    await (await chooser).setFiles(files);
    await expect(fileRows(upload3).filter({ hasText: /\.(json|md)/ }), 'キーボード: 一覧の行数').toHaveCount(files.length);
    // 取り込み先の選択・確認・取り込みまで、Tab と Space・Enter だけで届く（ボタンが tab 順に入っている）
    const submit = upload3.getByRole('button', { name: '取り込む' });
    await expect(submit).toBeVisible();
    await submit.focus();
    await expect(submit, '「取り込む」にキーボードの焦点が当たらない').toBeFocused();
    await expect(upload3.getByRole('radio', { name: '新規 Project を作成' })).toBeEnabled();
  });

  // FR-302 AC-839
  test('FR-302 AC-839 取り込み先は「新規 Project を作成」と「既存の Project の顧客パックを置き換える」の 2 択。置き換えは確認（Project 名・現在の顧客パックが失われること）で「置き換える」を選ぶまで実行されない', async ({ page, start }) => {
    const app = await startAtMain(page, start);
    const mono = examplePack('mono');
    const koto = examplePack('koto');
    // 既存の Project を、まず mono の新規取り込みで作る
    let upload = await openUploadScreen(page);
    await expect(upload.getByRole('radio'), '取り込み先の選択肢が 2 つでない').toHaveCount(2);
    await expect(upload.getByRole('radio', { name: '既存の Project の顧客パックを置き換える' })).toBeVisible();
    await selectFiles(upload, packFiles(mono));
    await upload.getByRole('radio', { name: '新規 Project を作成' }).check();
    // 新規は企業・Project の名前を入力して作る（既定は customer.json の値）
    await expect(upload.getByRole('textbox', { name: '企業名' })).toHaveValue(mono.customerName);
    await expect(upload.getByRole('textbox', { name: 'Project 名' })).toHaveValue(mono.projectName);
    await importNew(page, upload, { company: '取り込み確認株式会社', project: '取り込み確認 Project' });
    await expect.poll(async () => !!findStored(await storedPacks(page), mono)).toBe(true);

    // 置き換え: koto を、その Project に
    await backToMain(app, page);
    upload = await openUploadScreen(page);
    await selectFiles(upload, packFiles(koto));
    await upload.getByRole('radio', { name: '既存の Project の顧客パックを置き換える' }).check();
    const target = upload.getByRole('combobox', { name: '置き換える Project' });
    await target.selectOption(await target.locator('option').filter({ hasText: '取り込み確認 Project' }).first().getAttribute('value') ?? undefined as any);
    const confirmBox = upload.getByRole('checkbox', { name: '確かめました' });
    if (await confirmBox.count()) await confirmBox.check();
    const before = await storageSnapshot(page);
    await upload.getByRole('button', { name: '取り込む' }).click();
    const dlg = confirmDialog(page);
    await expect(dlg, '置き換えの確認が出ない').toBeVisible();
    const text = await dlg.innerText();
    expect(text, '置き換わる Project 名がない').toContain('取り込み確認 Project');
    expect(text, '現在の顧客パックが失われる旨がない').toMatch(/失われ|なくなり|消え/);
    // 確認で「やめる」: 何も変わらない（バイト単位）
    await dlg.getByRole('button', { name: 'やめる' }).click();
    await expect(dlg).toBeHidden();
    expect(await storageSnapshot(page), '確認で「やめる」を選んだのに保存が変わった').toBe(before);
    // 確認で「置き換える」: 実行される
    await upload.getByRole('button', { name: '取り込む' }).click();
    await confirmDialog(page).getByRole('button', { name: '置き換える' }).click();
    await expect.poll(async () => !!findStored(await storedPacks(page), koto), { message: '「置き換える」を選んでも置き換わらない' }).toBe(true);
    expect(findStored(await storedPacks(page), mono), '置き換えたのに元の顧客パックが残っている').toBeUndefined();
  });

  // FR-302 AC-840
  test('FR-302 AC-840 検証にエラーが 1 件でもあるときは「取り込む」が押せず理由が出て、現在の顧客パック・Project・端末内の保存はバイト単位で変わらない', async ({ page, start }) => {
    const app = await startAtMain(page, start);
    const upload = await openUploadScreen(page);
    const mono = examplePack('mono');
    const files = packFiles(mono);
    const before = await storageSnapshot(page);

    // 必須の sources.json がない
    await selectFiles(upload, without(files, 'sources.json'));
    const submit = upload.getByRole('button', { name: '取り込む' });
    await expect(submit, '必須のファイルがないのに「取り込む」が押せる').toBeDisabled();
    await expect(upload.getByRole('alert').or(upload.getByRole('list', { name: '検証の結果' })).first()).toContainText('sources.json');
    // 壊れた JSON
    await selectFiles(upload, replaced(files, jsonFile('plan.json', '{ "features": [ ')));
    await expect(submit, '壊れた JSON があるのに「取り込む」が押せる').toBeDisabled();
    await expect(upload.getByRole('alert').or(upload.getByRole('list', { name: '検証の結果' })).first()).toContainText('plan.json');
    // 押せない（キーボードでも進まない）
    await submit.focus().catch(() => undefined);
    await page.keyboard.press('Enter');
    await expect(confirmDialog(page)).toBeHidden();
    expect(await storageSnapshot(page), 'エラーのまま保存が変わった').toBe(before);
    expect(await storedPacks(page), 'エラーのまま顧客パックが保存された').toHaveLength(0);
  });

  // FR-302 AC-841
  test('FR-302 AC-841 検証と確認を通して取り込むと、新規は Project が一覧に増え、置き換えは顧客パックだけが入れ替わる。再読み込みしても残り、ほかの Project は変わらない', async ({ page, start }) => {
    const app = await startAtMain(page, start);
    const mono = examplePack('mono');
    const koto = examplePack('koto');
    const variant = makeVariant('mono', 'replaced', (p) => p.edit('customer', (j) => { j.name = '置換後株式会社'; j.projectName = '置換後 Project'; }));
    const names = [['一社目株式会社', '一件目 Project', mono], ['二社目株式会社', '二件目 Project', koto]] as const;
    for (const [company, project, pack] of names) {
      const up = await openUploadScreen(page);
      await selectFiles(up, packFiles(pack));
      await importNew(page, up, { company, project });
      await expect.poll(async () => !!findStored(await storedPacks(page), pack), { message: `${project} が保存されない` }).toBe(true);
      await backToMain(app, page);
    }
    // 新規の Project が一覧に出る（企業・Project の名前のまま）
    for (const [company, project] of names) {
      await expect(page.getByRole('region', { name: `企業 ${company}` }).getByRole('link', { name: project })).toBeVisible();
    }
    // 置き換え: 一件目の顧客パックだけを variant にする
    const up = await openUploadScreen(page);
    await selectFiles(up, packFiles(variant));
    await up.getByRole('radio', { name: '既存の Project の顧客パックを置き換える' }).check();
    const target = up.getByRole('combobox', { name: '置き換える Project' });
    await target.selectOption(await target.locator('option').filter({ hasText: '一件目 Project' }).first().getAttribute('value') ?? undefined as any);
    const box = up.getByRole('checkbox', { name: '確かめました' });
    if (await box.count()) await box.check();
    await up.getByRole('button', { name: '取り込む' }).click();
    await confirmDialog(page).getByRole('button', { name: '置き換える' }).click();
    await expect.poll(async () => !!findStored(await storedPacks(page), variant)).toBe(true);
    let stored = await storedPacks(page);
    expect(findStored(stored, mono), '置き換えた Project の元の顧客パックが残っている').toBeUndefined();
    expect(findStored(stored, koto), 'ほかの Project の顧客パックが変わった').toBeTruthy();
    // 再読み込みしても、取り込んだ顧客パックは端末から復元され、Project は一覧に残る
    await backToMain(app, page);
    stored = await storedPacks(page);
    expect(findStored(stored, variant), '再読み込みで置き換えた顧客パックが消えた').toBeTruthy();
    expect(findStored(stored, koto), '再読み込みでほかの顧客パックが変わった').toBeTruthy();
    await expect(page.getByRole('region', { name: '企業 一社目株式会社' }).getByRole('link', { name: '一件目 Project' })).toBeVisible();
    await expect(page.getByRole('region', { name: '企業 二社目株式会社' }).getByRole('link', { name: '二件目 Project' })).toBeVisible();
  });

  // FR-302 AC-843
  test('FR-302 AC-843 お手本パック mono の public/data の JSON 9 個と brand-profile.json をそのまま取り込め（エラー 0 件）、取り込んだ内容は元の JSON と一致する', async ({ page, start }) => {
    const app = await startAtMain(page, start);
    const mono = examplePack('mono');
    const upload = await openUploadScreen(page);
    await selectFiles(upload, packFiles(mono));
    await expect(fileRows(upload).filter({ hasText: /\.json/ })).toHaveCount(PACK_FILES.length + 1);
    await upload.getByRole('radio', { name: '新規 Project を作成' }).check();
    const box = upload.getByRole('checkbox', { name: '確かめました' });
    if (await box.count()) await box.check();
    await expect(upload.getByText(/エラー\s*0\s*件/).first(), '検証のエラーが 0 件と示されない').toBeVisible();
    await expect(upload.getByRole('button', { name: '取り込む' })).toBeEnabled();
    await upload.getByRole('button', { name: '取り込む' }).click();
    await expect.poll(async () => !!findStored(await storedPacks(page), mono), { message: '取り込んだ顧客パックが mono の JSON と一致しない（値の変化・補完・互換データの追加がある）' }).toBe(true);
    await backToMain(app, page);
    expect(findStored(await storedPacks(page), mono), '再読み込みのあとも内容が一致する').toBeTruthy();
  });
});
