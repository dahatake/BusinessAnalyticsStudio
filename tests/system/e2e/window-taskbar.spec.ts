// System Test: 開いているコンポーネントの一覧・既定の構成と最小サイズ・没入表示（run 202610302230）
// Oracles: FR-295 AC-797・AC-799、FR-296 AC-800、FR-297 AC-802・AC-803（docs/requirements/app-experience.md）だけ。
// PARAM-134=360 px（最小の幅）、PARAM-135=240 px（最小の高さ）、PARAM-136=4 個（既定の同時表示の上限）、PARAM-137=60 %（背面の減光）。
// 画面の探し方は tests/system/CONTRACT.md §33（実装前の契約案）。実装が未着手のため、失敗は正常。
import type { Page, Locator } from '@playwright/test';
import { test, expect, component, selectPersona, PERSONAS, MAIN_SCREENS, openScreen, contrastRatio, settingsButton, settingsDialog, closeSettings } from '../support/fixtures';

const MIN_W = 360; // PARAM-134
const MIN_H = 240; // PARAM-135
const MAX_VISIBLE = 4; // PARAM-136
const DIM = 0.6; // PARAM-137
const TOL = 2;

type Box = { x: number; y: number; width: number; height: number };
type State = 'front' | 'visible' | 'minimized' | 'closed' | 'behind'; // behind＝背面（FR-305 の雛形で配置して背面に回ったもの。AC-797・872）

const list = (page: Page) => page.getByTestId('window-list');
const items = (page: Page) => list(page).getByTestId('window-list-item');
const item = (page: Page, key: string) => list(page).locator(`[data-testid="window-list-item"][data-component-key="${key}"]`);

async function states(page: Page): Promise<Record<string, State>> {
  return items(page).evaluateAll((els) => Object.fromEntries(
    els.map((e) => [e.getAttribute('data-component-key') ?? '', e.getAttribute('data-state') ?? ''])) as Record<string, State>);
}
async function box(c: Locator): Promise<Box> {
  const b = await c.boundingBox();
  expect(b, 'visible rectangle required').not.toBeNull();
  return b!;
}
async function sameBox(c: Locator, expected: Box, message: string) {
  await expect.poll(async () => {
    const a = await box(c);
    return Math.max(...(['x', 'y', 'width', 'height'] as const).map((p) => Math.abs(a[p] - expected[p])));
  }, { message }).toBeLessThanOrEqual(TOL);
}
async function zIndex(c: Locator): Promise<number> {
  return c.evaluate((el) => {
    // 計算済みの z-index が数値の最も近い祖先（自分を含む）
    for (let e: Element | null = el; e; e = e.parentElement) {
      const z = parseInt(getComputedStyle(e).zIndex, 10);
      if (!Number.isNaN(z)) return z;
    }
    return 0;
  });
}
async function action(c: Locator, name: string) {
  await c.focus();
  // 見出しの 3 ボタン（AC-826: 最小化・最大化／元に戻す・閉じる）。旧名称「非表示」は「閉じる」
  const n = name === '非表示' ? '閉じる' : name;
  await c.getByTestId('window-controls').getByRole('button', { name: n, exact: true }).click();
}
async function resetLayout(page: Page) {
  await page.getByRole('button', { name: '既定のレイアウトに戻す', exact: true }).click();
  await expect(list(page)).toBeVisible();
}
async function setup(page: Page, persona = '事業部門') {
  await page.setViewportSize({ width: 1280, height: 800 });
  await selectPersona(page, persona);
  await resetLayout(page);
}
async function shown(page: Page): Promise<string[]> {
  const s = await states(page);
  return Object.keys(s).filter((k) => s[k] === 'front' || s[k] === 'visible');
}

