// System Test: 取り込み前に人が確かめること（FR-304。要求定義書 docs/requirements/customer-pack.md。AC-851〜AC-855）
// 期待値は受入基準だけから決める（実装コードは読まない）。件数の期待値は、入力したパックの JSON をテスト側で数えて決める。
// 画面の探し方は support/pack-upload.ts の先頭（仮の識別子）。取り込み前の確認は region「取り込み前に確かめること」。
import type { Locator } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { countInternal, examplePack, makeVariant } from '../support/packs';
import { countOf, openUploadScreen, startAtMain, reloadAtMain, packFiles, selectFiles, storedPacks } from '../support/pack-upload';

function checks(upload: Locator): Locator {
  return upload.getByRole('region', { name: '取り込み前に確かめること' });
}

/** value が数値で出典のない項目を作る: 先頭から n 件の sourceIds を消し、(ファイル・所有者 ID) を返す */
function stripSources(p: { edit(name: any, fn: (j: any) => void): void }, file: 'entities', n: number): Array<{ file: string; id: string }> {
  const hit: Array<{ file: string; id: string }> = [];
  p.edit(file, (json) => {
    const walk = (v: any, owner: string) => {
      if (hit.length >= n) return;
      if (Array.isArray(v)) { v.forEach((x) => walk(x, owner)); return; }
      if (v && typeof v === 'object') {
        const id = typeof v.id === 'string' ? v.id : owner;
        if (typeof v.value === 'number' && Array.isArray(v.sourceIds) && v.sourceIds.length > 0 && hit.length < n) {
          delete v.sourceIds;
          hit.push({ file: `${file}.json`, id });
        }
        Object.values(v).forEach((x) => walk(x, id));
      }
    };
    walk(json, '');
  });
  return hit;
}

