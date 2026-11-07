// System Test: 上端の中央へのドラッグでのレイアウトの雛形（Snap Layouts 相当）と順次の埋め（FR-305 AC-859・AC-862・AC-864）
// 期待値は要求定義書の受入基準（docs/requirements/app-experience.md の FR-305。commit 83951da の改訂）と PARAM だけから決める。
// 実装コードは正解にしない。
// PARAM-042=32 CSS px（上端からの距離）、PARAM-143=40%（中央の命中範囲の幅）、PARAM-144=300 ms（滞留時間）、
// PARAM-134=360・PARAM-135=240（雛形を当てる矩形で全区画がこれ以上の雛形だけを示す）。
// 画面の探し方は tests/system/CONTRACT.md §35（雛形のポップアップ・区画・順次の埋め）、§10（snap-assist・snap-preview）、
// §21（ピン止め）、§34（window-list-item の data-state）。
// 区画の期待値（要求の ①〜⑧ の定義から）: ① 左 1/2・右 1/2、⑥ 2×2。区画の番号（data-zone）は AC-864 の順
// （左の列から右の列へ、同じ列は上から下へ。1 始まり）。「画素の丸めを除く」は max(4 px, 作業領域の 1%) の許容で判定する。
// 雛形を当てる矩形（要求の本文）: 表示中のピン止めがなければ作業領域、あれば作業領域からピン止めの領域を除いた最大の空き矩形
// （面積が同じなら上、次に左）。
import type { CDPSession, Locator, Page } from '@playwright/test';
import { test, expect, component, selectPersona } from '../support/fixtures';
import { box, topKeys, pinButton } from '../support/screens';

const SNAP_EDGE = 32; // PARAM-042
const DWELL_MS = 300; // PARAM-144
const MIN_W = 360; // PARAM-134
const MIN_H = 240; // PARAM-135
const MIN_TARGET = 24; // WCAG 2.2 2.5.8（AC-862）

