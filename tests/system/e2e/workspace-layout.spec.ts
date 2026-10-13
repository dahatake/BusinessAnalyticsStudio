// System Test: コンポーネントのドラッグ移動・自動サイズ調整・作業先（デモ／実 Project）の選択・Fluent 2 の適用
// 期待値は要求定義書の受入基準（docs/requirements/app-experience.md の FR-142〜144・NFR-UX-007）だけから決める。
// 画面の探し方は tests/system/CONTRACT.md §9。PARAM-033=1.5 倍、PARAM-034=240 CSS px、PARAM-035=12 CSS px。
import type { Page, Locator } from '@playwright/test';
import { test, expect, openScreen, component, selectPersona } from '../support/fixtures';

const SCALE = 1.5; // PARAM-033
const MIN_WIDTH = 240; // PARAM-034
const MIN_FONT = 12; // PARAM-035

async function box(loc: Locator) {
  const b = await loc.boundingBox();
  expect(b, '要素が表示されていない').not.toBeNull();
  return b!;
}
const area = (b: { width: number; height: number }) => b.width * b.height;

function visibleComponents(page: Page): Locator {
  return page.getByTestId('workspace').locator('[data-testid^="component-"]:not([data-testid="component-menu"])');
}
async function keys(page: Page): Promise<string[]> {
  const all = visibleComponents(page);
  const out: string[] = [];
  for (let i = 0; i < (await all.count()); i++) {
    if (await all.nth(i).isVisible()) out.push(((await all.nth(i).getAttribute('data-testid')) ?? '').replace('component-', ''));
  }
  return out;
}

/** 祖先に component-*（component-menu を除く）がある要素を除いた、直下のコンポーネントだけ。 */
async function topKeys(page: Page): Promise<string[]> {
  return page.getByTestId('workspace').evaluate((ws) => {
    const sel = '[data-testid^="component-"]:not([data-testid="component-menu"])';
    const out: string[] = [];
    ws.querySelectorAll(sel).forEach((el) => {
      const parent = el.parentElement?.closest(sel);
      const r = (el as HTMLElement).getBoundingClientRect();
      if (!parent && r.width > 0 && r.height > 0) out.push((el.getAttribute('data-testid') ?? '').replace('component-', ''));
    });
    return out;
  });
}

/** 見出しをつかんで (dx, dy) だけ動かす。途中で drop-indicator が見えることを返す。 */
async function dragByHeading(page: Page, c: Locator, dx: number, dy: number): Promise<boolean> {
  const h = await box(c.getByRole('heading').first());
  const x = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 6 });
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  const shown = await page.getByTestId('drop-indicator').first().isVisible();
  await page.mouse.up();
  return shown;
}

test.describe('FR-142 すべてのコンポーネントのドラッグでの移動', () => {
  // FR-142 AC-224
  test('FR-142 AC-224 表示中のすべてのコンポーネントをドラッグで動かせ、ドロップ前に置き場所が示され、再読込後も同じ配置', async ({ page, start }) => {
    const app = await start();
    await selectPersona(page, '事業部門');
    const ks = await topKeys(page);
    expect(ks.length, 'コンポーネントが 2 つ以上必要').toBeGreaterThanOrEqual(2);
    for (const k of ks) {
      const c = component(page, k);
      const before = await box(c);
      const others = ks.filter((o) => o !== k);
      const target = await box(component(page, others[0]));
      // 移動先は、タブ化されない余白側（移動先の下端の余白）にする
      const dx = target.x + target.width / 2 - (before.x + before.width / 2);
      const dy = target.y + target.height + 6 - (before.y + before.height / 2);
      const shown = await dragByHeading(page, c, dx, dy);
      expect(shown, `${k}: ドロップ前に置ける場所が示されない`).toBe(true);
      const after = await box(component(page, k));
      expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y), `${k}: 位置が変わらない`).toBeGreaterThan(2);
    }
    const moved: Record<string, { x: number; y: number }> = {};
    for (const k of ks) { const b = await box(component(page, k)); moved[k] = { x: Math.round(b.x), y: Math.round(b.y) }; }
    await app.reload();
    for (const k of ks) {
      const b = await box(component(page, k));
      expect(Math.abs(b.x - moved[k].x), `${k}.x 再読込後`).toBeLessThanOrEqual(2);
      expect(Math.abs(b.y - moved[k].y), `${k}.y 再読込後`).toBeLessThanOrEqual(2);
    }
  });

  // FR-142 AC-224（異常系: 置けない場所へ放す／Esc で中止）
  test('FR-142 AC-224 異常系: ドラッグ中に Esc を押すと元の位置に戻り、保存されたレイアウトも変わらない', async ({ page, start }) => {
    const app = await start();
    await selectPersona(page, '事業部門');
    const [k] = await keys(page);
    const c = component(page, k);
    const before = await box(c);
    const h = await box(c.getByRole('heading').first());
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + 200, h.y + 160, { steps: 8 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    const after = await box(c);
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
    await app.reload();
    const again = await box(component(page, k));
    expect(Math.abs(again.x - before.x) + Math.abs(again.y - before.y)).toBeLessThanOrEqual(2);
  });
});

