// System Test: テーマ・ブランド・フォント・設定パネル・音・演出設定の保存・表示設定の追従・顧客パックの差し替えと検証・雛形のバージョン
// 期待値は要求定義書の受入基準（app-core.md・app-experience.md・quality.md）と、入力したパックの内容から決める。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import type { Page, Locator } from '@playwright/test';
import { test, expect, openScreen, component, hook, MAIN_SCREENS, hexToRgb, contrastRatio } from '../support/fixtures';
import { examplePack, makeVariant } from '../support/packs';
import { DIST_DIR } from '../support/server';

const mono = examplePack('mono');
const koto = examplePack('koto');

async function bgLuminanceDark(page: Page): Promise<boolean> {
  const rgb = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="workspace"]') ?? document.body;
    let c = getComputedStyle(el).backgroundColor;
    let e: Element | null = el;
    while (e && (c === 'rgba(0, 0, 0, 0)' || c === 'transparent')) { e = e.parentElement; c = e ? getComputedStyle(e).backgroundColor : 'rgb(255,255,255)'; }
    return c;
  });
  return contrastRatio(rgb, 'rgb(0, 0, 0)') < 3;
}

async function setTheme(page: Page, theme: 'Light' | 'Dark') {
  const settings = await openScreen(page, 'settings');
  await settings.getByRole('radio', { name: theme }).check();
}

function muteButton(page: Page): Locator {
  return page.getByTestId('show-control-bar').getByRole('button', { name: /ミュート/ }).first();
}

test.describe('FR-057 演出の設定の保存と復元', () => {
  // FR-057 AC-070
  test('FR-057 AC-070 ミュート解除・音量・アニメ停止・演出強度・3D 品質・ダークテーマを変えて再読込すると 6 項目すべてが復元される', async ({ page, start }) => {
    const app = await start();
    await page.mouse.move(300, 300);
    await expect(muteButton(page)).toHaveAttribute('aria-pressed', 'true');
    await muteButton(page).click();
    await expect(muteButton(page)).toHaveAttribute('aria-pressed', 'false');
    const vol = page.getByTestId('show-control-bar').getByRole('slider', { name: /音量/ });
    await vol.focus();
    await page.keyboard.press('Home');
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    const volume = await vol.getAttribute('aria-valuenow');
    await page.keyboard.press('p');
    await expect(page.getByTestId('animation-state')).toContainText('停止中');
    const intensity0 = await page.getByTestId('intensity').innerText();
    await page.keyboard.press('e');
    const intensity = (await page.getByTestId('intensity').innerText()).trim();
    expect(intensity).not.toBe(intensity0.trim());
    const settings = await openScreen(page, 'settings');
    await settings.getByRole('radio', { name: 'Low' }).check();
    await settings.getByRole('radio', { name: 'Dark' }).check();
    expect(await bgLuminanceDark(page)).toBe(true);
    await page.waitForTimeout(300);
    await app.reload();
    await page.mouse.move(310, 310);
    await expect(muteButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('show-control-bar').getByRole('slider', { name: /音量/ })).toHaveAttribute('aria-valuenow', volume!);
    await expect(page.getByTestId('animation-state')).toContainText('停止中');
    await expect(page.getByTestId('intensity')).toContainText(intensity);
    const s2 = await openScreen(page, 'settings');
    await expect(s2.getByTestId('quality-current')).toContainText('Low');
    await expect(s2.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(await bgLuminanceDark(page)).toBe(true);
  });
});

test.describe('FR-058 テーマ', () => {
  // FR-058 AC-071
  test('FR-058 AC-071 Light と Dark で背景と文字の色が切り替わり、強制カラーでは OS の色で描かれ情報が欠けない', async ({ page, start }) => {
    await start();
    const colors = async () => page.evaluate(() => {
      const el = document.querySelector('[data-testid="workspace"]')!;
      const h = el.querySelector('h1,h2,h3,[role="heading"]') ?? el;
      return { bg: getComputedStyle(document.body).backgroundColor + '|' + getComputedStyle(el).backgroundColor, fg: getComputedStyle(h).color };
    });
    await setTheme(page, 'Light');
    const light = await colors();
    await setTheme(page, 'Dark');
    const dark = await colors();
    expect(dark.bg).not.toBe(light.bg);
    expect(dark.fg).not.toBe(light.fg);
    // 強制カラー
    await setTheme(page, 'Light');
    const text0 = await page.getByTestId('workspace').innerText();
    await page.emulateMedia({ forcedColors: 'active' });
    await page.waitForTimeout(300);
    const text1 = await page.getByTestId('workspace').innerText();
    expect(text1).toBe(text0);
    const optedOut = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="workspace"] *')]
        .filter((e) => !(e instanceof HTMLCanvasElement) && !e.closest('canvas,svg,[data-forced-colors-exempt]'))
        .filter((e) => getComputedStyle(e).forcedColorAdjust === 'none' && (e.textContent ?? '').trim() !== '')
        .map((e) => e.tagName + ':' + (e.textContent ?? '').trim().slice(0, 20)),
    );
    expect(optedOut, '強制カラーを無効にしている文字の要素がある').toEqual([]);
    const btn = page.getByRole('button').first();
    await btn.focus();
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement;
      const s = getComputedStyle(a);
      return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? 'outline' : s.boxShadow !== 'none' ? 'shadow' : s.borderStyle !== 'none' ? 'border' : 'none';
    });
    expect(ring, '強制カラーでフォーカスの表示がない').not.toBe('none');
  });
});

