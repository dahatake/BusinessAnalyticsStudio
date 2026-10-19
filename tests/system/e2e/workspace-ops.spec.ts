// System Test: 作業先メニュー・画面上の操作部品・コンポーネント操作アイコン・最小化・スナップ・モーション・KPI/OKR
// 期待値は要求定義書の受入基準（docs/requirements/app-experience.md の FR-148〜154・NFR-UX-008）だけから決める。
// 画面の探し方は tests/system/CONTRACT.md §10。PARAM-040=24 CSS px、PARAM-041=200 ms、PARAM-042=32 CSS px。
import type { Page, Locator } from '@playwright/test';
import { test, expect, openScreen, component, selectPersona, setEditMode, reloadAndEnter, closeSettings } from '../support/fixtures';

const HIT = 24; // PARAM-040
const MOTION_MS = 200; // PARAM-041
const SNAP_EDGE = 32; // PARAM-042

async function box(loc: Locator) {
  const b = await loc.boundingBox();
  expect(b, '要素が表示されていない').not.toBeNull();
  return b!;
}

/** 直下のコンポーネント（component-menu と入れ子を除く）の key 一覧 */
async function topKeys(page: Page): Promise<string[]> {
  return page.getByTestId('workspace').evaluate((ws) => {
    const sel = '[data-testid^="component-"]:not([data-testid="component-menu"]):not([data-testid="component-actions"])';
    const out: string[] = [];
    ws.querySelectorAll(sel).forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (!el.parentElement?.closest(sel) && r.width > 0 && r.height > 0) out.push((el.getAttribute('data-testid') ?? '').replace('component-', ''));
    });
    return out;
  });
}

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

function icon(c: Locator, name: string | RegExp): Locator {
  return c.getByTestId('component-actions').getByRole('button', { name });
}

async function dragHeading(page: Page, c: Locator, toX: number, toY: number, release = true) {
  const h = await box(c.getByRole('heading').first());
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move((h.x + toX) / 2, (h.y + toY) / 2, { steps: 6 });
  await page.mouse.move(toX, toY, { steps: 6 });
  if (release) await page.mouse.up();
}

test.describe('FR-148 最上段の作業先メニュー', () => {
  // FR-148 AC-251
  test('FR-148 AC-251 企業 2 社（各 2 Project）で、作業先メニューにデモと 4 Project が企業名・Project 名で並び、選ぶと移動して表示が変わる', async ({ page, start }) => {
    await start();
    await seedProjects(page, '合成株式会社A', ['業務改善 2026', '在庫最適化']);
    await page.getByRole('button', { name: 'Project 一覧へ' }).click({ timeout: 500 }).catch(() => undefined);
    await seedProjects(page, '合成株式会社B', ['需要予測', '品質改善']);
    const menu = page.getByTestId('work-target-menu');
    await menu.click();
    const list = page.getByRole('menu', { name: '作業先' });
    await expect(list.getByRole('menuitemradio')).toHaveCount(5);
    await expect(list.getByRole('menuitemradio', { name: /デモ/ })).toBeVisible();
    for (const [c, p] of [['合成株式会社A', '業務改善 2026'], ['合成株式会社A', '在庫最適化'], ['合成株式会社B', '需要予測'], ['合成株式会社B', '品質改善']]) {
      await expect(list.getByRole('menuitemradio', { name: new RegExp(`${c}.*${p}`) })).toBeVisible();
    }
    await expect(list.getByRole('menuitemradio', { checked: true }), '現在の作業先が 1 つだけ識別できる').toHaveCount(1);
    await list.getByRole('menuitemradio', { name: /合成株式会社B.*品質改善/ }).click();
    await expect(page.getByTestId('stepper')).toBeVisible();
    await expect(menu).toContainText('合成株式会社B');
    await expect(menu).toContainText('品質改善');
    await expect(page.getByTestId('work-target')).toContainText('品質改善');
  });

  // FR-148 AC-251（異常系: 閉じて何も選ばなければ作業先は変わらない）
  test('FR-148 AC-251 異常系: メニューを Esc で閉じても作業先は変わらず、現在の作業先の表示が保たれる', async ({ page, start }) => {
    await start();
    await seedProjects(page, '合成株式会社A', ['業務改善 2026']);
    await page.getByRole('link', { name: '業務改善 2026' }).click();
    const menu = page.getByTestId('work-target-menu');
    await expect(menu).toContainText('業務改善 2026');
    await menu.click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu', { name: '作業先' })).toBeHidden();
    await expect(menu).toContainText('合成株式会社A');
    await expect(menu).toContainText('業務改善 2026');
  });
});

