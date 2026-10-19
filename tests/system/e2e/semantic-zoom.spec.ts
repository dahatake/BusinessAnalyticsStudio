// System Test: 意味的ズーム（全体→要素→詳細。FR-237）。期待値は docs/requirements/graph-twin.md の受入基準（AC-555・AC-557）だけから決める。
// 画面の探し方は CONTRACT.md の「意味的ズーム（FR-237）」節。まだ実装がない間は失敗するのが正常（not_run → 実装後に pass）。
// 対象画面の key: business-graph（ビジネス関係グラフ）・twin-view（Twin ビュー）・spatial-view（空間ビュー）・data-catalog（データビュアーを含む）。
import type { Page, Locator } from '@playwright/test';
import { test, expect, selectPersona, openScreen, component, hook } from '../support/fixtures';
import { gotoScreen, openViewMenu, viewButton } from '../support/screens';

type Level = 'overview' | 'element' | 'detail';
type Format = '2D' | '3D' | 'Graph';
const LEVEL_NAME: Record<Level, string> = { overview: '全体', element: '要素', detail: '詳細' };
const ZOOM_SCREENS = ['business-graph', 'twin-view', 'spatial-view', 'data-catalog'] as const;

/** ズームの対象の面（データビュアーは data-catalog の中の data-viewer。ほかは画面そのもの） */
function zoomRoot(page: Page, key: string): Locator {
  return key === 'data-catalog' ? page.getByTestId('data-viewer') : component(page, key);
}

const levelOf = async (root: Locator) => (await root.getAttribute('data-zoom-level')) as Level | null;

/** パンくず（FR-033）。現在の階層は aria-current="location" の項目 */
function crumbs(root: Locator): Locator {
  return root.getByRole('navigation', { name: 'パンくず' });
}

/** 全体に戻してから、ボタン「拡大」で目的の階層まで進める（段を飛ばさないことは AC-556 の単体で確かめる） */
async function zoomTo(root: Locator, level: Level): Promise<void> {
  await root.getByRole('button', { name: '全体表示に戻す' }).click();
  await expect(root).toHaveAttribute('data-zoom-level', 'overview');
  for (let i = 0; i < 20 && (await levelOf(root)) !== level; i++) {
    const zoomIn = root.getByRole('button', { name: '拡大' });
    await expect(zoomIn, `階層「${LEVEL_NAME[level]}」まで拡大できない`).toBeEnabled();
    await zoomIn.click();
  }
  await expect(root).toHaveAttribute('data-zoom-level', level);
}

async function chooseFormat(page: Page, c: Locator, f: Format): Promise<boolean> {
  const menu = await openViewMenu(page, c);
  const opt = menu.getByRole('menuitemradio', { name: f, exact: true });
  if (!(await opt.isEnabled())) {
    // 3D を描画できない環境: 無効＋理由の文字（AC-557 の括弧書き）
    expect(f, `${f} が無効になっている`).toBe('3D');
    await expect(menu, '3D が無効なのに理由の文字がない').toContainText(/3D.*(描画できません|使えません|WebGL|WebGPU)|(描画できません|使えません|WebGL|WebGPU).*3D/s);
    await page.keyboard.press('Escape');
    return false;
  }
  await opt.click();
  await expect(viewButton(c)).toContainText(f);
  return true;
}

