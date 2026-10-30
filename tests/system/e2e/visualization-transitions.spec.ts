// FR-070 AC-086 / PARAM-133=2000ms: データの追加・削除・undo における出入り/遷移の「中間値」を、
// 描画された DOM（computed style・図形属性・部品内の相対位置）または 3D の実シーン（scene.objects）から実測する。
// data-motion / data-transition 属性の有無では判定しない。期待値は AC だけから決める。
// 測定は「確定の操作（複製/削除/Ctrl+Z）の直前」から始め、行の選択・画面/ビューの切替という
// 操作側の待ち時間は含めない（対象ビューを表示し終えてから確定する）。
// 範囲と未着手の描画形式は tests/system/visualization-coverage.md の「出入り遷移」節。
import type { Page } from '@playwright/test';
import { test, expect, openScreen, component, entity, setEditMode } from '../support/fixtures';
import { showRepresentation } from '../support/visualization-matrix';

const PARAM_133_MS = 2000;

type Frame = [t: number, state: string | null];
type Series = Record<string, Frame[]>;

/** 描画フレームごとに、対象部品内の全 entity（または 3D シーンの全オブジェクト）の実描画値を記録する。 */
async function startSampler(page: Page, key: string, mode: '2D' | '3D'): Promise<void> {
  await page.evaluate(([k, m]) => {
    const w = window as any;
    w.__st086 = { run: true, series: {} as Record<string, Array<[number, string | null]>> };
    const tick = () => {
      const t = performance.timeOrigin + performance.now();
      const cur = new Map<string, string>();
      if (m === '3D') {
        for (const o of (w.__edbTest.scene.objects() as any[])) {
          if (o.visible) cur.set(o.entityId, [o.x.toFixed(1), o.y.toFixed(1)].join(','));
        }
      } else {
        const root = document.querySelector(`[data-testid="component-${k}"]`);
        const origin = root?.getBoundingClientRect();
        root?.querySelectorAll('[data-entity-id]').forEach(el => {
          const id = el.getAttribute('data-entity-id')!;
          const css = getComputedStyle(el);
          const a = ['x', 'y', 'cx', 'cy', 'd', 'points', 'width', 'height', 'transform']
            .map(n => el.getAttribute(n)).join('|');
          const box = el.getBoundingClientRect();
          const part = [css.opacity, css.transform, a, (box.x - origin!.x).toFixed(1), (box.y - origin!.y).toFixed(1),
            box.width.toFixed(1), box.height.toFixed(1), (el.textContent ?? '').trim()].join('/');
          cur.set(id, (cur.get(id) ?? '') + part + ';');
        });
      }
      const s = w.__st086.series;
      for (const id of new Set([...Object.keys(s), ...cur.keys()])) {
        const arr = s[id] ?? (s[id] = []);
        const v = cur.get(id) ?? null;
        if (!arr.length || arr[arr.length - 1][1] !== v) arr.push([t, v]);
      }
      if (w.__st086.run) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [key, mode] as const);
}

async function stopSampler(page: Page): Promise<Series> {
  await page.waitForTimeout(PARAM_133_MS + 300);
  return page.evaluate(() => { const w = window as any; w.__st086.run = false; return w.__st086.series; });
}

const now = (page: Page) => page.evaluate(() => performance.timeOrigin + performance.now());
const rowIds = (page: Page) => component(page, 'table').locator('[role="row"][data-entity-id]')
  .evaluateAll(els => els.map(el => el.getAttribute('data-entity-id')!));

/** 表で項目を選び（操作側の準備）、対象ビューを表示してから戻る。 */
async function selectThenShow(page: Page, id: string, screen: string, mode: '2D' | '3D') {
  const table = await openScreen(page, 'table');
  await entity(table, id).first().click();
  await showRepresentation(page, screen, mode);
  await page.waitForTimeout(300); // 画面切替直後の初期レイアウトを落ち着かせる（測定前）
}

for (const [screen, mode] of [
  ['knowledge-graph', '2D'], ['gantt', '2D'], ['knowledge-graph', '3D'],
] as const) {
  test(`FR-070 AC-086 ${screen}/${mode} 追加・削除・undo は同一性を保つ出入りの中間値を経て ${PARAM_133_MS}ms 以内に収束し、削除済みを残さない`, async ({ page, start }) => {
    await start();
    await setEditMode(page, true);
    await openScreen(page, 'table');
    const ids = await rowIds(page);
    const original = ids[0];
    const control = page.getByTestId('animation-state');
    if (!(await control.innerText()).includes('再生中')) await control.click();
    await expect(control, '動きが有効な状態').toContainText('再生中');

    // 追加（複製）
    await selectThenShow(page, original, screen, mode);
    await startSampler(page, screen, mode);
    const t0 = await now(page);
    await component(page, 'detail').getByRole('button', { name: '複製', exact: true }).click();
    const series = await stopSampler(page);
    const added = (await rowIds(page)).find(id => !ids.includes(id))!;
    expect(added, '追加した項目の ID').toBeTruthy();
    const frames = (series[added] ?? []).filter(f => f[0] >= t0 - 50);
    const present = frames.filter(f => f[1] !== null);
    expect(present.length, `追加した項目 ${added} が ${screen}/${mode} に描画されない`).toBeGreaterThan(0);
    const last = frames[frames.length - 1];
    expect(last[1], '最終的に追加した項目が表示されている').not.toBeNull();
    expect(present.length, '追加が中間値を経ずに瞬間表示された（出入りの遷移なし）').toBeGreaterThan(1);
    expect(present[0][1], '初出の描画値が最終値と同一（遷移なし）').not.toBe(last[1]);
    if (mode === '2D') expect(present[0][1]!.split('/').slice(0, 3), '初出が最終の位置・透明度・変形と同じ（出入りの補間なし）').not.toEqual(last[1]!.split('/').slice(0, 3));
    expect(last[0] - t0, `追加から最終状態まで ${PARAM_133_MS}ms 以内`).toBeLessThanOrEqual(PARAM_133_MS);
    expect((series[original] ?? []).filter(f => f[0] > t0 && f[1] === null), '既存項目が作り直された（同一性）').toHaveLength(0);

    // 削除 → 中間値を経て消え、削除済みを残さない
    await selectThenShow(page, added, screen, mode);
    await startSampler(page, screen, mode);
    const t1 = await now(page);
    await component(page, 'detail').getByRole('button', { name: '削除', exact: true }).click();
    const confirmation = page.getByRole('alertdialog');
    if (await confirmation.isVisible()) await confirmation.getByRole('button', { name: /削除/ }).click();
    const del = await stopSampler(page);
    const df = del[added] ?? [];
    expect(df.length, '削除前の描画記録').toBeGreaterThan(0);
    expect(df[df.length - 1][1], '削除済みの項目が表示に残っている').toBeNull();
    expect(df.filter(f => f[0] >= t1 && f[1] !== null).length, '削除が中間値を経ずに瞬間消去された（出入りの遷移なし）').toBeGreaterThan(0);
    expect(df[df.length - 1][0] - t1, `削除から消去完了まで ${PARAM_133_MS}ms 以内`).toBeLessThanOrEqual(PARAM_133_MS);

    // undo → 同じ ID で戻り、最新の状態へ収束する
    await showRepresentation(page, screen, mode);
    await page.waitForTimeout(300);
    await startSampler(page, screen, mode);
    const t2 = await now(page);
    await page.keyboard.press('Control+z');
    const undone = await stopSampler(page);
    const uf = undone[added] ?? [];
    expect(uf.some(f => f[1] !== null), 'undo で同じ ID の項目が戻る').toBe(true);
    expect(uf[uf.length - 1][0] - t2, `undo から収束まで ${PARAM_133_MS}ms 以内`).toBeLessThanOrEqual(PARAM_133_MS);
  });
}

// FR-070 AC-086 動き停止中・prefers-reduced-motion=reduce は遷移なしで最終状態を即時表示する
for (const reduceBy of ['停止', 'reduce'] as const) {
  test(`FR-070 AC-086 動き${reduceBy}では追加が中間値なしで即時に最終状態になる`, async ({ page, start }) => {
    await start();
    await setEditMode(page, true);
    await openScreen(page, 'table');
    const ids = await rowIds(page);
    const control = page.getByTestId('animation-state');
    if (reduceBy === '停止') {
      if ((await control.innerText()).includes('再生中')) await control.click();
      await expect(control).toContainText('停止中');
    } else {
      await page.emulateMedia({ reducedMotion: 'reduce' });
    }
    await selectThenShow(page, ids[0], 'knowledge-graph', '2D');
    await startSampler(page, 'knowledge-graph', '2D');
    await component(page, 'detail').getByRole('button', { name: '複製', exact: true }).click();
    const series = await stopSampler(page);
    const added = (await rowIds(page)).find(id => !ids.includes(id))!;
    const present = (series[added] ?? []).filter(f => f[1] !== null);
    expect(present.length, '停止中/reduce でも追加した項目は表示される').toBeGreaterThan(0);
    // 項目自身の不透明度・変形・図形属性で判定する（全体のフィット／再配置による箱の寸法変化は項目の遷移ではない）。
    expect(new Set(present.map(f => f[1]!.split('/').slice(0, 3).join('/'))).size, '停止中/reduce は中間値を経ず最終状態を即時表示する').toBe(1);
  });
}

// FR-070 AC-086 空データ・非表示の可視化に不要な連続描画がない（3D のフレーム更新数を計測）
test('FR-070 AC-086 背面（非表示）の 3D では連続描画が止まっている', async ({ page, start }) => {
  await start();
  const view = await showRepresentation(page, 'knowledge-graph', '3D');
  await expect(view).toBeVisible();
  await openScreen(page, 'table');
  await page.waitForTimeout(500);
  const frames = () => page.evaluate(() => (window as any).__edbTest.scene.info().frame as number);
  const a = await frames();
  await page.waitForTimeout(1000);
  expect((await frames()) - a, '背面・非表示の 3D が毎フレーム描画を続けている').toBeLessThanOrEqual(2);
});