type Box = { x: number; y: number; width: number; height: number };
type Pt = { x: number; y: number };
type Frac = readonly [number, number, number, number];
/** 雛形の区画（雛形を当てる矩形に対する割合 x, y, w, h）。要求の定義（①・⑥）から。並びは data-zone の順。 */
const LAYOUT: Record<'1' | '6', readonly Frac[]> = {
  '1': [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]],
  '6': [[0, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
};

const workspace = (page: Page) => page.getByTestId('workspace');
const heading = (c: Locator) => c.getByRole('heading').first();
const popup = (page: Page) => page.getByTestId('snap-layouts');
const preview = (page: Page) => page.getByTestId('snap-preview');
const zoneEl = (page: Page, layout: '1' | '6', zone: number) =>
  popup(page).locator(`[data-testid="snap-layout-zone"][data-layout="${layout}"][data-zone="${zone}"]`);

function zoneRect(base: Box, layout: '1' | '6', zone: number): Box {
  const [fx, fy, fw, fh] = LAYOUT[layout][zone - 1];
  return { x: base.x + base.width * fx, y: base.y + base.height * fy, width: base.width * fw, height: base.height * fh };
}
/** 作業領域からピン止めの領域（1 つ）を除いた最大の空き矩形。面積が同じなら上、次に左（要求の本文）。 */
function freeRect(ws: Box, pinBox: Box): Box {
  const l = Math.max(ws.x, pinBox.x), t = Math.max(ws.y, pinBox.y);
  const r = Math.min(ws.x + ws.width, pinBox.x + pinBox.width), b = Math.min(ws.y + ws.height, pinBox.y + pinBox.height);
  if (r <= l || b <= t) return ws;
  const cands: Box[] = [
    { x: ws.x, y: ws.y, width: ws.width, height: t - ws.y }, // 上
    { x: ws.x, y: ws.y, width: l - ws.x, height: ws.height }, // 左
    { x: r, y: ws.y, width: ws.x + ws.width - r, height: ws.height }, // 右
    { x: ws.x, y: b, width: ws.width, height: ws.y + ws.height - b }, // 下
  ];
  const area = (q: Box) => Math.round(Math.max(0, q.width) * Math.max(0, q.height));
  return cands.sort((p, q) => area(q) - area(p) || p.y - q.y || p.x - q.x)[0];
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
const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
/** 上端の中央の命中範囲の中心（上端から PARAM-042 以内・中央 PARAM-143% の幅）。 */
const hitPoint = (ws: Box): Pt => ({ x: ws.x + ws.width / 2, y: ws.y + SNAP_EDGE / 2 });
const centerOf = (b: Box): Pt => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

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
async function glide(p: Pointer, from: Pt, to: Pt, n = 6) {
  for (let i = 1; i <= n; i++) await p.move(from.x + ((to.x - from.x) * i) / n, from.y + ((to.y - from.y) * i) / n);
}

type Seen = { first: number | null; rect: Box | null; last: number | null };
/**
 * 指定した要素（testid）が表示された最初の時刻・そのときの矩形・最後に見えた時刻を、ページの中で毎フレーム記録する。
 * 「ポップアップの前に最大化のプレビューが出て、ポップアップに替わる」の順序と、「出ない」の判定に使う。
 */
async function watch(page: Page, ids: string[]) {
  await page.evaluate((list) => {
    const w = window as unknown as { __stSeen: Record<string, Seen>; __stStop?: boolean };
    w.__stStop = false;
    w.__stSeen = Object.fromEntries(list.map((id) => [id, { first: null, rect: null, last: null }]));
    const tick = () => {
      const now = performance.now();
      for (const id of list) {
        const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
        const r = el?.getBoundingClientRect();
        if (el && r && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') {
          const s = w.__stSeen[id];
          if (s.first === null) { s.first = now; s.rect = { x: r.x, y: r.y, width: r.width, height: r.height }; }
          s.last = now;
        }
      }
      if (!w.__stStop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, ids);
  return () => page.evaluate(() => {
    const w = window as unknown as { __stSeen: Record<string, Seen>; __stStop?: boolean };
    return w.__stSeen;
  });
}

/**
 * 見出しを掴み、作業領域の中央を経由して上端の中央の命中範囲へ運び、ポップアップが出るまでとどめる（AC-859）。
 * とどめている間に、まず FR-152 の上端の最大化のプレビュー（作業領域いっぱい）が示され、PARAM-144 ms 経つとポップアップに替わることも確かめる。
 */
async function dragToHitAndDwell(page: Page, p: Pointer, c: Locator, ws: Box, label: string, checkPreviewRect = true): Promise<Pt> {
  const h = centerOf(await box(heading(c)));
  const mid = centerOf(ws);
  const hit = hitPoint(ws);
  await p.down(h.x, h.y);
  await glide(p, h, mid);
  const read = await watch(page, ['snap-preview', 'snap-layouts']);
  await glide(p, mid, hit);
  // PARAM-144 ms とどめる（条件で待つ: ポップアップが出るまで。動かさずにとどめている）
  await expect(popup(page), `${label}: 上端の中央に ${DWELL_MS} ms とどめても雛形のポップアップが出ない`).toBeVisible();
  await expect(preview(page), `${label}: ポップアップに替わったあとも最大化のプレビューが残っている`).toBeHidden();
  const s = await read();
  expect(s['snap-preview'].first, `${label}: 命中範囲に入ってから ${DWELL_MS} ms までに最大化のプレビューが示されない`).not.toBeNull();
  expect(s['snap-preview'].first!, `${label}: 最大化のプレビューがポップアップより先に出ていない`).toBeLessThan(s['snap-layouts'].first!);
  // 最大化のプレビューの矩形は、ピン止めのない作業領域でだけ確かめる（ピン止めがあるときの最大化の矩形は AC-859・864 の範囲外）
  if (checkPreviewRect) expectRect(s['snap-preview'].rect!, ws, ws, `${label}: ポップアップの前のプレビューが上端の最大化（作業領域いっぱい）でない`);
  return hit;
}
/** ポップアップの区画の上へ動かして離す。 */
async function dropOnZone(page: Page, p: Pointer, from: Pt, layout: '1' | '6', zone: number) {
  const z = zoneEl(page, layout, zone);
  await expect(z, `雛形 ${layout} の区画 ${zone} がポップアップにない`).toBeVisible();
  const to = centerOf(await box(z));
  await glide(p, from, to, 4);
  await p.up(to.x, to.y);
  await expect(popup(page), '区画で離したあともポップアップが残っている').toBeHidden();
}

/** 異常系（AC-859）: PARAM-144 ms に満たずに命中範囲を離れると、ポップアップが出ない。 */
async function quickPassShowsNoPopup(page: Page, p: Pointer, c: Locator, ws: Box, label: string) {
  // 前提（命中範囲の滞在が PARAM-144 ms 未満）は負荷で崩れうる。崩れた試行は判定に数えず、最大 PASS_TRIES 回やり直す。
  // 滞在時間はアプリが実際に処理した時刻（ページ内の pointermove の timeStamp と処理時の performance.now() の大きい方）で測る。
  const PASS_TRIES = 3;
  const mid = centerOf(ws);
  const hit = hitPoint(ws);
  const tried: number[] = [];
  for (let i = 0; i < PASS_TRIES; i++) {
    const h = centerOf(await box(heading(c)));
    await p.down(h.x, h.y);
    await glide(p, h, mid);
    const read = await watch(page, ['snap-layouts']);
    await page.evaluate(() => {
      const w = window as unknown as { __stMoves: { y: number; ts: number; now: number }[]; __stMoveOff?: () => void };
      w.__stMoveOff?.();
      w.__stMoves = [];
      const on = (e: PointerEvent) => { w.__stMoves.push({ y: e.clientY, ts: e.timeStamp, now: performance.now() }); };
      window.addEventListener('pointermove', on, true);
      w.__stMoveOff = () => window.removeEventListener('pointermove', on, true);
    });
    const t0 = Date.now();
    await p.move(hit.x, hit.y);
    await p.move(mid.x, mid.y);
    const nodeStayed = Date.now() - t0;
    const pageStayed = await page.evaluate((edge) => {
      const w = window as unknown as { __stMoves: { y: number; ts: number; now: number }[]; __stMoveOff?: () => void };
      w.__stMoveOff?.();
      const m = w.__stMoves;
      const iIn = m.findIndex((e) => e.y <= edge);
      const out = iIn < 0 ? undefined : m.slice(iIn + 1).find((e) => e.y > edge);
      return iIn < 0 || !out ? null : Math.max(out.ts - m[iIn].ts, out.now - m[iIn].now);
    }, ws.y + SNAP_EDGE);
    // ページ内で入る・出るの両方を観測できなかったときは Node 側の時間で代える
    const stayed = pageStayed ?? nodeStayed;
    tried.push(Math.round(stayed));
    if (stayed >= DWELL_MS) {
      // 前提が崩れた試行: 中央で離して（ポップアップが閉じるのを待って）やり直す
      await p.up(mid.x, mid.y);
      await expect(popup(page)).toBeHidden();
      continue;
    }
    // 不在の確認には時間の経過が要る（滞留時間 + 余裕だけ、命中範囲の外で掴んだまま待つ）
    await page.waitForTimeout(DWELL_MS + 300);
    await p.up(mid.x, mid.y);
    expect((await read())['snap-layouts'].first, `${label}: ${DWELL_MS} ms に満たずに離れたのにポップアップが出た`).toBeNull();
    break;
  }
  expect(Math.min(...tried), `${label}: 前提（命中範囲にとどまった時間が ${DWELL_MS} ms 未満）を ${PASS_TRIES} 回とも作れなかった（実測 ${tried.join(', ')} ms）`).toBeLessThan(DWELL_MS);
  // 中央で離すのは自由配置の移動（FR-173）なので位置は変わりうる。最大化にならないことだけを確かめる
  expect(await c.getAttribute('data-maximized'), `${label}: 通り過ぎただけで最大化された`).not.toBe('true');
}

/**
 * 異常系（AC-859）: 命中範囲に入って PARAM-144 ms 未満で離すと、最大化のプレビューのとおり最大化され（AC-793 の上端と同じ）、ポップアップは出ない。
 * 前提（入ってから離すまでが PARAM-144 ms 未満）は負荷で崩れうる。滞在はページ内の時刻（pointermove／pointerup の timeStamp と
 * 処理時の performance.now() の大きい方）で測り、プレビューの確認はページ内で記録して測定時間に Node との往復を含めない。
 * 崩れた試行は判定に数えず、restore（元の配置に戻す）をしてから最大 TRIES 回やり直す。判定（最大化・プレビュー・ポップアップなし）は緩めない。
 */
async function quickReleaseMaximizes(page: Page, p: Pointer, c: Locator, ws: Box, label: string, restore: () => Promise<void>) {
  const TRIES = 3;
  const GO_BEFORE = DWELL_MS - 100; // 離す操作の往復の余裕。これを過ぎてからは離さず、中央で離して元に戻す
  const mid = centerOf(ws);
  const hit = hitPoint(ws);
  const edge = ws.y + SNAP_EDGE;
  const tried: string[] = [];
  for (let i = 0; i < TRIES; i++) {
    const h = centerOf(await box(heading(c)));
    await p.down(h.x, h.y);
    await glide(p, h, mid);
    const read = await watch(page, ['snap-preview', 'snap-layouts']);
    await page.evaluate(() => {
      type Ev = { k: string; y: number; ts: number; now: number };
      const w = window as unknown as { __stEv: Ev[]; __stEvOff?: () => void };
      w.__stEvOff?.();
      w.__stEv = [];
      const on = (e: PointerEvent) => { w.__stEv.push({ k: e.type, y: e.clientY, ts: e.timeStamp, now: performance.now() }); };
      for (const t of ['pointermove', 'pointerup', 'pointercancel']) window.addEventListener(t, on as EventListener, true);
      w.__stEvOff = () => { for (const t of ['pointermove', 'pointerup', 'pointercancel']) window.removeEventListener(t, on as EventListener, true); };
    });
    const t0 = Date.now();
    await p.move(hit.x, hit.y);
    // 入った時刻から GO_BEFORE ms までに最大化のプレビューが示されるかを、ページ内で（1 回の往復で）待つ
    const gate = await page.evaluate(({ edge, limit }) => new Promise<{ seen: boolean; elapsed: number | null }>((resolve) => {
      type Ev = { k: string; y: number; ts: number; now: number };
      const w = window as unknown as { __stEv: Ev[] };
      const start = performance.now();
      const tick = () => {
        const e = w.__stEv.find((x) => x.k === 'pointermove' && x.y <= edge);
        const el = document.querySelector('[data-testid="snap-preview"]') as HTMLElement | null;
        const r = el?.getBoundingClientRect();
        const seen = !!(el && r && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden');
        const elapsed = e ? performance.now() - Math.min(e.now, e.ts) : null;
        if (seen && elapsed !== null) return resolve({ seen, elapsed });
        if ((elapsed ?? performance.now() - start) >= limit) return resolve({ seen, elapsed });
        requestAnimationFrame(tick);
      };
      tick();
    }), { edge, limit: GO_BEFORE });
    if (!gate.seen || gate.elapsed === null || gate.elapsed >= GO_BEFORE) {
      // 前提が崩れた試行（離す前）: 中央で離し、ポップアップが閉じるのを待って元の配置に戻す
      tried.push(`離す前 ${gate.elapsed === null ? '入場未観測' : Math.round(gate.elapsed)} ms${gate.seen ? '' : '・プレビュー未表示'}`);
      await glide(p, hit, mid, 3);
      await p.up(mid.x, mid.y);
      await page.evaluate(() => (window as unknown as { __stEvOff?: () => void }).__stEvOff?.());
      await expect(popup(page)).toBeHidden();
      await restore();
      continue;
    }
    await p.up(hit.x, hit.y);
    const nodeStayed = Date.now() - t0;
    const pageStayed = await page.evaluate((edge) => {
      type Ev = { k: string; y: number; ts: number; now: number };
      const w = window as unknown as { __stEv: Ev[]; __stEvOff?: () => void };
      w.__stEvOff?.();
      const m = w.__stEv;
      const iIn = m.findIndex((e) => e.k === 'pointermove' && e.y <= edge);
      const up = iIn < 0 ? undefined : m.slice(iIn + 1).find((e) => e.k !== 'pointermove');
      return iIn < 0 || !up ? null : Math.max(up.ts - m[iIn].ts, up.now - m[iIn].now);
    }, edge);
    // ページ内で入る・離すの両方を観測できなかったときは Node 側の時間（プレビューの確認を含むので長めに出る）で代える
    const stayed = pageStayed ?? nodeStayed;
    if (stayed >= DWELL_MS) {
      // 前提が崩れた試行（離した後）: 結果は判定に数えず、元の配置に戻してやり直す
      tried.push(`離すまで ${Math.round(stayed)} ms`);
      await expect(popup(page)).toBeHidden();
      await restore();
      continue;
    }
    tried.push(`${Math.round(stayed)} ms`);
    await expect(c, `${label}: ${DWELL_MS} ms 未満（${Math.round(stayed)} ms）で離したのに最大化されない`).toHaveAttribute('data-maximized', 'true');
    expectRect(await box(c), ws, ws, `${label}: 最大化の配置（作業領域いっぱい）`);
    await expect(popup(page)).toHaveCount(0);
    const s = await read();
    expect(s['snap-preview'].first, `${label}: 命中範囲に入っても最大化のプレビューが示されない`).not.toBeNull();
    expectRect(s['snap-preview'].rect!, ws, ws, `${label}: 最大化のプレビュー`);
    expect(s['snap-layouts'].first, `${label}: ${DWELL_MS} ms 未満で離したのにポップアップが出た`).toBeNull();
    return;
  }
  throw new Error(`${label}: 前提（命中範囲に入って最大化のプレビューが示され、${DWELL_MS} ms 未満で離す）を ${TRIES} 回とも作れなかった（${tried.join(' / ')}）`);
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

  // FR-305 AC-859（マウス。正常系: 最大化のプレビュー→300 ms でポップアップに替わる、区画で離すとその位置・大きさ、再読込後も同じ。
  // 異常系: 300 ms 未満で命中範囲を離れるとポップアップが出ない／300 ms 未満で離すと最大化されポップアップは出ない）
  test('FR-305 AC-859 マウスで上端の中央に入るとまず最大化のプレビュー、300 ms とどめると雛形のポップアップに替わり、区画で離すとその位置・大きさで配置され再読込後も同じ。300 ms 未満で離れると出ず、300 ms 未満で離すと最大化される', async ({ page, start }) => {
    const app = await start();
    await selectPersona(page, '事業部門');
    const [a] = await topKeys(page);
    const c = component(page, a);
    const ws = await box(workspace(page));
    const m = mousePointer(page);

    // 異常系 1 を先に（配置を変えないため）
    await quickPassShowsNoPopup(page, m, c, ws, 'マウス');

    const hit = await dragToHitAndDwell(page, m, c, ws, 'マウス');
    // 示す雛形は全区画が PARAM-134×PARAM-135 以上のもの（ピン止めなし＝作業領域。この大きさでは ①・⑥ が成り立つ）
    expect(ws.width / 2 >= MIN_W && ws.height / 2 >= MIN_H, '前提: 作業領域で ⑥ が成り立つ大きさ').toBe(true);
    await expect(zoneEl(page, '1', 1)).toBeVisible();
    await expect(zoneEl(page, '6', 1)).toBeVisible();
    await dropOnZone(page, m, hit, '1', 2);
    expectRect(await box(c), zoneRect(ws, '1', 2), ws, '① の右 1/2 に配置');
    await app.reload();
    const ws2 = await box(workspace(page));
    expectRect(await box(component(page, a)), zoneRect(ws2, '1', 2), ws2, '再読込後も ① の右 1/2');

    // 異常系 2: 300 ms 未満で離すと最大化（ポップアップは出ない）
    // 前提が崩れた試行の後は、a を ① の右 1/2 に置き直して元の配置に戻す
    await quickReleaseMaximizes(page, m, component(page, a), ws2, 'マウス', async () => {
      await dropOnZone(page, m, await dragToHitAndDwell(page, m, component(page, a), ws2, 'マウス（元に戻す）'), '1', 2);
      expectRect(await box(component(page, a)), zoneRect(ws2, '1', 2), ws2, '元の配置（① の右 1/2）に戻す');
    });
  });

  // FR-305 AC-866 AC-867 AC-868（検証レベルはいずれも integration のため台帳の ac_ids には入れない。AC-859 のポップアップの表示・消去の延長として、同じ run.mjs の AC-859 で実行する）。
  // Q-073 A。ポップアップの表示後の離し方（commit 640c9ff の改訂、f07e033 で AC-867・868・869 に分割）。マウス（実入力）で確かめる。
  // AC-869（共有する境界のリサイズ）は FR-152 の AC-796 と同じ挙動で integration のため、ここでは扱わない。
  // ① ポップアップ（または命中範囲）の内側で離す → ポップアップが閉じ、配置は操作の前と同じ（AC-866）。
  // ② 外へ出て、どの端・角の範囲でもない位置で離す → ポップアップは外へ出た時点で閉じ、離しても最大化・半分にならない（AC-867）。戻らない間は再表示されない。
  // ③ 外へ出て左端（端から PARAM-042 以内）で離す → ポップアップは外へ出た時点で閉じ、AC-793 の左半分になる（AC-867）。
  // ④ 外へ出たあと同じドラッグで命中範囲へ戻り PARAM-144 ms とどまる → 再び表示され、区画で離すとその配置になる（AC-868）。
  // ⑤ 外へ出て、命中範囲の外の上端で離す → ポップアップは閉じ、AC-793 の最大化になる（AC-867）。
  // ポップアップを出すまでは dragToHitAndDwell が PARAM-144 ms の滞留・プレビュー→ポップアップの順を確かめる。
  // 再表示までの時間は、ページ内の pointermove の時刻（timeStamp と performance.now の小さい方を入場時刻とする）と
  // 毎フレームの表示記録の差で測り、Node の往復を含めない（負荷で下限の判定が緩む向きにだけずれる）。
  test('FR-305 AC-859 AC-866 AC-867 AC-868 マウスでポップアップの内側で離すと配置不変、外へ出ると閉じて端・角ならスナップ（左端は左半分・命中範囲の外の上端は最大化）・端でない位置なら配置不変、戻って PARAM-144 ms とどまると再表示される', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const [a] = await topKeys(page);
    const c = component(page, a);
    const ws = await box(workspace(page));
    const m = mousePointer(page);
    const mid = centerOf(ws);
    const leftEdge: Pt = { x: ws.x + SNAP_EDGE / 2, y: ws.y + ws.height / 2 }; // 左端から PARAM-042 以内で、角ではない
    const before = await box(c);

    // ① AC-866: 命中範囲の内側で離す → ポップアップが閉じ、配置は操作の前と同じ
    const hit = await dragToHitAndDwell(page, m, c, ws, 'マウス（命中範囲の内側）');
    await m.up(hit.x, hit.y);
    await expect(popup(page), '命中範囲の内側で離したのにポップアップが閉じない').toBeHidden();
    await expect(c, '命中範囲の内側で離したときに最大化された').not.toHaveAttribute('data-maximized', 'true');
    expectRect(await box(c), before, ws, '命中範囲の内側で離したあとの配置（操作の前と同じ）');

    // ② AC-867: 外へ出て、端・角のどの範囲でもない位置（作業領域の中央）で離す → 閉じる・配置の大きさは変わらない
    await dragToHitAndDwell(page, m, c, ws, 'マウス（端でない位置で離す）');
    await glide(m, hit, mid, 4);
    await expect(popup(page), '外へ出てもポップアップが閉じない').toBeHidden();
    await page.waitForTimeout(DWELL_MS + 300); // 戻らない間は再表示されない（不在の確認には時間の経過が要る）
    await expect(popup(page), '外に出たままなのにポップアップが再表示された').toBeHidden();
    await m.up(mid.x, mid.y);
    await expect(popup(page)).toBeHidden();
    const afterB = await box(c);
    expect(Math.abs(afterB.width - before.width), '端でない位置で離して幅が変わった（スナップ・最大化された）').toBeLessThanOrEqual(tol(ws.width));
    expect(Math.abs(afterB.height - before.height), '端でない位置で離して高さが変わった（スナップ・最大化された）').toBeLessThanOrEqual(tol(ws.height));
    await expect(c, '端でない位置で離して最大化された').not.toHaveAttribute('data-maximized', 'true');

    // ③ AC-867: 外へ出て左端で離す → ポップアップは外へ出た時点で閉じ、AC-793 の左半分になる
    const hit3 = await dragToHitAndDwell(page, m, c, ws, 'マウス（左端で離す）');
    await glide(m, hit3, leftEdge, 6);
    await expect(popup(page), '外へ出て左端へ動かしてもポップアップが閉じない').toBeHidden();
    await m.up(leftEdge.x, leftEdge.y);
    await expect(popup(page)).toBeHidden();
    expectRect(await box(c), zoneRect(ws, '1', 1), ws, '左端で離したときの配置（AC-793: 左半分）');

    // ④ AC-868: 外へ出て閉じたあと、同じドラッグで命中範囲へ戻り PARAM-144 ms とどまると再表示され、区画で離すとその配置になる
    const hit4 = await dragToHitAndDwell(page, m, c, ws, 'マウス（再表示）');
    await glide(m, hit4, mid, 4);
    await expect(popup(page), '外へ出てもポップアップが閉じない（再表示の前提）').toBeHidden();
    const readD = await watch(page, ['snap-layouts']);
    await page.evaluate((edgeY) => {
      const w = window as unknown as { __stRe?: number; __stReOff?: () => void };
      w.__stReOff?.();
      w.__stRe = undefined;
      const on = (e: PointerEvent) => {
        if (w.__stRe === undefined && e.clientY <= edgeY) w.__stRe = Math.min(e.timeStamp, performance.now());
      };
      window.addEventListener('pointermove', on, true);
      w.__stReOff = () => window.removeEventListener('pointermove', on, true);
    }, ws.y + SNAP_EDGE);
    await glide(m, mid, hit4, 4);
    await expect(popup(page), `命中範囲へ戻って ${DWELL_MS} ms とどまっても再表示されない`).toBeVisible();
    const reEntered = await page.evaluate(() => (window as unknown as { __stRe?: number; __stReOff?: () => void }).__stRe);
    await page.evaluate(() => (window as unknown as { __stReOff?: () => void }).__stReOff?.());
    const reSeen = (await readD())['snap-layouts'].first;
    expect(reEntered, '命中範囲へ戻った時刻をページ内で観測できない').not.toBeUndefined();
    expect(reSeen! - reEntered!, `命中範囲へ戻ってから ${DWELL_MS} ms 経つ前に再表示された`).toBeGreaterThanOrEqual(DWELL_MS - 30);
    await dropOnZone(page, m, hit4, '1', 2);
    expectRect(await box(c), zoneRect(ws, '1', 2), ws, '再表示した ① の右 1/2 に配置');

    // ⑤ AC-867: 外へ出て、命中範囲の外の上端（上端から PARAM-042 以内で、中央の幅の外。角ではない）で離す → ポップアップは閉じ、AC-793 の最大化になる
    const hit5 = await dragToHitAndDwell(page, m, c, ws, 'マウス（命中範囲の外の上端で離す）');
    const topOutside: Pt = { x: ws.x + ws.width * 0.1, y: ws.y + SNAP_EDGE / 2 };
    await glide(m, hit5, topOutside, 8);
    await expect(popup(page), '外へ出て命中範囲の外の上端へ動かしてもポップアップが閉じない').toBeHidden();
    await m.up(topOutside.x, topOutside.y);
    await expect(popup(page)).toBeHidden();
    await expect(c, '命中範囲の外の上端で離したのに最大化されない（AC-793）').toHaveAttribute('data-maximized', 'true');
    expectRect(await box(c), ws, ws, '命中範囲の外の上端で離したときの配置（AC-793: 最大化＝作業領域いっぱい）');
  });

  // FR-305 AC-866 AC-868 AC-870 AC-871（検証レベルはいずれも integration のため台帳の ac_ids には入れない。AC-859 のポップアップの延長として
  // 同じ run.mjs の AC-859 で実行する）。commit 60ff46b（Q-074〜077 A）の改訂に合わせる。
  // ① Esc（AC-870・866）: ポップアップが閉じ、ドラッグも取りやめになり、掴んでいたコンポーネントは掴む前の位置・大きさへ戻る。
  //    その後ポインターを動かしても、命中範囲・左端・命中範囲の外の上端で離しても配置は何も変わらない（最大化・半分にならない）。
  // ② Esc で閉じたものは、命中範囲へ戻って PARAM-144 ms 経っても再表示されない（AC-868）。
  // ③ 外へ出て閉じたあと、同じドラッグで命中範囲へ戻り PARAM-144 ms に満たずに離すと、上端の最大化（AC-793 の上端と同じ配置）になる。
  //    ポップアップは再表示されない（AC-871・AC-868）。
  test('FR-305 AC-859 AC-866 AC-868 AC-870 AC-871 Esc でポップアップが閉じドラッグも取りやめて掴む前の位置・大きさへ戻り再表示されず離しても配置不変、外へ出て閉じたあと命中範囲へ戻り PARAM-144 ms 未満で離すと最大化', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const [a] = await topKeys(page);
    const c = component(page, a);
    const ws = await box(workspace(page));
    const m = mousePointer(page);
    const mid = centerOf(ws);
    const leftEdge: Pt = { x: ws.x + SNAP_EDGE / 2, y: ws.y + ws.height / 2 };
    const topOutside: Pt = { x: ws.x + ws.width * 0.1, y: ws.y + SNAP_EDGE / 2 };
    const before = await box(c);
    const expectUnchanged = async (msg: string) => {
      await expect(popup(page), `${msg}: ポップアップが残っている`).toBeHidden();
      await expect(c, `${msg}: 最大化された`).not.toHaveAttribute('data-maximized', 'true');
      expectRect(await box(c), before, ws, `${msg}: 掴む前の位置・大きさ`);
    };

    // ① AC-870・866: Esc でポップアップが閉じ、ドラッグも取りやめ（掴む前の位置・大きさへ戻る）
    const hit = await dragToHitAndDwell(page, m, c, ws, 'マウス（Esc）');
    await page.keyboard.press('Escape');
    await expect(popup(page), 'Esc でポップアップが閉じない').toBeHidden();
    await expect(preview(page), 'Esc のあとに最大化のプレビューが出ている').toBeHidden();
    expectRect(await box(c), before, ws, 'Esc で取りやめたあとの位置・大きさ（掴む前へ戻る）');
    // ② AC-868: Esc で閉じたものは、命中範囲へ戻って PARAM-144 ms 経っても再表示されない
    await glide(m, hit, mid, 4);
    await glide(m, mid, hit, 4);
    await page.waitForTimeout(DWELL_MS + 300); // 不在の確認には時間の経過が要る
    await expect(popup(page), 'Esc で閉じたのに命中範囲へ戻ると再表示された').toBeHidden();
    // 取りやめたあとは、端・角・命中範囲で離しても配置は何も変わらない（AC-870）
    await glide(m, hit, leftEdge, 6);
    await m.up(leftEdge.x, leftEdge.y);
    await expectUnchanged('Esc のあと左端で離した');
    // もう一度: Esc のあと命中範囲の外の上端で離しても最大化されない
    const hit1b = await dragToHitAndDwell(page, m, c, ws, 'マウス（Esc のあと上端）');
    await page.keyboard.press('Escape');
    await expect(popup(page)).toBeHidden();
    await glide(m, hit1b, topOutside, 8);
    await m.up(topOutside.x, topOutside.y);
    await expectUnchanged('Esc のあと命中範囲の外の上端で離した');

    // ③ AC-871・868: 外へ出て閉じたあと、命中範囲へ戻って PARAM-144 ms に満たずに離す → 上端の最大化
    // 前提（戻ってから離すまでが PARAM-144 ms 未満）は負荷で崩れうる。滞在はページ内の時刻（pointermove／pointerup の timeStamp と
    // 処理時の performance.now() の大きい方）で測る。崩れた試行（命中範囲の内側で離す＝配置不変、AC-866）はやり直す。判定は緩めない。
    const TRIES = 3;
    const hitEdge = ws.y + SNAP_EDGE;
    const tried: number[] = [];
    let done = false;
    for (let i = 0; i < TRIES && !done; i++) {
      const hit3 = await dragToHitAndDwell(page, m, c, ws, 'マウス（再突入して滞留前に離す）');
      await glide(m, hit3, mid, 4);
      await expect(popup(page), '外へ出てもポップアップが閉じない（再突入の前提）').toBeHidden();
      const read = await watch(page, ['snap-layouts']);
      await page.evaluate(() => {
        type Ev = { k: string; y: number; ts: number; now: number };
        const w = window as unknown as { __stEv3: Ev[]; __stEv3Off?: () => void };
        w.__stEv3Off?.();
        w.__stEv3 = [];
        const on = (e: PointerEvent) => { w.__stEv3.push({ k: e.type, y: e.clientY, ts: e.timeStamp, now: performance.now() }); };
        for (const t of ['pointermove', 'pointerup']) window.addEventListener(t, on as EventListener, true);
        w.__stEv3Off = () => { for (const t of ['pointermove', 'pointerup']) window.removeEventListener(t, on as EventListener, true); };
      });
      await m.move(hit3.x, hit3.y);
      await m.up(hit3.x, hit3.y);
      const stayed = await page.evaluate((edge) => {
        const w = window as unknown as { __stEv3: { k: string; y: number; ts: number; now: number }[]; __stEv3Off?: () => void };
        w.__stEv3Off?.();
        const ev = w.__stEv3;
        const iIn = ev.findIndex((e) => e.k === 'pointermove' && e.y <= edge);
        const up = ev.find((e) => e.k === 'pointerup');
        return iIn < 0 || !up ? null : Math.max(up.ts - ev[iIn].ts, up.now - ev[iIn].now);
      }, hitEdge);
      const seen = (await read())['snap-layouts'].first;
      tried.push(stayed === null ? -1 : Math.round(stayed));
      if (stayed === null || stayed >= DWELL_MS - 50) {
        // 前提が崩れた試行: 命中範囲の内側で離しているので配置は変わらない（AC-866）。確かめてやり直す
        await expectUnchanged('前提が崩れた試行（命中範囲の内側で離した）');
        continue;
      }
      expect(seen, `戻って ${DWELL_MS} ms に満たずに離したのにポップアップが再表示された`).toBeNull();
      await expect(popup(page)).toBeHidden();
      await expect(c, '再突入して滞留前に離したのに上端の最大化にならない（AC-871）').toHaveAttribute('data-maximized', 'true');
      expectRect(await box(c), ws, ws, '再突入して滞留前に離したときの配置（AC-793 の上端: 最大化＝作業領域いっぱい）');
      done = true;
    }
    expect(done, `前提（戻ってから離すまでが ${DWELL_MS} ms 未満）を ${TRIES} 回とも作れなかった（実測 ${tried.join(', ')} ms）`).toBe(true);
  });

  // FR-305 AC-864（3 区画以上の雛形の順次の埋め。正常系: 次の区画の強調・候補〔表示中・ピン止め以外〕・選ぶと配置され次へ。
  // 異常系: Esc・候補の外の押下で閉じると配置は変わらず、残りの区画はどのコンポーネントにも割り当てられない）
  test('FR-305 AC-864 2×2 の雛形に置くと残りの区画が左の列から順に強調され表示中でピン止め以外の候補が出て、選ぶとその区画いっぱいに置かれ次へ進み、Esc や候補の外を押して閉じると配置は変わらず残りの区画は割り当てられない', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const ks = await topKeys(page);
    expect(ks.length, '表示中のコンポーネントが 4 つ以上必要（掴む・埋める・ピン止め・残す）').toBeGreaterThanOrEqual(4);
    const [a, , , p] = ks;
    // 最小化・閉じたもの（候補に出してはならない）
    const hiddenKeys = await page.locator('[data-testid="window-list-item"][data-state="minimized"], [data-testid="window-list-item"][data-state="closed"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-component-key') ?? ''));
    await pin(component(page, p));
    const pinnedBefore = await box(component(page, p));
    const ws = await box(workspace(page));
    // 雛形を当てる矩形: 作業領域からピン止めの領域を除いた最大の空き矩形
    const base = freeRect(ws, pinnedBefore);
    expect(base.width / 2 >= MIN_W && base.height / 2 >= MIN_H, `前提: ピン止めを除いた空き矩形（${Math.round(base.width)}×${Math.round(base.height)}）で ⑥ が成り立つ`).toBe(true);
    const m = mousePointer(page);

    const hit = await dragToHitAndDwell(page, m, component(page, a), ws, 'マウス', false);
    await dropOnZone(page, m, hit, '6', 1);
    const aBox = await box(component(page, a));
    expectRect(aBox, zoneRect(base, '6', 1), ws, '⑥ の区画 1（空き矩形の左上）に配置');
    expect(overlapArea(aBox, pinnedBefore), '雛形の区画がピン止めの領域と重なる').toBeLessThanOrEqual(4 * Math.max(aBox.width, aBox.height));

    const assist = page.getByTestId('snap-assist');
    const current = page.getByTestId('snap-assist-zone');
    await expect(assist, '配置の直後に残りの区画の候補が出ない').toBeVisible();
    // 残りの区画の順: 左の列の下（2）→ 右の列の上（3）→ 右の列の下（4）
    await expect(current).toHaveAttribute('data-zone', '2');
    expectRect(await box(current), zoneRect(base, '6', 2), ws, '強調された区画 2（左下）');
    const cands = await assist.locator('[data-component-key]').evaluateAll((els) => els.map((e) => e.getAttribute('data-component-key') ?? ''));
    expect(cands, '掴んだコンポーネントが候補にある').not.toContain(a);
    expect(cands, 'ピン止め中のコンポーネントが候補にある').not.toContain(p);
    for (const k of hiddenKeys) expect(cands, `最小化・閉じた ${k} が候補にある`).not.toContain(k);
    const others = ks.filter((k) => k !== a && k !== p);
    for (const k of others) expect(cands, `表示中のほかのコンポーネント ${k} が候補にない`).toContain(k);
    const b = others[0];
    await assist.locator(`[data-component-key="${b}"]`).click();
    expectRect(await box(component(page, b)), zoneRect(base, '6', 2), ws, '選んだ b が区画 2 いっぱいに配置');
    await expect(current, '選んだあと次の区画（右の列の上）へ進まない').toHaveAttribute('data-zone', '3');
    expectRect(await box(current), zoneRect(base, '6', 3), ws, '強調された区画 3（右上）');

    // 閉じる前の、まだ割り当てられていないコンポーネントの位置・大きさ（閉じても割り当てられない＝変わらない。背面に見えてもよい）
    const rest = ks.filter((x) => x !== a && x !== b && x !== p);
    const snapshot = async () => Object.fromEntries(await Promise.all(rest.map(async (k) => [k, await component(page, k).boundingBox()] as const)));
    const expectClosedUnchanged = async (label: string, restBefore: Record<string, Box | null>) => {
      expectRect(await box(component(page, a)), zoneRect(base, '6', 1), ws, `${label}: a の配置`);
      expectRect(await box(component(page, b)), zoneRect(base, '6', 2), ws, `${label}: b の配置`);
      for (const k of rest) {
        const now = await component(page, k).boundingBox();
        const was = restBefore[k];
        if (was && now) expect(sameRect(now, was, ws), `${label}: 閉じたのに ${k} が残りの区画に割り当てられた（位置・大きさが変わった）`).toBe(true);
        for (const z of [3, 4]) if (now && (!was || !sameRect(was, zoneRect(base, '6', z), ws))) {
          expect(sameRect(now, zoneRect(base, '6', z), ws), `${label}: 閉じたのに ${k} が区画 ${z} に割り当てられた`).toBe(false);
        }
      }
      expect(sameRect(await box(component(page, p)), pinnedBefore, ws), `${label}: ピン止め中のコンポーネントが動いた`).toBe(true);
    };
    // 異常系 1: Esc で閉じる
    const before1 = await snapshot();
    await page.keyboard.press('Escape');
    await expect(assist, 'Esc で閉じない').toBeHidden();
    await expectClosedUnchanged('Esc', before1);

    // 異常系 2: もう一度 a を区画 1 に置き、候補の外（a の本体）を押して閉じる
    const hit2 = await dragToHitAndDwell(page, m, component(page, a), ws, 'マウス（2 回目）', false);
    await dropOnZone(page, m, hit2, '6', 1);
    await expect(assist).toBeVisible();
    const before2 = await snapshot();
    const outside = centerOf(zoneRect(base, '6', 1));
    await page.mouse.click(outside.x, outside.y);
    await expect(assist, '候補の外を押しても閉じない').toBeHidden();
    await expectClosedUnchanged('候補の外の押下', before2);
  });
});