test.describe('FR-143 操作中のコンポーネントを大きくする自動のサイズ調整', () => {
  // FR-143 AC-226
  test('FR-143 AC-226 操作したコンポーネントの面積が基準の 1.5 倍になり、別のコンポーネントを操作すると大きいものが移る', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const ks = await topKeys(page);
    expect(ks.length, '4 つ以上のコンポーネントが必要').toBeGreaterThanOrEqual(4);
    const base: Record<string, number> = {};
    for (const k of ks) base[k] = area(await box(component(page, k)));
    const [a, b] = ks;
    await component(page, a).focus();
    await expect.poll(async () => area(await box(component(page, a))) / base[a], { timeout: 5_000 }).toBeCloseTo(SCALE, 1);
    await component(page, b).focus();
    await expect.poll(async () => area(await box(component(page, b))) / base[b], { timeout: 5_000 }).toBeCloseTo(SCALE, 1);
    await expect.poll(async () => area(await box(component(page, a))) / base[a]).toBeLessThan(SCALE - 0.2);
  });

  // FR-143 AC-226（ペルソナの既定の情報表現は標準より小さくならない）
  test('FR-143 AC-226 ペルソナの既定の情報表現のコンポーネントは、標準のコンポーネントより小さくならない', async ({ page, start }) => {
    await start();
    await selectPersona(page, '経営層');
    await expect(component(page, 'matrix')).toBeVisible();
    const ks = (await topKeys(page)).filter((k) => k !== 'matrix');
    expect(ks.length).toBeGreaterThanOrEqual(3);
    await component(page, ks[0]).focus();
    const primary = area(await box(component(page, 'matrix')));
    for (const k of ks.slice(1)) {
      expect(primary, `matrix が ${k} より小さい`).toBeGreaterThanOrEqual(area(await box(component(page, k))) - 1);
    }
  });

  // FR-143 AC-226（異常系: 自動調整を切ると変わらない。AC-228 の一部を system で確認）
  test('FR-143 AC-226 異常系: 自動の調整を切ると、操作しても大きさが変わらない', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const ks = await keys(page);
    await page.getByRole('switch', { name: 'サイズの自動調整' }).uncheck();
    const before = area(await box(component(page, ks[0])));
    await component(page, ks[0]).focus();
    await page.waitForTimeout(500);
    expect(Math.abs(area(await box(component(page, ks[0]))) - before)).toBeLessThanOrEqual(2);
  });
});

/** 実 Project を n 件登録する（企業 1 社に Project を n 件）。 */
async function seedProjects(page: Page, company: string, names: string[]): Promise<void> {
  await page.getByRole('button', { name: '企業を登録' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: '企業名' }).fill(company);
  await dlg.getByRole('button', { name: '登録' }).click();
  await expect(dlg).toBeHidden();
  for (const n of names) {
    await page.getByRole('region', { name: `企業 ${company}` }).getByRole('button', { name: 'Project を作成' }).click();
    await dlg.getByRole('textbox', { name: 'Project 名' }).fill(n);
    await dlg.getByRole('button', { name: '作成' }).click();
    await expect(dlg).toBeHidden();
  }
}

