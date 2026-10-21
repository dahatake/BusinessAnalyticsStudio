// System Test: Graph 描画面の操作（FR-245 パン・拡大縮小／FR-246 全画面／FR-247 詳細カード／FR-248 表の行から図へ）
// 期待値は docs/requirements/graph-twin.md の受入基準（AC-593〜601）と PARAM-057（1.25）・PARAM-087（0.25〜4）・PARAM-088（40px）・PARAM-089（2 秒）だけから決める。
// 実装のコードは読んでいない。まだ実装がない間は失敗するのが正常（not_run → 実装後に pass）。
// 代表の画面は KPI/OKR（key `kpi-okr`。Graph の表現を持つ）。AC-595 は Graph の描画面を使う五つの画面（ビジネス関係グラフを除く）を走査する。
// 画面・部品の探し方は CONTRACT.md の「Graph の操作（FR-245〜248）」節（§25）。
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Locator } from '@playwright/test';
import { test, expect, selectPersona, openScreen } from '../support/fixtures';
import { TMP_DIR } from '../support/paths';
import { openViewMenu, viewButton } from '../support/screens';

const STEP = 1.25; // PARAM-057
const MIN_SCALE = 0.25; // PARAM-087
const MAX_SCALE = 4;
const PAN_STEP = 40; // PARAM-088（CSS px）
const HIGHLIGHT_MS = 2000; // PARAM-089
const REP = 'kpi-okr';

/** 表示形式を Graph にして、図の面（data-zoom-surface="graph"）を返す */
async function openGraph(page: Page, key: string, root?: Locator): Promise<{ c: Locator; surface: Locator }> {
  const c = root ?? (await openScreen(page, key));
  const surface = c.locator('[data-zoom-surface="graph"]').first();
  if (!(await surface.isVisible())) {
    const menu = await openViewMenu(page, c);
    await menu.getByRole('menuitemradio', { name: 'Graph', exact: true }).click();
    await expect(viewButton(c)).toContainText('Graph');
  }
  await expect(surface, `${key}: Graph の面が出ない`).toBeVisible();
  return { c, surface };
}

/** 図の位置と倍率（data-pan-x・data-pan-y は CSS px、data-scale は全体表示を 1 とする倍率） */
async function view(surface: Locator): Promise<{ x: number; y: number; s: number }> {
  const num = async (n: string) => Number(await surface.getAttribute(n));
  const v = { x: await num('data-pan-x'), y: await num('data-pan-y'), s: await num('data-scale') };
  expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.s), '面に data-pan-x・data-pan-y・data-scale がない').toBe(true);
  return v;
}

const nodes = (c: Locator) => c.locator('[data-testid="graph-node"][data-entity-id]');
const card = (c: Locator) => c.page().getByTestId('detail-card');

/** 全体に戻してから要素の階層まで拡大し、ノードが見える状態にする（FR-237。拡大した分の倍率はテスト側で扱う） */
async function toElementLevel(c: Locator): Promise<void> {
  await c.getByRole('button', { name: '全体表示に戻す' }).click();
  for (let i = 0; i < 6 && (await c.getAttribute('data-zoom-level')) !== 'element'; i++) {
    await c.getByRole('button', { name: '拡大' }).click();
  }
  await expect(c).toHaveAttribute('data-zoom-level', 'element');
  await expect(nodes(c).first()).toBeVisible();
}

async function inside(inner: Locator, outer: Locator): Promise<boolean> {
  const a = await inner.boundingBox();
  const b = await outer.boundingBox();
  if (!a || !b) return false;
  return a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.width <= b.x + b.width + 1 && a.y + a.height <= b.y + b.height + 1;
}

/** 枠線・線種の指標（色だけでない強調の判定用） */
async function outline(el: Locator): Promise<string> {
  return el.evaluate((e) => {
    const t = (e.querySelector('[stroke], rect, circle, path, ellipse') as Element | null) ?? e;
    const a = getComputedStyle(e as Element);
    const b = getComputedStyle(t);
    return [a.outlineStyle, a.outlineWidth, a.borderTopStyle, a.borderTopWidth, b.strokeWidth, b.strokeDasharray].join('|');
  });
}