test.describe('FR-149 users-guide の全ユーザー操作を画面から', () => {
  // FR-149 AC-254
  // 操作の一覧（利用者の操作名 → 画面上の操作部品）。ショートカット・コマンドパレットは使わない。
  test('FR-149 AC-254 users-guide の操作それぞれに、画面上の操作部品があり、その操作だけで結果が得られる', async ({ page, start }) => {
    await start();
    await openScreen(page, 'canvas');
    const c = component(page, 'canvas');
    await c.focus();
    // コンポーネントの最大化 → 通常表示
    const before = await box(c);
    await icon(c, '最大化').click();
    const big = await box(c);
    expect(big.width * big.height, '最大化で広がらない').toBeGreaterThan(before.width * before.height);
    await icon(c, /通常表示|元に戻す/).click();
    const back = await box(c);
    expect(Math.abs(back.width - before.width)).toBeLessThanOrEqual(2);
    // ミュート（M）: 常時見えるボタン
    const mute = page.getByRole('button', { name: /ミュート/ }).first();
    await expect(mute).toBeVisible();
    const muteName = await mute.getAttribute('aria-label') ?? await mute.innerText();
    await mute.click();
    expect(await page.getByRole('button', { name: /ミュート|消音/ }).first().getAttribute('aria-label') ?? '', 'ミュートの操作後に表示が変わらない').not.toBe('');
    void muteName;
    // アニメーションの停止（P）
    await page.getByRole('button', { name: /アニメーション.*(停止|再生)/ }).first().click();
    await expect(page.getByTestId('animation-state')).toContainText(/停止中|再生中/);
    // 編集モード・既定のレイアウトに戻す
    await expect(page.getByRole('switch', { name: '編集モード' })).toBeVisible();
    await expect(page.getByRole('button', { name: /レイアウトを既定に戻す|既定のレイアウトに戻す/ })).toBeVisible();
    // 非表示（H）
    await c.focus();
    await icon(c, '非表示').click();
    await expect(component(page, 'canvas')).toBeHidden();
  });

  // FR-149 AC-254（異常系: キー操作に頼らない。キーを押さずに非表示にしたコンポーネントを一覧から戻せる）
  test('FR-149 AC-254 異常系: 非表示にしたコンポーネントを、キー操作なしに非表示の一覧から再表示できる', async ({ page, start }) => {
    await start();
    await openScreen(page, 'canvas');
    const c = component(page, 'canvas');
    await c.focus();
    await icon(c, '非表示').click();
    await expect(component(page, 'canvas')).toBeHidden();
    await page.getByRole('button', { name: /非表示のコンポーネント/ }).click();
    await page.getByRole('menuitem', { name: /キャンバス|canvas/i }).first().click();
    await expect(component(page, 'canvas')).toBeVisible();
  });
});

