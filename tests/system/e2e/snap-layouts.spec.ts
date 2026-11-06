// System Test: 上端の中央へのドラッグでのレイアウトの雛形（Snap Layouts 相当）と順次の埋め（FR-305 AC-859・AC-862・AC-864）
// 期待値は要求定義書の受入基準（docs/requirements/app-experience.md の FR-305）と PARAM だけから決める。実装コードは正解にしない。
// PARAM-042=32 CSS px（上端からの距離）、PARAM-143=40%（中央の命中範囲の幅）、PARAM-144=300 ms（滞留時間）、
// PARAM-134=360・PARAM-135=240（全区画がこれ以上の雛形だけを示す）。
// 画面の探し方は tests/system/CONTRACT.md §35（雛形のポップアップ・区画・順次の埋め）、§10（snap-assist）、§21（ピン止め）。
// 区画の期待値（要求の ①〜⑧ の定義から）: ① 左 1/2・右 1/2、⑥ 2×2。区画の番号（data-zone）は AC-864 の順
// （左の列から右の列へ、同じ列は上から下へ。1 始まり）。「画素の丸めを除く」は max(4 px, 1%) の許容で判定する。
import type { CDPSession, Locator, Page } from '@playwright/test';
import { test, expect, component, selectPersona } from '../support/fixtures';
import { box, topKeys, pinButton } from '../support/screens';

const SNAP_EDGE = 32; // PARAM-042
const DWELL_MS = 300; // PARAM-144
const MIN_TARGET = 24; // WCAG 2.2 2.5.8（AC-862）

type Box = { x: number; y: number; width: number; height: number };
type Frac = readonly [number, number, number, number];
/** 雛形の区画（作業領域に対する割合 x, y, w, h）。要求の定義（①・⑥）から。並びは data-zone の順。 */
const LAYOUT: Record<'1' | '6', readonly Frac[]> = {
  '1': [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]],
  '6': [[0, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
};

const workspace = (page: Page) => page.getByTestId('workspace');
const heading = (c: Locator) => c.getByRole('heading').first();
const popup = (page: Page) => page.getByTestId('snap-layouts');
const zoneEl = (page: Page, layout: '1' | '6', zone: number) =>
  popup(page).locator(`[data-testid="snap-layout-zone"][data-layout="${layout}"][data-zone="${zone}"]`);

function zoneRect(ws: Box, layout: '1' | '6', zone: number): Box {
  const [fx, fy, fw, fh] = LAYOUT[layout][zone - 1];
  return { x: ws.x + ws.width * fx, y: ws.y + ws.height * fy, width: ws.width * fw, height: ws.height * fh };
}
function tol(dim: number) {
  return Math.max(4, dim * 0.01);
}
function expectRect(actual: Box, expected: Box, ws: Box, msg: string) {
  expect(Math.abs(actual.x - expected.x), `${msg}: x`).toBeLessThanOrEqual(tol(ws.width));
  expect(Math.abs(actual.y - expected.y), `${msg}: y`).toBeLessThanOrEqual(tol(ws.height));
  expect(Math.abs(actual.width - expected.width), `${msg}: 幅`).toBeLessThanOrEqual(tol(ws.width));
  expect(Math.abs(actual.height - expected.height), `${msg}: 高さ`).toBeLessThanOrEqual(tol(ws.height));
}
function sameRect(a: Box, b: Box, ws: Box) {
  return Math.abs(a.x - b.x) <= tol(ws.width) && Math.abs(a.y - b.y) <= tol(ws.height)
    && Math.abs(a.width - b.width) <= tol(ws.width) && Math.abs(a.height - b.height) <= tol(ws.height);
}
/** 上端の中央の命中範囲の中心（上端から PARAM-042 以内・中央 PARAM-143% の幅）。 */
const hitPoint = (ws: Box) => ({ x: ws.x + ws.width / 2, y: ws.y + SNAP_EDGE / 2 });
const centerOf = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** 入力の種類ごとのドラッグ（実際の入力イベント。マウス=page.mouse、タッチ=CDP の touch、ペン=CDP の pointerType pen）。 */
interface Pointer {
  down(x: number, y: number): Promise<void>;
  move(x: number, y: number): Promise<void>;
  up(x: number, y: number): Promise<void>;
}
function mousePointer(page: Page): Pointer {
  return {
    down: async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); },
    move: (x, y) => page.mouse.move(x, y),
    up: async (x, y) => { await page.mouse.move(x, y); await page.mouse.up(); },
  };
}
function touchPointer(cdp: CDPSession): Pointer {
  return {
    down: async (x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); },
    move: async (x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] }); },
    up: async () => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); },
  };
}
function penPointer(cdp: CDPSession): Pointer {
  const ev = (type: 'mousePressed' | 'mouseMoved' | 'mouseReleased', x: number, y: number, pressed: boolean) =>
    cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: pressed ? 1 : 0, clickCount: 1, pointerType: 'pen' } as never);
  return {
    down: async (x, y) => { await ev('mouseMoved', x, y, false); await ev('mousePressed', x, y, true); },
    move: async (x, y) => { await ev('mouseMoved', x, y, true); },
    up: async (x, y) => { await ev('mouseReleased', x, y, false); },
  };
}
/** 線分を n 段で移動する（ドラッグの開始のしきい値を越えるため）。 */
async function glide(p: Pointer, from: { x: number; y: number }, to: { x: number; y: number }, n = 6) {
  for (let i = 1; i <= n; i++) await p.move(from.x + ((to.x - from.x) * i) / n, from.y + ((to.y - from.y) * i) / n);
}

