// System Test: コンポーネントのピン止めの切替（アイコン）と、ピン止めしたコンポーネントの画面の幅の変化での比率の保持
// 期待値は要求定義書の受入基準（docs/requirements/app-experience.md の FR-215 AC-493・FR-216 AC-495）と PARAM だけから決める。
// PARAM-072=1（作業領域の幅・高さに対する比率の差。百分率のポイント）。画面の幅 1920→1280→1600 CSS px は AC-495 の検証の条件。
// 画面の探し方は CONTRACT.md §10（component-actions）・§21（ピンのアイコン: button「ピン止めする」／「ピン止めを外す」、aria-pressed、data-icon-variant）。
import type { Page, Locator } from '@playwright/test';
import { test, expect, component, selectPersona, openScreen } from '../support/fixtures';
import { box, topKeys, pinButton } from '../support/screens';

const RATIO_TOL = 0.01; // PARAM-072（1 ポイント）

async function pin(c: Locator): Promise<void> {
  await c.focus();
  const b = pinButton(c);
  await expect(b).toHaveAccessibleName('ピン止めする');
  await b.click();
  await expect(pinButton(c)).toHaveAccessibleName('ピン止めを外す');
}

async function ratios(page: Page, c: Locator) {
  const ws = await box(page.getByTestId('workspace'));
  const b = await box(c);
  return { x: (b.x - ws.x) / ws.width, y: (b.y - ws.y) / ws.height, w: b.width / ws.width, h: b.height / ws.height };
}

/** 直下のコンポーネントの矩形どうしの重なり（許容 4px²。CONTRACT.md §15） */
async function overlaps(page: Page, keys: string[]): Promise<string[]> {
  const out: string[] = [];
  const all = await topKeys(page);
  for (const k of keys) {
    const a = await box(component(page, k));
    for (const o of all) {
      if (o === k) continue;
      const b = await component(page, o).boundingBox();
      if (!b) continue;
      const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (w > 0 && h > 0 && w * h > 4) out.push(`${k} × ${o}`);
    }
  }
  return out;
}

/** レイアウトが落ち着く（2 回続けて同じ矩形になる）まで待つ */
async function settle(page: Page, keys: string[]): Promise<void> {
  let prev = '';
  await expect.poll(async () => {
    const cur = JSON.stringify(await Promise.all(keys.map(async (k) => component(page, k).boundingBox())));
    const same = cur === prev;
    prev = cur;
    return same;
  }, { timeout: 5_000, intervals: [200] }).toBe(true);
}

async function dragHeadingTo(page: Page, c: Locator, toX: number, toY: number): Promise<void> {
  const h = await box(c.getByRole('heading').first());
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move((h.x + h.width / 2 + toX) / 2, (h.y + h.height / 2 + toY) / 2, { steps: 6 });
  await page.mouse.move(toX, toY, { steps: 6 });
  await page.mouse.up();
}