test.describe('FR-245 図のパンと拡大縮小', () => {
  // FR-245 AC-593
  test('FR-245 AC-593 空白のドラッグ・Shift＋矢印キー・移動ボタンで図が動き、キー 1 操作は 40px、矢印キー単独は隣接ノードへの移動で図は動かない', async ({ page, start }) => {
    test.setTimeout(120_000);
    await start();
    await selectPersona(page, '事業部門');
    const { c, surface } = await openGraph(page, REP);
    await c.getByRole('button', { name: '全体表示に戻す' }).click();
    // ボタン（ドラッグ以外の同じ操作。WCAG 2.5.7）
    let v0 = await view(surface);
    await c.getByRole('button', { name: '図を右へ移動' }).click();
    let v1 = await view(surface);
    expect(v1.x, '右へ移動のボタンで図が右へ動かない').toBeGreaterThan(v0.x);
    await c.getByRole('button', { name: '図を下へ移動' }).click();
    expect((await view(surface)).y, '下へ移動のボタンで図が下へ動かない').toBeGreaterThan(v1.y);
    // Shift＋矢印キー 1 操作 = 40px（PARAM-088）
    await c.getByRole('button', { name: '全体表示に戻す' }).click();
    await surface.focus();
    v0 = await view(surface);
    await page.keyboard.press('Shift+ArrowLeft');
    v1 = await view(surface);
    expect(Math.abs(v1.x - v0.x), 'Shift＋←の 1 操作の移動量が 40px でない').toBeCloseTo(PAN_STEP, 0);
    expect(v1.y).toBeCloseTo(v0.y, 0);
    await page.keyboard.press('Shift+ArrowDown');
    const v2 = await view(surface);
    expect(Math.abs(v2.y - v1.y), 'Shift＋↓の 1 操作の移動量が 40px でない').toBeCloseTo(PAN_STEP, 0);
    // 空白部分のドラッグ
    const box = (await surface.boundingBox())!;
    const sx = box.x + 6;
    const sy = box.y + 6; // 面の角（空白）
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 60, sy + 30, { steps: 6 });
    await page.mouse.up();
    const v3 = await view(surface);
    expect(v3.x - v2.x, 'ドラッグで図が右へ動かない').toBeGreaterThan(20);
    expect(v3.y - v2.y, 'ドラッグで図が下へ動かない').toBeGreaterThan(10);
    // 異常系: 矢印キー単独は隣接ノードへ移動し、図は動かない
    await toElementLevel(c);
    const first = nodes(c).first();
    await first.focus();
    const before = await view(surface);
    const idBefore = await page.evaluate(() => document.activeElement?.getAttribute('data-entity-id') ?? '');
    await page.keyboard.press('ArrowRight');
    const after = await view(surface);
    expect(after.x, '矢印キー単独で図が動いた').toBe(before.x);
    expect(after.y, '矢印キー単独で図が動いた').toBe(before.y);
    const idAfter = await page.evaluate(() => document.activeElement?.getAttribute('data-entity-id') ?? '');
    expect(idAfter, '矢印キー単独で隣接ノードへ移動しない').not.toBe('');
    expect(idAfter).not.toBe(idBefore);
  });

  // FR-245 AC-594
  test('FR-245 AC-594 ホイール・ピンチ・ボタン・キーで拡大縮小でき、1 操作 1.25 倍、倍率は 0.25〜4 に丸められ、全体に戻すと全ノードが収まり、選択は変わらない', async ({ page, start }) => {
    test.setTimeout(180_000);
    await start();
    await selectPersona(page, '事業部門');
    const { c, surface } = await openGraph(page, REP);
    await toElementLevel(c);
    await c.getByRole('button', { name: '全体表示に戻す' }).click();
    const s0 = (await view(surface)).s;
    // ボタン: 1.25 倍・縮小は逆数
    await c.getByRole('button', { name: '拡大' }).click();
    const s1 = (await view(surface)).s;
    expect(s1 / s0, '拡大ボタン 1 操作が 1.25 倍でない').toBeCloseTo(STEP, 2);
    await c.getByRole('button', { name: '縮小' }).click();
    expect((await view(surface)).s / s1, '縮小ボタン 1 操作が 1/1.25 倍でない').toBeCloseTo(1 / STEP, 2);
    // キー
    await surface.focus();
    await page.keyboard.press('+');
    const sk = (await view(surface)).s;
    expect(sk, '＋キーで拡大しない').toBeGreaterThan(s0);
    await page.keyboard.press('-');
    expect((await view(surface)).s, '－キーで縮小しない').toBeLessThan(sk);
    // ホイール・ピンチ（ピンチはトラックパッドの Ctrl＋ホイール）
    const box = (await surface.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const sw = (await view(surface)).s;
    await page.mouse.wheel(0, -200);
    await expect.poll(async () => (await view(surface)).s, 'ホイールで拡大しない').toBeGreaterThan(sw);
    const sp = (await view(surface)).s;
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 200);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await view(surface)).s, 'ピンチ（Ctrl＋ホイール）で縮小しない').toBeLessThan(sp);
    // 異常系: 上限・下限で丸められる
    for (let i = 0; i < 30; i++) await c.getByRole('button', { name: '拡大' }).click({ force: true });
    expect((await view(surface)).s, '上限 4 倍を超えた').toBeCloseTo(MAX_SCALE, 2);
    for (let i = 0; i < 60; i++) await c.getByRole('button', { name: '縮小' }).click({ force: true });
    expect((await view(surface)).s, '下限 0.25 倍を割った').toBeCloseTo(MIN_SCALE, 2);
    // 選択はパン・拡大縮小の前後で変わらない
    await c.getByRole('button', { name: '全体表示に戻す' }).click();
    await toElementLevel(c);
    const pick = nodes(c).first();
    const id = (await pick.getAttribute('data-entity-id'))!;
    await pick.click();
    await expect(pick).toHaveAttribute('data-highlight', /selected/);
    await c.getByRole('button', { name: '図を左へ移動' }).click();
    await c.getByRole('button', { name: '拡大' }).click();
    await expect(c.locator(`[data-entity-id="${id}"]`).first(), 'パン・拡大縮小で選択が変わった').toHaveAttribute('data-highlight', /selected/);
    // 全体に戻す: 全ノードが面に収まる
    await c.getByRole('button', { name: '全体表示に戻す' }).click();
    const v = await view(surface);
    expect(v.s).toBeGreaterThanOrEqual(MIN_SCALE);
    await expect(c).toHaveAttribute('data-zoom-level', 'overview');
    await expect(c.locator('[data-zoom-cluster]').first()).toBeVisible();
    for (const el of await c.locator('[data-zoom-cluster]').all()) expect(await inside(el, surface), '全体に戻しても塊が面に収まらない').toBe(true);
  });

  // FR-245 AC-595
  test('FR-245 AC-595 Graph の描画面を使う五つの画面（ビジネス関係グラフを除く）すべてでパン・拡大縮小ができ、ビジネス関係グラフには操作がない', async ({ page, start }) => {
    test.setTimeout(300_000);
    await start();
    await selectPersona(page, '事業部門');
    for (const key of ['twin-view', 'spatial-view', 'issue-solution', 'kpi-okr']) {
      const { c, surface } = await openGraph(page, key);
      await c.getByRole('button', { name: '全体表示に戻す' }).click();
      const v0 = await view(surface);
      await c.getByRole('button', { name: '図を右へ移動' }).click();
      expect((await view(surface)).x, `${key}: パンできない`).toBeGreaterThan(v0.x);
      await c.getByRole('button', { name: '拡大' }).click();
      expect((await view(surface)).s, `${key}: 拡大できない`).toBeGreaterThan(v0.s);
    }
    // データビュアー（data-catalog の中）
    const viewer = await prepareDataViewer(page);
    const { c: vc, surface: vs } = await openGraph(page, 'data-catalog', viewer);
    await vc.getByRole('button', { name: '全体表示に戻す' }).click();
    const d0 = await view(vs);
    await vc.getByRole('button', { name: '図を右へ移動' }).click();
    expect((await view(vs)).x, 'データビュアー: パンできない').toBeGreaterThan(d0.x);
    await vc.getByRole('button', { name: '拡大' }).click();
    expect((await view(vs)).s, 'データビュアー: 拡大できない').toBeGreaterThan(d0.s);
    // 異常系: ビジネス関係グラフには本要求の操作を追加しない
    const bg = await openScreen(page, 'business-graph');
    await expect(bg.locator('[data-zoom-surface="graph"]').first()).toBeVisible();
    await expect(bg.getByRole('button', { name: '図を右へ移動' })).toHaveCount(0);
    await expect(bg.getByRole('button', { name: '全画面' })).toHaveCount(0);
  });
});