/** 見出しを掴み、作業領域の中央を経由して上端の中央の命中範囲へ運び、ポップアップが出るまでとどめる。戻り値は命中点。 */
async function dragToHitAndDwell(page: Page, p: Pointer, c: Locator, ws: Box) {
  const h = centerOf(await box(heading(c)));
  const mid = centerOf(ws);
  const hit = hitPoint(ws);
  await p.down(h.x, h.y);
  await glide(p, h, mid);
  await glide(p, mid, hit);
  // PARAM-144 ms とどめる（条件で待つ: ポップアップが出るまで。動かさずにとどめている）
  await expect(popup(page), `上端の中央に ${DWELL_MS} ms とどめても雛形のポップアップが出ない`).toBeVisible();
  return hit;
}
/** ポップアップの区画の上へ動かして離す。 */
async function dropOnZone(page: Page, p: Pointer, from: { x: number; y: number }, layout: '1' | '6', zone: number) {
  const z = zoneEl(page, layout, zone);
  await expect(z, `雛形 ${layout} の区画 ${zone} がポップアップにない`).toBeVisible();
  const to = centerOf(await box(z));
  await glide(p, from, to, 4);
  await p.up(to.x, to.y);
  await expect(popup(page), '区画で離したあともポップアップが残っている').toBeHidden();
}