test.describe('FR-305 上端の中央へのドラッグでのレイアウトの雛形（タッチ・ペン）', () => {
  test.use({ viewport: { width: 1600, height: 1400 }, hasTouch: true });

  // FR-305 AC-862（タッチ・ペンで AC-859 と同じ結果〔最大化のプレビュー→ポップアップ、区画どおりの配置と再読込、300 ms 未満の通過は出ない・
  // 300 ms 未満の離しは最大化〕。区画の操作の対象は 24×24 CSS px 以上。ドラッグ中にページのスクロール・ズームが起きない）
  // 入力の種類ごとに初期配置から始める（独立した事前条件）。1 つのテストで続けると、先に区画へ置いたコンポーネントが、
  // 区画に置かれていないほかのコンポーネントを AC-865 のとおり背面に回して覆い、次の入力で掴めなくなるため。
  // どちらも AC-859 と同じ操作（掴む対象は初期配置の最初のコンポーネント、置く先は ① の左 1/2）で、結果も同じであることを確かめる。
  for (const kind of ['タッチ', 'ペン'] as const) {
  test(`FR-305 AC-862 ${kind}でも上端の中央でまず最大化のプレビュー、とどめると雛形のポップアップに替わり区画どおりに配置され再読込後も同じ、300 ms 未満では出ず 300 ms 未満の離しは最大化、区画は 24×24 CSS px 以上、ドラッグ中にページのスクロールやズームが起きない`, async ({ page, start }) => {
    const app = await start();
    await selectPersona(page, '事業部門');
    const [a] = await topKeys(page);
    expect(a, 'コンポーネントが 1 つ以上必要').toBeTruthy();
    const ws = await box(workspace(page));
    const cdp = await page.context().newCDPSession(page);
    const ptr = kind === 'タッチ' ? touchPointer(cdp) : penPointer(cdp);

    const view = () => page.evaluate(() => ({
      sx: window.scrollX, sy: window.scrollY,
      st: document.scrollingElement?.scrollTop ?? 0, sl: document.scrollingElement?.scrollLeft ?? 0,
      scale: window.visualViewport?.scale ?? 1,
      ox: window.visualViewport?.offsetLeft ?? 0, oy: window.visualViewport?.offsetTop ?? 0,
    }));
    const v0 = await view();

    // 異常系: 命中範囲を 300 ms 未満で通り過ぎるとポップアップが出ない
    await quickPassShowsNoPopup(page, ptr, component(page, a), ws, kind);

    // 正常系: 最大化のプレビュー→とどめるとポップアップ。区画の操作の対象は 24×24 CSS px 以上
    const hit = await dragToHitAndDwell(page, ptr, component(page, a), ws, kind);
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
    expect(await view(), `${kind}のドラッグ中にページがスクロール・ズームした`).toEqual(v0);
    await dropOnZone(page, ptr, hit, '1', 1);
    expectRect(await box(component(page, a)), zoneRect(ws, '1', 1), ws, `${kind}で ① の左 1/2 に配置`);
    expect(await view(), `${kind}のドラッグでページがスクロール・ズームした`).toEqual(v0);

    // 再読込しても同じ配置（AC-859 と同じ結果）
    await app.reload();
    const ws2 = await box(workspace(page));
    expectRect(await box(component(page, a)), zoneRect(ws2, '1', 1), ws2, `再読込後も ${kind}で置いた a は ① の左 1/2`);

    // 異常系: 300 ms 未満で離すと最大化（ポップアップは出ない）。a は区画に置かれた手前のコンポーネントなので見出しを掴める
    // 前提が崩れた試行の後は、a を ① の左 1/2 に置き直して元の配置に戻す
    await quickReleaseMaximizes(page, ptr, component(page, a), ws2, kind, async () => {
      await dropOnZone(page, ptr, await dragToHitAndDwell(page, ptr, component(page, a), ws2, `${kind}（元に戻す）`), '1', 1);
      expectRect(await box(component(page, a)), zoneRect(ws2, '1', 1), ws2, '元の配置（① の左 1/2）に戻す');
    });
    expect(await view(), `${kind}のドラッグでページがスクロール・ズームした`).toEqual(v0);
  });
  }
});