test.describe('FR-304 取り込み前に人が確かめること', () => {
  // FR-304 AC-854
  test('FR-304 AC-854 種別「人」を含むパックは件数と FR-219 の注意（外部 AI への送信・エクスポート前の確認、顧客の了承は人が行う）を示し、個人名・連絡先の値は表示しない。含まないパックでは注意を出さない', async ({ page, start }) => {
    const app = await startAtMain(page, start);
    const PERSON_NAME = 'ZX-個人名-試験用の人物';
    const PERSON_NOTE = 'zx-contact-test@example.invalid';
    const withPerson = makeVariant('mono', 'person', (p) => p.edit('entities', (j) => {
      const list = Array.isArray(j) ? j : j.entities;
      for (const e of list) if (e.kind === 'person') { e.name = PERSON_NAME; e.description = `連絡先 ${PERSON_NOTE}`; }
    }));
    const persons = withPerson.entities().filter((e: any) => e.kind === 'person').length;
    expect(persons, '前提: mono は種別「人」を含む').toBeGreaterThan(0);
    const noPerson = examplePack('koto');
    expect(noPerson.entities().filter((e: any) => e.kind === 'person').length, '前提: koto は種別「人」を含まない').toBe(0);

    const upload = await openUploadScreen(page);
    const region = checks(upload);
    await selectFiles(upload, packFiles(withPerson));
    await expect(region).toBeVisible();
    const t = await region.innerText();
    expect(countOf(t, /種別「?人」?|人（/), '種別「人」の件数が示されない').toBe(persons);
    expect(t, '外部 AI への送信・エクスポートの前に確認が出る旨がない').toMatch(/外部\s*AI/);
    expect(t).toMatch(/エクスポート|書き出し/);
    expect(t, '顧客の了承は人が行う旨がない').toMatch(/顧客の了承/);
    expect(t, '個人名が表示されている').not.toContain(PERSON_NAME);
    expect(t, '連絡先の値が表示されている').not.toContain(PERSON_NOTE);
    expect(await upload.innerText(), '取り込み画面のどこかに個人名・連絡先が出ている').not.toContain(PERSON_NAME);

    await selectFiles(upload, packFiles(noPerson));
    await expect.poll(async () => /顧客の了承/.test(await region.innerText()), { message: '種別「人」を含まないのに FR-219 の注意が出る' }).toBe(false);
  });

  // FR-304 AC-855
  test('FR-304 AC-855 「確かめました」を選ぶまで「取り込む」が押せず、選んでも了承の記録（日時・利用者）が端末内にも書き出しにも残らない。確認事項の件数は検証の結果が変わるたびに更新される', async ({ page, start }) => {
    const app = await startAtMain(page, start);
    const mono = examplePack('mono');
    const upload = await openUploadScreen(page);
    const region = checks(upload);
    await selectFiles(upload, packFiles(mono));
    await upload.getByRole('radio', { name: '新規 Project を作成' }).check();
    const submit = upload.getByRole('button', { name: '取り込む' });
    const box = upload.getByRole('checkbox', { name: '確かめました' });
    await expect(box).not.toBeChecked();
    await expect(submit, '確かめる前に「取り込む」が押せる').toBeDisabled();
    await submit.focus().catch(() => undefined);
    await page.keyboard.press('Enter');
    expect(await storedPacks(page), '確かめる前に取り込まれた').toHaveLength(0);
    await box.check();
    await expect(submit, '確かめたのに「取り込む」が押せない').toBeEnabled();
    await box.uncheck();
    await expect(submit, '確かめる選択を外したのに「取り込む」が押せる').toBeDisabled();

    // 検証の結果が変わるたびに、確認事項の件数が更新される（internal 0 件 → 変種の件数 → 0 件）。
    // 確認欄の件数は、検証エラーのない（確認欄が出る）パックで見る。出典のない数値は検証エラー（FR-303）なので、確認欄は出ない（AC-851）。
    expect(countOf(await region.innerText(), /internal/), 'お手本パックの internal 件数').toBe(countInternal(mono));
    // internal の項目を増やした変種（ID の重複など検証エラーを作らないよう、既存の課題の機密区分だけを internal にする）
    const withInternal = makeVariant('mono', 'more-internal', (p) => p.edit('issues', (j) => {
      const list = Array.isArray(j) ? j : j.issues;
      for (const e of list.filter((x: any) => x.classification !== 'internal').slice(0, 2)) e.classification = 'internal';
    }));
    expect(countInternal(withInternal), '前提: 変種は internal が増える').toBeGreaterThan(countInternal(mono));
    await selectFiles(upload, packFiles(withInternal));
    await expect.poll(async () => countOf(await region.innerText(), /internal/), { message: '選び直したのに件数が更新されない' }).toBe(countInternal(withInternal));
    await selectFiles(upload, packFiles(mono));
    await expect.poll(async () => countOf(await region.innerText(), /internal/)).toBe(countInternal(mono));

    // FR-304 AC-851 出典のない数値（検証エラー）のときは確認欄が出ず、「取り込む」が押せない
    const bad = makeVariant('mono', 'unsourced-2', (p) => { stripSources(p, 'entities', 2); });
    await selectFiles(upload, packFiles(bad));
    await expect(region, '検証エラーなのに確認欄が出ている').toHaveCount(0);
    await expect(submit, '検証エラーなのに「取り込む」が押せる').toBeDisabled();
    await selectFiles(upload, packFiles(mono));
    await expect(region).toBeVisible();
    // 確かめて取り込んだあと、了承の記録が端末内（localStorage・sessionStorage）に残らない
    await box.check();
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect.poll(async () => (await storedPacks(page)).length, { message: '取り込まれない' }).toBeGreaterThan(0);
    const dump = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
    expect(dump, '了承の記録（日時・利用者）が端末内に保存されている').not.toMatch(/確かめました|acknowledg|reviewedAt|reviewedBy|confirmedAt|confirmedBy|humanConfirm|確認日時/i);
  });
});