test.describe('FR-237 意味的ズーム（全体→要素→詳細）', () => {
  // FR-237 AC-555
  test('FR-237 AC-555 ビジネス関係グラフで全体→要素→詳細の順にズームインでき、全体は塊の名前と件数、要素は名称と種別、詳細は属性・出典・関係の一覧、パンくずが位置を示し、一つ上と全体へ戻せる', async ({ page, start }) => {
    test.setTimeout(180_000);
    await start();
    await selectPersona(page, '事業部門');
    const c = await openScreen(page, 'business-graph');
    // 既定の表示形式は Graph（FR-238）。標準の検証条件はお手本パックのデモ
    await expect(viewButton(c)).toContainText('Graph');
    await c.getByRole('button', { name: '全体表示に戻す' }).click();
    await expect(c).toHaveAttribute('data-zoom-level', 'overview');

    // 全体: 塊の名前と件数。パンくずの現在の位置は「全体」
    const clusters = c.locator('[data-zoom-cluster]');
    await expect(clusters.first(), '全体に塊が表示されない').toBeVisible();
    const n = await clusters.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const cl = clusters.nth(i);
      expect(((await cl.getAttribute('data-zoom-cluster')) ?? '').trim(), '塊の名前がない').not.toBe('');
      await expect(cl, '塊に件数が文字で出ない').toContainText(/\d+\s*件/);
    }
    await expect(crumbs(c).locator('[aria-current="location"]')).toHaveText('全体');
    // 異常系: 全体より上へは行けない
    await expect(c.getByRole('button', { name: '縮小' })).toBeDisabled();
    await expect(c.getByRole('button', { name: '一つ上の階層へ' })).toBeDisabled();

    // 要素: 塊をダブルクリック（ズームイン）。個々のノードの名称と種別
    await clusters.first().dblclick();
    await expect(c).toHaveAttribute('data-zoom-level', 'element');
    await expect(crumbs(c).locator('[aria-current="location"]')).toContainText('要素');
    const nodes = c.locator('[data-zoom-node][data-entity-id]');
    await expect(nodes.first(), '要素の階層にノードが表示されない').toBeVisible();
    const first = nodes.first();
    expect(((await first.getAttribute('data-entity-name')) ?? (await first.innerText())).trim(), 'ノードの名称がない').not.toBe('');
    expect(((await first.getAttribute('data-entity-kind')) ?? '').trim(), 'ノードの種別がない').not.toBe('');
    await expect(first, '種別が文字でも示される').toContainText(/\S/);
    const id = (await first.getAttribute('data-entity-id'))!;

    // 詳細: ノードを選んで Enter。属性・出典・関係の一覧
    await first.focus();
    await page.keyboard.press('Enter');
    await expect(c).toHaveAttribute('data-zoom-level', 'detail');
    const detail = c.getByTestId('zoom-detail');
    await expect(detail).toBeVisible();
    await expect(detail.locator(`[data-entity-id="${id}"]`).first()).toBeVisible();
    for (const h of ['属性', '出典', '関係']) {
      await expect(detail.getByRole('heading', { name: h }), `詳細に「${h}」の一覧がない`).toBeVisible();
    }
    await expect(crumbs(c).locator('[aria-current="location"]')).toContainText('詳細');
    // 異常系: 詳細より先へは拡大できない
    await expect(c.getByRole('button', { name: '拡大' })).toBeDisabled();

    // 一つ上へ → 要素、全体へ → 全体
    await c.getByRole('button', { name: '一つ上の階層へ' }).click();
    await expect(c).toHaveAttribute('data-zoom-level', 'element');
    await expect(crumbs(c).locator('[aria-current="location"]')).toContainText('要素');
    await c.getByRole('button', { name: '拡大' }).click().catch(() => undefined);
    await c.getByRole('button', { name: '全体表示に戻す' }).click();
    await expect(c).toHaveAttribute('data-zoom-level', 'overview');
    await expect(crumbs(c).locator('[aria-current="location"]')).toHaveText('全体');
    // パンくずの項目を押しても戻れる（詳細から全体へ）
    await zoomTo(c, 'detail');
    await crumbs(c).getByRole('link', { name: '全体' }).or(crumbs(c).getByRole('button', { name: '全体' })).first().click();
    await expect(c).toHaveAttribute('data-zoom-level', 'overview');
  });

  // FR-237 AC-557
  test('FR-237 AC-557 ビジネス関係グラフ・Twin ビュー・空間ビュー・データビュアーのそれぞれで {全体, 要素, 詳細}×{2D, 3D, Graph} の 9 通りがすべて描画され、同じ選択項目が表示される（3D を描画できない環境では 3D が無効で理由が示される）', async ({ page, start }) => {
    test.setTimeout(600_000);
    await start();
    await selectPersona(page, '事業部門');
    // 同じ選択項目: 一覧表で 1 件選ぶ（選択状態は画面をまたいで連動する。FR-024）
    const table = await openScreen(page, 'table');
    const row = table.locator('[role="row"][data-entity-id]').first();
    await row.click();
    const selectedId = (await row.getAttribute('data-entity-id'))!;
    expect(selectedId).toBeTruthy();

    for (const key of ZOOM_SCREENS) {
      const c = await gotoScreen(page, key);
      const root = zoomRoot(page, key);
      await expect(root, `${key}: ズームの対象の面が表示されない`).toBeVisible();
      for (const f of ['2D', '3D', 'Graph'] as Format[]) {
        const ok = await chooseFormat(page, c, f);
        if (!ok) continue; // 3D を描画できない環境では、無効＋理由の文字だけを確かめて飛ばす
        for (const lv of ['overview', 'element', 'detail'] as Level[]) {
          await zoomTo(root, lv);
          const where = `${key} / ${LEVEL_NAME[lv]} × ${f}`;
          await expect(root, `${where}: 描画されない`).toBeVisible();
          // 描画の実体: 3D は 3D の面、Graph はグラフの面。2D は面か本文がある
          if (f === '3D') await expect(root.locator('[data-zoom-surface="3d"]').first(), `${where}: 3D の面がない`).toBeVisible();
          if (f === 'Graph') await expect(root.locator('[data-zoom-surface="graph"]').first(), `${where}: Graph の面がない`).toBeVisible();
          expect(((await root.innerText()) ?? '').trim().length, `${where}: 画面の内容が空`).toBeGreaterThan(0);
          const st = await hook<{ selectedIds: string[] }>(page, 't.view.state(a)', key);
          expect(st.selectedIds, `${where}: 同じ選択項目が表示されない`).toContain(selectedId);
        }
      }
    }
  });

  // FR-237 AC-557（異常系: 3D を描画できない環境で、3D は無効＋理由、2D と Graph は 9 通りのうち 6 通りで描画される）
  test('FR-237 AC-557 異常系: 3D を描画できない環境（WebGPU・WebGL2 なし）では「ビュー」の 3D が無効で理由が示され、2D と Graph では全階層が描画される', async ({ page, start }) => {
    test.setTimeout(300_000);
    await page.addInitScript(() => {
      // WebGPU と WebGL2 を使えなくする
      Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl|webgpu/i.test(type)) return null;
        return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest) as never;
      } as typeof orig;
    });
    await start();
    await selectPersona(page, '事業部門');
    for (const key of ZOOM_SCREENS) {
      const c = await gotoScreen(page, key);
      const root = zoomRoot(page, key);
      const menu = await openViewMenu(page, c);
      await expect(menu.getByRole('menuitemradio', { name: '3D', exact: true }), `${key}: 3D が無効にならない`).toBeDisabled();
      await expect(menu).toContainText(/描画できません|使えません|WebGL|WebGPU/);
      await page.keyboard.press('Escape');
      for (const f of ['2D', 'Graph'] as Format[]) {
        await chooseFormat(page, c, f);
        for (const lv of ['overview', 'element', 'detail'] as Level[]) {
          await zoomTo(root, lv);
          await expect(root, `${key} / ${LEVEL_NAME[lv]} × ${f}: 描画されない`).toBeVisible();
        }
      }
    }
  });
});