test.describe('FR-295 開いているコンポーネントの一覧', () => {
  // FR-295 AC-797
  test('FR-295 AC-797 一覧に最小化・閉じたものを含む全コンポーネントが名前と状態つきで並び、項目の操作で復元・最小化・再表示でき、選択・絞り込み・入力が変わらない', async ({ page, start }) => {
    await start();
    await setup(page);
    const ks = await shown(page);
    expect(ks.length, '3 つ以上のコンポーネントが必要').toBeGreaterThanOrEqual(3);
    const [a, b, c] = ks;
    const search = page.getByRole('searchbox', { name: /検索/ });
    await search.fill('絞り込み確認');
    await action(component(page, b), '最小化');
    await action(component(page, c), '非表示');
    const bBefore = await box(component(page, a)); // 参照: 前面側が動かない
    const s = await states(page);
    expect(s[b]).toBe('minimized');
    expect(s[c]).toBe('closed');
    // すべてのコンポーネントが名前つきで並び、状態が文字か図で区別できる（色だけにしない）
    expect(await items(page).count()).toBeGreaterThanOrEqual(ks.length);
    for (const k of [a, b, c]) {
      const it = item(page, k);
      await expect(it, `${k}: 一覧の項目`).toBeVisible();
      expect((await it.innerText()).trim().length, `${k}: 名前の文字`).toBeGreaterThan(0);
      const name = (await it.getAttribute('aria-label')) ?? (await it.innerText());
      expect(name, `${k}: 状態の語`).toMatch(/前面|表示中|最小化|閉じた|背面/);
    }
    expect(Object.values(s).filter((v) => v === 'front').length, '前面は 1 つだけ').toBe(1);
    // 最小化中の項目 → 元の位置・大きさで前面に復元
    const bOrig = await (async () => { await item(page, b).click(); return box(component(page, b)); })();
    await expect(item(page, b)).toHaveAttribute('data-state', 'front');
    expect(bOrig.width, '復元した幅').toBeGreaterThan(0);
    await expect(component(page, a)).toBeVisible();
    // 前面の項目 → 最小化
    await item(page, b).click();
    await expect(item(page, b)).toHaveAttribute('data-state', 'minimized');
    // 閉じた項目 → 再表示
    await item(page, c).click();
    await expect(component(page, c)).toBeVisible();
    await expect(item(page, c)).toHaveAttribute('data-state', /^(front|visible)$/);
    // 操作の前後で絞り込み・ペルソナが変わらない
    await expect(search).toHaveValue('絞り込み確認');
    await expect(page.getByRole('button', { name: /ペルソナ/ })).toContainText('事業部門');
  });

  // FR-295 AC-797 異常系: 一覧に無いコンポーネントを作らない・状態の整合（最小化したものは画面に出ない）
  test('FR-295 AC-797 異常系: 最小化・閉じた項目のコンポーネントは画面に表示されず、一覧から消えない', async ({ page, start }) => {
    await start();
    await setup(page);
    const [, b, c] = await shown(page);
    const bFull = await box(component(page, b));
    await action(component(page, b), '最小化');
    await action(component(page, c), '非表示');
    // 最小化は見出しだけ残る（FR-151 AC-260）。コンテンツ領域は表示されない（枠の高さが縮む）
    await expect.poll(async () => (await box(component(page, b))).height, { message: '最小化で内容が畳まれる' }).toBeLessThan(bFull.height / 2);
    await expect(component(page, c)).toBeHidden();
    await expect(item(page, b)).toBeVisible();
    await expect(item(page, c)).toBeVisible();
  });

  // FR-295 AC-799
  test('FR-295 AC-799 重ねて前面にし最小化・閉じた状態が再読込で復元され、既定のレイアウトに戻すと既定に戻る', async ({ page, start }) => {
    const app = await start();
    await setup(page);
    const ks = await shown(page);
    expect(ks.length).toBeGreaterThanOrEqual(4);
    const [a, b, c, d] = ks;
    const initial = await states(page);
    const initialBoxes: Record<string, Box> = {};
    for (const k of [a, b, c, d]) initialBoxes[k] = await box(component(page, k));
    // 1 つを自由配置にすると全部が自由配置になる（FR-173）。そのうえで b を a に重ねる
    await component(page, a).focus();
    await component(page, a).getByTestId('component-menu').click();
    await page.getByRole('menuitem', { name: '自由に動かせる配置にする', exact: true }).click();
    const ba = await box(component(page, a));
    const hb = await box(component(page, b).getByTestId('panel-handle').first());
    const bb = await box(component(page, b));
    const dx = ba.x + 40 - bb.x;
    const dy = ba.y + 40 - bb.y;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + dx, hb.y + hb.height / 2 + dy, { steps: 12 });
    await page.mouse.up();
    // 後ろのもの（a）を押して前面に出す
    await component(page, a).getByTestId('panel-body').click({ position: { x: 4, y: 4 } });
    await expect(item(page, a)).toHaveAttribute('data-state', 'front');
    expect(await zIndex(component(page, a)), 'a が b より前').toBeGreaterThan(await zIndex(component(page, b)));
    // 重なりで操作ボタンが覆われうるため、c・d の操作はボタンへ直接 click を送る
    const act = async (k: string, name: string) => { await component(page, k).focus(); await component(page, k).getByTestId('window-controls').getByRole('button', { name: name === '非表示' ? '閉じる' : name, exact: true }).dispatchEvent('click'); };
    await act(c, '最小化');
    await act(d, '非表示');
    const snap = async () => {
      const o: Record<string, { state: State; box: Box | null; z: number }> = {};
      const st = await states(page);
      for (const k of [a, b, c, d]) {
        const vis = st[k] === 'front' || st[k] === 'visible';
        o[k] = { state: st[k], box: vis ? await box(component(page, k)) : null, z: vis ? await zIndex(component(page, k)) : 0 };
      }
      return o;
    };
    const before = await snap();
    await app.reload();
    await expect(list(page)).toBeVisible();
    const after = await snap();
    for (const k of [a, b, c, d]) {
      expect(after[k].state, `${k}: 再読込後の状態`).toBe(before[k].state);
      if (before[k].box) {
        for (const p of ['x', 'y', 'width', 'height'] as const) {
          expect(Math.abs(after[k].box![p] - before[k].box![p]), `${k}.${p} 再読込後`).toBeLessThanOrEqual(TOL);
        }
      }
    }
    expect(after[a].z, '再読込後も a が b より前').toBeGreaterThan(after[b].z);
    // 異常系: 既定のレイアウトに戻すと、状態・位置・大きさが既定に戻る
    await resetLayout(page);
    const reset = await states(page);
    for (const k of [a, b, c, d]) {
      expect(reset[k], `${k}: 既定の状態`).toBe(initial[k] === 'front' ? reset[k] : initial[k]);
      if (initial[k] === 'front' || initial[k] === 'visible') await sameBox(component(page, k), initialBoxes[k], `${k}: 既定の位置・大きさ`);
    }
  });
});