test.describe('FR-215 ピン止めの切替（アイコン）', () => {
  // FR-215 AC-493
  test('FR-215 AC-493 ピンのアイコンを押すと「ピン止めを外す」（Filled・押下 true）に替わり、もう一度で「ピン止めする」（Regular）に戻り、アイコンは常に 1 つ、固定は再読込後も復元される', async ({ page, start }) => {
    const app = await start();
    await selectPersona(page, '事業部門');
    const [k] = await topKeys(page);
    const c = component(page, k);
    await c.focus();
    const b = pinButton(c);
    await expect(b, '見出しのピンのアイコンが 1 つでない').toHaveCount(1);
    await expect(b).toHaveAccessibleName('ピン止めする');
    await expect(b).toHaveAttribute('aria-pressed', 'false');
    await expect(b).toHaveAttribute('data-icon-variant', 'regular');
    await b.click();
    await expect(pinButton(c)).toHaveCount(1);
    await expect(pinButton(c)).toHaveAccessibleName('ピン止めを外す');
    await expect(pinButton(c)).toHaveAttribute('aria-pressed', 'true');
    await expect(pinButton(c)).toHaveAttribute('data-icon-variant', 'filled');
    // ツールチップの名前も切替に応じて変わる
    await pinButton(c).hover();
    await expect(page.getByRole('tooltip').filter({ hasText: 'ピン止めを外す' })).toBeVisible();
    // もう一度で戻る
    await pinButton(c).click();
    await expect(pinButton(c)).toHaveCount(1);
    await expect(pinButton(c)).toHaveAccessibleName('ピン止めする');
    await expect(pinButton(c)).toHaveAttribute('aria-pressed', 'false');
    await expect(pinButton(c)).toHaveAttribute('data-icon-variant', 'regular');
    // 固定した状態で再読込 → 固定したまま復元
    await pinButton(c).click();
    await expect(pinButton(c)).toHaveAccessibleName('ピン止めを外す');
    await app.reload();
    const c2 = component(page, k);
    await c2.focus();
    await expect(pinButton(c2)).toHaveCount(1);
    await expect(pinButton(c2), '再読込後にピン止めが復元されない').toHaveAccessibleName('ピン止めを外す');
    await expect(pinButton(c2)).toHaveAttribute('aria-pressed', 'true');
  });

  // FR-215 AC-493（全コンポーネント: どのコンポーネントの見出しにもピンのアイコンが 1 つだけ）
  test('FR-215 AC-493 表示中のすべてのコンポーネントの見出しに、ピンのアイコンが状態に応じて 1 つだけある（既定は固定なし）', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const ks = await topKeys(page);
    expect(ks.length).toBeGreaterThanOrEqual(2);
    for (const k of ks) {
      const c = component(page, k);
      await c.focus();
      await expect(pinButton(c), `${k}: ピンのアイコンが 1 つでない`).toHaveCount(1);
      await expect(pinButton(c), `${k}: 既定のレイアウトで固定されている`).toHaveAccessibleName('ピン止めする');
    }
  });

  // FR-215 AC-493（異常系: 1 つを固定して再読込しても、ほかのコンポーネントは固定されない／フォーカスだけでは切り替わらない）
  test('FR-215 AC-493 異常系: 1 つだけ固定して再読込しても、ほかのコンポーネントは固定なしのままで、フォーカスしただけでは切り替わらない', async ({ page, start }) => {
    const app = await start();
    await selectPersona(page, '事業部門');
    const [a, b] = await topKeys(page);
    await component(page, b).focus();
    await expect(pinButton(component(page, b))).toHaveAccessibleName('ピン止めする');
    await pin(component(page, a));
    await app.reload();
    const cb = component(page, b);
    await cb.focus();
    await expect(pinButton(cb), 'ピン止めしていないコンポーネントが固定されている').toHaveAccessibleName('ピン止めする');
    await expect(pinButton(cb)).toHaveAttribute('aria-pressed', 'false');
    const ca = component(page, a);
    await ca.focus();
    await expect(pinButton(ca)).toHaveAccessibleName('ピン止めを外す');
  });
});