test.describe('FR-059 ブランドランプの適用', () => {
  // FR-059 AC-073
  test('FR-059 AC-073 Primary 色が主要なボタンとアクセントに、ランプの値（補正後の実効色）で反映される', async ({ page, start }) => {
    await start();
    const settings = await openScreen(page, 'settings');
    const ramp = settings.getByTestId('brand-ramp');
    const steps = ramp.locator('[data-step]');
    await expect(steps).toHaveCount(16);
    const primaryStep = ramp.locator('[data-step][data-primary="true"]');
    await expect(primaryStep).toHaveCount(1);
    const rampHex = (await primaryStep.getAttribute('data-color'))!;
    const rampRgb = hexToRgb(rampHex);
    await openScreen(page, 'canvas');
    const primaryBtn = page.locator('[data-appearance="primary"], [data-testid="primary-action"]').first();
    await expect(primaryBtn).toBeVisible();
    const s = await primaryBtn.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color }));
    const accent = await page.getByTestId('accent').first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return [cs.color, cs.backgroundColor, cs.borderTopColor].join('|');
    });
    const ratio = contrastRatio(rampRgb, s.fg);
    if (ratio >= 4.5) {
      // 補正が起きない色では、ランプの値そのもの
      expect(s.bg).toBe(rampRgb);
    } else {
      // 補正後: AA を満たし、色相が保たれる（明度だけの補正）
      expect(contrastRatio(s.bg, s.fg)).toBeGreaterThanOrEqual(4.5);
      const hue = (rgb: string) => {
        const [r, g, b] = (rgb.match(/\d+/g) ?? []).slice(0, 3).map((x) => Number(x) / 255);
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        if (d === 0) return 0;
        const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return (h * 60 + 360) % 360;
      };
      expect(Math.abs(hue(s.bg) - hue(rampRgb)) % 360).toBeLessThan(12);
    }
    // アクセント（主要なボタン以外の強調色）にも同じ実効色が使われる
    const accentColors = accent.split('|');
    expect(accentColors.some((c) => c === s.bg || c === rampRgb), `アクセントの色 ${accent} が Primary の実効色 ${s.bg} と一致しない`).toBe(true);
  });
});

test.describe('FR-060 コントラスト', () => {
  // FR-060 AC-075
  test('FR-060 AC-075 主要画面の文字と背景の組み合わせを自動検査すると AA の違反が 0 件', async ({ page, start }) => {
    await start();
    for (const theme of ['Light', 'Dark'] as const) {
      await setTheme(page, theme);
      for (const [key, name] of MAIN_SCREENS) {
        await openScreen(page, key);
        const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
        const v = r.violations.flatMap((x) => x.nodes.map((n) => `${n.target.join(' ')}: ${n.failureSummary}`));
        expect(v, `${theme} ${name} のコントラスト違反`).toEqual([]);
      }
    }
  });
});