test.describe('FR-296 既定の構成と最小サイズ', () => {
  // FR-296 AC-800
  test('FR-296 AC-800 各ペルソナ・各画面の既定のレイアウトで、同時表示が 4 個以内・各 360x240 以上で、残りは最小化で一覧にある', async ({ page, start }) => {
    await start();
    await page.setViewportSize({ width: 1280, height: 800 });
    const check = async (label: string) => {
      const s = await states(page);
      const keys = Object.keys(s);
      const vis = keys.filter((k) => s[k] === 'front' || s[k] === 'visible');
      expect(vis.length, `${label}: 同時表示の数`).toBeLessThanOrEqual(MAX_VISIBLE);
      expect(vis.length, `${label}: 1 つ以上表示`).toBeGreaterThanOrEqual(1);
      for (const k of vis) {
        const b = await box(component(page, k));
        expect(b.width, `${label}/${k}: 幅`).toBeGreaterThanOrEqual(MIN_W - TOL);
        expect(b.height, `${label}/${k}: 高さ`).toBeGreaterThanOrEqual(MIN_H - TOL);
      }
      // 異常系: 残りは非表示（closed）ではなく最小化の状態で一覧にある
      expect(keys.filter((k) => s[k] === 'closed'), `${label}: 閉じたもの`).toEqual([]);
      expect(keys.filter((k) => s[k] === 'minimized').length + vis.length, `${label}: 一覧の数`).toBe(keys.length);
    };
    for (const p of PERSONAS) {
      await selectPersona(page, p);
      await resetLayout(page);
      await check(`persona ${p}`);
    }
    // 各画面: 既定のレイアウトから画面を開いても同時表示の上限と最小サイズを守る
    await selectPersona(page, '事業部門');
    for (const [key] of MAIN_SCREENS) {
      if (key === 'settings') continue;
      await resetLayout(page);
      await openScreen(page, key);
      await check(`screen ${key}`);
    }
  });
});