test.describe('FR-216 ピン止めしたコンポーネントの固定と比率の保持', () => {
  /** KPI/OKR を上部の左、ガントチャートを上部の右に置いてピン止めする。選択と絞り込みも作っておく。 */
  async function arrange(page: Page) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    // 選択中の対象と絞り込み（NFR-UX-001）
    const table = await openScreen(page, 'table');
    const firstRow = table.locator('[role="row"][data-entity-id]').first();
    await firstRow.click();
    const selection = await page.getByTestId('selection-indicator').innerText();
    const filter = table.getByRole('textbox', { name: /絞り込み/ });
    const filterText = (await firstRow.innerText()).trim().slice(0, 2);
    await filter.fill(filterText);
    // 配置
    const kpi = await openScreen(page, 'kpi-okr');
    const gantt = await openScreen(page, 'gantt');
    const ws = await box(page.getByTestId('workspace'));
    // スナップの範囲（端から 32px。PARAM-042）を避けて置く
    await dragHeadingTo(page, kpi, ws.x + ws.width * 0.2, ws.y + 60);
    await dragHeadingTo(page, gantt, ws.x + ws.width * 0.75, ws.y + 60);
    const kb = await box(kpi);
    const gb = await box(gantt);
    expect(kb.x + kb.width, '前提: KPI/OKR がガントチャートの左にない').toBeLessThanOrEqual(gb.x + 1);
    expect(kb.y - ws.y, '前提: KPI/OKR が上部にない').toBeLessThan(ws.height / 3);
    expect(gb.y - ws.y, '前提: ガントチャートが上部にない').toBeLessThan(ws.height / 3);
    await pin(kpi);
    await pin(gantt);
    await settle(page, ['kpi-okr', 'gantt']);
    return { kpi, gantt, selection, filterText };
  }

  // FR-216 AC-495
  test('FR-216 AC-495 KPI/OKR を上部の左、ガントチャートを上部の右でピン止めし、幅を 1920→1280→1600 CSS px に変えても、比率の差が 1 ポイント以内で左右の並びが変わらず、重ならず、選択と絞り込みも変わらない', async ({ page, start }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await start();
    await selectPersona(page, '事業部門');
    const { kpi, gantt, selection, filterText } = await arrange(page);
    const base = { kpi: await ratios(page, kpi), gantt: await ratios(page, gantt) };
    for (const width of [1280, 1600]) {
      await page.setViewportSize({ width, height: 1080 });
      await settle(page, ['kpi-okr', 'gantt']);
      for (const [name, c] of [['kpi', kpi], ['gantt', gantt]] as const) {
        const r = await ratios(page, c);
        for (const p of ['x', 'y', 'w', 'h'] as const) {
          expect(Math.abs(r[p] - base[name][p]), `${width}px: ${name} の ${p} の比率の差`).toBeLessThanOrEqual(RATIO_TOL);
        }
      }
      const kb = await box(kpi);
      const gb = await box(gantt);
      expect(kb.x + kb.width, `${width}px: 左右の並びが変わった`).toBeLessThanOrEqual(gb.x + 1);
      expect(await overlaps(page, ['kpi-okr', 'gantt']), `${width}px: ほかのコンポーネントと重なる`).toEqual([]);
      await expect(page.getByTestId('selection-indicator'), `${width}px: 選択中の対象が変わった`).toHaveText(selection);
      await expect(component(page, 'table').getByRole('textbox', { name: /絞り込み/ }), `${width}px: 絞り込みが変わった`).toHaveValue(filterText);
      // ピン止めの状態も保たれる
      await kpi.focus();
      await expect(pinButton(kpi)).toHaveAccessibleName('ピン止めを外す');
    }
  });

  // FR-216 AC-495（異常系: 幅を変えた後にほかのコンポーネントへフォーカスして自動のサイズ調整が働いても、ピン止めした 2 つは比率を保ち、重ならない）
  test('FR-216 AC-495 異常系: 1280 CSS px でほかのコンポーネントにフォーカスして自動のサイズ調整が働いても、ピン止めした 2 つの比率は 1 ポイント以内で重ならない', async ({ page, start }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await start();
    await selectPersona(page, '事業部門');
    const { kpi, gantt } = await arrange(page);
    const base = { kpi: await ratios(page, kpi), gantt: await ratios(page, gantt) };
    await page.setViewportSize({ width: 1280, height: 1080 });
    await settle(page, ['kpi-okr', 'gantt']);
    const others = (await topKeys(page)).filter((k) => k !== 'kpi-okr' && k !== 'gantt');
    expect(others.length, '前提: ほかのコンポーネントがない').toBeGreaterThan(0);
    for (const o of others) {
      await component(page, o).focus();
      await settle(page, ['kpi-okr', 'gantt', o]);
      for (const [name, c] of [['kpi', kpi], ['gantt', gantt]] as const) {
        const r = await ratios(page, c);
        for (const p of ['x', 'y', 'w', 'h'] as const) {
          expect(Math.abs(r[p] - base[name][p]), `${o} にフォーカス: ${name} の ${p} の比率の差`).toBeLessThanOrEqual(RATIO_TOL);
        }
      }
      expect(await overlaps(page, ['kpi-okr', 'gantt']), `${o} にフォーカス: 重なる`).toEqual([]);
    }
  });
});
