// System Test: キャンバス・コンポーネントのレイアウト・ペルソナ別ビュー・コマンドパレット・縮退
// 期待値は要求定義書の受入基準（app-core.md・app-experience.md・quality.md）と §7 の表から決める。
import type { Page, Locator } from '@playwright/test';
import { test, expect, openScreen, component, entity, hook, selectPersona, runCommand, PERSONAS, MAIN_SCREENS, screenEntry } from '../support/fixtures';
import { examplePack } from '../support/packs';

const mono = examplePack('mono');

/** §7 の表の既定の情報表現（ペルソナ → 最も大きく前面に置くコンポーネント。標準の検証条件はモノ） */
const DEFAULT_PRIMARY: Record<string, string> = {
  経営層: 'matrix',
  事業部門: 'issue-solution',
  IT: 'architecture',
  現場: 'twin-view', // 中核オブジェクトの 3D デジタルツイン（画面 view3d は 2026-10-22 に廃止。Twin ビューが担う。Q-062 A）
};

async function box(loc: Locator) {
  const b = await loc.boundingBox();
  expect(b, '要素が表示されていない').not.toBeNull();
  return b!;
}

function area(b: { width: number; height: number }) {
  return b.width * b.height;
}

/** 表示中のコンポーネント（component-*）のうち、面積が最大のもののキー */
async function largestComponent(page: Page): Promise<string> {
  const all = page.locator('[data-testid^="component-"]');
  let best = '';
  let max = 0;
  for (let i = 0; i < (await all.count()); i++) {
    const c = all.nth(i);
    if (!(await c.isVisible())) continue;
    const b = await c.boundingBox();
    if (b && area(b) > max) {
      max = area(b);
      best = ((await c.getAttribute('data-testid')) ?? '').replace('component-', '');
    }
  }
  return best;
}

async function layoutSnapshot(page: Page): Promise<Record<string, { x: number; y: number; w: number; h: number } | null>> {
  const all = page.locator('[data-testid^="component-"]');
  const out: Record<string, { x: number; y: number; w: number; h: number } | null> = {};
  for (let i = 0; i < (await all.count()); i++) {
    const c = all.nth(i);
    const key = (await c.getAttribute('data-testid'))!;
    const b = (await c.isVisible()) ? await c.boundingBox() : null;
    out[key] = b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
  }
  return out;
}

function expectSameLayout(a: Awaited<ReturnType<typeof layoutSnapshot>>, b: Awaited<ReturnType<typeof layoutSnapshot>>) {
  expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
  for (const k of Object.keys(a)) {
    if (a[k] === null || b[k] === null) {
      expect(b[k], `${k} の表示/非表示が変わった`).toEqual(a[k]);
      continue;
    }
    for (const p of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(a[k]![p] - b[k]![p]), `${k}.${p}`).toBeLessThanOrEqual(2);
  }
}

async function componentMenu(c: Locator, item: string): Promise<void> {
  await c.getByTestId('component-menu').click();
  await c.page().getByRole('menuitem', { name: item }).click();
}