/** 指定した要素（testid）が一度でも表示されたかを、ページの中で毎フレーム記録する。 */
async function watchAppear(page: Page, testid: string) {
  await page.evaluate((id) => {
    const w = window as unknown as { __seenSt?: Record<string, boolean> };
    w.__seenSt = { ...(w.__seenSt ?? {}), [id]: false };
    const tick = () => {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
      if (el && el.getBoundingClientRect().width > 0) w.__seenSt![id] = true;
      if (!w.__seenSt![id]) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, testid);
  return () => page.evaluate((id) => (window as unknown as { __seenSt: Record<string, boolean> }).__seenSt[id], testid);
}

/** 異常系: PARAM-144 ms に満たずに命中範囲を通り過ぎて離すと、ポップアップが出ず配置も変わらない。 */
async function quickPassShowsNothing(page: Page, p: Pointer, c: Locator, ws: Box, label: string) {
  const seen = await watchAppear(page, 'snap-layouts');
  const h = centerOf(await box(heading(c)));
  const mid = centerOf(ws);
  const hit = hitPoint(ws);
  await p.down(h.x, h.y);
  await glide(p, h, mid);
  const t0 = Date.now();
  await p.move(hit.x, hit.y);
  await p.move(mid.x, mid.y);
  const stayed = Date.now() - t0;
  expect(stayed, `${label}: 前提（命中範囲にとどまった時間が ${DWELL_MS} ms 未満）を作れなかった`).toBeLessThan(DWELL_MS);
  // 不在の確認には時間の経過が要る（滞留時間 + 余裕だけ、命中範囲の外で掴んだまま待つ）
  await page.waitForTimeout(DWELL_MS + 300);
  await p.up(mid.x, mid.y);
  expect(await seen(), `${label}: ${DWELL_MS} ms に満たずに離れたのにポップアップが出た`).toBe(false);
  // 中央で離すのは自由配置の移動（FR-173）なので位置は変わりうる。最大化にならないことだけを確かめる
  expect(await c.getAttribute('data-maximized'), `${label}: 通り過ぎただけで最大化された`).not.toBe('true');
}

async function pin(c: Locator) {
  await c.focus();
  const b = pinButton(c);
  await expect(b).toHaveAccessibleName('ピン止めする');
  await b.click();
  await expect(pinButton(c)).toHaveAccessibleName('ピン止めを外す');
}

test.describe('FR-305 上端の中央へのドラッグでのレイアウトの雛形（マウス）', () => {
  // 既定の構成の下限（FR-296）で 2 行目が画面外にならないよう、FR-152 の E2E と同じ画面の大きさにする（検証内容は変えない）
  test.use({ viewport: { width: 1600, height: 1400 } });

  // FR-305 AC-859（マウス。正常系: とどめるとポップアップ、区画で離すとその位置・大きさ、再読込後も同じ。異常系: 300 ms 未満で離れるとポップアップが出ない）
  test('FR-305 AC-859 マウスで見出しを掴み上端の中央に 300 ms とどめると雛形のポップアップが出て、区画で離すとその位置・大きさで配置され再読込後も同じ。300 ms 未満で離れると出ない', async ({ page, start }) => {
    const app = await start();
    await selectPersona(page, '事業部門');
    const [a] = await topKeys(page);
    const c = component(page, a);
    const ws = await box(workspace(page));
    const m = mousePointer(page);

    // 異常系を先に（配置を変えないため）
    await quickPassShowsNothing(page, m, c, ws, 'マウス');

    const hit = await dragToHitAndDwell(page, m, c, ws);
    // 示す雛形は全区画が PARAM-134×PARAM-135 以上のもの（この作業領域では ①・⑥ が成り立つ）
    await expect(zoneEl(page, '1', 1)).toBeVisible();
    await expect(zoneEl(page, '6', 1)).toBeVisible();
    await dropOnZone(page, m, hit, '1', 2);
    const want = zoneRect(ws, '1', 2);
    expectRect(await box(c), want, ws, '① の右 1/2 に配置');
    await app.reload();
    const ws2 = await box(workspace(page));
    expectRect(await box(component(page, a)), zoneRect(ws2, '1', 2), ws2, '再読込後も ① の右 1/2');
  });

  // FR-305 AC-864（3 区画以上の雛形の順次の埋め。正常系: 次の区画の強調・候補（ピン止め中を除く）・選ぶと配置され次へ。異常系: Esc・候補の外の押下で閉じると配置は変わらず残りは空）
  test('FR-305 AC-864 2×2 の雛形に置くと残りの区画が左の列から順に強調されピン止め中を除く候補が出て、選ぶとその区画いっぱいに置かれ次へ進み、Esc や候補の外を押して閉じると配置は変わらず残りは空のまま', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const ks = await topKeys(page);
    expect(ks.length, '表示中のコンポーネントが 4 つ以上必要（掴む・埋める・ピン止め・残す）').toBeGreaterThanOrEqual(4);
    const [a, , , p] = ks;
    await pin(component(page, p));
    const pinnedBefore = await box(component(page, p));
    const ws = await box(workspace(page));
    const m = mousePointer(page);

    const hit = await dragToHitAndDwell(page, m, component(page, a), ws);
    await dropOnZone(page, m, hit, '6', 1);
    expectRect(await box(component(page, a)), zoneRect(ws, '6', 1), ws, '⑥ の区画 1（左上）に配置');

    const assist = page.getByTestId('snap-assist');
    const current = page.getByTestId('snap-assist-zone');
    await expect(assist, '配置の直後に残りの区画の候補が出ない').toBeVisible();
    // 残りの区画の順: 左の列の下（2）→ 右の列の上（3）→ 右の列の下（4）
    await expect(current).toHaveAttribute('data-zone', '2');
    expectRect(await box(current), zoneRect(ws, '6', 2), ws, '強調された区画 2（左下）');
    const cands = await assist.locator('[data-component-key]').evaluateAll((els) => els.map((e) => e.getAttribute('data-component-key') ?? ''));
    expect(cands, '掴んだコンポーネントが候補にある').not.toContain(a);
    expect(cands, 'ピン止め中のコンポーネントが候補にある').not.toContain(p);
    const others = ks.filter((k) => k !== a && k !== p);
    for (const k of others) expect(cands, `ほかのコンポーネント ${k} が候補にない`).toContain(k);
    const b = others[0];
    await assist.locator(`[data-component-key="${b}"]`).click();
    expectRect(await box(component(page, b)), zoneRect(ws, '6', 2), ws, '選んだ b が区画 2 いっぱいに配置');
    await expect(current, '選んだあと次の区画（右の列の上）へ進まない').toHaveAttribute('data-zone', '3');
    expectRect(await box(current), zoneRect(ws, '6', 3), ws, '強調された区画 3（右上）');

    const expectUnchangedAndEmpty = async (label: string) => {
      expectRect(await box(component(page, a)), zoneRect(ws, '6', 1), ws, `${label}: a の配置`);
      expectRect(await box(component(page, b)), zoneRect(ws, '6', 2), ws, `${label}: b の配置`);
      for (const k of ks.filter((x) => x !== a && x !== b && x !== p)) {
        const kb = await component(page, k).boundingBox();
        if (!kb) continue;
        for (const z of [3, 4]) expect(sameRect(kb, zoneRect(ws, '6', z), ws), `${label}: 閉じたのに ${k} が区画 ${z} に配置された`).toBe(false);
      }
      const pb = await box(component(page, p));
      expect(sameRect(pb, pinnedBefore, ws), `${label}: ピン止め中のコンポーネントが動いた`).toBe(true);
    };
    // 異常系 1: Esc で閉じる
    await page.keyboard.press('Escape');
    await expect(assist, 'Esc で閉じない').toBeHidden();
    await expectUnchangedAndEmpty('Esc');

    // 異常系 2: もう一度 a を区画 1 に置き、候補の外（a の本体）を押して閉じる
    const hit2 = await dragToHitAndDwell(page, m, component(page, a), ws);
    await dropOnZone(page, m, hit2, '6', 1);
    await expect(assist).toBeVisible();
    const outside = centerOf(zoneRect(ws, '6', 1));
    await page.mouse.click(outside.x, outside.y);
    await expect(assist, '候補の外を押しても閉じない').toBeHidden();
    await expectUnchangedAndEmpty('候補の外の押下');
  });
});

test.describe('FR-305 上端の中央へのドラッグでのレイアウトの雛形（タッチ・ペン）', () => {
  test.use({ viewport: { width: 1600, height: 1400 }, hasTouch: true });

  // FR-305 AC-862（タッチ・ペンで AC-859 と同じ結果。区画の操作の対象は 24×24 CSS px 以上。ドラッグ中にページのスクロール・ズームが起きない。異常系: タッチで 300 ms 未満の通過は出ない）
  test('FR-305 AC-862 タッチとペンでも上端の中央にとどめると雛形のポップアップが出て区画どおりに配置され、区画は 24×24 CSS px 以上、ドラッグ中にページのスクロールやズームが起きない', async ({ page, start }) => {
    const app = await start();
    await selectPersona(page, '事業部門');
    const ks = await topKeys(page);
    expect(ks.length, 'コンポーネントが 2 つ以上必要').toBeGreaterThanOrEqual(2);
    const [a, b] = ks;
    const ws = await box(workspace(page));
    const cdp = await page.context().newCDPSession(page);
    const touch = touchPointer(cdp);
    const pen = penPointer(cdp);

    const view = () => page.evaluate(() => ({
      sx: window.scrollX, sy: window.scrollY,
      st: document.scrollingElement?.scrollTop ?? 0, sl: document.scrollingElement?.scrollLeft ?? 0,
      scale: window.visualViewport?.scale ?? 1,
      ox: window.visualViewport?.offsetLeft ?? 0, oy: window.visualViewport?.offsetTop ?? 0,
    }));
    const v0 = await view();

    // 異常系: タッチで命中範囲を 300 ms 未満で通り過ぎるとポップアップが出ない
    await quickPassShowsNothing(page, touch, component(page, a), ws, 'タッチ');

    // タッチ: とどめるとポップアップ。区画の操作の対象は 24×24 CSS px 以上
    const hit = await dragToHitAndDwell(page, touch, component(page, a), ws);
    const zones = popup(page).locator('[data-testid="snap-layout-zone"]');
    const n = await zones.count();
    expect(n, 'ポップアップに区画がない').toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const zb = await zones.nth(i).boundingBox();
      if (!zb) continue; // 表示していない区画は数えない
      const name = `${await zones.nth(i).getAttribute('data-layout')}-${await zones.nth(i).getAttribute('data-zone')}`;
      expect(zb.width, `区画 ${name} の幅が 24 CSS px 未満`).toBeGreaterThanOrEqual(MIN_TARGET);
      expect(zb.height, `区画 ${name} の高さが 24 CSS px 未満`).toBeGreaterThanOrEqual(MIN_TARGET);
    }
    expect(await view(), 'タッチのドラッグ中にページがスクロール・ズームした').toEqual(v0);
    await dropOnZone(page, touch, hit, '1', 1);
    expectRect(await box(component(page, a)), zoneRect(ws, '1', 1), ws, 'タッチで ① の左 1/2 に配置');
    expect(await view(), 'タッチのドラッグでページがスクロール・ズームした').toEqual(v0);

    // ペン: 同じ操作で ① の右 1/2 へ
    const hitPen = await dragToHitAndDwell(page, pen, component(page, b), ws);
    await dropOnZone(page, pen, hitPen, '1', 2);
    expectRect(await box(component(page, b)), zoneRect(ws, '1', 2), ws, 'ペンで ① の右 1/2 に配置');
    expect(await view(), 'ペンのドラッグでページがスクロール・ズームした').toEqual(v0);

    // 再読込しても同じ配置（AC-859 と同じ結果）
    await app.reload();
    const ws2 = await box(workspace(page));
    expectRect(await box(component(page, a)), zoneRect(ws2, '1', 1), ws2, '再読込後も a は ① の左 1/2');
    expectRect(await box(component(page, b)), zoneRect(ws2, '1', 2), ws2, '再読込後も b は ① の右 1/2');
  });
});