test.describe('FR-297 没入表示・奥行き', () => {
  // FR-297 AC-802
  test('FR-297 AC-802 最大化で背面が 60% 暗くなり操作できず全体を占め、Esc と一覧の操作で戻り、絞り込みが変わらない', async ({ page, start }) => {
    await start();
    await setup(page);
    const [a, b] = await shown(page);
    const search = page.getByRole('searchbox', { name: /検索/ });
    await search.fill('没入確認');
    const ws = await box(page.getByTestId('workspace'));
    const before = await box(component(page, a));
    const bBox = await box(component(page, b));
    await action(component(page, a), '最大化');
    await expect(component(page, a)).toHaveAttribute('data-maximized', 'true');
    await sameBox(component(page, a), ws, '最大化は作業領域の全体');
    const alpha = await page.getByTestId('immersive-backdrop').evaluate((el) => {
      const cs = getComputedStyle(el);
      const m = cs.backgroundColor.match(/[\d.]+/g) ?? [];
      const a0 = m.length >= 4 ? Number(m[3]) : 1;
      return a0 * Number(cs.opacity);
    });
    expect(Math.abs(alpha - DIM), '背面の減光 PARAM-137').toBeLessThanOrEqual(0.05);
    // 背面のコンポーネントは操作できない（最大化したものが覆う）
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest('[data-testid^="component-"]')?.getAttribute('data-testid') ?? null;
    }, { x: bBox.x + bBox.width / 2, y: bBox.y + bBox.height / 2 });
    expect(hit, '背面の上の点は背面のコンポーネントに当たらない').not.toBe(`component-${b}`);
    // Esc で戻る
    await page.keyboard.press('Escape');
    await expect(component(page, a)).not.toHaveAttribute('data-maximized', 'true');
    await sameBox(component(page, a), before, 'Esc で元の位置・大きさ');
    await expect(search).toHaveValue('没入確認');
    // 一覧の操作で戻る
    await action(component(page, a), '最大化');
    await expect(component(page, a)).toHaveAttribute('data-maximized', 'true');
    await item(page, a).click();
    await expect(component(page, a)).not.toHaveAttribute('data-maximized', 'true');
    await sameBox(component(page, a), before, '一覧の操作で元の位置・大きさ');
    await expect(search).toHaveValue('没入確認');
  });

  // FR-297 AC-803
  for (const theme of ['light', 'dark', 'hc'] as const) {
    test(`FR-297 AC-803 ${theme}: 前面は背面より強い影か境界線と見出しの強調（文字かアイコン）で区別でき、見出しの文字が AA`, async ({ page, start }) => {
      await start();
      if (theme === 'hc') await page.emulateMedia({ forcedColors: 'active' });
      else await page.emulateMedia({ colorScheme: theme, forcedColors: 'none' });
      await setup(page);
      const [front, back] = await shown(page);
      await component(page, front).focus();
      await expect(item(page, front)).toHaveAttribute('data-state', 'front');
      await expect(component(page, front).getByTestId('front-indicator'), '前面の見出しの強調').toBeVisible();
      await expect(component(page, back).getByTestId('front-indicator'), '背面に強調はない').toHaveCount(0);
      const edge = (c: Locator) => c.evaluate((el) => {
        const cs = getComputedStyle(el);
        const shadow = cs.boxShadow === 'none' ? 0 : (cs.boxShadow.match(/\d+(\.\d+)?px/g) ?? []).map((v) => parseFloat(v)).reduce((s, v) => s + v, 0);
        const line = Math.max(parseFloat(cs.borderTopWidth) || 0, parseFloat(cs.outlineWidth) || 0);
        return { shadow, line };
      });
      const f = await edge(component(page, front));
      const bk = await edge(component(page, back));
      if (theme === 'hc') expect(f.line, 'ハイコントラストでは前面の境界線が背面より太い').toBeGreaterThan(bk.line);
      else expect(f.shadow, '前面の影が背面より強い').toBeGreaterThan(bk.shadow);
      // 見出しの文字のコントラスト（透明の背景は祖先の不透明な背景に重ねて計算）。ハイコントラストでは背景が不透明
      const head = await component(page, front).getByTestId('panel-handle').first().evaluate((el) => {
        const parse = (s: string) => (s.match(/[\d.]+/g) ?? ['0', '0', '0', '1']).map(Number);
        let bg = [255, 255, 255];
        const chain: number[][] = [];
        for (let e: Element | null = el; e; e = e.parentElement) chain.push(parse(getComputedStyle(e).backgroundColor));
        for (const c of chain.reverse()) {
          const a = c.length >= 4 ? c[3] : 1;
          bg = bg.map((v, i) => Math.round(c[i] * a + v * (1 - a)));
        }
        return { color: getComputedStyle(el).color, bg: `rgb(${bg.join(',')})`, ownAlpha: parse(getComputedStyle(el).backgroundColor)[3] ?? 1 };
      });
      if (theme === 'hc') expect(head.ownAlpha, 'ハイコントラストでは見出しの素材が不透明').toBe(1);
      expect(contrastRatio(head.color, head.bg), '見出しの文字は AA（4.5 以上）').toBeGreaterThanOrEqual(4.5);
    });
  }
});

// ---- FR-295 AC-824〜826: 左メニューのバッジ・青いバー、見出しの 3 ボタン（契約: CONTRACT.md §34 の追補。実装前の契約案）----
type Entry = { key: string; screen: string; state: State };
async function entries(page: Page): Promise<Entry[]> {
  return items(page).evaluateAll((els) => els.map((e) => ({
    key: e.getAttribute('data-component-key') ?? '',
    screen: e.getAttribute('data-screen-key') ?? '',
    state: (e.getAttribute('data-state') ?? '') as State,
  })));
}
// バッジ・青いバーの数に含まれる Window（AC-824: 閉じた・未表示、または背面だけの項目には出さない。背面は前面に出すと数に含まれる〔AC-872〕）
const isOpen = (s: State) => s !== 'closed' && s !== 'behind';
const badge = (page: Page, screen: string) => page.getByTestId(`nav-badge-${screen}`);
const bar = (page: Page, screen: string) => page.getByTestId(`nav-bar-${screen}`);
/** 閉じる（最小化中なら先に復元して、見出しの［閉じる］で閉じる） */
async function hideWin(page: Page, key: string) {
  if ((await states(page))[key] === 'minimized') await item(page, key).click();
  await component(page, key).focus();
  await component(page, key).getByTestId('window-close').dispatchEvent('click');
  await expect(item(page, key)).toHaveAttribute('data-state', 'closed');
}
async function setOsWin(page: Page, os: '自動' | 'Windows' | 'macOS'): Promise<void> {
  await settingsButton(page).click();
  await settingsDialog(page).getByRole('combobox', { name: 'OS の操作慣習' }).selectOption({ label: os });
  await closeSettings(page);
}
/** 画面 A（前面の Window）・B（前面でない Window）・C（すべて閉じた）を作る。画面は list-item の data-screen-key（左メニューの nav-<key> の key）。
 *  現行の registry は 1 画面＝1 コンポーネントなので、各画面の Window は 1 つ（件数バッジ「2」は件数 2 以上のときだけ出る。単体テスト tests/unit/nav-taskbar.test.tsx が担う）。 */