test.describe('FR-246 図だけの全画面表示', () => {
  // FR-246 AC-596
  test('FR-246 AC-596 全画面で図だけが画面いっぱいに出て、Esc でも「全画面を終了」ボタンでも戻り、前後でパン・倍率・選択が変わらない', async ({ page, start }) => {
    test.setTimeout(120_000);
    await start();
    await selectPersona(page, '事業部門');
    const { c, surface } = await openGraph(page, REP);
    await toElementLevel(c);
    await c.getByRole('button', { name: '図を右へ移動' }).click();
    await c.getByRole('button', { name: '拡大' }).click();
    const pick = nodes(c).first();
    const id = (await pick.getAttribute('data-entity-id'))!;
    await pick.click();
    const before = await view(surface);
    for (const how of ['Esc', 'ボタン'] as const) {
      await c.getByRole('button', { name: '全画面', exact: true }).click();
      const exit = page.getByRole('button', { name: '全画面を終了' });
      await expect(exit, '全画面にならない（「全画面を終了」がない）').toBeVisible();
      const vp = page.viewportSize()!;
      const fb = (await surface.boundingBox())!;
      expect(fb.width, '図が画面いっぱいの幅でない').toBeGreaterThanOrEqual(vp.width - 2);
      expect(fb.height, '図が画面いっぱいの高さでない').toBeGreaterThanOrEqual(vp.height * 0.9);
      const mid = await view(surface);
      expect(mid.s, '全画面で倍率が変わった').toBeCloseTo(before.s, 2);
      if (how === 'Esc') await page.keyboard.press('Escape');
      else await exit.click();
      await expect(exit, `${how} で全画面が終わらない`).toBeHidden();
      const after = await view(surface);
      expect(after.x, `${how}: パンが変わった`).toBeCloseTo(before.x, 0);
      expect(after.y, `${how}: パンが変わった`).toBeCloseTo(before.y, 0);
      expect(after.s, `${how}: 倍率が変わった`).toBeCloseTo(before.s, 2);
      await expect(c.locator(`[data-entity-id="${id}"]`).first(), `${how}: 選択が変わった`).toHaveAttribute('data-highlight', /selected/);
    }
  });

  // FR-246 AC-597
  test('FR-246 AC-597 全画面中もパン・拡大縮小・矢印キーの移動・詳細カードが使え、全画面にする操作はキーボードだけでもでき、フォーカスが示される', async ({ page, start }) => {
    test.setTimeout(120_000);
    await start();
    await selectPersona(page, '事業部門');
    const { c, surface } = await openGraph(page, REP);
    await toElementLevel(c);
    // キーボードだけで全画面: 図にフォーカスして F キー、ボタンは Enter（FR-246）
    const exit = page.getByRole('button', { name: '全画面を終了' });
    await surface.focus();
    await page.keyboard.press('f');
    await expect(exit, 'F キーで全画面にできない').toBeVisible();
    await page.keyboard.press('Escape');
    await expect(exit).toBeHidden();
    const fsBtn = c.getByRole('button', { name: '全画面', exact: true });
    await fsBtn.focus();
    await page.keyboard.press('Enter');
    await expect(exit, 'ボタンをキーボードで押しても全画面にならない').toBeVisible();
    // 操作中の対象がフォーカスで示される（フォーカスが body に落ちない・枠が見える）
    const focusInfo = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || a === document.body) return null;
      const s = getComputedStyle(a);
      return { outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, shadow: s.boxShadow !== 'none' };
    });
    expect(focusInfo, '全画面にしたあと、フォーカスが失われている').not.toBeNull();
    expect(focusInfo!.outline || focusInfo!.shadow, 'フォーカスの枠が見えない').toBe(true);
    // 全画面中のパン・拡大縮小
    const v0 = await view(surface);
    await page.getByRole('button', { name: '図を右へ移動' }).click();
    expect((await view(surface)).x, '全画面中にパンできない').toBeGreaterThan(v0.x);
    await page.getByRole('button', { name: '拡大' }).click();
    expect((await view(surface)).s, '全画面中に拡大できない').toBeGreaterThan(v0.s);
    // 矢印キーで隣接ノードへ
    const n = nodes(page.locator('body')).first();
    await n.focus();
    const id0 = await page.evaluate(() => document.activeElement?.getAttribute('data-entity-id') ?? '');
    await page.keyboard.press('ArrowRight');
    const id1 = await page.evaluate(() => document.activeElement?.getAttribute('data-entity-id') ?? '');
    expect(id1, '全画面中に矢印キーで隣接ノードへ移動できない').not.toBe('');
    expect(id1).not.toBe(id0);
    // 詳細カード
    await nodes(page.locator('body')).first().click();
    await expect(card(c), '全画面中に詳細カードが出ない').toBeVisible();
    // Esc はカード優先: 1 回目はカードだけ閉じ全画面は続く、2 回目で全画面が終わる
    await page.keyboard.press('Escape');
    await expect(card(c), '1 回目の Esc でカードが閉じない').toBeHidden();
    await expect(exit, '1 回目の Esc で全画面まで終わった').toBeVisible();
    await page.keyboard.press('Escape');
    await expect(exit, '2 回目の Esc で全画面が終わらない').toBeHidden();
  });
});

