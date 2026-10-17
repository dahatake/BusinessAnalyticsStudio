// System Test: インクルーシブデザインとアクセシビリティの全画面での確認（リフロー・文字の拡大・焦点の戻り・見出しの段・操作の大きさ）
// 期待値は要求定義書の受入基準（docs/requirements/app-experience.md の NFR-A11Y-009 AC-483〜485）と PARAM だけから決める。
// PARAM-029=320 CSS px（拡大率 400% 相当の表示幅）、PARAM-040=24 CSS px（操作の対象の最小の大きさ）。200% は WCAG 2.2 の 1.4.4 による固定値。
// 「全画面」は画面の登録＝左メニューの画面の一覧を走査する（support/screens.ts・CONTRACT.md §21）。
import type { Page, Locator } from '@playwright/test';
import { test, expect, selectPersona } from '../support/fixtures';
import { listScreenKeys, gotoScreen, INTERACTIVE_SELECTOR } from '../support/screens';

const REFLOW_WIDTH = 320; // PARAM-029
const MIN_TARGET = 24; // PARAM-040
const TEXT_ZOOM = 2; // 200%（WCAG 2.2 1.4.4）

/** 2 次元の操作が本質の面（地図・3D・キャンバス）の画面。中の横スクロールは判定から除く（NFR-A11Y-009） */
const TWO_D_SURFACES = new Set(['map', 'view3d', 'canvas', 'whiteboard']);

async function pageOverflowX(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/**
 * 文字だけを 200% に拡大する（文字の大きさと行の高さだけを 2 倍にし、ページの倍率は変えない。WCAG 2.2 1.4.4 の確認の方法）。
 * 戻り値は元に戻す関数の代わりに、拡大した要素の数（0 なら拡大できていない）。
 */
async function zoomTextOnly(page: Page, factor: number): Promise<number> {
  return page.evaluate((f) => {
    const els = Array.from(document.body.querySelectorAll<HTMLElement>('*')).filter((e) => !(e instanceof SVGElement) && e.tagName !== 'CANVAS');
    const plan = els.map((e) => {
      const s = getComputedStyle(e);
      const fs = parseFloat(s.fontSize);
      const lh = s.lineHeight === 'normal' ? null : parseFloat(s.lineHeight);
      return { e, fs, lh };
    });
    for (const { e, fs, lh } of plan) {
      e.style.setProperty('font-size', `${fs * f}px`, 'important');
      if (lh !== null) e.style.setProperty('line-height', `${lh * f}px`, 'important');
    }
    return plan.length;
  }, factor);
}

/**
 * 文字の切れ（はみ出した文字が overflow: hidden/clip の祖先で切られる、または省略記号で省かれる）と、
 * 文字どうしの重なり（祖先・子孫の関係にない、見えている文字の要素の矩形の交わり）を数える。
 * 拡大・縮小できる面（SVG・canvas）の中は除く。スクロールできる祖先（auto/scroll）は切れに数えない。
 */
async function clippedOrOverlapping(root: Locator): Promise<{ clipped: string[]; overlap: string[] }> {
  return root.evaluate((el) => {
    const leaves = Array.from(el.querySelectorAll<HTMLElement>('*')).filter((e) => {
      if (e instanceof SVGElement || e.closest('svg, canvas')) return false;
      const hasText = Array.from(e.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim());
      if (!hasText) return false;
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && Number(s.opacity) > 0;
    });
    const name = (e: Element) => `"${(e.textContent ?? '').trim().slice(0, 16)}"`;
    const clipped: string[] = [];
    for (const e of leaves) {
      const s = getComputedStyle(e);
      if (s.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) { clipped.push(`${name(e)} 省略`); continue; }
      if (/hidden|clip/.test(s.overflowX + s.overflowY) && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)) { clipped.push(`${name(e)} 自身で切れる`); continue; }
      const r = e.getBoundingClientRect();
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (/auto|scroll/.test(ps.overflowX + ps.overflowY)) break;
        if (/hidden|clip/.test(ps.overflowX + ps.overflowY)) {
          const pr = p.getBoundingClientRect();
          if (r.right > pr.right + 1 || r.bottom > pr.bottom + 1 || r.left < pr.left - 1 || r.top < pr.top - 1) { clipped.push(`${name(e)} 祖先で切れる`); }
          break;
        }
      }
    }
    const overlap: string[] = [];
    const list = leaves.slice(0, 600).map((e) => ({ e, r: e.getBoundingClientRect() }));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 2 && h > 2) overlap.push(`${name(a.e)} × ${name(b.e)}`);
      }
    }
    return { clipped: [...new Set(clipped)], overlap: [...new Set(overlap)] };
  });
}