test.describe('FR-144 起動後のデモ／実プロジェクトの選択', () => {
  // FR-144 AC-229
  test('FR-144 AC-229 実 Project が 2 件以上ある端末の起動時に選択画面が出て、デモと各 Project を選べ、作業先が常に示される', async ({ page, start }) => {
    const app = await start();
    await seedProjects(page, '合成株式会社A', ['業務改善 2026', '在庫最適化']);
    await app.reload({ skipOpening: false });
    const picker = page.getByRole('dialog', { name: '作業先の選択' });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('option', { name: /デモ/ })).toBeVisible();
    await expect(picker.getByRole('option', { name: /合成株式会社A.*業務改善 2026/ })).toBeVisible();
    await expect(picker.getByRole('option', { name: /合成株式会社A.*在庫最適化/ })).toBeVisible();
    // Project を選ぶと、その Project のステッパーで開く
    await picker.getByRole('option', { name: /合成株式会社A.*在庫最適化/ }).click();
    await expect(page.getByTestId('stepper')).toBeVisible();
    await expect(page.getByTestId('work-target')).toContainText('合成株式会社A');
    await expect(page.getByTestId('work-target')).toContainText('在庫最適化');
    // 開き直してデモを選ぶと、架空企業のお手本パックで開く
    await app.reload({ skipOpening: false });
    await page.getByRole('dialog', { name: '作業先の選択' }).getByRole('option', { name: /デモ/ }).click();
    await expect(page.getByTestId('workspace')).toBeVisible();
    await expect(page.getByTestId('work-target')).toContainText('デモ');
    await expect(page.getByText('合成株式会社A')).toHaveCount(0);
  });

  // FR-144 AC-229（異常系: 選択画面を何も選ばずに閉じられない）
  test('FR-144 AC-229 異常系: 作業先を選ばないまま選択画面を閉じても、作業先が未定のまま本編に入らない', async ({ page, start }) => {
    const app = await start();
    await seedProjects(page, '合成株式会社A', ['業務改善 2026', '在庫最適化']);
    await app.reload({ skipOpening: false });
    const picker = page.getByRole('dialog', { name: '作業先の選択' });
    await expect(picker).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('work-target')).toBeVisible();
    await expect(page.getByTestId('work-target')).not.toBeEmpty();
  });

  // FR-144 AC-230
  test('FR-144 AC-230 実 Project が 0 件ならデモで起動し、作業先の選択からデモと「実際の Project を登録」を選べる', async ({ page, start }) => {
    await start();
    await expect(page.getByRole('dialog', { name: '作業先の選択' })).toBeHidden();
    await expect(page.getByTestId('workspace')).toBeVisible();
    await expect(page.getByTestId('work-target')).toContainText('デモ');
    await page.getByRole('button', { name: '作業先' }).click();
    const picker = page.getByRole('dialog', { name: '作業先の選択' });
    await expect(picker.getByRole('option', { name: /デモ/ })).toBeVisible();
    await expect(picker.getByRole('option', { name: '実際の Project を登録' })).toBeVisible();
  });

  // FR-144 AC-230（異常系: Project が無いのに実 Project の候補は出ない）
  test('FR-144 AC-230 異常系: 実 Project が 0 件のとき、選択画面に企業名・Project 名の候補は出ない', async ({ page, start }) => {
    await start();
    await page.getByRole('button', { name: '作業先' }).click();
    const picker = page.getByRole('dialog', { name: '作業先の選択' });
    await expect(picker.getByRole('option')).toHaveCount(2);
  });
});

/** 検証対象の見出し・タブ・作業先の選択画面の要素 */
async function contrastFailures(page: Page, root: Locator): Promise<string[]> {
  return await root.evaluate((el: Element) => {
    const parse = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (e: Element | null): number[] => {
      while (e) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c.length >= 3 && (c.length === 3 || c[3] > 0.99)) return c;
        e = e.parentElement;
      }
      return [255, 255, 255];
    };
    const bad: string[] = [];
    for (const t of Array.from(el.querySelectorAll('h1,h2,h3,[role=tab],[role=option],button'))) {
      if (!(t as HTMLElement).offsetParent || !(t.textContent ?? '').trim()) continue;
      const fg = parse(getComputedStyle(t).color);
      const l1 = lum(fg), l2 = lum(bgOf(t));
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (ratio < 4.5) bad.push(`${(t.textContent ?? '').trim().slice(0, 20)}: ${ratio.toFixed(2)}`);
    }
    return bad;
  });
}