test.describe('FR-061 ロゴ', () => {
  // FR-061 AC-076
  test('FR-061 AC-076 利用条件が「不明」のパックでは「LOGO（要許諾確認）」が出て、「顧客名 × Microsoft」の表記がある', async ({ page, start }) => {
    const pack = makeVariant('mono', 'logo-unknown', (p) => p.editBrand((b) => { b.logo.status = 'unknown'; }));
    await start({ pack });
    await expect(page.getByText('LOGO（要許諾確認）').first()).toBeVisible();
    await expect(page.locator('img[data-testid="customer-logo"]')).toHaveCount(0);
    await expect(page.getByText(`${mono.customerName} × Microsoft`).first()).toBeVisible();
  });

  // FR-061 AC-076（確認済み）
  test('FR-061 AC-076 利用条件が「確認済み」のパックでは同梱のロゴが元の縦横比のまま表示される', async ({ page, start }) => {
    const pack = makeVariant('mono', 'logo-confirmed', (p) => p.editBrand((b) => { b.logo.status = 'confirmed'; }));
    await start({ pack });
    const logo = page.locator('img[data-testid="customer-logo"]').first();
    await expect(logo).toBeVisible();
    const r = await logo.evaluate((img: HTMLImageElement) => ({ nat: img.naturalWidth / img.naturalHeight, shown: img.getBoundingClientRect().width / img.getBoundingClientRect().height, fit: getComputedStyle(img).objectFit }));
    if (r.fit === 'contain' || r.fit === 'scale-down') expect(r.nat).toBeGreaterThan(0);
    else expect(Math.abs(r.shown / r.nat - 1), 'ロゴの縦横比が変わっている').toBeLessThan(0.02);
    await expect(page.getByText('LOGO（要許諾確認）')).toHaveCount(0);
    await expect(page.getByText(`${mono.customerName} × Microsoft`).first()).toBeVisible();
  });
});

test.describe('FR-062 フォント', () => {
  // FR-062 AC-077
  test('FR-062 AC-077 本文の font-family がブランド書体・Segoe UI Variable・Noto Sans JP の順を含み、KPI の数値が tabular-nums', async ({ page, start }) => {
    await start();
    const brandFont: string = mono.brand().fonts.primary;
    expect(brandFont).toBeTruthy();
    const ff = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="workspace"] p, [data-testid="workspace"]')!).fontFamily);
    const list = ff.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
    const i1 = list.indexOf(brandFont);
    const i2 = list.indexOf('Segoe UI Variable');
    const i3 = list.indexOf('Noto Sans JP');
    expect(i1, `font-family: ${ff}`).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
    await openScreen(page, 'priority');
    const kpis = page.getByTestId('kpi-value');
    expect(await kpis.count()).toBeGreaterThan(0);
    for (const v of await kpis.evaluateAll((els) => els.map((e) => getComputedStyle(e).fontVariantNumeric))) expect(v).toContain('tabular-nums');
  });
});