test.describe('NFR-A11Y-009 リフローと文字の拡大', () => {
  // NFR-A11Y-009 AC-483
  test('NFR-A11Y-009 AC-483 表示幅 320 CSS px で全画面を開くとページ全体に横スクロールがなく、すべてのコンポーネントにタブかメニューから到達できる', async ({ page, start }) => {
    test.setTimeout(300_000);
    await start();
    await selectPersona(page, '事業部門');
    const keys = await listScreenKeys(page);
    await page.setViewportSize({ width: REFLOW_WIDTH, height: 800 });
    const bad: string[] = [];
    for (const key of keys) {
      const c = await gotoScreen(page, key);
      const ov = await pageOverflowX(page);
      if (ov > 0) bad.push(`${key}: ページ全体に横スクロール ${ov}px`);
      const b = await c.boundingBox();
      if (!b || b.x < -1 || b.x + b.width > REFLOW_WIDTH + 1) bad.push(`${key}: コンポーネントが表示幅をはみ出す`);
      // その画面のすべてのコンポーネント（入れ子の component-*）にタブかメニューから到達できる
      const inner = await c.locator('[data-testid^="component-"]:not([data-testid="component-menu"]):not([data-testid="component-actions"])').evaluateAll((els) =>
        els.map((e) => e.getAttribute('data-testid')!));
      for (const id of inner) {
        const sub = page.getByTestId(id).first();
        if (await sub.isVisible()) continue;
        const tab = page.getByRole('tab', { name: new RegExp((await sub.getAttribute('aria-label')) ?? id.replace('component-', '')) }).first();
        if (await tab.isVisible()) { await tab.click(); }
        if (!(await sub.isVisible())) bad.push(`${key}: ${id} にタブかメニューから到達できない`);
      }
    }
    expect(bad, `表示幅 ${REFLOW_WIDTH}px でのリフロー`).toEqual([]);
  });

  // NFR-A11Y-009 AC-483（文字だけを 200%）
  test('NFR-A11Y-009 AC-483 表示幅を戻し、文字だけを 200% に拡大すると、全画面で文字の切れ・重なりが 0 件', async ({ page, start }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1600, height: 900 });
    const app = await start();
    await selectPersona(page, '事業部門');
    const keys = await listScreenKeys(page);
    const bad: string[] = [];
    for (const key of keys) {
      await app.reload(); // 前の画面で拡大した文字を元に戻す
      const c = await gotoScreen(page, key);
      expect(await zoomTextOnly(page, TEXT_ZOOM), '文字を拡大する要素がない').toBeGreaterThan(0);
      await page.waitForTimeout(300);
      const r = await clippedOrOverlapping(c);
      bad.push(...r.clipped.map((x) => `${key} 切れ: ${x}`), ...r.overlap.map((x) => `${key} 重なり: ${x}`));
    }
    expect(bad, '文字の 200% 拡大での切れ・重なり').toEqual([]);
  });

  // NFR-A11Y-009 AC-483（異常系: 2 次元の操作が本質の面を除く画面で、320px の幅でも情報（見出し・操作）が欠けない）
  test('NFR-A11Y-009 AC-483 異常系: 320 CSS px の幅でも、地図・3D・キャンバス以外の画面の見出しと操作が 1600px の幅と同じだけある（情報が欠けない）', async ({ page, start }) => {
    test.setTimeout(300_000);
    await start();
    await selectPersona(page, '事業部門');
    const keys = (await listScreenKeys(page)).filter((k) => !TWO_D_SURFACES.has(k));
    const names = async (c: Locator) => c.evaluate((root) => Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],button,a[href],[role="tab"],[role="switch"]'))
      .map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim()).filter(Boolean).sort());
    const wide: Record<string, string[]> = {};
    for (const key of keys) wide[key] = await names(await gotoScreen(page, key));
    await page.setViewportSize({ width: REFLOW_WIDTH, height: 800 });
    for (const key of keys) {
      const narrow = await names(await gotoScreen(page, key));
      const missing = wide[key].filter((n) => !narrow.includes(n));
      expect(missing, `${key}: 320px で欠ける見出し・操作`).toEqual([]);
    }
  });
});

