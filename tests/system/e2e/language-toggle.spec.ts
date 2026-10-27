// System Test: 表示言語の切り替え（日本語／English。AC-786・AC-788・AC-789）
// 期待値は要求定義書の受入基準（docs/requirements/app-core.md の AC-786〜AC-789）だけから決める。
// トグルは文言（ボタン名 "English" / "日本語"）と aria-pressed で探す（実装のセレクターには依存しない）。
import type { Page, Locator } from '@playwright/test';
import { test, expect, openScreen, MAIN_SCREENS } from '../support/fixtures';
import { examplePack, PACK_FILES } from '../support/packs';

const mono = examplePack('mono');
const JA = /[\u3040-\u30ff\u4e00-\u9fff]/;

function toggle(page: Page, name: 'English' | '日本語'): Locator {
  return page.getByRole('banner').getByRole('button', { name, exact: true }).or(page.getByRole('button', { name, exact: true })).first();
}

/** 顧客パック（お手本パック）の全 JSON の文字列値のうち日本語を含むもの（FR-294 の対象外＝データ。走査から除く）と、製品名・言語名 */
function packTexts(): string[] {
  const out = new Set<string>(['日本語']);
  const walk = (v: unknown) => {
    if (typeof v === 'string') { const s = v.trim(); if (s.length >= 2 && JA.test(s)) out.add(s); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  for (const f of PACK_FILES) { try { walk(mono.json(f)); } catch { /* 無いファイルは飛ばす */ } }
  try { walk(mono.brand()); } catch { /* 任意 */ }
  return [...out].sort((a, b) => b.length - a.length);
}

/** （データの断片＝パックの文字列の一部も許容）パック語を除いた残りに日本語が残らなければデータ由来（「ノード名 ／ 関連: …」などの複合文言）。区切りの「関連:」「／」だけは許容 */
function onlyPackData(t: string, allow: string[]): boolean {
  let r = t;
  for (const a of allow) if (a) r = r.split(a).join(' ');
  r = r.replace(/関連[:：]/g, ' ').replace(/課題-解決策分析[:：]/g, ' ').replace(/アーキテクチャ|なし|／/g, ' '); // 関係グラフのノード説明「<種別> ／ 関連: <ノード名…>」（データの複合文言）
  return !JA.test(r);
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
  return all.filter((t) => JA.test(t)).filter((t) => !allow.some((a) => a && t.includes(a))).filter((t) => !onlyPackData(t, allow)).filter((t) => !(t.length >= 2 && allow.some((a) => a.includes(t))));
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
      if (key === 'settings') {
        // 設定はモーダル。openScreen は日本語名「設定」のダイアログを探すので、英語時はツールバーのボタンを直接押し、role だけで dialog を取る
        await page.getByTestId('settings-button').click();
        await expect(page.getByRole('dialog').first(), '設定のモーダルが開かない').toBeVisible();
      } else {
        await openScreen(page, key);
      }
      for (const t of await japaneseTexts(page, allow)) bad.push(`${name}: ${t}`);
      if (key === 'settings') await page.keyboard.press('Escape'); // 英語ではモーダル名が違うので Esc で閉じる
    }
    // 設定モーダルを閉じ、コマンドパレット（Ctrl+K）も走査する（AC-788: アプリの全画面）
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog').first(), 'コマンドパレットが開かない').toBeVisible();
    for (const t of await japaneseTexts(page, allow)) bad.push(`コマンドパレット: ${t}`);
    await page.keyboard.press('Escape');
    expect(bad, '英語選択後に日本語が残っている').toEqual([]);

    // AC-789: 開いている画面の選択は、言語を切り替えても保たれる
    await page.keyboard.press('Escape');
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