// FR-012 AC-015 は 2026-10-22 の依頼で廃止予定（画面「キャンバス」の廃止）。ケース E2E-114 は台帳で blocked。テストは削除した。
// 作業領域のパン/ズーム（canvas-surface）と論点の移動は FR-016 AC-192・FR-086・FR-173 などのケースが、作業領域（data-testid="workspace"）に対して確かめる。
test.describe('FR-013 最大化・通常・非表示', () => {
  // FR-013 AC-016
  test('FR-013 AC-016 Shift+F で最大化、Esc で通常、H で非表示、見出しのダブルクリックは FR-174 の拡大（最大化にならない）', async ({ page, start }) => {
    await start();
    const c = await openScreen(page, 'gantt');
    const ws = await box(page.getByTestId('workspace'));
    const normal = await box(c);
    expect(area(normal)).toBeLessThan(area(ws) * 0.9);
    await c.focus();
    await page.keyboard.press('Shift+F');
    await expect.poll(async () => area(await box(c))).toBeGreaterThan(area(ws) * 0.9);
    await page.keyboard.press('Escape');
    await expect.poll(async () => Math.round(area(await box(c)))).toBeLessThan(area(ws) * 0.9);
    // 見出しのダブルクリックは最大化ではなく FR-174 の拡大（data-expanded）。Q-023 2026-10-15 改訂
    await c.getByRole('heading').first().dblclick();
    await expect(c).toHaveAttribute('data-expanded', 'true');
    expect(await c.getAttribute('data-maximized'), 'ダブルクリックで最大化になっている').not.toBe('true');
    await expect.poll(async () => area(await box(c))).toBeLessThan(area(ws) * 0.9);
    await c.getByRole('heading').first().dblclick();
    await expect(c).not.toHaveAttribute('data-expanded', 'true');
    // 最大化は Shift+F（別手段）で行い、Esc で戻る
    await c.focus();
    await page.keyboard.press('Shift+F');
    await expect(c).toHaveAttribute('data-maximized', 'true');
    await expect.poll(async () => area(await box(c))).toBeGreaterThan(area(ws) * 0.9);
    await page.keyboard.press('Escape');
    await expect(c).not.toHaveAttribute('data-maximized', 'true');
    await c.focus();
    await page.keyboard.press('h');
    await expect(c).toBeHidden();
  });

  // FR-013 AC-016（異常系: 入力欄では H が文字入力になる）
  test('FR-013 AC-016 異常系: 入力欄にフォーカスがあるとき H を押しても非表示にならない', async ({ page, start }) => {
    await start();
    const search = page.getByRole('searchbox', { name: /検索/ });
    const c = await openScreen(page, 'gantt');
    await search.focus();
    await page.keyboard.press('h');
    await expect(search).toHaveValue('h');
    await expect(c).toBeVisible();
  });
});

test.describe('FR-014 レイアウトの保存と復元', () => {
  // FR-014 AC-017
  test('FR-014 AC-017 非表示にしたレイアウトが同じペルソナで復元され、ドックから再表示でき、別ペルソナは別のレイアウト', async ({ page, start }) => {
    const app = await start();
    await selectPersona(page, '経営層');
    const target = component(page, 'ranking');
    await expect(target).toBeVisible();
    await target.focus();
    await page.keyboard.press('h');
    await expect(target).toBeHidden();
    const changed = await layoutSnapshot(page);
    await app.reload();
    await expect(component(page, 'ranking')).toBeHidden();
    expectSameLayout(changed, await layoutSnapshot(page));
    // 別のペルソナでは、そのペルソナのレイアウト
    await selectPersona(page, '事業部門');
    await expect(component(page, DEFAULT_PRIMARY['事業部門'])).toBeVisible();
    expect(await largestComponent(page)).toBe(DEFAULT_PRIMARY['事業部門']);
    await selectPersona(page, '経営層');
    await expect(component(page, 'ranking')).toBeHidden();
    // ドックから再表示
    await page.getByTestId('dock').getByRole('button', { name: /ランキング/ }).click();
    await expect(component(page, 'ranking')).toBeVisible();
  });
});

test.describe('FR-015 ペルソナ別ビュー', () => {
  // FR-015 AC-018
  test('FR-015 AC-018 4 つのペルソナを順に選ぶと既定の情報表現が前面に表示され、選択中の対象が保たれる', async ({ page, start }) => {
    await start();
    const issue = mono.issues()[0];
    const view = await openScreen(page, 'issue-solution');
    await entity(view, issue.id).first().click();
    await expect(page.getByTestId('selection-indicator')).toContainText(issue.title);
    for (const p of PERSONAS) {
      // キーボードでも操作できる: メニューを Enter で開き、矢印キーと Enter で選ぶ
      const menuButton = page.getByRole('button', { name: /ペルソナ/ });
      await menuButton.focus();
      await page.keyboard.press('Enter');
      const item = page.getByRole('menuitemradio', { name: p });
      await expect(item).toBeVisible();
      await item.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: /ペルソナ/ })).toContainText(p);
      await expect(component(page, DEFAULT_PRIMARY[p])).toBeVisible();
      await expect(page.getByTestId('selection-indicator')).toContainText(issue.title);
    }
  });
});