test.describe('FR-064 設定パネルのブランド', () => {
  // FR-064 AC-079
  test('FR-064 AC-079 設定パネルにブランドの値と出典・確認日・確度があり、低い確度は「推定」、Primary の上書きが再読込後も保たれる', async ({ page, start }) => {
    const app = await start();
    const settings = await openScreen(page, 'settings');
    for (const [key, label] of [['color', '色'], ['logo', 'ロゴ'], ['font', 'フォント'], ['tone', 'トーン']]) {
      const row = settings.getByTestId(`brand-${key}`);
      await expect(row, `${label} の行がない`).toBeVisible();
      await expect(row).toContainText(/出典/);
      await expect(row).toContainText(/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/);
      await expect(row).toContainText(/確度|推定/);
    }
    const lowKeys = Object.entries(mono.brand()).filter(([, v]: any) => v && typeof v === 'object' && /low|低|推定|estimate/i.test(String(v.confidence ?? ''))).map(([k]) => k);
    expect(lowKeys.length, 'お手本パックに確度の低いブランドの値がない').toBeGreaterThan(0);
    for (const k of lowKeys) {
      const key = k === 'colors' ? 'color' : k === 'fonts' ? 'font' : k;
      await expect(settings.getByTestId(`brand-${key}`)).toContainText('推定');
    }
    // Primary 色の上書き
    const input = settings.getByRole('textbox', { name: /Primary/ });
    await input.fill('#2E7D32');
    await input.press('Enter');
    const btnBg = () => page.locator('[data-appearance="primary"], [data-testid="primary-action"]').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    const after = await btnBg();
    expect(after).not.toBe(hexToRgb(mono.brand().colors.primary));
    await app.reload();
    const s2 = await openScreen(page, 'settings');
    await expect(s2.getByRole('textbox', { name: /Primary/ })).toHaveValue(/#?2E7D32/i);
    expect(await btnBg()).toBe(after);
  });

  // FR-064 AC-079（異常系: 色でない値）
  test('FR-064 AC-079 異常系: Primary 色に色でない値を入れると反映されず原因が表示される', async ({ page, start }) => {
    await start();
    const settings = await openScreen(page, 'settings');
    const input = settings.getByRole('textbox', { name: /Primary/ });
    const before = await input.inputValue();
    await input.fill('みどり');
    await input.press('Enter');
    await expect(settings.getByRole('alert').or(page.getByRole('alert')).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settings.getByRole('textbox', { name: /Primary/ })).toHaveValue(before);
  });
});

test.describe('FR-074 ミュートと音量', () => {
  // FR-074 AC-091
  test('FR-074 AC-091 初回はミュートで、M で切り替わりボタンの表示と名前が変わり、BGM だけ OFF でも効果音は変わらない', async ({ page, start }) => {
    await start();
    await page.mouse.move(200, 200);
    const btn = muteButton(page);
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    const name0 = await btn.evaluate((e) => e.getAttribute('aria-label') ?? e.textContent);
    await page.keyboard.press('m');
    const btn2 = muteButton(page);
    await expect(btn2).toHaveAttribute('aria-pressed', 'false');
    const name1 = await btn2.evaluate((e) => e.getAttribute('aria-label') ?? e.textContent);
    expect(name1).not.toBe(name0);
    const settings = await openScreen(page, 'settings');
    const bgm = settings.getByRole('switch', { name: 'BGM' });
    const se = settings.getByRole('switch', { name: '効果音' });
    const se0 = await se.isChecked();
    if (!(await bgm.isChecked())) await bgm.click();
    await bgm.click();
    await expect(bgm).not.toBeChecked();
    expect(await se.isChecked()).toBe(se0);
  });

  // FR-074 AC-193
  test('FR-074 AC-193 初回は M 以外の操作をしてもミュートのまま鳴らず、解除を保存して再読込すると解除で復元され、最初の操作の後に鳴る', async ({ page, start }) => {
    const app = await start();
    await page.mouse.click(400, 300);
    await page.keyboard.press('e');
    await page.keyboard.press('e');
    await page.keyboard.press('e');
    await page.mouse.move(200, 200);
    await expect(muteButton(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await hook<boolean>(page, 't.audio.isAudible()'), 'ミュートなのに音が鳴っている').toBe(false);
    await muteButton(page).click();
    await expect(muteButton(page)).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(300);
    await app.reload({ skipOpening: false });
    await page.mouse.move(210, 210);
    await expect(muteButton(page)).toHaveAttribute('aria-pressed', 'false');
    await page.mouse.click(500, 400);
    await expect.poll(() => hook<boolean>(page, 't.audio.isAudible()'), { timeout: 10_000 }).toBe(true);
  });
});

test.describe('NFR-UX-005 OS の表示設定への追従', () => {
  // NFR-UX-005 AC-189
  test('NFR-UX-005 AC-189 prefers-color-scheme が dark なら初回はダーク、拡大率 200% でも主要画面の文字が切れたり重なったりしない', async ({ page, start }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 800, height: 450 });
    await start();
    expect(await bgLuminanceDark(page)).toBe(true);
    for (const [key, name] of MAIN_SCREENS) {
      const nav = page.getByTestId(`nav-${key}`);
      if (!(await nav.isVisible())) await page.getByRole('button', { name: 'メニュー' }).click();
      await nav.click();
      const c = component(page, key);
      await expect(c).toBeVisible();
      const problems = await c.evaluate((root) => {
        const els = [...root.querySelectorAll('button, h1, h2, h3, h4, label, [role="tab"], [role="menuitem"], th, legend')]
          .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (e.textContent ?? '').trim() !== ''; });
        const out: string[] = [];
        for (const e of els) {
          const s = getComputedStyle(e);
          if ((s.overflow === 'hidden' || s.overflowX === 'hidden' || s.textOverflow === 'clip') && e.scrollWidth > e.clientWidth + 1 && s.textOverflow !== 'ellipsis') out.push(`切れ: ${(e.textContent ?? '').trim().slice(0, 20)}`);
          if (e.scrollHeight > e.clientHeight + 2 && (s.overflow === 'hidden' || s.overflowY === 'hidden')) out.push(`縦に切れ: ${(e.textContent ?? '').trim().slice(0, 20)}`);
        }
        const rects = els.map((e) => ({ e, r: e.getBoundingClientRect() }));
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
          const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (ix > 2 && iy > 2) out.push(`重なり: ${(a.e.textContent ?? '').trim().slice(0, 12)} / ${(b.e.textContent ?? '').trim().slice(0, 12)}`);
        }
        return out;
      });
      expect(problems, `${name}`).toEqual([]);
    }
  });
});