test.describe('FR-247 ノード・エッジの詳細カード', () => {
  // FR-247 AC-598
  test('FR-247 AC-598 ノードのクリックで名称・種別・属性・主要な関係の詳細カード、再クリックで閉じ、別のノードで内容が替わる', async ({ page, start }) => {
    test.setTimeout(120_000);
    await start();
    await selectPersona(page, '事業部門');
    const { c } = await openGraph(page, REP);
    await toElementLevel(c);
    const list = nodes(c);
    expect(await list.count(), 'ノードが 2 つ以上ない').toBeGreaterThanOrEqual(2);
    const a = list.nth(0);
    const b = list.nth(1);
    const aId = (await a.getAttribute('data-entity-id'))!;
    const bId = (await b.getAttribute('data-entity-id'))!;
    const aName = ((await a.getAttribute('data-entity-name')) ?? '').trim();
    const bName = ((await b.getAttribute('data-entity-name')) ?? '').trim();
    expect(aName).not.toBe('');
    await a.click();
    const cd = card(c);
    await expect(cd, 'ノードのクリックで詳細カードが出ない').toBeVisible();
    await expect(cd).toHaveAttribute('data-entity-id', aId);
    await expect(cd).toContainText(aName);
    await expect(cd.getByRole('heading', { name: '種別' })).toBeVisible();
    await expect(cd.getByRole('heading', { name: '属性' })).toBeVisible();
    await expect(cd.getByRole('heading', { name: /関係/ })).toBeVisible();
    // カードは選択した項目に重ならない（FR-247）
    const cb = (await cd.boundingBox())!;
    const nb = (await a.boundingBox())!;
    const overlap = cb.x < nb.x + nb.width && nb.x < cb.x + cb.width && cb.y < nb.y + nb.height && nb.y < cb.y + cb.height;
    expect(overlap, 'カードが選択したノードに重なっている').toBe(false);
    // 別のノード: 内容が替わる
    await b.click();
    await expect(cd).toHaveAttribute('data-entity-id', bId);
    await expect(cd).toContainText(bName);
    // 異常系: 同じノードの再クリックで閉じる（開いたままにならない）
    await b.click();
    await expect(cd, '再クリックでカードが閉じない').toBeHidden();
  });

  // FR-247 AC-599
  test('FR-247 AC-599 エッジのクリックで「A から B へ 意味ラベル」・種別・属性のカード、再クリックか Esc で閉じ、ノード・エッジとも Enter で開く', async ({ page, start }) => {
    test.setTimeout(120_000);
    await start();
    await selectPersona(page, '事業部門');
    const { c } = await openGraph(page, REP);
    await toElementLevel(c);
    const edge = c.locator('[data-testid="graph-edge"]').filter({ hasText: /\S/ }).first();
    await expect(edge, '意味ラベルつきのエッジがない').toBeAttached();
    const from = (await edge.getAttribute('data-from'))!;
    const to = (await edge.getAttribute('data-to'))!;
    const fromName = ((await c.locator(`[data-testid="graph-node"][data-entity-id="${from}"]`).first().getAttribute('data-entity-name')) ?? '').trim();
    const toName = ((await c.locator(`[data-testid="graph-node"][data-entity-id="${to}"]`).first().getAttribute('data-entity-name')) ?? '').trim();
    const label = ((await edge.textContent()) ?? '').trim();
    await edge.click({ force: true });
    const cd = card(c);
    await expect(cd, 'エッジのクリックで詳細カードが出ない').toBeVisible();
    await expect(cd, '「A から B へ 意味ラベル」の文がない').toContainText(new RegExp(`${fromName}\\s*から\\s*${toName}\\s*へ\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    await expect(cd.getByRole('heading', { name: '種別' })).toBeVisible();
    await expect(cd.getByRole('heading', { name: '属性' })).toBeVisible();
    // 再クリックで閉じる
    await edge.click({ force: true });
    await expect(cd).toBeHidden();
    // Esc で閉じる
    await edge.click({ force: true });
    await expect(cd).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(cd, 'Esc でカードが閉じない').toBeHidden();
    // Enter で開閉（エッジ・ノード。マウスなし。Enter ではズームインしない）
    const level = await c.getAttribute('data-zoom-level');
    await edge.focus();
    await page.keyboard.press('Enter');
    await expect(cd, 'エッジを Enter で開けない').toBeVisible();
    await page.keyboard.press('Enter');
    await expect(cd, 'エッジを Enter で閉じられない').toBeHidden();
    const node = nodes(c).first();
    await node.focus();
    await page.keyboard.press('Enter');
    await expect(cd, 'ノードを Enter で開けない').toBeVisible();
    await expect(cd).toHaveAttribute('data-entity-id', (await node.getAttribute('data-entity-id'))!);
    await page.keyboard.press('Enter');
    await expect(cd, 'ノードを Enter で閉じられない').toBeHidden();
    expect(await c.getAttribute('data-zoom-level'), 'Enter でズームインした').toBe(level);
    // 異常系: ダブルクリックはカードを開閉せずズームインする（Enter・「+」と区別）
    await c.getByRole('button', { name: '全体表示に戻す' }).click();
    const cl = c.locator('[data-zoom-cluster]').first();
    await expect(cl).toBeVisible();
    await cl.dblclick();
    await expect(c, 'ダブルクリックでズームインしない').not.toHaveAttribute('data-zoom-level', 'overview');
    await expect(cd, 'ダブルクリックでカードが開いた').toBeHidden();
    // 主要な関係は PARAM-105（5 件）まで。超える分は「ほか N 件」。要素の階層でもカードに属性が出る
    await toElementLevel(c);
    const all = nodes(c);
    for (let i = 0; i < Math.min(await all.count(), 12); i++) {
      await all.nth(i).click();
      await expect(cd).toBeVisible();
      await expect(cd.getByRole('heading', { name: '属性' }), '要素の階層でカードに属性がない').toBeVisible();
      const items = cd.getByTestId('card-relation');
      const shown = await items.count();
      expect(shown, '主要な関係が 5 件を超えた').toBeLessThanOrEqual(5);
      const m = ((await cd.textContent()) ?? '').match(/ほか\s*(\d+)\s*件/);
      if (m) {
        expect(shown, '「ほか N 件」があるのに主要な関係が 5 件でない').toBe(5);
        expect(Number(m[1])).toBeGreaterThan(0);
      }
      await all.nth(i).click(); // 閉じる
      await expect(cd).toBeHidden();
    }
  });
});

test.describe('FR-248 表の行から図のノードへの移動とハイライト', () => {
  async function openTable(c: Locator): Promise<Locator> {
    await c.getByRole('button', { name: '表で見る' }).click();
    const t = c.getByRole('table').or(c.getByRole('grid')).first();
    await expect(t).toBeVisible();
    return t.locator('[role="row"][data-entity-id], tr[data-entity-id]');
  }

  /** 対象ノードが表示範囲の外になるまで図を動かす（ボタン操作） */
  async function panAway(c: Locator, surface: Locator, node: Locator): Promise<void> {
    await c.getByRole('button', { name: '全体表示に戻す' }).click();
    for (let i = 0; i < 80 && (await inside(node, surface)); i++) {
      await c.getByRole('button', { name: '図を右へ移動' }).click();
    }
    expect(await inside(node, surface), '図を動かしてもノードが範囲外にならない').toBe(false);
  }

  // FR-248 AC-600
  test('FR-248 AC-600 範囲外のノードの表の行をクリックすると、同じノードが選択され、範囲内へパンされ、2 秒間、色に加えて枠線の太さか線種でハイライトされる', async ({ page, start }) => {
    test.setTimeout(120_000);
    await start();
    await selectPersona(page, '事業部門');
    const { c, surface } = await openGraph(page, REP);
    await toElementLevel(c);
    const rows = await openTable(c);
    await expect(rows.first()).toBeVisible();
    const id = (await rows.first().getAttribute('data-entity-id'))!;
    const node = c.locator(`[data-testid="graph-node"][data-entity-id="${id}"]`).first();
    const other = c.locator(`[data-testid="graph-node"]:not([data-entity-id="${id}"])`).last();
    await panAway(c, surface, node);
    const plain = await outline(other);
    const s0 = (await view(surface)).s;
    await rows.first().click();
    // 選択（AC-580 のとおり）と、範囲内へのパン（倍率は保つ）
    await expect(node).toHaveAttribute('data-highlight', /selected/);
    await expect.poll(async () => inside(node, surface), { message: '表の行のクリックで対象ノードが表示範囲に入らない', timeout: 3_000 }).toBe(true);
    expect((await view(surface)).s, 'パンで倍率が変わった').toBeCloseTo(s0, 2);
    // ハイライト: 2 秒の間は出ており、色だけでなく枠線の太さか線種が通常と違う
    await expect(node, 'ハイライトがない').toHaveAttribute('data-row-highlight', 'true');
    expect(await outline(node), '色だけでなく枠線の太さか線種でも示す').not.toBe(plain);
    await page.waitForTimeout(HIGHLIGHT_MS * 0.5);
    await expect(node, '2 秒より前にハイライトが消えた').toHaveAttribute('data-row-highlight', 'true');
    await expect(node, '2 秒を過ぎてもハイライトが続く').not.toHaveAttribute('data-row-highlight', 'true', { timeout: HIGHLIGHT_MS + 1_500 });
    // 選択はハイライトが消えても保たれる
    await expect(node).toHaveAttribute('data-highlight', /selected/);
  });

  // FR-248 AC-600（塊に集約されて見えない対象）
  test('FR-248 AC-600 対象が全体の階層で塊に集約されて見えないときは、見える階層へ切り替えてから移動・ハイライトする', async ({ page, start }) => {
    test.setTimeout(120_000);
    await start();
    await selectPersona(page, '事業部門');
    const { c, surface } = await openGraph(page, REP);
    await c.getByRole('button', { name: '全体表示に戻す' }).click();
    await expect(c).toHaveAttribute('data-zoom-level', 'overview');
    const rows = await openTable(c);
    const id = (await rows.first().getAttribute('data-entity-id'))!;
    const node = c.locator(`[data-testid="graph-node"][data-entity-id="${id}"]`).first();
    await expect(node, '前提: 全体の階層ではノードが見えない').toBeHidden();
    await rows.first().click();
    await expect(c, '階層が切り替わらない').not.toHaveAttribute('data-zoom-level', 'overview');
    await expect(node, '対象のノードが見えない').toBeVisible();
    await expect.poll(async () => inside(node, surface), { timeout: 3_000 }).toBe(true);
    await expect(node).toHaveAttribute('data-highlight', /selected/);
    await expect(node).toHaveAttribute('data-row-highlight', 'true');
  });
  // FR-248 AC-601
  test('FR-248 AC-601 Enter で表の行を選んでも同じで、動きの軽減では即時に移動し、ビジネス関係グラフの表ではハイライトの挙動を足さない', async ({ page, start }) => {
    test.setTimeout(150_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start();
    await selectPersona(page, '事業部門');
    const { c, surface } = await openGraph(page, REP);
    await toElementLevel(c);
    const rows = await openTable(c);
    const id = (await rows.first().getAttribute('data-entity-id'))!;
    const node = c.locator(`[data-testid="graph-node"][data-entity-id="${id}"]`).first();
    await panAway(c, surface, node);
    await rows.first().focus();
    await page.keyboard.press('Enter');
    await expect(node).toHaveAttribute('data-highlight', /selected/);
    // 動きの軽減: アニメーションなしで即時（描画 1〜2 フレーム＝数百 ms 以内に範囲内）
    await expect.poll(async () => inside(node, surface), { message: '動きの軽減で移動が即時でない', timeout: 300 }).toBe(true);
    await expect(node).toHaveAttribute('data-row-highlight', 'true');
    // 異常系: ビジネス関係グラフの表には本要求の挙動を追加しない
    const bg = await openScreen(page, 'business-graph');
    const bgRows = bg.locator('[role="row"][data-entity-id], tr[data-entity-id]');
    if (!(await bgRows.first().isVisible())) {
      const t = bg.getByRole('button', { name: '表で見る' });
      if (await t.count()) await t.click();
    }
    await expect(bgRows.first(), 'ビジネス関係グラフに行つきの表がない').toBeVisible();
    await bgRows.first().click();
    await page.waitForTimeout(300);
    await expect(bg.locator('[data-row-highlight="true"]'), 'ビジネス関係グラフの表の行にハイライトが付いた').toHaveCount(0);
  });
});

/** データビュアーを出す正規の手順（semantic-zoom.spec.ts と同じ。FR-104・FR-169） */
async function prepareDataViewer(page: Page): Promise<Locator> {
  const co = '合成株式会社GI';
  const pj = 'GI案件1';
  await page.getByRole('button', { name: '企業を登録' }).click();
  let dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: '企業名' }).fill(co);
  await dlg.getByRole('button', { name: '登録' }).click();
  await expect(dlg).toBeHidden();
  await page.getByRole('region', { name: `企業 ${co}` }).getByRole('button', { name: 'Project を作成' }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: 'Project 名' }).fill(pj);
  await dlg.getByRole('button', { name: '作成' }).click();
  await expect(dlg).toBeHidden();
  await page.getByRole('region', { name: `企業 ${co}` }).getByRole('link', { name: pj }).click();
  await expect(page.getByTestId('stepper')).toBeVisible();
  await page.getByTestId('stepper').getByRole('button', { name: 'ユースケース作成' }).click();
  const cand = page.getByTestId('usecase-candidates').getByRole('listitem').first();
  await expect(cand).toBeVisible();
  await cand.getByRole('button', { name: '登録', exact: true }).click();
  await expect(page.getByTestId('usecase-list').getByRole('listitem').first()).toBeVisible();
  await openScreen(page, 'data-catalog');
  const rows = page.getByTestId('entity-list').getByRole('listitem');
  await expect(rows.first()).toBeVisible();
  const n = await rows.count();
  const items: { name: string; description: string; columns: { name: string; type: string }[] }[] = [];
  for (let i = 0; i < n; i++) {
    items.push({
      name: ((await rows.nth(i).getAttribute('data-entity-name')) ?? '').trim(),
      description: ((await rows.nth(i).getAttribute('data-entity-description')) ?? '').trim(),
      columns: ['合成列A', '合成列B'].map((cn) => ({ name: cn, type: 'string' })),
    });
  }
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, 'gi-columns.json');
  fs.writeFileSync(file, JSON.stringify({ entities: items }), 'utf8');
  await page.getByLabel('企業データカタログのファイル').setInputFiles(file);
  const viewer = page.getByTestId('data-viewer');
  await expect(viewer, '取り込み後にデータビュアーが出ない').toBeVisible();
  return viewer;
}