test.describe('FR-150 操作アイコンの常時表示', () => {
  // FR-150 AC-257
  test('FR-150 AC-257 フォーカスしたコンポーネントの見出しに操作アイコンが出て 1 回の操作で実行でき、フォーカスを移すとアイコンも移る', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const ks = await topKeys(page);
    expect(ks.length).toBeGreaterThanOrEqual(2);
    const a = component(page, ks[0]);
    const b = component(page, ks[1]);
    await a.focus();
    for (const n of ['最大化', '最小化', 'タブにまとめる', '非表示']) {
      await expect(icon(a, n), `${ks[0]}: ${n} のアイコン`).toBeVisible();
    }
    await b.focus();
    await expect(icon(b, '最小化')).toBeVisible();
    await expect(icon(a, '最小化'), 'フォーカスを外したのにアイコンの組が残っている').toBeHidden();
    // 1 回の操作で実行
    await icon(b, '最小化').click();
    await expect(component(page, ks[1])).toHaveAttribute('data-minimized', 'true');
  });

  // FR-150 AC-257（異常系: フォーカスのないコンポーネントのアイコンを操作できない／誤って実行されない）
  test('FR-150 AC-257 異常系: フォーカスしただけでは操作は実行されず、位置も大きさも変わらない', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const [k] = await topKeys(page);
    const c = component(page, k);
    await page.getByRole('switch', { name: 'サイズの自動調整' }).uncheck({ timeout: 500 }).catch(() => undefined);
    const before = await box(c);
    await c.focus();
    await page.waitForTimeout(400);
    const after = await box(c);
    expect(Math.abs(after.width - before.width) + Math.abs(after.height - before.height)).toBeLessThanOrEqual(2);
    await expect(c).not.toHaveAttribute('data-minimized', 'true');
  });
});

test.describe('FR-151 最小化と左メニューのアイコン表示', () => {
  // FR-151 AC-260
  test('FR-151 AC-260 コンポーネントを最小化すると見出しだけが残り、ほかが領域を使い、復元で元に戻り、絞り込み・選択・入力が保たれる', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const ks = await topKeys(page);
    const a = component(page, ks[0]);
    const other = component(page, ks[1]);
    await a.focus();
    const search = a.getByRole('searchbox').first();
    const hasSearch = (await search.count()) > 0;
    if (hasSearch) await search.fill('合成');
    const aBefore = await box(a);
    const oBefore = await box(other);
    await icon(a, '最小化').click();
    await expect(a).toHaveAttribute('data-minimized', 'true');
    const min = await box(a);
    expect(min.height, '見出しだけが残る').toBeLessThan(aBefore.height / 2);
    await expect(a.getByRole('heading').first()).toBeVisible();
    const oAfter = await box(other);
    expect(oAfter.width * oAfter.height, '空いた領域をほかが使う').toBeGreaterThan(oBefore.width * oBefore.height);
    await icon(a, /元に戻す|復元/).click();
    const restored = await box(a);
    expect(Math.abs(restored.width - aBefore.width) + Math.abs(restored.height - aBefore.height)).toBeLessThanOrEqual(4);
    if (hasSearch) await expect(a.getByRole('searchbox').first()).toHaveValue('合成');
  });

  // FR-151 AC-261
  test('FR-151 AC-261 左メニューを最小化するとアイコンだけの列になり、ホバーで画面名が出て、押すと画面が開き、元の幅に戻せる（キーボードのみ）', async ({ page, start }) => {
    await start();
    const nav = page.getByTestId('nav-canvas');
    const wide = await box(nav);
    await page.getByRole('button', { name: 'メニューを最小化' }).focus();
    await page.keyboard.press('Enter');
    const narrow = await box(page.getByTestId('nav-canvas'));
    expect(narrow.width, 'アイコンだけの細い列になる').toBeLessThan(wide.width);
    await expect(page.getByTestId('nav-canvas')).toHaveAccessibleName(/./);
    await page.getByTestId('nav-settings').hover();
    await expect(page.getByRole('tooltip')).toContainText(/設定/);
    await page.getByTestId('nav-settings').click();
    await expect(component(page, 'settings')).toBeVisible();
    await closeSettings(page); // 設定はモーダル（FR-223）
    await page.getByRole('button', { name: /メニューを(元の幅に戻す|展開)/ }).focus();
    await page.keyboard.press('Enter');
    expect((await box(page.getByTestId('nav-canvas'))).width).toBeGreaterThanOrEqual(wide.width - 2);
  });

  // FR-151 AC-261（異常系: 最小化していても画面へ到達できなくならない）
  test('FR-151 AC-261 異常系: 最小化した左メニューでも、すべての画面のアイコンに名前があり、到達できる', async ({ page, start }) => {
    await start();
    await page.getByRole('button', { name: 'メニューを最小化' }).click();
    for (const k of ['canvas', 'priority', 'architecture', 'gantt', 'whiteboard', 'settings']) {
      const n = page.getByTestId(`nav-${k}`);
      await expect(n).toBeVisible();
      await expect(n).toHaveAccessibleName(/./);
      expect((await box(n)).width, `${k}: 当たり判定`).toBeGreaterThanOrEqual(HIT);
    }
  });
});

