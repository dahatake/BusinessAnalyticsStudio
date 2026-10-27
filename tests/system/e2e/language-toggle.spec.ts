// System Test: 表示言語の切り替え（日本語／English。AC-786・AC-788・AC-789）
// 期待値は要求定義書の受入基準（docs/requirements/app-core.md の AC-786〜AC-789）だけから決める。
// トグルは文言（ボタン名 "English" / "日本語"）と aria-pressed で探す（実装のセレクターには依存しない）。
import type { Page, Locator } from '@playwright/test';
import { test, expect, openScreen, MAIN_SCREENS } from '../support/fixtures';
import { examplePack } from '../support/packs';

const mono = examplePack('mono');
const JA = /[\u3040-\u30ff\u4e00-\u9fff]/;

function toggle(page: Page, name: 'English' | '日本語'): Locator {
  return page.getByRole('banner').getByRole('button', { name, exact: true }).or(page.getByRole('button', { name, exact: true })).first();
}

/** 製品名・顧客パックの内容に含まれる日本語（走査から除く） */
function packTexts(): string[] {
  return [mono.customerName, mono.projectName, ...mono.products().map((p) => p.name), ...mono.entities().map((e) => e.name)].map(String).filter((s) => JA.test(s));
}

/** 画面に見える文言（テキスト・aria-label・title・placeholder・ドキュメントのタイトル）のうち、日本語を含むものを返す */
async function japaneseTexts(page: Page, allow: string[]): Promise<string[]> {
  const all = await page.evaluate(() => {
    const out: string[] = [document.title];
    const visible = (e: Element) => {
      const h = e as HTMLElement;
      const r = h.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(h).visibility !== 'hidden';
    };
    for (const e of Array.from(document.body.querySelectorAll('*'))) {
      if (!visible(e)) continue;
      for (const a of ['aria-label', 'title', 'placeholder', 'alt']) {
        const v = e.getAttribute(a);
        if (v) out.push(v);
      }
      for (const n of Array.from(e.childNodes)) if (n.nodeType === 3 && n.textContent?.trim()) out.push(n.textContent.trim());
    }
    return out;
  });
  return all.filter((t) => JA.test(t)).filter((t) => !allow.some((a) => a && t.includes(a)));
}

test.describe('FR-L10N 表示言語の切り替え', () => {
  // AC-786
  test('AC-786 初回は日本語（html lang=ja）で、ヘッダーの言語トグルで英語にすると再読込なしに lang=en になり、現在の言語がキーボードと aria-pressed で識別できる。異常系: 保存値が不正なら日本語', async ({ page, start }) => {
    const app = await start();
    await expect(page.locator('html')).toHaveAttribute('lang', /^ja/);
    const en = toggle(page, 'English');
    const ja = toggle(page, '日本語');
    await expect(en, '言語トグル（English）がない').toBeVisible();
    await expect(ja, '言語トグル（日本語）がない').toBeVisible();
    await expect(ja).toHaveAttribute('aria-pressed', 'true');
    await expect(en).toHaveAttribute('aria-pressed', 'false');

    // キーボード操作で英語へ（再読込なし）
    let reloaded = false;
    page.on('load', () => (reloaded = true));
    await en.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('lang', /^en/);
    await expect(toggle(page, 'English')).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle(page, '日本語')).toHaveAttribute('aria-pressed', 'false');
    expect(reloaded, '言語の切り替えで再読込された').toBe(false);

    // 異常系: 保存値を不正にして起動し直すと日本語
    await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (/lang|locale/i.test(k)) localStorage.setItem(k, '@@invalid@@');
      }
    });
    await app.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', /^ja/);
  });

  // AC-788 AC-789
  test('AC-788 AC-789 英語を選んで主要画面を巡ると日本語の文字が現れず（文言・aria-label・title・placeholder・タイトル）、空の状態・通知も英語で、切り替えで画面の選択が保たれ、日本語に戻すと日本語に戻る', async ({ page, start }) => {
    await start();
    await toggle(page, 'English').click();
    await expect(page.locator('html')).toHaveAttribute('lang', /^en/);
    const allow = packTexts();
    const bad: string[] = [];
    for (const [key, name] of MAIN_SCREENS) {
      if (key === 'settings') continue; // 設定は別の入口（ツールバー）のため、英語では下で確認する
      await openScreen(page, key);
      for (const t of await japaneseTexts(page, allow)) bad.push(`${name}: ${t}`);
    }
    expect(bad, '英語選択後に日本語が残っている').toEqual([]);

    // AC-789: 開いている画面の選択は、言語を切り替えても保たれる
    await openScreen(page, 'priority');
    await toggle(page, '日本語').click();
    await expect(page.locator('html')).toHaveAttribute('lang', /^ja/);
    await expect(page.getByTestId('priority'), '言語の切り替えで開いている画面が変わった').toBeVisible();
    await toggle(page, 'English').click();
    await expect(page.getByTestId('priority')).toBeVisible();
    // 通知・空の状態・エラーの文言
    for (const t of await japaneseTexts(page, allow)) bad.push(`通知・空の状態: ${t}`);
    expect(bad, '通知・エラー・空の状態に日本語が残っている').toEqual([]);

    // 日本語に戻すと、すべて日本語に戻る
    await toggle(page, '日本語').click();
    await expect(page.locator('html')).toHaveAttribute('lang', /^ja/);
    await expect(toggle(page, '日本語')).toHaveAttribute('aria-pressed', 'true');
    for (const [key, name] of MAIN_SCREENS) {
      if (key === 'settings') continue;
      await openScreen(page, key);
      expect(await japaneseTexts(page, []), `${name}: 日本語に戻しても日本語の文言が現れない`).not.toEqual([]);
    }
  });
});