async function arrange(page: Page) {
  const all = await entries(page);
  const screens = [...new Set(all.map((e) => e.screen))];
  const by = (s: string) => all.filter((e) => e.screen === s);
  expect(screens.length, '画面が 3 つ以上必要').toBeGreaterThanOrEqual(3);
  const [A, B, C] = screens;
  for (const e of by(C)) if ((await states(page))[e.key] !== 'closed') await hideWin(page, e.key);
  const bs = by(B);
  for (const e of bs.slice(1)) if ((await states(page))[e.key] !== 'closed') await hideWin(page, e.key);
  if ((await states(page))[bs[0].key] === 'closed') await item(page, bs[0].key).click();
  if ((await states(page))[bs[0].key] === 'minimized') await item(page, bs[0].key).click();
  const as = by(A);
  for (const e of as.slice(1)) if ((await states(page))[e.key] !== 'closed') await hideWin(page, e.key);
  const a1 = as[0];
  if ((await states(page))[a1.key] === 'closed') await item(page, a1.key).click();
  if ((await states(page))[a1.key] === 'minimized') await item(page, a1.key).click();
  // A を前面にする（B・C は前面でない）
  await component(page, a1.key).getByTestId('panel-body').click({ position: { x: 4, y: 4 } });
  await expect(item(page, a1.key)).toHaveAttribute('data-state', 'front');
  await expect(item(page, bs[0].key)).not.toHaveAttribute('data-state', 'front');
  return { A, B, C, a1: a1.key, b1: bs[0].key };
}