test.describe('FR-109 移動・タブ化・大きさの変更', () => {
  // FR-109 AC-134
  test('FR-109 AC-134 移動・タブ化・大きさの変更をした後に再読込すると同じレイアウトで表示される', async ({ page, start }) => {
    const app = await start();
    await selectPersona(page, '事業部門');
    const gantt = component(page, 'gantt');
    const tree = component(page, 'discussion-tree');
    await expect(gantt).toBeVisible();
    await expect(tree).toBeVisible();
    const before = await box(gantt);
    await componentMenu(gantt, '上へ移動');
    await expect.poll(async () => Math.round((await box(gantt)).y)).not.toBe(Math.round(before.y));
    // 2 つをタブにまとめる
    await componentMenu(tree, 'タブにまとめる');
    await page.getByRole('menuitem', { name: /ガント/ }).click();
    const tablist = page.getByRole('tablist').filter({ has: page.getByRole('tab', { name: /ガント/ }) });
    await expect(tablist.getByRole('tab', { name: /議論ツリー/ })).toBeVisible();
    // 境界をドラッグして大きさを変える
    const sep = page.getByRole('separator').first();
    const sb = await box(sep);
    const s0 = await layoutSnapshot(page);
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb.x + sb.width / 2 + 80, sb.y + sb.height / 2 + 80, { steps: 6 });
    await page.mouse.up();
    const changed = await layoutSnapshot(page);
    expect(JSON.stringify(changed)).not.toBe(JSON.stringify(s0));
    await app.reload();
    expectSameLayout(changed, await layoutSnapshot(page));
    await expect(page.getByRole('tablist').filter({ has: page.getByRole('tab', { name: /ガント/ }) }).getByRole('tab', { name: /議論ツリー/ })).toBeVisible();
  });
});

test.describe('FR-110 既定のレイアウトへの復元', () => {
  // FR-110 AC-135
  test('FR-110 AC-135 「既定のレイアウトに戻す」で既定のレイアウトに戻り、選択と絞り込みは変わらない', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const defaults = await layoutSnapshot(page);
    const issue = mono.issues()[0];
    const view = component(page, 'issue-solution');
    await entity(view, issue.id).first().click();
    const table = await openScreen(page, 'table');
    await table.getByRole('textbox', { name: /絞り込み/ }).fill(issue.title.slice(0, 2));
    await component(page, 'gantt').focus();
    await page.keyboard.press('h');
    await expect(component(page, 'gantt')).toBeHidden();
    await page.getByRole('button', { name: '既定のレイアウトに戻す' }).click();
    await expect(component(page, 'gantt')).toBeVisible();
    // 復元直後は寸法の遷移中のことがあるため、収束を待って判定する（期待値は変えない）
    await expect.poll(() => largestComponent(page), { timeout: 5000 }).toBe(DEFAULT_PRIMARY['事業部門']);
    const restored = await layoutSnapshot(page);
    for (const k of Object.keys(defaults)) expect(restored[k] === null, k).toBe(defaults[k] === null);
    await expect(page.getByTestId('selection-indicator')).toContainText(issue.title);
    await expect(component(page, 'table').getByRole('textbox', { name: /絞り込み/ })).toHaveValue(issue.title.slice(0, 2));
  });
});

test.describe('FR-111 コマンドパレット', () => {
  // FR-111 AC-136
  test('FR-111 AC-136 Ctrl+K で開き「既定」で「既定のレイアウトに戻す」を Enter で実行でき、ショートカットが表示される', async ({ page, start }) => {
    await start();
    await component(page, 'ranking').focus();
    await page.keyboard.press('h');
    await expect(component(page, 'ranking')).toBeHidden();
    await runCommand(page, '既定', '既定のレイアウトに戻す');
    await expect(component(page, 'ranking')).toBeVisible();
    // ショートカットの表示
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'コマンドパレット' });
    await dialog.getByRole('combobox').fill('エクスポート');
    await expect(dialog.getByRole('option', { name: /エクスポート/ }).first()).toContainText(/Ctrl\+Shift\+E|Ctrl\+S/);
    await dialog.getByRole('combobox').fill('ミュート');
    await expect(dialog.getByRole('option', { name: /ミュート/ }).first()).toContainText(/\bM\b/);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  // FR-111 AC-136（異常系: 一致しない語）
  test('FR-111 AC-136 異常系: 一致する操作がない語では何も実行されない', async ({ page, start }) => {
    await start();
    const before = await layoutSnapshot(page);
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'コマンドパレット' });
    await dialog.getByRole('combobox').fill('ｚｚ存在しない操作');
    await expect(dialog.getByRole('option')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    expectSameLayout(before, await layoutSnapshot(page));
  });
});