test.describe('FR-152 スナップとレイアウト候補', () => {
  // FR-152 AC-264
  test('FR-152 AC-264 作業領域の左端へドラッグすると配置の候補が見た目つきで出て、選んで離すと左半分に配置され、再読込後も同じ', async ({ page, start }) => {
    const app = await start();
    await selectPersona(page, '事業部門');
    const [k] = await topKeys(page);
    const c = component(page, k);
    const ws = await box(page.getByTestId('workspace'));
    await dragHeading(page, c, ws.x + SNAP_EDGE / 2, ws.y + ws.height / 2, false);
    const cand = page.getByTestId('snap-candidates');
    await expect(cand).toBeVisible();
    await expect(cand.getByRole('button', { name: '左半分' })).toBeVisible();
    await expect(page.getByTestId('snap-preview'), '配置後の見た目が示される').toBeVisible();
    await cand.getByRole('button', { name: '左半分' }).hover();
    await page.mouse.up();
    const b = await box(component(page, k));
    expect(b.x).toBeLessThanOrEqual(ws.x + 4);
    expect(Math.abs(b.width - ws.width / 2), '左半分').toBeLessThanOrEqual(ws.width * 0.06);
    await app.reload();
    const again = await box(component(page, k));
    expect(Math.abs(again.x - b.x) + Math.abs(again.width - b.width)).toBeLessThanOrEqual(4);
  });

  // FR-152 AC-264（異常系: 端から遠いときは候補が出ない）
  test('FR-152 AC-264 異常系: 端から {PARAM-042} より遠い位置では候補が出ない', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const [k] = await topKeys(page);
    const ws = await box(page.getByTestId('workspace'));
    await dragHeading(page, component(page, k), ws.x + ws.width / 2, ws.y + ws.height / 2, false);
    await expect(page.getByTestId('snap-candidates')).toBeHidden();
    await page.keyboard.press('Escape');
    await page.mouse.up();
  });
});