/** その画面でキーボードで開けるメニュー・ダイアログの入口（aria-haspopup を持つ操作と、その他の操作のメニュー） */
async function popupTriggers(c: Locator): Promise<Locator[]> {
  const loc = c.locator('[aria-haspopup="menu"], [aria-haspopup="true"], [aria-haspopup="dialog"], [data-testid="component-menu"]');
  const out: Locator[] = [];
  const n = await loc.count();
  for (let i = 0; i < n && out.length < 12; i++) {
    const t = loc.nth(i);
    if ((await t.isVisible()) && (await t.isEnabled())) out.push(t);
  }
  return out;
}

async function activeIs(page: Page, loc: Locator): Promise<boolean> {
  return loc.evaluate((e) => e === document.activeElement || e.contains(document.activeElement));
}

test.describe('NFR-A11Y-009 焦点の戻りと見出しの段', () => {
  // NFR-A11Y-009 AC-484
  test('NFR-A11Y-009 AC-484 全画面のダイアログ・メニューをキーボードで開いて Esc で閉じると、フォーカスが開いた操作の要素に戻る', async ({ page, start }) => {
    test.setTimeout(300_000);
    await start();
    await selectPersona(page, '事業部門');
    const keys = await listScreenKeys(page);
    const bad: string[] = [];
    let checked = 0;
    for (const key of keys) {
      const c = await gotoScreen(page, key);
      await c.focus();
      for (const t of await popupTriggers(c)) {
        const label = ((await t.getAttribute('aria-label')) || (await t.innerText()) || '').trim().slice(0, 30);
        await t.focus();
        await page.keyboard.press('Enter');
        const popup = page.locator('[role="menu"]:visible, [role="dialog"]:visible, [role="alertdialog"]:visible, [role="listbox"]:visible').last();
        if (!(await popup.isVisible().catch(() => false))) continue;
        checked++;
        await page.keyboard.press('Escape');
        await expect(popup).toBeHidden();
        if (!(await activeIs(page, t))) bad.push(`${key}: 「${label}」を閉じた後にフォーカスが戻らない`);
      }
      // ダイアログ（コマンドパレット）: 画面の操作要素から開いて閉じる
      await c.focus();
      await page.keyboard.press('Control+k');
      const dlg = page.getByRole('dialog', { name: 'コマンドパレット' });
      await expect(dlg).toBeVisible();
      checked++;
      await page.keyboard.press('Escape');
      await expect(dlg).toBeHidden();
      if (!(await activeIs(page, c))) bad.push(`${key}: コマンドパレットを閉じた後にフォーカスが開く前の要素に戻らない`);
    }
    expect(checked, '確かめたダイアログ・メニューが画面の数より少ない').toBeGreaterThanOrEqual(keys.length * 2);
    expect(bad).toEqual([]);
  });

  // NFR-A11Y-009 AC-484（作業先のダイアログ）
  test('NFR-A11Y-009 AC-484 異常系: 作業先のダイアログと作業先のメニューを Esc で閉じても、フォーカスが開いたボタンに戻る（選択は変わらない）', async ({ page, start }) => {
    await start();
    const target = page.getByTestId('work-target');
    const before = await target.innerText().catch(() => '');
    for (const opener of [page.getByRole('button', { name: '作業先', exact: true }), page.getByTestId('work-target-menu')]) {
      await opener.focus();
      await page.keyboard.press('Enter');
      const popup = page.locator('[role="menu"]:visible, [role="dialog"]:visible').last();
      await expect(popup).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(popup).toBeHidden();
      expect(await activeIs(page, opener), 'フォーカスが開いたボタンに戻らない').toBe(true);
    }
    if (before) await expect(target).toHaveText(before);
  });

  // NFR-A11Y-009 AC-484（見出しの段）
  test('NFR-A11Y-009 AC-484 全画面で見出しの段（h1〜h6 と role="heading" の段）が h1 から始まり、段を飛ばさずに並ぶ', async ({ page, start }) => {
    test.setTimeout(180_000);
    await start();
    await selectPersona(page, '事業部門');
    const keys = await listScreenKeys(page);
    const bad: string[] = [];
    for (const key of keys) {
      await gotoScreen(page, key);
      const levels = await page.evaluate(() => Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]'))
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[aria-hidden="true"]'); })
        .map((e) => ({ l: Number(e.getAttribute('aria-level') || (/^H\d$/.test(e.tagName) ? e.tagName[1] : '2')), t: (e.textContent ?? '').trim().slice(0, 20) })));
      if (!levels.length) { bad.push(`${key}: 見出しがない`); continue; }
      if (levels[0].l !== 1) bad.push(`${key}: 最初の見出し「${levels[0].t}」が h${levels[0].l}`);
      for (let i = 1; i < levels.length; i++) {
        if (levels[i].l > levels[i - 1].l + 1) bad.push(`${key}: 「${levels[i - 1].t}」h${levels[i - 1].l} → 「${levels[i].t}」h${levels[i].l}`);
      }
    }
    expect(bad, '見出しの段が飛ぶ').toEqual([]);
  });
});