test.describe('FR-101 顧客パックの差し替え', () => {
  function distHash(): string {
    const h = crypto.createHash('sha256');
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else h.update(p).update(fs.readFileSync(p));
      }
    };
    walk(DIST_DIR);
    return h.digest('hex');
  }
  // FR-101 AC-123
  test('FR-101 AC-123 同じ dist/ に 2 種類のお手本パックを順に差し替えると、再ビルドせずにそれぞれの顧客名がタイトルとオープニングに出る', async ({ page, start }) => {
    test.setTimeout(120_000);
    expect(mono.customerName).not.toBe(koto.customerName);
    const h0 = distHash();
    for (const p of [mono, koto]) {
      await start({ pack: p, skipOpening: false });
      await expect(page.getByTestId('opening')).toContainText(p.customerName, { timeout: 30_000 });
      await page.keyboard.press('Escape');
      await expect(page).toHaveTitle(new RegExp(p.customerName));
    }
    expect(distHash(), 'dist/ が変わった（再ビルドされた）').toBe(h0);
  });
});

test.describe('FR-102 顧客パックの検証', () => {
  // FR-102 AC-124
  test('FR-102 AC-124 1 件の課題だけが不正なパックで、画面とコンソールにファイル名・位置・内容が出て、他はすべて表示されページエラーがない', async ({ page, start, pageErrors }) => {
    let badIndex = -1;
    let badId = '';
    const pack = makeVariant('mono', 'one-bad-issue', (p) =>
      p.edit('issues', (j) => {
        const list = Array.isArray(j) ? j : j.issues;
        badIndex = list.length - 1;
        badId = list[badIndex].id;
        list[badIndex].title = 12345;
      }),
    );
    const consoleLines: string[] = [];
    page.on('console', (m) => consoleLines.push(m.text()));
    await start({ pack });
    const errors = page.getByTestId('pack-errors');
    await expect(errors).toBeVisible();
    await expect(errors).toContainText('issues.json');
    await expect(errors).toContainText(new RegExp(`(issues/${badIndex}|\\[${badIndex}\\]|${badId})`));
    await expect(errors).toContainText(/title|課題名|string|文字列/);
    expect(consoleLines.some((l) => l.includes('issues.json') && /title|string|文字列/.test(l)), 'コンソールに出ていない').toBe(true);
    const view = await openScreen(page, 'issue-solution');
    for (const i of mono.issues().filter((x) => x.id !== badId)) await expect(view.locator(`[data-entity-id="${i.id}"]`).first()).toBeAttached();
    await expect(view.locator(`[data-entity-id="${badId}"]`)).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
});

test.describe('FR-104 お手本パックでの起動', () => {
  // FR-104 AC-126
  test('FR-104 AC-126 public/data が空なら、お手本パックの架空企業名がタイトルに出て「お手本パック」で起動したことが示される', async ({ page, start }) => {
    await start({ pack: null });
    await expect(page).toHaveTitle(new RegExp(mono.customerName));
    await expect(page.getByText('お手本パック').first()).toBeVisible();
  });
});

test.describe('FR-106 雛形のバージョン', () => {
  // FR-106 AC-129
  test('FR-106 AC-129 互換でないバージョンの顧客パックで起動すると警告にバージョンの組み合わせが出て、設定パネルに雛形のバージョンがある', async ({ page, start }) => {
    const pack = makeVariant('mono', 'bad-version', (p) => p.edit('customer', (c) => { c.templateVersion = '999.0.0'; }));
    await start({ pack });
    const settings = await openScreen(page, 'settings');
    const tv = (await settings.getByTestId('template-version').innerText()).match(/\d+\.\d+\.\d+/)?.[0];
    expect(tv, '設定パネルに雛形のバージョンがない').toBeTruthy();
    const warn = page.getByTestId('version-warning');
    await expect(warn).toBeVisible();
    await expect(warn).toContainText('999.0.0');
    await expect(warn).toContainText(tv!);
  });

  // FR-106 AC-129（互換なら警告なし）
  test('FR-106 AC-129 互換のお手本パックでは警告が出ない', async ({ page, start }) => {
    await start();
    await expect(page.getByTestId('version-warning')).toHaveCount(0);
  });
});