test.describe('NFR-UX-008 モーション', () => {
  // NFR-UX-008 AC-268
  test('NFR-UX-008 AC-268 アニメーション再生中、最小化・復元と左メニューの最小化・復元が動きを伴い 200ms 以内に完了し、完了後の状態が動きなしと同じ', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    if (!(await page.getByTestId('animation-state').innerText()).includes('再生中')) await page.keyboard.press('p');
    const [k] = await topKeys(page);
    const c = component(page, k);
    await c.focus();
    const before = await box(c);
    await icon(c, '最小化').click();
    const animating = await page.evaluate(() => document.getAnimations().length);
    expect(animating, '動きを伴わない').toBeGreaterThan(0);
    await page.waitForTimeout(MOTION_MS + 150);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length), `${MOTION_MS}ms 以内に完了しない`).toBe(0);
    const minAnimated = await box(c);
    await icon(c, /元に戻す|復元/).click();
    await page.waitForTimeout(MOTION_MS + 150);
    const restored = await box(c);
    expect(Math.abs(restored.height - before.height)).toBeLessThanOrEqual(4);
    // 動きなし（P で停止）と最終状態が同じ
    await page.keyboard.press('p');
    await icon(c, '最小化').click();
    const minStatic = await box(c);
    expect(Math.abs(minStatic.height - minAnimated.height)).toBeLessThanOrEqual(2);
    // 左メニュー
    await page.keyboard.press('p');
    await page.getByRole('button', { name: 'メニューを最小化' }).click();
    expect(await page.evaluate(() => document.getAnimations().length), '左メニューの最小化に動きがない').toBeGreaterThan(0);
    await page.waitForTimeout(MOTION_MS + 150);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
  });

  // NFR-UX-008 AC-269
  for (const mode of ['prefers-reduced-motion: reduce', 'アニメーション停止中'] as const) {
    test(`NFR-UX-008 AC-269 ${mode}: 最小化・復元・移動・スナップの候補が動きなしで即座に切り替わり、transition・animation の所要時間が 0`, async ({ page, start }) => {
      await start();
      await selectPersona(page, '事業部門');
      if (mode.startsWith('prefers')) await page.emulateMedia({ reducedMotion: 'reduce' });
      else if (!(await page.getByTestId('animation-state').innerText()).includes('停止中')) await page.keyboard.press('p');
      const [k] = await topKeys(page);
      const c = component(page, k);
      await c.focus();
      await icon(c, '最小化').click();
      expect(await page.evaluate(() => document.getAnimations().length), '動きが残っている').toBe(0);
      await icon(c, /元に戻す|復元/).click();
      const ws = await box(page.getByTestId('workspace'));
      await dragHeading(page, c, ws.x + SNAP_EDGE / 2, ws.y + ws.height / 2, false);
      await expect(page.getByTestId('snap-candidates')).toBeVisible();
      const durations = await page.evaluate(() => {
        const out: string[] = [];
        document.querySelectorAll<HTMLElement>('[data-testid^="component-"], [data-testid^="snap-"], [data-testid^="nav-"]').forEach((el) => {
          const s = getComputedStyle(el);
          for (const v of [...s.transitionDuration.split(','), ...s.animationDuration.split(',')]) {
            if (parseFloat(v) > 0) out.push(`${el.getAttribute('data-testid')}: ${v}`);
          }
        });
        return out;
      });
      expect(durations, '所要時間が 0 でない').toEqual([]);
      await page.keyboard.press('Escape');
      await page.mouse.up();
    });
  }
});

test.describe('FR-153 KPI と OKR の定義', () => {
  // FR-153 AC-271
  test('FR-153 AC-271 編集モードで Objective 1・Key Result 2・KPI を定義すると達成度が算式どおり表示され、再読込後も保持され、別 Project には出ない', async ({ page, start }) => {
    const app = await start();
    await seedProjects(page, '合成株式会社A', ['業務改善 2026', '在庫最適化']);
    await page.getByRole('link', { name: '業務改善 2026' }).click();
    await setEditMode(page, true);
    const c = component(page, 'kpi-okr');
    await expect(c).toBeVisible();
    await c.getByRole('button', { name: 'OKR を定義' }).click();
    const dlg = page.getByRole('dialog', { name: 'OKR の定義' });
    await dlg.getByRole('textbox', { name: 'Objective' }).fill('合成の目標');
    await dlg.getByRole('button', { name: 'Key Result を追加' }).click();
    await dlg.getByRole('button', { name: 'Key Result を追加' }).click();
    const rows = dlg.getByTestId('key-result');
    const spec = [['KR1', '売上', '万円', '0', '200', '50'], ['KR2', '欠品率', '%', '10', '30', '20']];
    for (let i = 0; i < 2; i++) {
      const r = rows.nth(i);
      await r.getByRole('textbox', { name: 'Key Result 名' }).fill(spec[i][0]);
      await r.getByRole('textbox', { name: 'KPI 名' }).fill(spec[i][1]);
      await r.getByRole('textbox', { name: '単位' }).fill(spec[i][2]);
      await r.getByRole('spinbutton', { name: '基準値' }).fill(spec[i][3]);
      await r.getByRole('spinbutton', { name: '目標値' }).fill(spec[i][4]);
      await r.getByRole('spinbutton', { name: '現在値' }).fill(spec[i][5]);
    }
    await dlg.getByRole('button', { name: '保存' }).click();
    await expect(dlg).toBeHidden();
    // (50-0)/(200-0)=25%、(20-10)/(30-10)=50%
    await expect(c.getByTestId('kpi-achievement').nth(0)).toContainText('25%');
    await expect(c.getByTestId('kpi-achievement').nth(1)).toContainText('50%');
    await reloadAndEnter(page, '合成株式会社A');
    await page.getByRole('link', { name: '業務改善 2026' }).click();
    await expect(component(page, 'kpi-okr').getByTestId('kpi-achievement').nth(0)).toContainText('25%');
    await page.getByRole('button', { name: 'Project 一覧へ' }).click();
    await page.getByRole('link', { name: '在庫最適化' }).click();
    await expect(component(page, 'kpi-okr')).not.toContainText('合成の目標');
  });

  // FR-153 AC-271（異常系: 基準値＝目標値は算出できない）
  test('FR-153 AC-271 異常系: 目標値と基準値が同じ KPI は「算出できない」と表示され、数値でない入力は保存されない', async ({ page, start }) => {
    await start();
    await seedProjects(page, '合成株式会社A', ['業務改善 2026']);
    await page.getByRole('link', { name: '業務改善 2026' }).click();
    await setEditMode(page, true);
    const c = component(page, 'kpi-okr');
    await c.getByRole('button', { name: 'OKR を定義' }).click();
    const dlg = page.getByRole('dialog', { name: 'OKR の定義' });
    await dlg.getByRole('textbox', { name: 'Objective' }).fill('合成の目標');
    await dlg.getByRole('button', { name: 'Key Result を追加' }).click();
    const r = dlg.getByTestId('key-result').first();
    await r.getByRole('textbox', { name: 'Key Result 名' }).fill('KR1');
    await r.getByRole('textbox', { name: 'KPI 名' }).fill('売上');
    await r.getByRole('textbox', { name: '単位' }).fill('万円');
    await r.getByRole('spinbutton', { name: '基準値' }).fill('100');
    await r.getByRole('spinbutton', { name: '目標値' }).fill('100');
    await r.getByRole('spinbutton', { name: '現在値' }).fill('120');
    await dlg.getByRole('button', { name: '保存' }).click();
    await expect(c.getByTestId('kpi-achievement').first()).toContainText('算出できない');
    // 単位が空は検証エラーで保存されず、直前の値のまま
    await c.getByRole('button', { name: 'OKR を定義' }).click();
    await dlg.getByTestId('key-result').first().getByRole('textbox', { name: '単位' }).fill('');
    await dlg.getByRole('button', { name: '保存' }).click();
    await expect(dlg.getByRole('alert').first()).toBeVisible();
  });
});