test.describe('NFR-A11Y-009 操作の対象の大きさ', () => {
  /**
   * WCAG 2.2 の 2.5.8 の例外（除外の一覧）:
   *  1. 文中（inline）: 文章の中のリンク（親のブロックがリンク以外の文字も持つ a 要素）
   *  2. 間隔（spacing）: 24px 未満でも、その中心を中心とする直径 24px の円が、ほかの操作の対象とほかの 24px 未満の対象の円に交わらないもの
   *  3. 不可欠（essential）: 2 次元の面（地図・3D・canvas・SVG のグラフ）の中の点や線（DOM の操作部品でないもの）。DOM の部品だけを数えるので自動的に除く
   *  4. 利用者エージェントの既定: スタイルを変えていないブラウザーの既定の部品（この雛形では使わない前提。使っていれば違反に数える）
   */
  // NFR-A11Y-009 AC-485
  test('NFR-A11Y-009 AC-485 全画面の操作の対象（ボタン・リンク・切替・入力）の当たり判定が幅・高さとも 24 CSS px 以上（2.5.8 の例外は除外の一覧のとおり）', async ({ page, start }) => {
    test.setTimeout(300_000);
    await start();
    await selectPersona(page, '事業部門');
    const keys = await listScreenKeys(page);
    const bad: string[] = [];
    let total = 0;
    for (const key of keys) {
      await gotoScreen(page, key);
      const r = await page.evaluate(([sel, min]) => {
        const els = Array.from(document.querySelectorAll<HTMLElement>(sel as string)).filter((e) => {
          const r = e.getBoundingClientRect();
          const s = getComputedStyle(e);
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.pointerEvents !== 'none' && !(e as HTMLButtonElement).disabled && !e.closest('[aria-hidden="true"]');
        });
        // 当たり判定: 要素の矩形（入れ子の操作部品は外側を当たり判定とする）
        const targets = els.filter((e) => !els.some((o) => o !== e && o.contains(e)));
        const rects = targets.map((e) => ({ e, r: e.getBoundingClientRect() }));
        const small = rects.filter(({ r }) => r.width < (min as number) - 0.01 || r.height < (min as number) - 0.01);
        const inline = (e: HTMLElement) => e.tagName === 'A' && !!e.parentElement && (e.parentElement.textContent ?? '').trim().length > (e.textContent ?? '').trim().length && getComputedStyle(e).display.startsWith('inline');
        const circleHits = (c: { x: number; y: number }, r: DOMRect) => {
          const dx = Math.max(r.left - c.x, 0, c.x - r.right);
          const dy = Math.max(r.top - c.y, 0, c.y - r.bottom);
          return dx * dx + dy * dy < ((min as number) / 2) ** 2;
        };
        const centers = new Map(small.map(({ e, r }) => [e, { x: r.left + r.width / 2, y: r.top + r.height / 2 }]));
        const out: string[] = [];
        for (const { e, r } of small) {
          if (inline(e)) continue; // 例外 1
          const c = centers.get(e)!;
          const spaced = rects.every((o) => o.e === e || !circleHits(c, o.r)) &&
            small.every((o) => o.e === e || Math.hypot(centers.get(o.e)!.x - c.x, centers.get(o.e)!.y - c.y) >= (min as number));
          if (spaced) continue; // 例外 2
          out.push(`${e.tagName.toLowerCase()}「${(e.getAttribute('aria-label') || e.textContent || e.getAttribute('data-testid') || '').trim().slice(0, 20)}」${r.width.toFixed(0)}×${r.height.toFixed(0)}`);
        }
        return { out, n: targets.length };
      }, [INTERACTIVE_SELECTOR, MIN_TARGET] as const);
      total += r.n;
      bad.push(...r.out.map((x) => `${key}: ${x}`));
    }
    expect(total, '操作の対象が見つからない').toBeGreaterThan(0);
    expect(bad, `当たり判定が ${MIN_TARGET}px 未満の操作の対象`).toEqual([]);
  });

  // NFR-A11Y-009 AC-485（異常系: フォーカスで現れる見出しの操作アイコン・メニューの項目も 24px 以上）
  test('NFR-A11Y-009 AC-485 異常系: フォーカスして現れる見出しの操作アイコンと、開いたメニューの項目も 24 CSS px 以上', async ({ page, start }) => {
    test.setTimeout(180_000);
    await start();
    await selectPersona(page, '事業部門');
    const keys = await listScreenKeys(page);
    const bad: string[] = [];
    for (const key of keys) {
      const c = await gotoScreen(page, key);
      await c.focus();
      const icons = c.getByTestId('component-actions').first().getByRole('button');
      for (let i = 0; i < (await icons.count()); i++) {
        const b = await icons.nth(i).boundingBox();
        if (b && (b.width < MIN_TARGET || b.height < MIN_TARGET)) bad.push(`${key} アイコン ${i}: ${b.width}×${b.height}`);
      }
      await c.getByTestId('component-menu').first().click();
      const items = page.getByRole('menu').last().locator('[role^="menuitem"]');
      await expect(items.first()).toBeVisible();
      for (let i = 0; i < (await items.count()); i++) {
        const b = await items.nth(i).boundingBox();
        if (b && (b.width < MIN_TARGET || b.height < MIN_TARGET)) bad.push(`${key} メニューの項目 ${i}: ${b.width}×${b.height}`);
      }
      await page.keyboard.press('Escape');
    }
    expect(bad).toEqual([]);
  });
});

