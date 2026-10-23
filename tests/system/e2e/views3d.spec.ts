// System Test: 3D・2D 図面・地図・ガント・フライスルー・連動・LOD・品質・アニメーション停止
// 期待値は要求定義書の受入基準と、お手本パック（モノ／コト）の内容から決める。
// 3D・地図の内部の状態は、CONTRACT.md §6 のテスト用フック（window.__edbTest）で読む。
import type { Page } from '@playwright/test';
import { test, expect, openScreen, component, entity, hook, scene, expectCanvasDrawn, waitFirstFrame, captureDownload, recordExportConsent, setEditMode } from '../support/fixtures';
import { examplePack, makeVariant } from '../support/packs';
import { gotoScreen, chooseView } from '../support/screens';

const mono = examplePack('mono');
const koto = examplePack('koto');

function leafEntities(p = mono) {
  const all = p.entities();
  return all.filter((e) => !all.some((c) => c.parentId === e.id));
}
function ancestors(id: string, p = mono): any[] {
  const all = p.entities();
  const chain: any[] = [];
  let cur = all.find((e) => e.id === id);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentId ? all.find((e) => e.id === cur.parentId) : undefined;
  }
  return chain;
}
async function nextFrames(page: Page, n = 2) {
  await page.evaluate((k) => new Promise<void>((r) => { let i = 0; const f = () => (++i >= k ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
}
async function clickSceneObject(page: Page, entityId: string) {
  // カメラが動いている間は当たりがずれるので、座標が 2 フレーム連続で同じになるのを待ってからクリックする（最大 約 3 秒。収束しなければ直近の座標で押す）
  const read = async () => (await scene.objects(page)).find((x) => x.entityId === entityId && x.visible);
  let o = await read();
  for (let i = 0; i < 60; i++) {
    await nextFrames(page, 2);
    const n = await read();
    const same = !!o && !!n && Math.abs(o.x - n.x) < 0.5 && Math.abs(o.y - n.y) < 0.5;
    o = n ?? o;
    if (same) break;
    await page.waitForTimeout(50);
  }
  expect(o, `3D ビューに ${entityId} が表示されていない`).toBeTruthy();
  await page.mouse.click(o!.x, o!.y);
}
async function toggleAnimation(page: Page, state: '停止中' | '再生中') {
  if (!(await page.getByTestId('animation-state').innerText()).includes(state)) await page.keyboard.press('p');
  await expect(page.getByTestId('animation-state')).toContainText(state);
}

// FR-020（AC-024）は 2026-10-22 の依頼で廃止予定（画面 view3d・drawing2d の廃止）。ケース E2E-124 は台帳で blocked。テストは削除した。

test.describe('FR-021 コトの表現', () => {
  // FR-021 AC-025
  test('FR-021 AC-025 コトのパックで拠点が位置に表示され、時間軸を動かすと流れが変わり、停止中は粒子が静止する', async ({ page, start }) => {
    await start({ pack: 'koto' });
    const map = await openScreen(page, 'map');
    const sites = koto.entities().filter((e) => e.type === 'site' && e.location);
    expect(sites.length).toBeGreaterThan(1);
    const markers = await hook<Array<{ entityId: string; lat: number; lng: number }>>(page, 't.map.markers()');
    for (const s of sites) {
      const m = markers.find((x) => x.entityId === s.id);
      expect(m, `拠点 ${s.name} が地図にない`).toBeTruthy();
      expect(Math.abs(m!.lat - s.location.lat)).toBeLessThan(0.01);
      expect(Math.abs(m!.lng - s.location.lng)).toBeLessThan(0.01);
    }
    await toggleAnimation(page, '停止中');
    const slider = page.getByRole('slider', { name: '時間軸' });
    await slider.focus();
    const shot0 = await map.screenshot();
    const v0 = Number(await slider.getAttribute('aria-valuenow'));
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await expect.poll(async () => Number(await slider.getAttribute('aria-valuenow'))).toBeGreaterThan(v0);
    await nextFrames(page, 3);
    const shot1 = await map.screenshot();
    expect(shot1.equals(shot0), '時刻を変えても流れの表示が変わらない').toBe(false);
    // 停止中は粒子が静止
    await page.waitForTimeout(300);
    const a = await map.screenshot();
    await page.waitForTimeout(700);
    const b = await map.screenshot();
    expect(a.equals(b), 'アニメーション停止中なのに表示が動いている').toBe(true);
  });
});

test.describe('FR-022 ガント 2D/2.5D', () => {
  // FR-022 AC-026
  test('FR-022 AC-026 2D と 2.5D を切り替えても工程の件数・期間・選択中の工程が変わらない', async ({ page, start }) => {
    await start();
    const gantt = await openScreen(page, 'gantt');
    const task = mono.tasks()[0];
    await entity(gantt, task.id).first().click();
    const read = () => hook<Array<{ id: string; start: string; end: string; selected: boolean }>>(page, 't.gantt.tasks()');
    await gantt.getByRole('radio', { name: '2D' }).check();
    const a = await read();
    expect(a.length).toBe(mono.tasks().length);
    await gantt.getByRole('radio', { name: '2.5D' }).check();
    await expectCanvasDrawn(gantt.locator('canvas').first());
    const b = await read();
    expect(b.map((t) => [t.id, t.start, t.end]).sort()).toEqual(a.map((t) => [t.id, t.start, t.end]).sort());
    expect(b.filter((t) => t.selected).map((t) => t.id)).toEqual([task.id]);
    await gantt.getByRole('radio', { name: '2D' }).check();
    expect((await read()).filter((t) => t.selected).map((t) => t.id)).toEqual([task.id]);
  });
});

test.describe('FR-023 フライスルー', () => {
  // FR-023 AC-027
  test('FR-023 AC-027 末端の項目を選ぶとカメラが連続的に移動し、停止中は即座に切り替わる', async ({ page, start }) => {
    await start();
    await openScreen(page, 'view3d');
    const leaf = leafEntities()[0];
    const table = await openScreen(page, 'table');
    const before = await scene.camera(page);
    await entity(table, leaf.id).first().click();
    const samples: string[] = [];
    for (let i = 0; i < 12; i++) {
      samples.push((await scene.camera(page)).position.map((v) => v.toFixed(2)).join(','));
      await page.waitForTimeout(50);
    }
    const distinct = new Set(samples.filter((s) => s !== before.position.map((v) => v.toFixed(2)).join(',')));
    expect(distinct.size, 'カメラが連続的に移動していない（途中の位置がない）').toBeGreaterThanOrEqual(3);
    await expect.poll(async () => (await scene.camera(page)).moving).toBe(false);
    // 停止中は即座に
    await toggleAnimation(page, '停止中');
    const leaf2 = leafEntities()[leafEntities().length - 1];
    await entity(component(page, 'table'), leaf2.id).first().click();
    await nextFrames(page, 2);
    const c1 = await scene.camera(page);
    expect(c1.moving).toBe(false);
    await page.waitForTimeout(300);
    expect((await scene.camera(page)).position).toEqual(c1.position);
    expect((await scene.objects(page)).find((o) => o.entityId === leaf2.id)?.visible).toBe(true);
  });
});

test.describe('FR-025 クロスハイライト', () => {
  // FR-025 AC-030
  test('FR-025 AC-030 3D で拠点を選ぶと地図・表・ガント・出典でハイライトされ、表で選ぶと 3D で強調されカメラが向く', async ({ page, start }) => {
    await start();
    const site = mono.entities().find((e) => e.type === 'site');
    expect(site, 'お手本パックに拠点がない').toBeTruthy();
    await openScreen(page, 'view3d');
    await clickSceneObject(page, site.id);
    for (const key of ['map', 'table', 'gantt', 'sources']) {
      const c = await openScreen(page, key);
      await expect(entity(c, site.id).first(), `${key} でハイライトされない`).toHaveAttribute('data-highlight', /selected|related/);
    }
    // 逆方向: 表 → 3D
    const other = mono.entities().filter((e) => e.type === 'site' || e.type === 'part').find((e) => e.id !== site.id)!;
    const table = await openScreen(page, 'table');
    await entity(table, other.id).first().click();
    const v3 = await openScreen(page, 'view3d');
    await expect.poll(async () => (await scene.objects(page)).find((o) => o.entityId === other.id)?.highlighted).toBe(true);
    await expect.poll(async () => (await scene.camera(page)).moving, { timeout: 10_000 }).toBe(false);
    const o = (await scene.objects(page)).find((x) => x.entityId === other.id)!;
    const b = (await v3.locator('canvas').first().boundingBox())!;
    expect(o.visible).toBe(true);
    expect(o.x).toBeGreaterThan(b.x);
    expect(o.x).toBeLessThan(b.x + b.width);
    expect(o.y).toBeGreaterThan(b.y);
    expect(o.y).toBeLessThan(b.y + b.height);
  });
});

// FR-146（AC-243・AC-244）は 2026-10-22 の依頼で廃止予定（画面 view3d の廃止）。ケース E2E-223・E2E-224 は台帳で blocked。テストは削除した。

test.describe('FR-029 停止中の連動', () => {
  // FR-029 AC-035
  test('FR-029 AC-035 アニメーション停止中に項目を選ぶと、カメラとハイライトが次の描画で切り替わる', async ({ page, start }) => {
    await start();
    await openScreen(page, 'view3d');
    await toggleAnimation(page, '停止中');
    const target = leafEntities()[0];
    const table = await openScreen(page, 'table');
    await entity(table, target.id).first().click();
    await nextFrames(page, 2);
    const cam = await scene.camera(page);
    expect(cam.moving).toBe(false);
    expect((await scene.objects(page)).find((o) => o.entityId === target.id)?.highlighted).toBe(true);
    await expect(entity(table, target.id).first()).toHaveAttribute('data-highlight', /selected/);
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    expect(running).toBe(0);
  });
});

test.describe('FR-033 パンくずリストとミニマップ', () => {
  // FR-033 AC-040
  test('FR-033 AC-040 末端まで移動するとパンくずに全階層が並び、上位を選ぶとその視点へ移動し、ミニマップに表示範囲が出る', async ({ page, start }) => {
    await start();
    await openScreen(page, 'view3d');
    const leaf = leafEntities().find((e) => ancestors(e.id).length >= 3)!;
    expect(leaf, 'お手本パックに 3 階層以上の項目がない').toBeTruthy();
    const chain = ancestors(leaf.id);
    await entity(await openScreen(page, 'table'), leaf.id).first().click();
    await openScreen(page, 'view3d');
    const crumbs = page.getByRole('navigation', { name: 'パンくずリスト' });
    for (const a of chain) await expect(crumbs).toContainText(a.name);
    await expect(page.getByTestId('minimap').getByTestId('minimap-viewport')).toBeVisible();
    // 上位の階層名を Enter で選ぶ
    const upper = chain[0];
    const camBefore = await scene.camera(page);
    await crumbs.getByRole('link', { name: upper.name }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => JSON.stringify((await scene.camera(page)).position)).not.toBe(JSON.stringify(camBefore.position));
    await expect(crumbs).not.toContainText(leaf.name);
    // クリックでも
    await entity(await openScreen(page, 'table'), leaf.id).first().click();
    await openScreen(page, 'view3d');
    await crumbs.getByRole('link', { name: chain[1].name }).click();
    await expect(crumbs).not.toContainText(leaf.name);
  });
});

test.describe('FR-034 停止中の階層の切替', () => {
  // FR-034 AC-041
  test('FR-034 AC-041 P で止めてからズームすると、しきい値を越えた時点で下位の階層が表示されパンくずも変わる', async ({ page, start }) => {
    await start();
    const v3 = await openScreen(page, 'view3d');
    await toggleAnimation(page, '停止中');
    const crumbs = page.getByRole('navigation', { name: 'パンくずリスト' });
    const before = await crumbs.innerText();
    const b = (await v3.locator('canvas').first().boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    let changed = false;
    for (let i = 0; i < 30 && !changed; i++) {
      await page.mouse.wheel(0, -200);
      await nextFrames(page, 2);
      changed = (await crumbs.innerText()) !== before;
    }
    expect(changed, 'ズームしてもパンくずの階層が変わらない').toBe(true);
    const visible = (await scene.objects(page)).filter((o) => o.visible).map((o) => o.entityId);
    const level = (await crumbs.innerText()).split(/\n|>|›|\//).map((s) => s.trim()).filter(Boolean);
    const last = mono.entities().find((e) => e.name === level[level.length - 1]);
    expect(last, 'パンくずの末尾が階層の項目ではない').toBeTruthy();
    const children = mono.entities().filter((e) => e.parentId === last.id).map((e) => e.id);
    if (children.length) expect(children.some((c) => visible.includes(c)), '下位の階層が表示されていない').toBe(true);
  });
});

test.describe('FR-035 2D での段階的な表示', () => {
  // FR-035 AC-042
  test('FR-035 AC-042 表の上位の行を展開すると下位が出て折りたたむと隠れ、ガントでも同様', async ({ page, start }) => {
    await start();
    const parent = mono.entities().find((e) => mono.entities().some((c) => c.parentId === e.id) && !e.parentId)!;
    const child = mono.entities().find((c) => c.parentId === parent.id)!;
    const table = await openScreen(page, 'table');
    const row = table.locator(`[role="row"][data-entity-id="${parent.id}"]`);
    if ((await row.getAttribute('aria-expanded')) === 'true') await row.getByRole('button', { name: /折りたたむ|展開/ }).click();
    await expect(table.locator(`[role="row"][data-entity-id="${child.id}"]`)).toHaveCount(0);
    await row.getByRole('button', { name: /展開/ }).click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await expect(table.locator(`[role="row"][data-entity-id="${child.id}"]`)).toBeVisible();
    await row.getByRole('button', { name: /折りたたむ/ }).click();
    await expect(table.locator(`[role="row"][data-entity-id="${child.id}"]`)).toHaveCount(0);
    // ガント
    const pt = mono.tasks().find((t) => mono.tasks().some((c) => c.parentId === t.id))!;
    expect(pt, 'お手本パックに下位の工程を持つ工程がない').toBeTruthy();
    const ct = mono.tasks().find((t) => t.parentId === pt.id)!;
    const gantt = await openScreen(page, 'gantt');
    await gantt.getByRole('radio', { name: '2D' }).check();
    const grow = gantt.locator(`[role="row"][data-entity-id="${pt.id}"]`);
    if ((await grow.getAttribute('aria-expanded')) === 'true') await grow.getByRole('button', { name: /折りたたむ/ }).click();
    await expect(gantt.locator(`[role="row"][data-entity-id="${ct.id}"]`)).toHaveCount(0);
    await grow.getByRole('button', { name: /展開/ }).click();
    await expect(gantt.locator(`[role="row"][data-entity-id="${ct.id}"]`)).toBeVisible();
  });
});

test.describe('FR-065 WebGL2 へのフォールバック', () => {
  // FR-065 AC-080
  test('FR-065 AC-080 WebGPU を無効にしても 3D が描画され、設定パネルに「WebGL2」と表示される', async ({ page, start, pageErrors }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    });
    await start();
    const v3 = await openScreen(page, 'view3d');
    await expectCanvasDrawn(v3.locator('canvas').first());
    const settings = await openScreen(page, 'settings');
    await expect(settings.getByTestId('renderer')).toContainText('WebGL2');
    expect(pageErrors).toEqual([]);
  });
});

test.describe('FR-066 必須の 3D シーン', () => {
  // Q-062 A: 4 つのシーンは既存の画面に帰属する（①Twin ビュー ②KPI/OKR の 3D ③地図 ④アーキテクチャ図）。
  // FR-066 AC-081
  test('FR-066 AC-081 4 つのシーンはそれぞれの画面で 3D 要素が描画されページエラーがなく、業種プリセットでヒーロー（Twin ビュー）が変わる', async ({ page, start, pageErrors }) => {
    await start();
    // ① ヒーロー: Twin ビュー
    const twin = await gotoScreen(page, 'twin-view');
    await chooseView(page, twin, '3D');
    await expectCanvasDrawn(twin.locator('canvas').first());
    expect((await scene.info(page)).objectCount, 'ヒーローの 3D 要素がない').toBeGreaterThan(0);
    // ② KPI タワー: KPI/OKR の 3D
    const kpi = await gotoScreen(page, 'kpi-okr');
    await chooseView(page, kpi, '3D');
    await expect(kpi.locator('[data-zoom-surface="3d"]').first(), 'KPI タワーの 3D 面が表示されない').toBeVisible();
    await expectCanvasDrawn(kpi.locator('canvas').first());
    // ③ データフロー: 地図（流れの粒子）
    const map = await openScreen(page, 'map');
    await expectCanvasDrawn(map.locator('canvas').first());
    // ④ AsIs→ToBe: アーキテクチャ図の 3D（AsIs と ToBe の両方）
    const arch = await gotoScreen(page, 'architecture');
    await chooseView(page, arch, '3D');
    await expectCanvasDrawn(arch.locator('canvas').first());
    await arch.getByRole('radio', { name: 'ToBe' }).check();
    await expectCanvasDrawn(arch.locator('canvas').first());
    await arch.getByRole('radio', { name: 'AsIs' }).check();
    await expectCanvasDrawn(arch.locator('canvas').first());
    expect(pageErrors).toEqual([]);
    const v3 = await gotoScreen(page, 'twin-view');
    await chooseView(page, v3, '3D');
    await toggleAnimation(page, '停止中');
    const before = await v3.locator('canvas').first().screenshot();
    const preset0 = (await scene.info(page)).industryPreset;
    const settings = await openScreen(page, 'settings');
    const combo = settings.getByRole('combobox', { name: '業種プリセット' });
    await combo.click();
    const options = page.getByRole('listbox', { name: '業種プリセット' }).getByRole('option');
    expect(await options.count()).toBeGreaterThanOrEqual(5);
    const other = options.filter({ hasNotText: new RegExp(preset0) }).first();
    await other.click();
    await expect.poll(async () => (await scene.info(page)).industryPreset).not.toBe(preset0);
    const v3b = await gotoScreen(page, 'twin-view');
    await chooseView(page, v3b, '3D');
    await nextFrames(page, 3);
    const after = await v3b.locator('canvas').first().screenshot();
    expect(after.equals(before), '業種プリセットを変えてもヒーローの表示が変わらない').toBe(false);
    expect(pageErrors).toEqual([]);
  });
});

test.describe('FR-069 品質プリセット', () => {
  // FR-069 AC-085
  test('FR-069 AC-085 品質プリセットを 4 段階それぞれに切り替えられ、設定パネルに現在の品質と FPS が出る', async ({ page, start }) => {
    await start();
    const settings = await openScreen(page, 'settings');
    for (const q of ['Low', 'Medium', 'High', 'Ultra']) {
      await settings.getByRole('radio', { name: q }).check();
      await expect(settings.getByTestId('quality-current')).toContainText(q);
      await expect(settings.getByTestId('fps')).toContainText(/\d+(\.\d+)?\s*(fps|FPS)/);
      expect((await scene.info(page)).quality).toBe(q);
    }
  });
});

test.describe('FR-071 グローバルのアニメーション停止', () => {
  // FR-071 AC-087
  test('FR-071 AC-087 P で CSS アニメ・3D の連続描画・動画が止まり、停止中も選択・編集・エクスポートができ、もう一度 P で再開', async ({ page, start }) => {
    await start();
    await recordExportConsent(page); // FR-219: 了承の記録を先に入力する
    await openScreen(page, 'view3d');
    await toggleAnimation(page, '再生中');
    const f0 = await waitFirstFrame(page);
    await page.waitForTimeout(500);
    expect((await scene.info(page)).frame, '再生中に 3D が連続描画されていない').toBeGreaterThan(f0);
    await page.keyboard.press('p');
    await expect(page.getByTestId('animation-state')).toContainText('停止中');
    await page.waitForTimeout(300);
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    expect(running, 'CSS アニメーションが止まっていない').toBe(0);
    const videosPlaying = await page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => !v.paused).length);
    expect(videosPlaying, '動画が一時停止していない').toBe(0);
    const s0 = (await scene.info(page)).frame;
    await page.waitForTimeout(1_000);
    expect((await scene.info(page)).frame - s0, '停止中も 3D が連続描画されている').toBeLessThanOrEqual(1);
    // 停止中も選択・編集・エクスポート
    const table = await openScreen(page, 'table');
    const issue = mono.issues()[0];
    await entity(table, issue.id).first().click();
    await expect(entity(table, issue.id).first()).toHaveAttribute('data-highlight', /selected/);
    await setEditMode(page, true);
    const cell = table.getByRole('gridcell').filter({ hasText: issue.title }).first();
    await cell.dblclick();
    await page.keyboard.press('Control+a');
    await page.keyboard.type(`${issue.title}-停止中`);
    await page.keyboard.press('Enter');
    await expect(table).toContainText(`${issue.title}-停止中`);
    const dl = await captureDownload(page, () => page.keyboard.press('Control+s'));
    expect(dl.data.byteLength).toBeGreaterThan(0);
    // 再開
    await openScreen(page, 'view3d');
    await page.keyboard.press('p');
    await expect(page.getByTestId('animation-state')).toContainText('再生中');
    const r0 = (await scene.info(page)).frame;
    await page.waitForTimeout(500);
    expect((await scene.info(page)).frame).toBeGreaterThan(r0);
  });
});

test.describe('FR-113 表現が成り立たないときの代替表示', () => {
  // FR-113 AC-139
  test('FR-113 AC-139 位置情報のない拠点を含むパックで「位置情報なし: N 件」が出て、選ぶと該当の拠点が表で出る', async ({ page, start }) => {
    const removed: string[] = [];
    const pack = makeVariant('koto', 'no-location', (p) =>
      p.edit('entities', (j) => {
        const list = Array.isArray(j) ? j : j.entities;
        for (const e of list.filter((x: any) => x.type === 'site' && x.location).slice(0, 2)) {
          delete e.location;
          removed.push(e.id);
        }
      }),
    );
    expect(removed.length).toBe(2);
    await start({ pack });
    const map = await openScreen(page, 'map');
    const note = map.getByRole('button', { name: /位置情報なし: 2 件/ });
    await expect(note).toBeVisible();
    const markers = await hook<Array<{ entityId: string }>>(page, 't.map.markers()');
    for (const id of removed) expect(markers.some((m) => m.entityId === id), `${id} が地図に表示されている`).toBe(false);
    await note.click();
    const table = component(page, 'table');
    await expect(table).toBeVisible();
    for (const id of removed) await expect(entity(table, id).first()).toBeVisible();
    await expect(table.getByTestId('count-badge')).toContainText('2');
  });
});

void koto;

// FR-147（AC-246〜AC-250）は 2026-10-22 の依頼で廃止予定（画面 view3d の廃止）。ケース E2E-226〜E2E-230 は台帳で blocked。テストは削除した。
// FR-147 AC-249 が参照していた AC-081・AC-087 は、E2E-169・E2E-171（本ファイルの FR-066・FR-071）で確かめる。