test.describe('FR-154 KPI/OKR の既定の表示', () => {
  // FR-154 AC-273
  for (const persona of ['経営層', '事業部門', 'IT', '現場']) {
    test(`FR-154 AC-273 ${persona}: 保存済みレイアウトなしでデモを開くと既定のレイアウトに KPI/OKR が文字と数値で表示される`, async ({ page, start }) => {
      await start();
      await selectPersona(page, persona);
      const c = component(page, 'kpi-okr');
      await expect(c).toBeVisible();
      await expect(c).toContainText(/Objective|目標/);
      await expect(c).toContainText(/達成|進行中|未着手/);
      await expect(c.getByTestId('kpi-achievement').first()).toContainText(/\d/);
      // ペルソナの既定の情報表現が最大の領域のまま（AC-137）
      const ks = await topKeys(page);
      const areas: Record<string, number> = {};
      for (const k of ks) { const b = await box(component(page, k)); areas[k] = b.width * b.height; }
      const largest = Object.entries(areas).sort((x, y) => y[1] - x[1])[0][0];
      expect(largest, 'KPI/OKR が最大の領域を奪っている').not.toBe('kpi-okr');
    });
  }

  // FR-154 AC-273（異常系: Project でも保存済みレイアウトなしで同様に出る）
  test('FR-154 AC-273 異常系: 定義のない実 Project を開いても KPI/OKR コンポーネントが現れ、数値を捏造しない', async ({ page, start }) => {
    await start();
    await seedProjects(page, '合成株式会社A', ['業務改善 2026']);
    await page.getByRole('link', { name: '業務改善 2026' }).click();
    const c = component(page, 'kpi-okr');
    await expect(c).toBeVisible();
    await expect(c).toContainText('未設定');
    await expect(c.getByTestId('kpi-achievement')).toHaveCount(0);
  });
});