test.describe('FR-112 ペルソナ別の既定の情報表現', () => {
  // FR-112 AC-137
  test('FR-112 AC-137 保存済みのレイアウトがない状態で各ペルソナを選ぶと §7 の既定の情報表現が最大の領域に表示される', async ({ page, start }) => {
    await start();
    for (const p of PERSONAS) {
      await selectPersona(page, p);
      await expect(component(page, DEFAULT_PRIMARY[p])).toBeVisible();
      expect(await largestComponent(page), `${p} の最大の領域`).toBe(DEFAULT_PRIMARY[p]);
    }
  });

  // FR-112 AC-138
  test('FR-112 AC-138 どのペルソナを選んでも検索で見つかる項目の件数が同じ', async ({ page, start }) => {
    await start();
    const counts: number[] = [];
    const term = mono.issues()[0].title.slice(0, 1);
    for (const p of PERSONAS) {
      await selectPersona(page, p);
      await page.getByRole('searchbox', { name: /検索/ }).fill(term);
      const results = page.getByTestId('search-results');
      await expect(results).toBeVisible();
      counts.push(await results.getByRole('option').count());
      await page.getByRole('searchbox', { name: /検索/ }).fill('');
    }
    expect(counts[0]).toBeGreaterThan(0);
    expect(new Set(counts).size, `件数: ${counts.join(',')}`).toBe(1);
  });
});

test.describe('NFR-UX-002 狭い画面での縮退', () => {
  // NFR-UX-002 AC-186
  test('NFR-UX-002 AC-186 表示幅 320px でタブか縦積みになり、横スクロールがなく、すべてのコンポーネントに到達できる', async ({ page, start }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await start();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'ページ全体に横スクロールが発生').toBeLessThanOrEqual(0);
    for (const [key, name] of MAIN_SCREENS) {
      // 設定は上部のボタン「設定」から開く（FR-223 AC-774）。ほかは左メニュー
      const nav = screenEntry(page, key);
      if (!(await nav.isVisible())) await page.getByRole('button', { name: 'メニュー' }).click();
      await nav.click();
      const c = component(page, key);
      await expect(c, `${name} に到達できない`).toBeVisible();
      const b = await box(c);
      expect(b.x).toBeGreaterThanOrEqual(-1);
      expect(b.x + b.width, `${name} が画面幅をはみ出す`).toBeLessThanOrEqual(321);
    }
    const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow2).toBeLessThanOrEqual(0);
  });
});

test.describe('NFR-UX-001 切替で状態を失わない', () => {
  // NFR-UX-001 AC-185
  test('NFR-UX-001 AC-185 最大化・移動・ペルソナ・2D/3D の切替で、選択・絞り込み・時刻・入力中の内容が変わらない', async ({ page, start }) => {
    await start();
    const issue = mono.issues()[0];
    const view = await openScreen(page, 'issue-solution');
    await entity(view, issue.id).first().click();
    const table = await openScreen(page, 'table');
    const filter = table.getByRole('textbox', { name: /絞り込み/ });
    await filter.fill(issue.title.slice(0, 2));
    const slider = page.getByRole('slider', { name: '時間軸' }).first();
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const time = await slider.getAttribute('aria-valuenow');
    const detail = component(page, 'detail');
    const memo = detail.getByRole('textbox').first();
    await page.getByRole('switch', { name: '編集モード' }).click();
    await memo.fill('未保存の入力 ST-185');

    const check = async (step: string) => {
      await expect(page.getByTestId('selection-indicator'), step).toContainText(issue.title);
      await expect(component(page, 'table').getByRole('textbox', { name: /絞り込み/ }), step).toHaveValue(issue.title.slice(0, 2));
      await expect(page.getByRole('slider', { name: '時間軸' }).first(), step).toHaveAttribute('aria-valuenow', time!);
      await expect(component(page, 'detail').getByRole('textbox').first(), step).toHaveValue('未保存の入力 ST-185');
    };
    // 最大化
    await component(page, 'table').focus();
    await page.keyboard.press('Shift+F');
    await page.keyboard.press('Escape');
    await check('最大化の後');
    // 移動
    await componentMenu(component(page, 'table'), '下へ移動');
    await check('移動の後');
    // ペルソナの切替
    await selectPersona(page, 'IT');
    await selectPersona(page, '経営層');
    await check('ペルソナの切替の後');
    // 2D/3D の切替（ガント）
    const gantt = await openScreen(page, 'gantt');
    await gantt.getByRole('radio', { name: '2.5D' }).check();
    await gantt.getByRole('radio', { name: '2D' }).check();
    await check('2D/3D の切替の後');
  });
});