test.describe('NFR-UX-007 画面とレイアウト操作への Fluent 2 の適用と最小の読みやすさ', () => {
  // NFR-UX-007 AC-234
  for (const mode of ['light', 'dark', 'hc'] as const) {
    test(`NFR-UX-007 AC-234 ${mode}: 見出し・タブ・作業先の選択画面の文字が AA のコントラストで、キーボードフォーカスが見える`, async ({ page, start }) => {
      if (mode === 'hc') await page.emulateMedia({ forcedColors: 'active' });
      else await page.emulateMedia({ colorScheme: mode });
      await start();
      await selectPersona(page, '事業部門');
      const ws = page.getByTestId('workspace');
      expect(await contrastFailures(page, ws), '本編のコントラスト不足').toEqual([]);
      await page.getByRole('button', { name: '作業先' }).click();
      const picker = page.getByRole('dialog', { name: '作業先の選択' });
      expect(await contrastFailures(page, picker), '作業先の選択画面のコントラスト不足').toEqual([]);
      await page.keyboard.press('Tab');
      const outline = await page.evaluate(() => {
        const s = getComputedStyle(document.activeElement as Element);
        return { w: parseFloat(s.outlineWidth), style: s.outlineStyle, shadow: s.boxShadow };
      });
      expect(outline.style !== 'none' && outline.w > 0 || outline.shadow !== 'none', 'フォーカスが見えない').toBe(true);
    });
  }

  // NFR-UX-007 AC-234（動きの軽減）
  test('NFR-UX-007 AC-234 動きの軽減を有効にすると、移動・サイズ変更の動き（transition・animation）が省かれる', async ({ page, start }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start();
    await selectPersona(page, '事業部門');
    const [k] = await keys(page);
    await component(page, k).focus();
    const dur = await component(page, k).evaluate((el) => {
      const s = getComputedStyle(el);
      const ms = (v: string) => Math.max(...v.split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) : parseFloat(x) * 1000)));
      return Math.max(ms(s.transitionDuration), ms(s.animationDuration));
    });
    expect(dur, '動きの軽減でも動きが残っている').toBeLessThanOrEqual(1);
  });

  // NFR-UX-007 AC-235
  test('NFR-UX-007 AC-235 コンポーネントを最小の幅（240px）近くまで縮めても、本文の文字は 12px 以上', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    await page.setViewportSize({ width: MIN_WIDTH * 5, height: 900 }); // 並ぶ数が増え、各幅が最小に近づく
    const ks = await keys(page);
    for (const k of ks) {
      const c = component(page, k);
      const w = (await box(c)).width;
      expect(w, `${k} が最小の幅未満`).toBeGreaterThanOrEqual(MIN_WIDTH - 1);
    }
    const small = await visibleComponents(page).evaluateAll((els, min) => {
      const out: string[] = [];
      for (const el of els) {
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          const p = n.parentElement;
          if (!p || !(n.textContent ?? '').trim() || !p.offsetParent) continue;
          const px = parseFloat(getComputedStyle(p).fontSize);
          if (px < (min as number)) out.push(`${(n.textContent ?? '').trim().slice(0, 16)}: ${px}px`);
        }
      }
      return out;
    }, MIN_FONT);
    expect(small, '12px 未満の本文がある').toEqual([]);
  });

  // NFR-UX-007 AC-235（異常系: 大きく縮めて増やした状態）
  test('NFR-UX-007 AC-235 異常系: 画面を狭くして収まらないコンポーネントがタブにまとめられても、本文は 12px 以上', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    await page.setViewportSize({ width: MIN_WIDTH * 2, height: 800 });
    const sizes = await page.getByTestId('workspace').locator('h1,h2,h3,[role=tab],p,li,td,span').evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).offsetParent && (e.textContent ?? '').trim()).map((e) => parseFloat(getComputedStyle(e).fontSize)));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(MIN_FONT);
  });
});