test.describe('FR-295 左メニューのバッジ・青いバーと見出しの 3 ボタン', () => {
  // FR-295 AC-824（現行の registry は 1 画面＝1 Window。件数「2」のバッジは件数 2 以上で出る＝単体テスト tests/unit/nav-taskbar.test.tsx。ここでは青いバーとバッジなし（件数 1）を検証する）
  test('FR-295 AC-824 左メニューに青いバー（前面あり=長い・前面でないだけ=短い）が出て、件数 1 ではバッジが出ず、閉じた画面には何も出ず、色以外でも区別でき、操作で即座に変わる', async ({ page, start }) => {
    await start();
    await setup(page);
    const w = await arrange(page);
    // ① 前面の Window: 長い青いバー（件数 1 なのでバッジなし）
    await expect(bar(page, w.A)).toHaveAttribute('data-state', 'front');
    await expect(badge(page, w.A), '件数 1 の画面にバッジを出さない').toHaveCount(0);
    // ② 前面でない Window だけ: 短い青いバー（バッジなし）
    await expect(bar(page, w.B)).toHaveAttribute('data-state', 'other');
    await expect(badge(page, w.B), '1 つだけの画面にバッジを出さない').toHaveCount(0);
    // ③ Window がない（閉じた）画面: バッジも青いバーも出ない（異常系）
    await expect(badge(page, w.C)).toHaveCount(0);
    await expect(bar(page, w.C)).toHaveCount(0);
    // 文字の代替（アクセシブルな名前）と、色以外の区別（バーの長さ・名前）。Light・Dark・ハイコントラスト
    for (const mode of [{ colorScheme: 'light' as const }, { colorScheme: 'dark' as const }, { forcedColors: 'active' as const }]) {
      await page.emulateMedia(mode);
      const name = async (l: Locator) => ((await l.getAttribute('aria-label')) ?? (await l.innerText()) ?? '').trim();
      expect((await name(bar(page, w.A))).length, `${JSON.stringify(mode)}: 青いバー（前面）の名前`).toBeGreaterThan(0);
      expect(await name(bar(page, w.A)), '前面ありと前面なしの名前が違う').not.toBe(await name(bar(page, w.B)));
      expect((await box(bar(page, w.A))).height, 'バーが見える').toBeGreaterThan(0);
      expect((await box(bar(page, w.A))).width, `${JSON.stringify(mode)}: 前面のバーが前面でないバーより長い`).toBeGreaterThan((await box(bar(page, w.B))).width + 1);
    }
    await page.emulateMedia({ colorScheme: null, forcedColors: null });
    // 操作で即座に変わる: 前面の Window を最小化 → 前面なし（短いバー）／復元 → 前面あり
    await component(page, w.a1).getByTestId('window-minimize').dispatchEvent('click');
    await expect(bar(page, w.A), '最小化の直後にバーが変わる').toHaveAttribute('data-state', 'other');
    await item(page, w.a1).click();
    await expect(bar(page, w.A), '復元の直後にバーが変わる').toHaveAttribute('data-state', 'front');
    // 閉じる → バーが消える／再表示 → 戻る（バッジは件数 1 のまま出ない）
    await hideWin(page, w.a1);
    await expect(bar(page, w.A), '閉じた直後にバーが消える').toHaveCount(0);
    await expect(badge(page, w.A)).toHaveCount(0);
    await item(page, w.a1).click();
    await expect(bar(page, w.A), '再表示の直後にバーが戻る').toBeVisible();
    await expect(badge(page, w.A)).toHaveCount(0);
  });

  // FR-295 AC-825
  test('FR-295 AC-825 左メニューの項目で Window が復元・最小化・再表示され、一覧と一致し、選択・絞り込み・入力が変わらず、再読込で復元され、Tab+Enter と最小化メニューでも動く', async ({ page, start }) => {
    const app = await start();
    await setup(page);
    const w = await arrange(page);
    const search = page.getByRole('searchbox', { name: /検索/ });
    await search.fill('左メニュー確認');
    // A の項目: 前面の Window は最小化 → 最小化中は最小化前の位置・大きさで前面に復元 → もう一度で最小化
    const placed0 = await box(component(page, w.a1));
    await page.getByTestId(`nav-${w.A}`).click();
    await expect(item(page, w.a1), '前面の Window は最小化').toHaveAttribute('data-state', 'minimized');
    await page.getByTestId(`nav-${w.A}`).click();
    await expect(item(page, w.a1), '最小化中だった Window が前面に復元').toHaveAttribute('data-state', 'front');
    await sameBox(component(page, w.a1), placed0, '最小化前の位置・大きさで復元');
    expect((await box(component(page, w.a1))).width, '復元した大きさ').toBeGreaterThanOrEqual(MIN_W - TOL);
    await page.getByTestId(`nav-${w.A}`).click();
    await expect(item(page, w.a1)).toHaveAttribute('data-state', 'minimized');
    // 前面の A を最小化すると、次に最近使った表示中の B が自動で前面になる（AC-797・798）
    await expect(item(page, w.b1), 'A の最小化で B が自動で前面').toHaveAttribute('data-state', 'front');
    // A の項目で A を復元 → A が前面・B は前面でない
    await page.getByTestId(`nav-${w.A}`).click();
    await expect(item(page, w.a1)).toHaveAttribute('data-state', 'front');
    await expect(item(page, w.b1)).toHaveAttribute('data-state', 'visible');
    // B の項目: 前面でない Window → 前面に出る（B の Window が前面）
    await page.getByTestId(`nav-${w.B}`).click();
    await expect(item(page, w.b1)).toHaveAttribute('data-state', 'front');
    // 没入（最大化）中も左メニューの項目を操作できる（背面の覆いに阻まれない）
    await component(page, w.b1).getByTestId('window-maximize').dispatchEvent('click');
    await expect(component(page, w.b1)).toHaveAttribute('data-maximized', 'true');
    await page.getByTestId(`nav-${w.A}`).click({ trial: true });
    await component(page, w.b1).getByTestId('window-maximize').dispatchEvent('click');
    await expect(component(page, w.b1)).not.toHaveAttribute('data-maximized', 'true');
    // 左メニューの結果は FR-295 の一覧と常に一致（バーの状態 = 一覧の前面の有無）
    const consistent = async () => {
      const es = await entries(page);
      for (const s of [w.A, w.B, w.C]) {
        const open = es.filter((e) => e.screen === s && isOpen(e.state));
        const hasFront = open.some((e) => e.state === 'front');
        if (open.length === 0) await expect(bar(page, s), `${s}: 閉じた画面にバーがない`).toHaveCount(0);
        else await expect(bar(page, s), `${s}: バーが一覧と一致`).toHaveAttribute('data-state', hasFront ? 'front' : 'other');
      }
    };
    await consistent();
    // 閉じた画面 C の項目: 表示される（前面）
    await page.getByTestId(`nav-${w.C}`).click();
    expect((await entries(page)).filter((e) => e.screen === w.C && e.state === 'front').length, '閉じた画面が表示される').toBeGreaterThanOrEqual(1);
    await consistent();
    // 操作の前後で絞り込みが変わらない（NFR-UX-001）
    await expect(search).toHaveValue('左メニュー確認');
    // 再読込後も FR-014 のとおり復元
    const before = await states(page);
    await app.reload();
    await expect(list(page)).toBeVisible();
    await expect.poll(() => states(page), { message: '再読込後の状態', timeout: 5000 }).toEqual(before);
    await consistent();
    // キーボード（Tab・Enter）: 項目にフォーカスして Enter で同じ操作
    const nav = page.getByTestId(`nav-${w.B}`);
    await nav.focus();
    await page.keyboard.press('Enter');
    const afterEnter = (await entries(page)).filter((e) => e.screen === w.B);
    expect(afterEnter.some((e) => e.state === 'front') !== (before[w.b1] === 'front'), 'Enter で前面の有無が切り替わる').toBe(true);
    // 左メニューが最小化（アイコンのみ）でも同じに動く（異常系）
    await page.getByRole('button', { name: 'メニューを最小化' }).click();
    await page.getByTestId(`nav-${w.A}`).click();
    await expect(bar(page, w.A), '最小化したメニューでもバーが出る').toBeVisible();
    await consistent();
  });

  // FR-295 AC-826
  test('FR-295 AC-826 見出しの［最小化］［最大化／元に戻す］［閉じる］が Windows は右端・macOS は左端に並び、操作でき、結果が左メニューと一覧に反映される', async ({ page, start }) => {
    await start();
    await setup(page);
    const [a] = await shown(page);
    const c = component(page, a);
    const ctl = (k: string, n: string) => component(page, k).getByTestId('window-controls').getByRole('button', { name: n, exact: true });
    for (const os of ['Windows', 'macOS'] as const) {
      await setOsWin(page, os);
      const h = await box(c);
      const mn = await box(ctl(a, '最小化'));
      const mx = await box(ctl(a, '最大化'));
      const cl = await box(ctl(a, '閉じる'));
      const mid = (b: Box) => b.x + b.width / 2;
      if (os === 'Windows') {
        expect(mid(mn), 'Windows: 最小化・最大化・閉じるの順').toBeLessThan(mid(mx));
        expect(mid(mx)).toBeLessThan(mid(cl));
        expect(mid(cl), 'Windows: 右端').toBeGreaterThan(h.x + h.width * 0.75);
        // 左のアイコン＋タイトル
        const title = await box(c.getByTestId('window-title'));
        expect(title.x + title.width / 2, 'Windows: タイトルは左').toBeLessThan(mid(mn));
      } else {
        for (const b of [mn, mx, cl]) expect(mid(b), 'macOS: 左端').toBeLessThan(h.x + h.width * 0.25);
      }
      // ピン止め・タブ・ビュー・メニューが見出しに残り操作できる
      await expect(c.getByTestId('component-menu'), `${os}: メニューが残る`).toBeVisible();
      await expect(c.getByTestId('component-actions').getByRole('button').first(), `${os}: 既存の操作が残る`).toBeEnabled();
    }
    await setOsWin(page, 'Windows');
    // 最大化 → 元に戻す（位置・大きさが戻る）
    const orig = await box(c);
    await ctl(a, '最大化').click();
    await expect(c).toHaveAttribute('data-maximized', 'true');
    await ctl(a, '元に戻す').click();
    await expect(c).not.toHaveAttribute('data-maximized', 'true');
    await sameBox(c, orig, '元に戻すで位置・大きさが戻る');
    // キーボードで操作できる（Tab で到達・Enter で実行）
    await ctl(a, '最小化').focus();
    await expect(ctl(a, '最小化')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(item(page, a)).toHaveAttribute('data-state', 'minimized');
    // 最小化で見出しだけに畳まれる（本体が出ない）。復元して閉じるへ
    await expect(c.getByTestId('panel-body')).toHaveCount(0);
    await item(page, a).click();
    const screen = (await entries(page)).find((e) => e.key === a)!.screen;
    const others = (await entries(page)).filter((e) => e.screen === screen && isOpen(e.state) && e.key !== a);
    await ctl(a, '閉じる').click();
    await expect(item(page, a), '閉じるで一覧に closed').toHaveAttribute('data-state', 'closed');
    await expect(c, '閉じるで非表示').toBeHidden();
    // 左メニューのバッジ・青いバーに反映（異常系: 同じ画面にほかの Window がなければバーも消える）
    if (others.length === 0) await expect(bar(page, screen)).toHaveCount(0);
    else await expect(bar(page, screen)).toBeVisible();
    // 反映の確認: 再表示で戻る
    await item(page, a).click();
    await expect(c).toBeVisible();
  });
});

// ---- FR-295 AC-797・AC-824・AC-872: 雛形（FR-305）で配置して背面に回ったコンポーネントの一覧の状態・左メニュー・前面への呼び出し ----
// 背面の状態は §34 の追補（data-state="behind"、文字は「背面」）。背面の作り方は AC-865 の前提（区画より表示中のコンポーネントが多い）。
// 注: AC-865・873・874・875・876 は integration のためこのケースの ac_ids に入れない（ここでは前提として使うだけ）。
test.describe('FR-295 背面（雛形で配置して背面に回ったコンポーネント）', () => {
  test('FR-295 AC-797 AC-824 AC-872 雛形で配置して背面に回ったコンポーネントが一覧に「背面」と区別して並び、左メニューのバッジ・バーに出ず、項目を押すと前面に出て通常の表示中になりバー・バッジの数に含まれる', async ({ page, start }) => {
    await start();
    await setup(page);
    const ks = await shown(page);
    expect(ks.length, '2 区画の雛形に対し表示中が 3 つ以上必要（背面に回るものを作る）').toBeGreaterThanOrEqual(3);
    const [a, b, ...rest] = ks;
    const ws = (await page.getByTestId('workspace').boundingBox())!;
    expect(ws, 'workspace').not.toBeNull();
    const mid = { x: ws.x + ws.width / 2, y: ws.y + ws.height / 2 };
    const hit = { x: ws.x + ws.width / 2, y: ws.y + 16 }; // 上端から PARAM-042 以内・中央
    const hb = (await component(page, a).getByRole('heading').first().boundingBox())!;
    const h = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 };
    const glide = async (from: { x: number; y: number }, to: { x: number; y: number }, n = 6) => {
      for (let i = 1; i <= n; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / n, from.y + ((to.y - from.y) * i) / n);
    };
    // ① 左 1/2・右 1/2 の雛形（FR-305）で a を左、b を順次の埋めで右に置く
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await glide(h, mid);
    await glide(mid, hit);
    const zone1 = page.locator('[data-testid="snap-layouts"] [data-testid="snap-layout-zone"][data-layout="1"][data-zone="1"]');
    await expect(zone1, '300 ms とどめると雛形のポップアップが出る').toBeVisible();
    const zb = (await zone1.boundingBox())!;
    const z = { x: zb.x + zb.width / 2, y: zb.y + zb.height / 2 };
    await glide(hit, z, 4);
    await page.mouse.up();
    const assist = page.getByTestId('snap-assist');
    await expect(assist, '配置の直後に残りの区画の候補が出る').toBeVisible();
    await assist.locator(`[data-component-key="${b}"]`).click();
    // 区画に配置されなかった表示中のコンポーネントは背面に回る（閉じず・最小化せず）
    for (const k of rest) {
      await expect(item(page, k), `${k}: 一覧で背面`).toHaveAttribute('data-state', 'behind');
      const it = item(page, k);
      const name = (await it.getAttribute('aria-label')) ?? (await it.innerText());
      expect(name, `${k}: 状態の語「背面」が文字で区別できる`).toMatch(/背面/);
      expect((await it.innerText()).trim().length, `${k}: 名前つき`).toBeGreaterThan(0);
    }
    expect(await items(page).count(), '一覧にすべてのコンポーネントが残る（背面も閉じた扱いにならない）').toBeGreaterThanOrEqual(ks.length);
    const s0 = await states(page);
    expect(Object.values(s0).filter((v) => v === 'front').length, '前面は 1 つだけ').toBe(1);
    expect(s0[a] === 'front' || s0[a] === 'visible', 'a は配置されて前面か表示中').toBe(true);
    expect(s0[b] === 'front' || s0[b] === 'visible', 'b は配置されて前面か表示中').toBe(true);
    const aBox = (await component(page, a).boundingBox())!;
    const bBox = (await component(page, b).boundingBox())!;

    // AC-824 ③: 背面だけの画面の項目には、バッジも青いバーも出ない（異常系）
    const es = await entries(page);
    const screenOf = (k: string) => es.find((e) => e.key === k)!.screen;
    const behindOnly = [...new Set(rest.map(screenOf))].filter((sc) =>
      es.filter((e) => e.screen === sc && e.state !== 'closed').every((e) => e.state === 'behind'));
    expect(behindOnly.length, '背面だけの画面が 1 つ以上ある').toBeGreaterThan(0);
    for (const sc of behindOnly) {
      await expect(badge(page, sc), `${sc}: 背面だけの画面にバッジを出さない`).toHaveCount(0);
      await expect(bar(page, sc), `${sc}: 背面だけの画面に青いバーを出さない`).toHaveCount(0);
    }

    // AC-872: 背面の項目を押すと前面に出て、通常の表示中になる（FR-173 の自由配置の重なりとして扱われ、ほかを動かさない）
    const r = rest.find((k) => behindOnly.includes(screenOf(k)))!;
    await item(page, r).click();
    await expect(item(page, r), '押すと前面に出る').toHaveAttribute('data-state', /^(front|visible)$/);
    await expect(component(page, r)).toBeVisible();
    expect(await item(page, r).getAttribute('aria-label') ?? await item(page, r).innerText(), '状態が「背面」でなくなる').not.toMatch(/背面/);
    // 前面に出した後は、左メニューのバッジ・青いバーの数に含まれる（その画面に Window は 1 つ以上）
    await expect(bar(page, screenOf(r)), '前面に出すとバーに含まれる').toBeVisible();
    // ほかのコンポーネントは動かされず、背面のままのものは背面のまま
    for (const [k, was] of [[a, aBox], [b, bBox]] as const) {
      const now = (await component(page, k).boundingBox())!;
      expect(Math.max(Math.abs(now.x - was.x), Math.abs(now.y - was.y), Math.abs(now.width - was.width), Math.abs(now.height - was.height)), `${k}: 呼び出しで配置が動いた`).toBeLessThanOrEqual(TOL);
    }
    for (const k of rest.filter((x) => x !== r)) await expect(item(page, k), `${k}: ほかの背面は背面のまま`).toHaveAttribute('data-state', 'behind');
  });
});
