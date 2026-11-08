// System Test: 画面の操作性の刷新（FR-220〜FR-228。run 202610192037 の依頼 1〜9）
// 期待値は要求定義書の受入基準（docs/requirements/app-experience.md の FR-220 AC-515・FR-221 AC-517・FR-222 AC-518・FR-223 AC-519・
// FR-224 AC-521・FR-225 AC-523・FR-226 AC-525・FR-227 AC-526・FR-228 AC-528・AC-529）と PARAM（PARAM-073=6、PARAM-030=5）だけから決める。
// 画面の探し方は CONTRACT.md §23（本ファイルが前提にするもの）。AC-516・520・522・524・527・530 は統合・単体テストの範囲で、この spec では扱わない。
import AxeBuilder from '@axe-core/playwright';
import type { Page, Locator } from '@playwright/test';
import { test, expect, component, selectPersona, openScreen, hook, settingsButton, settingsDialog, gotoAndEnter } from '../support/fixtures';
import { listScreenKeys, gotoScreen, topKeys, actions, pinButton, viewButton, openViewMenu, chooseView, box, type ViewState } from '../support/screens';
import { layoutTest } from '../support/layout-fixture';
import { expectBeforeReflowObservation, observeStepNavigation, type NavigationObservation } from '../support/layout-observer';

const MAX_PERMANENT_BUTTONS = 6; // PARAM-073
// 見出しの最小化・最大化（元に戻す）・閉じるは window-controls（FR-295 AC-826）、ピン止め・タブ・ビューは component-actions。常設ボタンの数は両方の合計（「その他の操作」を除く）
const wctl = (c: Locator) => c.getByTestId('window-controls').first();
const permanentCount = (c: Locator) => c.locator('[data-testid="window-controls"] button, [data-testid="component-actions"] button').evaluateAll((els) => els.filter((e) => !/その他の操作/.test(e.getAttribute('aria-label') ?? e.textContent ?? '')).length);
const STEPS = ['課題定義', '現状分析', 'KPI 測定', 'ユースケース作成', '施策計画']; // PARAM-030 = 5
const MIN_TARGET = 44; // AC-528
const THEMES = ['light', 'dark', 'hc'] as const;
type Theme = (typeof THEMES)[number];

async function applyTheme(page: Page, theme: Theme): Promise<void> {
  if (theme === 'hc') await page.emulateMedia({ forcedColors: 'active' });
  else await page.emulateMedia({ colorScheme: theme, forcedColors: 'none' });
}

const viewState = (page: Page, key: string) => hook<ViewState>(page, 't.view.state(a)', key);
const screenViewButton = (page: Page): Locator => page.getByTestId('screen-heading').getByRole('button', { name: /^ビュー/ });

/** 3D の表現を持つ画面（FR-217 の本文と AC-501 の画面）。画面の登録にあるものだけを対象にする */
const SCREENS_3D = ['map', 'knowledge-graph', 'architecture', 'data-catalog', 'gantt', 'table', 'matrix', 'ranking', 'issue-solution', 'discussion-tree', 'kpi-okr'];

/** 企業と Project を作って Project を開く（CONTRACT.md §8） */
async function openNewProject(page: Page, company = '合成株式会社A', project = '業務改善 2026'): Promise<void> {
  await page.getByRole('button', { name: '企業を登録' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: '企業名' }).fill(company);
  await dlg.getByRole('button', { name: '登録' }).click();
  await expect(dlg).toBeHidden();
  await createProject(page, company, project);
  await page.getByRole('region', { name: `企業 ${company}` }).getByRole('link', { name: project }).click();
  await expect(page.getByTestId('stepper')).toBeVisible();
}

async function createProject(page: Page, company: string, project: string): Promise<void> {
  await page.getByRole('region', { name: `企業 ${company}` }).getByRole('button', { name: 'Project を作成' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: 'Project 名' }).fill(project);
  await dlg.getByRole('button', { name: '作成' }).click();
  await expect(dlg).toBeHidden();
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

/** 文字だけを factor 倍にする（WCAG 2.2 1.4.4 の確認の方法。a11y-all-screens.spec.ts と同じ） */
async function zoomTextOnly(page: Page, factor: number): Promise<void> {
  await page.evaluate((f) => {
    const els = Array.from(document.body.querySelectorAll<HTMLElement>('*')).filter((e) => !(e instanceof SVGElement) && e.tagName !== 'CANVAS');
    const plan = els.map((e) => {
      const s = getComputedStyle(e);
      return { e, fs: parseFloat(s.fontSize), lh: s.lineHeight === 'normal' ? null : parseFloat(s.lineHeight) };
    });
    for (const { e, fs, lh } of plan) {
      e.style.setProperty('font-size', `${fs * f}px`, 'important');
      if (lh !== null) e.style.setProperty('line-height', `${lh * f}px`, 'important');
    }
  }, factor);
}

async function textContrastViolations(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  return r.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')}: ${n.any.map((a) => a.message).join(' ').slice(0, 120)}`));
}

/** アイコンと入力欄の境界の、隣の色とのコントラストが 3:1 未満のもの（WCAG 2.2 1.4.11。fluent-design.spec.ts と同じ判定） */
async function nonTextContrastFailures(page: Page): Promise<string[]> {
  return page.evaluate((sel) => {
    const parse = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const bgOf = (e: Element | null): number[] => {
      for (; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c.length >= 3 && (c.length === 3 || c[3] > 0.99)) return c.slice(0, 3);
      }
      return [255, 255, 255];
    };
    const visible = (e: Element) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && Number(s.opacity) > 0;
    };
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll(sel))) {
      if (!visible(el) || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') continue;
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('data-testid') || el.tagName).trim().slice(0, 20);
      for (const svg of Array.from(el.querySelectorAll('svg'))) {
        if (!visible(svg)) continue;
        const s = getComputedStyle(svg);
        const fill = parse(s.fill && s.fill !== 'none' && !s.fill.startsWith('url') ? s.fill : s.color);
        if (fill.length < 3) continue;
        const r = ratio(fill.slice(0, 3), bgOf(el));
        if (r < 3) bad.push(`アイコン「${name}」: ${r.toFixed(2)}`);
      }
      if (el.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select, [role="combobox"]')) {
        const s = getComputedStyle(el);
        const parentBg = bgOf(el.parentElement);
        const sides = [
          [s.borderTopWidth, s.borderTopColor], [s.borderRightWidth, s.borderRightColor],
          [s.borderBottomWidth, s.borderBottomColor], [s.borderLeftWidth, s.borderLeftColor],
        ].filter(([w]) => parseFloat(w) >= 1).map(([, c]) => ratio(parse(c).slice(0, 3), parentBg));
        const best = Math.max(ratio(bgOf(el), parentBg), ...sides, 0);
        if (best < 3) bad.push(`入力欄の境界「${name}」: ${best.toFixed(2)}`);
      }
    }
    return [...new Set(bad)];
  }, 'button, a[href], input, textarea, select, [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="combobox"], [role="slider"], [role="menuitem"]');
}

/** 縁・角のドラッグ（CONTRACT.md §23 の resize-e・resize-s・resize-se） */
async function dragEdge(page: Page, c: Locator, edge: 'e' | 's' | 'se', dx: number, dy: number): Promise<void> {
  await c.hover();
  const h = c.getByTestId(`resize-${edge}`).first();
  await expect(h, `縁・角のつまみ resize-${edge} がない`).toBeAttached();
  const b = await box(h);
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 });
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

// ───────────────────────────── FR-220 ─────────────────────────────
test.describe('FR-220 2D/3D の切替の一本化', () => {
  // FR-220 AC-515
  test('FR-220 AC-515 左メニューに「3D ビュー」の 2D/3D 切替の項目がなく、画面の見出しの「ビュー」で 3D にすると 3D の表現を持つ画面コンポーネント（ピン止めを除く）がすべて 3D になり、2D に戻すと 2D になる', async ({ page, start }) => {
    test.setTimeout(300_000);
    await start();
    await selectPersona(page, '事業部門');
    const nav = page.getByRole('navigation', { name: '画面', exact: true });
    await expect(nav.getByRole('menuitemradio', { name: /^(2D|3D)$/ }), '左メニューに 2D/3D の切替の項目がある').toHaveCount(0);
    await expect(nav.getByRole('switch', { name: /3D/ }), '左メニューに 3D の切替のスイッチがある').toHaveCount(0);
    await expect(nav.getByRole('button', { name: /^3D ビュー$/ }), '左メニューに「3D ビュー」の切替の項目がある').toHaveCount(0);
    await expect(nav.getByRole('link', { name: /^3D ビュー$/ }), '左メニューに「3D ビュー」の切替の項目がある').toHaveCount(0);
    const keys = (await listScreenKeys(page)).filter((k) => SCREENS_3D.includes(k));
    expect(keys.length, '3D の表現を持つ画面が 1 つ以上必要').toBeGreaterThanOrEqual(1);
    for (const key of keys) {
      await gotoScreen(page, key);
      const comps = await topKeys(page);
      // 3D が選べる（2D/3D の両方が有効な）コンポーネントを求める
      const capable: string[] = [];
      for (const k of comps) {
        const c = component(page, k);
        if ((await viewButton(c).count()) === 0) continue;
        const menu = await openViewMenu(page, c);
        if (await menu.getByRole('menuitemradio', { name: '3D', exact: true }).isEnabled()) capable.push(k);
        await page.keyboard.press('Escape');
      }
      const heading = screenViewButton(page);
      await heading.click();
      await page.getByRole('menuitemradio', { name: '3D', exact: true }).click();
      for (const k of capable) expect((await viewState(page, k)).mode, `${key}/${k}: 画面の見出しの「ビュー」で 3D にならない`).toBe('3d');
      await screenViewButton(page).click();
      await page.getByRole('menuitemradio', { name: '2D', exact: true }).click();
      for (const k of capable) expect((await viewState(page, k)).mode, `${key}/${k}: 2D に戻らない`).toBe('2d');
    }
  });

  // FR-220 AC-515（異常系: ピン止めしたコンポーネントは画面の見出しの切替で変わらない）
  test('FR-220 AC-515 異常系: ピン止めしたコンポーネントは、画面の見出しの「ビュー」で 3D にしても表示モードが変わらない', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const c = await gotoScreen(page, 'knowledge-graph');
    await chooseView(page, c, '2D');
    await c.focus();
    await pinButton(c).click();
    await expect(pinButton(c)).toHaveAccessibleName('ピン止めを外す');
    await screenViewButton(page).click();
    await page.getByRole('menuitemradio', { name: '3D', exact: true }).click();
    expect((await viewState(page, 'knowledge-graph')).mode, 'ピン止めしたコンポーネントが 3D になった').toBe('2d');
    // 見出し自身の「ビュー」では変えられる
    await chooseView(page, component(page, 'knowledge-graph'), '3D');
    expect((await viewState(page, 'knowledge-graph')).mode).toBe('3d');
  });
});

// FR-228 AC-529: 実入力で移動し、画面移動後・再配置前の DOM と再配置後の位置を比べる。
async function componentScrollOffset(c: Locator): Promise<{ x: number; y: number }> {
  return c.evaluate((el) => {
    const workspace = el.closest('[data-testid="workspace"]');
    let x = 0, y = 0;
    for (let node = el.parentElement; node; node = node.parentElement) {
      x += node.scrollLeft;
      y += node.scrollTop;
      if (node === workspace) break;
    }
    return { x, y };
  });
}

/**
 * 一覧の項目をキーボードで前面に出す操作は、ステップの現在位置を変更しない。
 * 先に移動先を前面化し、画面を開く処理による最小化と次のステップ再配置を区別する。
 */
async function raiseStepDestination(page: Page, key: string, sourceStep: string): Promise<void> {
  const item = page.getByTestId('window-list').locator(`[data-testid="window-list-item"][data-component-key="${key}"]`);
  const state = await item.getAttribute('data-state');
  if (state !== 'front') {
    expect(['visible', 'minimized', 'behind'], `${key}: 一覧から前面化できる状態`).toContain(state);
    await item.focus();
    await expect(item).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(item, `${key}: ステップのクリック前に移動先を前面化`).toHaveAttribute('data-state', 'front');
  await expect(page.getByTestId('stepper').locator('[data-step-state="current"]'),
    '前面化だけでは元のステップを変えない').toContainText(sourceStep);
  // サイズの自動調整は有効のまま、ステップのクリック前にコンポーネントの外へ焦点を移す。
  // クリックに伴う単なるフォーカス移動を、再配置そのものと取り違えない。
  const outside = page.getByRole('switch', { name: 'サイズの自動調整' });
  await outside.focus();
  await expect(outside).toBeFocused();
}

async function verifyManualPosition(page: Page, input: 'mouse' | 'touch', testInfo: import('@playwright/test').TestInfo) {
    await openNewProject(page, `${input}試験株式会社`, `${input}位置保持`);
    const stepper = page.getByTestId('stepper');
    await stepper.getByRole('button', { name: '現状分析', exact: true }).click();
    await expect(stepper.locator('[data-step-state="current"]')).toContainText('現状分析');
    await expect(component(page, 'knowledge-graph'), '現状分析の作業画面').toBeVisible();
    await raiseStepDestination(page, 'priority', '現状分析');
    await expect(component(page, 'priority').getByRole('heading', { name: '優先順位分析', exact: true }), 'KPI 測定の作業画面').toBeVisible();
    await settle(page, await topKeys(page));
    let info = await stepInfo(page);
    const key = info.find((i) => i.key !== 'priority' && i.key !== 'knowledge-graph')?.key;
    expect(key, '前提: 両方の作業画面とは別に手で動かす対象').toBeTruthy();
    // 再配置の両方の移動先と手動対象だけを表示し、前面化の際の上限超過を避ける。
    while (info.length > 3) {
      const extra = [...info].reverse().find((i) => i.key !== 'priority' && i.key !== 'knowledge-graph' && i.key !== key);
      expect(extra, '前提: 余分な表示を最小化する対象').toBeTruthy();
      await raiseStepDestination(page, extra!.key, '現状分析');
      const item = page.getByTestId('window-list').locator(`[data-testid="window-list-item"][data-component-key="${extra!.key}"]`);
      await item.focus();
      await page.keyboard.press('Enter');
      await expect(item).toHaveAttribute('data-state', 'minimized');
      info = await stepInfo(page);
    }
    await settle(page, await topKeys(page));
    const c = component(page, key!);
    await expect(c.getByTestId('component-actions').locator('button[aria-label^="ピン止め"]'),
      '手動移動の対象はピン止めされていない').toHaveAttribute('aria-label', 'ピン止めする');
    const heading = c.getByRole('heading').first();
    await heading.scrollIntoViewIfNeeded();
    const h = await box(heading);
    const original = await box(c);
    const x = h.x + h.width / 2;
    const y = h.y + h.height / 2;
    if (input === 'touch') {
      // CDP の touchStart/touchMove/touchEnd は実入力経路。合成 DOM イベントではない。
      const cdp = await page.context().newCDPSession(page);
      try {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        for (let i = 1; i <= 10; i++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 80 * i / 10, y: y + 60 * i / 10, id: 1 }] });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } finally { await cdp.detach(); }
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 80, y + 60, { steps: 10 });
      await page.mouse.up();
    }
    await expect.poll(async () => {
      const b = await box(c);
      return Math.abs(b.x - original.x) + Math.abs(b.y - original.y);
    }, { message: `前提: ${input} で位置が実際に変わる` }).toBeGreaterThan(0);
    await settle(page, await topKeys(page));
    const manual = await box(c);
    const manualWorkspace = await box(page.getByTestId('workspace'));
    const manualScroll = await componentScrollOffset(c);
    for (const [source, step, target] of [
      ['現状分析', 'KPI 測定', 'priority'],
      ['KPI 測定', '現状分析', 'knowledge-graph'],
    ] as const) {
      await raiseStepDestination(page, target, source);
      await settle(page, await topKeys(page));
      const before = await observeStepNavigation(page, step, target);
      await testInfo.attach(`${input}-${step}-before-reflow`, { body: JSON.stringify(before, null, 2), contentType: 'application/json' });
      expectBeforeReflowObservation(before);
      const atNavigation = before.windows.find((w) => w.key === key);
      expect(atNavigation?.rect, `${input}: 移動後・再配置直前に対象が表示されている`).toBeTruthy();
      expect(atNavigation!.scrollOffset, '対象のスクロール位置').toBeTruthy();
      expect(atNavigation!.rect!.x - before.workspace.x + atNavigation!.scrollOffset!.x, `${input}: 手動移動後から再配置直前の x`).toBe(manual.x - manualWorkspace.x + manualScroll.x);
      expect(atNavigation!.rect!.y - before.workspace.y + atNavigation!.scrollOffset!.y, `${input}: 手動移動後から再配置直前の y`).toBe(manual.y - manualWorkspace.y + manualScroll.y);
      await settle(page, await topKeys(page));
      const after = await box(c);
      const afterWorkspace = await box(page.getByTestId('workspace'));
      const afterScroll = await componentScrollOffset(c);
      await testInfo.attach(`${input}-${step}-position-comparison`, {
        body: JSON.stringify({ manual, manualWorkspace, manualScroll, before: atNavigation!.rect, beforeWorkspace: before.workspace,
          beforeScroll: atNavigation!.scrollOffset, after, afterWorkspace, afterScroll }, null, 2),
        contentType: 'application/json',
      });
      expect(after.x - afterWorkspace.x + afterScroll.x, `${input}: 再配置で x が上書きされた`).toBe(atNavigation!.rect!.x - before.workspace.x + atNavigation!.scrollOffset!.x);
      expect(after.y - afterWorkspace.y + afterScroll.y, `${input}: 再配置で y が上書きされた`).toBe(atNavigation!.rect!.y - before.workspace.y + atNavigation!.scrollOffset!.y);
      await expect(stepper.locator('[data-step-state="current"]'), `${input}: ステップの選択が残る`).toContainText(step);
      await expect(page.getByTestId('window-list').locator(`[data-testid="window-list-item"][data-component-key="${target}"]`),
        `${input}: 作業画面への移動が残る`).toHaveAttribute('data-state', 'front');
      await expect(component(page, target), `${input}: 移動先の画面が表示される`).toBeVisible();
    }
  }

// ───────────────────────────── FR-221 ─────────────────────────────
/** 要素の文字の全体が、その要素と、overflow が visible でない祖先の表示範囲に収まっているか（はみ出しの内容を返す） */
async function clipProblems(loc: Locator): Promise<string[]> {
  return loc.evaluate((el) => {
    const out: string[] = [];
    const range = document.createRange();
    range.selectNodeContents(el);
    const t = range.getBoundingClientRect();
    if (t.width === 0 || t.height === 0) return ['文字の範囲が 0'];
    const r = el.getBoundingClientRect();
    const eps = 0.5;
    if (t.top < r.top - eps) out.push(`文字の上端が要素の上端より上（${(r.top - t.top).toFixed(1)}px）`);
    if (t.bottom > r.bottom + eps) out.push(`文字の下端が要素の下端より下（${(t.bottom - r.bottom).toFixed(1)}px）`);
    if ((el as HTMLElement).scrollHeight > (el as HTMLElement).clientHeight + 1) out.push('要素の高さが内容の高さより小さい（scrollHeight > clientHeight）');
    for (let a = el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowY === 'visible' && s.overflowX === 'visible') continue;
      const ar = a.getBoundingClientRect();
      if (t.top < ar.top - eps || t.bottom > ar.bottom + eps) out.push(`祖先の表示範囲で文字が切れる（${a.tagName}${a.getAttribute('data-testid') ? '[' + a.getAttribute('data-testid') + ']' : ''}）`);
    }
    return out;
  });
}

test.describe('FR-221 左メニュー「メニューを最小化」の文字の全表示', () => {
  for (const theme of THEMES) {
    // FR-221 AC-517
    test(`FR-221 AC-517 ${theme}: 左メニュー最上部の「メニューを最小化」の文字の全体（上端・下端）が表示範囲に収まり、拡大率 200% でも欠けない`, async ({ page, start }) => {
      await applyTheme(page, theme);
      await start();
      await selectPersona(page, '事業部門');
      const toggle = page.getByRole('button', { name: 'メニューを最小化' });
      await expect(toggle).toBeVisible();
      await expect(toggle, '文字が見えない').not.toHaveText('');
      expect(await clipProblems(toggle), '標準の文字の大きさで文字が欠ける').toEqual([]);
      await zoomTextOnly(page, 2);
      expect(await clipProblems(page.getByRole('button', { name: 'メニューを最小化' })), '拡大率 200% で文字が欠ける').toEqual([]);
    });
  }

  // FR-221 AC-517（異常系: 最小化して戻した後の「メニューを元の幅に戻す」・戻した後の「メニューを最小化」でも欠けない）
  test('FR-221 AC-517 異常系: 左メニューを最小化して元の幅に戻した後も、「メニューを最小化」の文字は上下とも欠けない', async ({ page, start }) => {
    await start();
    await page.getByRole('button', { name: 'メニューを最小化' }).click();
    const back = page.getByRole('button', { name: 'メニューを元の幅に戻す' });
    await expect(back).toBeVisible();
    await back.click();
    const toggle = page.getByRole('button', { name: 'メニューを最小化' });
    await expect(toggle).toBeVisible();
    expect(await clipProblems(toggle)).toEqual([]);
  });
});

// ───────────────────────────── FR-222 ─────────────────────────────
test.describe('FR-222 画面コンポーネント右上の操作アイコン', () => {
  // FR-222 AC-518
  test('FR-222 AC-518 全画面の各コンポーネントの見出しの右上に最小化・最大化（元に戻す）のアイコンがあり、名前がホバー・フォーカスで出て、押すと FR-151・FR-013 と同じ結果になり、キーボードだけで操作でき、常設ボタンが 6 個以下', async ({ page, start }) => {
    test.setTimeout(300_000);
    await start();
    await selectPersona(page, '事業部門');
    for (const key of await listScreenKeys(page)) {
      if (key === 'settings') continue; // モーダルの設定は対象外（FR-223）
      await gotoScreen(page, key);
      let shown = 0;
      for (const k of await topKeys(page)) {
        const c = component(page, k);
        // FR-143 の自動サイズ調整が先の focus でタブをまとめ直すと、後の部品は非表示のタブ内になる。表示中のものだけを対象にする
        if (!(await c.isVisible())) continue;
        await c.focus();
        if (!(await c.isVisible())) continue; // focus 後にも再確認
        shown++;
        const a = wctl(c);
        await expect(a, `${key}/${k}: 見出しに最小化・最大化・閉じるのアイコンがない`).toBeVisible();
        const ab = await box(a);
        const cb = await box(c);
        expect(ab.x + ab.width / 2, `${key}/${k}: 操作アイコンが見出しの右側にない（Windows の慣習）`).toBeGreaterThan(cb.x + cb.width / 2);
        expect(ab.y - cb.y, `${key}/${k}: 操作アイコンが見出し（上部）にない`).toBeLessThanOrEqual(cb.height * 0.25);
        const min = a.getByRole('button', { name: '最小化', exact: true });
        const max = a.getByRole('button', { name: /^(最大化|元に戻す)$/ });
        const close = a.getByRole('button', { name: '閉じる', exact: true });
        await expect(min, `${key}/${k}: 最小化のアイコンがない`).toBeVisible();
        await expect(max, `${key}/${k}: 最大化のアイコンがない`).toBeVisible();
        await expect(close, `${key}/${k}: 閉じるのアイコンがない`).toBeVisible();
        for (const b of [min, max, close]) await expect(b.locator('svg, img, [data-icon-variant]').first(), `${key}/${k}: アイコンの図がない（文字だけ）`).toBeAttached();
        // 常設ボタンの数（「その他の操作」を開くボタンは数えない）
        const permanent = await permanentCount(c);
        expect(permanent, `${key}/${k}: 常設ボタンが多い`).toBeLessThanOrEqual(MAX_PERMANENT_BUTTONS);
      }
      expect(shown, `${key}: 表示中の画面コンポーネントが 1 つもない`).toBeGreaterThanOrEqual(1);
    }
    // 1 つのコンポーネントで、名前（ホバー・フォーカス）と結果（FR-151 最小化・FR-013 最大化）とキーボード操作を確かめる
    const c = await openScreen(page, 'priority'); // 画面「キャンバス」は廃止（FR-012）
    await c.focus();
    const a = wctl(c);
    await a.getByRole('button', { name: '最小化' }).hover();
    await expect(page.getByRole('tooltip').filter({ hasText: '最小化' }).first(), 'ホバーで名前が出ない').toBeVisible();
    await page.mouse.move(0, 0);
    await a.getByRole('button', { name: '最大化', exact: true }).focus();
    await expect(page.getByRole('tooltip').filter({ hasText: '最大化' }).first(), 'フォーカスで名前が出ない').toBeVisible();
    const before = await box(c);
    await page.keyboard.press('Enter'); // キーボードだけで最大化
    await expect(c).toHaveAttribute('data-maximized', 'true');
    expect((await box(c)).width * (await box(c)).height).toBeGreaterThan(before.width * before.height);
    await a.getByRole('button', { name: '元に戻す', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(c).not.toHaveAttribute('data-maximized', 'true');
    await a.getByRole('button', { name: '最小化' }).focus();
    await page.keyboard.press('Enter');
    await expect(c).toHaveAttribute('data-minimized', 'true');
  });

  // FR-222 AC-518（異常系: 幅を狭くしても最小化・最大化・閉じるは見出しに残り、ピン止め・タブ・ビューだけが「…」に畳まれ、畳んだ操作は「…」メニューとコマンドパレットから実行できる）
  test('FR-222 AC-518 異常系: 幅を狭くしても最小化・最大化・閉じるは見出しに残り、常設ボタンは 6 個を超えず、畳んだ操作（ピン止め・タブ・ビュー）は「その他の操作」メニューとコマンドパレットから実行できる', async ({ page, start }) => {
    await page.setViewportSize({ width: 320, height: 800 }); // PARAM-029 の境界。さらに狭い 300 でも同じ
    await start();
    await selectPersona(page, '事業部門');
    for (const width of [320, 300]) {
      await page.setViewportSize({ width, height: 800 });
      const [k] = await topKeys(page);
      const c = component(page, k);
      await c.focus();
      const w = wctl(c);
      await expect(w.getByRole('button', { name: '最小化', exact: true }), `${width}px: 最小化が消える`).toBeVisible();
      await expect(w.getByRole('button', { name: /^(最大化|元に戻す)$/ }), `${width}px: 最大化が消える`).toBeVisible();
      await expect(w.getByRole('button', { name: '閉じる', exact: true }), `${width}px: 閉じるが消える`).toBeVisible();
      expect(await permanentCount(c), `${width}px: 常設ボタン`).toBeLessThanOrEqual(MAX_PERMANENT_BUTTONS);
    }
    const [k] = await topKeys(page);
    const c = component(page, k);
    await c.focus();
    // ピン止め・タブ・ビューは常設から畳まれる（見出しに直接は並ばない）
    await expect(pinButton(c), '狭い幅でピン止めが常設のまま').toHaveCount(0);
    await actions(c).getByRole('button', { name: 'その他の操作' }).click();
    const menu = page.getByRole('menu').last();
    await expect(menu.getByRole('menuitem').first(), '「その他の操作」に畳んだ操作がない').toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /ピン止め/ }).first(), '畳んだピン止めがメニューにない').toBeVisible();
    await page.keyboard.press('Escape');
    // 畳んだ操作（ピン止め）をコマンドパレットからも実行できる
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'コマンドパレット' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox').fill('ピン止め');
    await expect(dialog.getByRole('option', { name: /ピン止め/ }).first(), '畳んだ操作がコマンドパレットにない').toBeVisible();
  });
});

// ───────────────────────────── FR-223 ─────────────────────────────
test.describe('FR-223 設定のモーダル表示', () => {
  async function openSettings(page: Page): Promise<Locator> {
    // 設定は画面上部のツールバーのボタン「設定」から開く（FR-223 AC-774。左メニューには項目がない）
    await settingsButton(page).click();
    const modal = page.getByRole('dialog', { name: '設定' });
    await expect(modal, '設定のモーダルが開かない').toBeVisible();
    return modal;
  }

  // FR-223 AC-519
  test('FR-223 AC-519 「設定」を開くと奥のすべてのコンポーネントが暗くなって操作できず、固定の大きさの設定画面が前面に出て、キャンバスのコンポーネントとして並ばず、既定のレイアウトに戻す・再読込の対象にならない', async ({ page, start }) => {
    const app = await start();
    await selectPersona(page, '事業部門');
    const before = await topKeys(page);
    expect(before.length).toBeGreaterThanOrEqual(2);
    const modal = await openSettings(page);
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    // 暗くなる（バックドロップが全面を覆い、色が透明でない）
    const backdrop = page.getByTestId('modal-backdrop');
    await expect(backdrop).toBeVisible();
    const bg = await backdrop.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg, 'バックドロップが透明').not.toMatch(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)|transparent/);
    // 奥のすべてのコンポーネントは、その中心の点でバックドロップが受ける（操作できない）
    for (const k of before) {
      const b = await box(component(page, k));
      const hit = await page.evaluate(([x, y]) => {
        const e = document.elementFromPoint(x, y);
        return { backdrop: !!e?.closest('[data-testid="modal-backdrop"]'), modal: !!e?.closest('[role="dialog"]') };
      }, [b.x + b.width / 2, b.y + b.height / 2] as const);
      expect(hit.backdrop || hit.modal, `${k}: 奥のコンポーネントが操作できる状態`).toBe(true);
    }
    // 前面の固定の大きさ（画面の大きさが変わっても同じ。画面に収まる範囲）
    const size1 = await box(modal);
    await page.setViewportSize({ width: 1500, height: 880 });
    const size2 = await box(modal);
    expect(Math.abs(size1.width - size2.width), '設定の幅が固定でない').toBeLessThanOrEqual(2);
    expect(Math.abs(size1.height - size2.height), '設定の高さが固定でない').toBeLessThanOrEqual(2);
    // キャンバスのコンポーネントとして並ばない
    await expect(page.getByTestId('workspace').getByTestId('component-settings'), '設定がコンポーネントとして並んでいる').toHaveCount(0);
    expect(await topKeys(page)).not.toContain('settings');
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    // 既定のレイアウトに戻す・再読込の後も、設定はコンポーネントとして現れない
    await page.getByRole('button', { name: /レイアウトを既定に戻す|既定のレイアウトに戻す/ }).click();
    expect(await topKeys(page)).not.toContain('settings');
    await app.reload();
    expect(await topKeys(page)).not.toContain('settings');
  });

  // FR-223 AC-519（異常系: 設定を開いている間にキーボードで奥のコンポーネントを操作できない）
  test('FR-223 AC-519 異常系: 設定を開いている間、Tab を何度押しても焦点は奥のコンポーネントに出ず、閉じると奥のコンポーネントが操作できる', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const modal = await openSettings(page);
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
      expect(inside, `Tab ${i + 1} 回目で焦点が設定の外に出た`).toBe(true);
    }
    await modal.getByRole('button', { name: '閉じる' }).click();
    await expect(modal).toBeHidden();
    const [k] = await topKeys(page);
    await component(page, k).focus();
    await expect(actions(component(page, k))).toBeVisible();
  });

  /** 画面の先頭から Tab だけで上部のボタン「設定」に焦点を移す（到達できなければ失敗） */
  async function tabToSettingsButton(page: Page): Promise<void> {
    // 文書の先頭に焦点の起点を置く（Tab の順に入らない tabindex=-1 の印。到達後に取り除く）
    await page.evaluate(() => {
      const s = document.createElement('span');
      s.tabIndex = -1;
      s.setAttribute('data-st-focus-start', '');
      document.body.prepend(s);
      s.focus();
    });
    try {
      for (let i = 0; i < 80; i++) {
        await page.keyboard.press('Tab');
        const on = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'settings-button');
        if (on) return;
      }
      throw new Error('画面の上部から Tab でボタン「設定」に到達できない');
    } finally {
      await page.evaluate(() => document.querySelector('[data-st-focus-start]')?.remove());
    }
  }

  // FR-223 AC-774（左メニューに項目がなく、上部のツールバーのボタン「設定」から開く。異常系: 「設定パネル」の名称・左メニューの項目が残っていれば失敗）
  test('FR-223 AC-774 左メニューに「設定」「設定パネル」の項目がなく、上部のツールバーのボタン「設定」をクリック・Tab で到達して Enter／Space で押すと最初の見出しが「設定」のモーダルが開き、「設定パネル」の文字はどこにも表示されず、幅 320px でも上部からキーボードで開ける', async ({ page, start }) => {
    await start();
    // 左メニューに「設定」「設定パネル」の項目がない
    const nav = page.getByRole('navigation', { name: '画面', exact: true });
    await expect(nav, '左メニュー（navigation「画面」）がない').toBeAttached();
    await expect(page.getByTestId('nav-settings'), '左メニューに設定の項目が残っている').toHaveCount(0);
    for (const role of ['button', 'link', 'menuitem', 'menuitemradio', 'tab', 'option', 'treeitem'] as const) {
      await expect(nav.getByRole(role, { name: /^\s*設定(パネル)?\s*$/ }), `左メニューに ${role}「設定」がある`).toHaveCount(0);
    }
    await expect(nav.getByText(/^\s*設定(パネル)?\s*$/), '左メニューに「設定」の文字の項目がある').toHaveCount(0);

    // 上部のツールバーに、アクセシブルな名前「設定」のボタンがある（左メニューの外。AI の状態表示と同じ上部の段で、作業先の段より上ではない）
    const btn = settingsButton(page);
    await expect(btn, '上部にボタン「設定」がない').toBeVisible();
    await expect(btn).toHaveRole('button');
    await expect(btn).toHaveAccessibleName('設定');
    expect(await btn.evaluate((e) => !!e.closest('nav, [role="navigation"]')), 'ボタン「設定」が左メニューの中にある').toBe(false);
    const b = await box(btn);
    const ai = await box(page.getByTestId('ai-status'));
    expect(b.y < ai.y + ai.height && ai.y < b.y + b.height, `ボタン「設定」（y=${b.y}）が AI の状態表示（y=${ai.y}）と同じ上部の段にない`).toBe(true);
    const wt = await box(page.getByTestId('work-target-menu'));
    expect(b.y, 'ボタン「設定」が作業先の段より上にある').toBeGreaterThanOrEqual(wt.y - 1);
    expect(await page.locator('body').innerText(), '「設定パネル」の文字が表示されている').not.toContain('設定パネル');

    // クリックで開く: AC-519 のモーダル。最初の見出しが「設定」
    await btn.click();
    const modal = settingsDialog(page);
    await expect(modal, 'クリックで設定のモーダルが開かない').toBeVisible();
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByTestId('modal-backdrop')).toBeVisible();
    await expect(modal.getByRole('heading').first(), '設定の最初の見出しが「設定」でない').toHaveText('設定');
    expect(await page.locator('body').innerText(), '設定を開いた画面に「設定パネル」の文字がある').not.toContain('設定パネル');
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    // キーボード: Tab で到達して Enter／Space で開く
    for (const key of ['Enter', 'Space'] as const) {
      await tabToSettingsButton(page);
      await page.keyboard.press(key);
      await expect(modal, `${key} で設定が開かない`).toBeVisible();
      await expect(modal.getByRole('heading').first()).toHaveText('設定');
      await modal.getByRole('button', { name: '閉じる' }).click();
      await expect(modal).toBeHidden();
    }

    // 幅 320px（PARAM-029）でも、上部からキーボードでボタン「設定」に到達して開ける
    await page.setViewportSize({ width: 320, height: 800 });
    await tabToSettingsButton(page);
    const nb = await box(settingsButton(page));
    expect(nb.x + nb.width, '幅 320px でボタン「設定」が画面の外').toBeLessThanOrEqual(321);
    expect(nb.x).toBeGreaterThanOrEqual(-1);
    await page.keyboard.press('Enter');
    await expect(modal, '幅 320px で設定が開かない').toBeVisible();
    await expect(modal.getByRole('heading').first()).toHaveText('設定');
    await expect(modal.getByRole('heading').first()).toBeInViewport();
    expect(await page.locator('body').innerText()).not.toContain('設定パネル');
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
  });
});

// ───────────────────────────── FR-224 ─────────────────────────────
test.describe('FR-224 コンポーネントの縦横の独立したサイズ変更', () => {
  // FR-296 AC-800/801: 既定の構成の下限（360x240）と作業領域のゾーンにより、1600x900 では 2 行目が画面外になるため、画面の高さを広げて前提を揃える（検証内容は変えない）。
  test.use({ viewport: { width: 1600, height: 1400 } });
  // FR-224 AC-521
  test('FR-224 AC-521 右の縁だけ・下の縁だけをドラッグすると横だけ・縦だけが変わり、角では両方が変わり、最小の大きさを下回れない', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const [k] = await topKeys(page);
    const c = component(page, k);
    const b0 = await box(c);
    await dragEdge(page, c, 'e', -40, 0);
    await settle(page, [k]);
    const b1 = await box(c);
    expect(b1.width, '右の縁のドラッグで横が変わらない').toBeLessThan(b0.width - 10);
    expect(Math.abs(b1.height - b0.height), '右の縁のドラッグで縦が変わった').toBeLessThanOrEqual(2);
    await dragEdge(page, c, 's', 0, -40);
    await settle(page, [k]);
    const b2 = await box(c);
    expect(b2.height, '下の縁のドラッグで縦が変わらない').toBeLessThan(b1.height - 10);
    expect(Math.abs(b2.width - b1.width), '下の縁のドラッグで横が変わった').toBeLessThanOrEqual(2);
    await dragEdge(page, c, 'se', 30, 30);
    await settle(page, [k]);
    const b3 = await box(c);
    expect(b3.width, '角のドラッグで横が変わらない').toBeGreaterThan(b2.width + 10);
    expect(b3.height, '角のドラッグで縦が変わらない').toBeGreaterThan(b2.height + 10);
  });

  // FR-224 AC-521（異常系: 小さくし続けても最小の大きさ（内容が読める下限）で止まる）
  test('FR-224 AC-521 異常系: 縁・角を大きく小さい側へドラッグしても最小の大きさで止まり、それ以上は小さくならず、見出しが見えたままである', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const [k] = await topKeys(page);
    const c = component(page, k);
    await dragEdge(page, c, 'se', -3000, -3000);
    await settle(page, [k]);
    const min1 = await box(c);
    expect(min1.width, '横が 0 に近づく').toBeGreaterThanOrEqual(80);
    expect(min1.height, '縦が 0 に近づく').toBeGreaterThanOrEqual(60);
    await dragEdge(page, c, 'se', -500, -500);
    await settle(page, [k]);
    const min2 = await box(c);
    expect(min2.width, '最小の大きさを下回って小さくなる（横）').toBeGreaterThanOrEqual(min1.width - 2);
    expect(min2.height, '最小の大きさを下回って小さくなる（縦）').toBeGreaterThanOrEqual(min1.height - 2);
    await expect(c.getByRole('heading').first()).toBeVisible();
  });
});

// ───────────────────────────── FR-225 ─────────────────────────────
test.describe('FR-225 Fluent 2 のコントラスト', () => {
  for (const theme of THEMES) {
    // FR-225 AC-523
    test(`FR-225 AC-523 ${theme}: 全画面（選択して関連しない項目を減光した状態と設定のモーダルを含む）で、通常の文字 4.5:1・大きな文字 3:1・アイコンと UI 部品の境界 3:1 未満が 0 件`, async ({ page, start }, testInfo) => {
      test.setTimeout(400_000);
      await applyTheme(page, theme);
      await start();
      await selectPersona(page, '事業部門');
      // 項目を 1 つ選び、減光の状態を作る（FR-227。減光した文字も対象）
      const table = await openScreen(page, 'table');
      await table.locator('[role="row"][data-entity-id]').first().click();
      const text: string[] = [];
      const nonText: string[] = [];
      let scanned = 0;
      for (const key of await listScreenKeys(page)) {
        if (key === 'settings') continue;
        await gotoScreen(page, key);
        text.push(...(await textContrastViolations(page)).map((x) => `${key}: ${x}`));
        nonText.push(...(await nonTextContrastFailures(page)).map((x) => `${key}: ${x}`));
        scanned++;
      }
      // 設定（モーダル）
      await settingsButton(page).click(); // 上部のボタン「設定」（FR-223 AC-774）
      await expect(page.getByRole('dialog', { name: '設定' })).toBeVisible();
      text.push(...(await textContrastViolations(page)).map((x) => `設定: ${x}`));
      nonText.push(...(await nonTextContrastFailures(page)).map((x) => `設定: ${x}`));
      // フォーカスの表示（3:1。キーボードで焦点を当てた要素の輪郭の色と背景）
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const e = document.activeElement as HTMLElement | null;
        if (!e) return null;
        const s = getComputedStyle(e);
        return { outlineStyle: s.outlineStyle, outlineWidth: parseFloat(s.outlineWidth), outlineColor: s.outlineColor, boxShadow: s.boxShadow };
      });
      expect(focus, '焦点がない').not.toBeNull();
      expect(focus!.outlineWidth > 0 && focus!.outlineStyle !== 'none' || focus!.boxShadow !== 'none', 'フォーカスの表示がない').toBe(true);
      await testInfo.attach(`contrast-${theme}.json`, { body: JSON.stringify({ theme, screensScanned: scanned, textViolations: text, nonTextViolations: nonText }, null, 2), contentType: 'application/json' });
      expect(text, '文字のコントラスト不足（対象と最小値を含む）').toEqual([]);
      expect(nonText, 'アイコン・UI 部品の境界のコントラスト不足').toEqual([]);
    });
  }
});

// ───────────────────────────── FR-226 ─────────────────────────────
/** 画面上で見えている文字のうち、text を含む文字ノードの数 */
async function visibleTextCount(page: Page, text: string): Promise<number> {
  return page.evaluate((t) => {
    let n = 0;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = w.nextNode(); node; node = w.nextNode()) {
      if (!node.textContent?.replace(/\s+/g, ' ').includes(t)) continue;
      const el = node.parentElement;
      if (!el || el.closest('[role="menu"]')) continue;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none') n++;
    }
    return n;
  }, text);
}

test.describe('FR-226 「[顧客名] - [プロジェクト名]」の表示を 1 か所にする', () => {
  // FR-226 AC-525
  test('FR-226 AC-525 閉じた分析画面上部の現在作業先は最上段の同じ表示領域に 1 か所だけで、他段に連結・個別の重複がなく、展開メニュー項目は数えない', async ({ page, start }) => {
    await start();
    await openNewProject(page, '合成株式会社A', '業務改善 2026');
    const header = page.getByTestId('app-header');
    const target = header.getByTestId('work-target-display');
    /** 開いたメニュー内（role=menu）と非可視を除く、ヘッダー内の可視文字のうち names を含むもの（表示領域の内外別） */
    async function scan(names: string[]) {
      return header.evaluate((root, ns) => {
        const display = root.querySelector('[data-testid="work-target-display"]');
        const inside: string[] = [];
        const outside: string[] = [];
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          const el = n.parentElement;
          if (!el || el.closest('[role="menu"]')) continue;
          if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
          const r = document.createRange();
          r.selectNodeContents(n);
          if (![...r.getClientRects()].some((q) => q.width > 0 && q.height > 0)) continue;
          (display?.contains(n) ? inside : outside).push(n.textContent ?? '');
        }
        const hit = (arr: string[]) => ns.filter((x) => arr.join(' ').includes(x));
        return { inside: hit(inside), outside: hit(outside) };
      }, names);
    }
    async function expectSingle(company: string, project: string, oldProject?: string) {
      await expect(target).toHaveCount(1);
      await expect(target).toBeVisible();
      await expect(target).toContainText(company);
      await expect(target).toContainText(project);
      await expect(target).toHaveAccessibleName(new RegExp(`${company}.*${project}`));
      const r = await scan([company, project, ...(oldProject ? [oldProject] : [])]);
      expect(r.inside, '最上段の表示領域に企業名・Project 名がある').toEqual(expect.arrayContaining([company, project]));
      expect(r.outside, '他段に企業名・Project 名（連結・個別）が重複している、または前の Project 名が残る').toEqual([]);
      expect(await visibleTextCount(page, `${company} - ${project}`), '連結表記が他の場所に重複しない').toBeLessThanOrEqual(1);
      const h = await target.boundingBox();
      expect(h).not.toBeNull();
      const upper = await header.locator('button:visible, a:visible, [role="button"]:visible').evaluateAll(
        (els, top) => els.filter((el) => el.getBoundingClientRect().bottom <= top).length, h!.y);
      expect(upper, '最上段: 表示領域より上の段に可視の操作がない').toBe(0);
    }
    await expectSingle('合成株式会社A', '業務改善 2026');
    const stepperBox = await page.getByTestId('stepper').boundingBox();
    expect(stepperBox).not.toBeNull();
    expect((await target.boundingBox())!.y, '作業先表示がステッパーより上段にある').toBeLessThan(stepperBox!.y);

    // メニュー展開中も最上段の現在先表示を維持する（ナビゲーション項目・非可視名は数えない）
    await target.getByTestId('current-company-menu').click();
    const companyMenu = page.getByRole('menu', { name: '企業の Project' });
    await expect(companyMenu).toBeVisible();
    await expect(target).toBeVisible();
    await expect(target).toHaveAccessibleName(/合成株式会社A.*業務改善 2026/);
    expect((await scan(['合成株式会社A', '業務改善 2026'])).outside, '展開中も他段に重複しない').toEqual([]);
    await page.keyboard.press('Escape');
    await expect(companyMenu).toBeHidden();
    await expectSingle('合成株式会社A', '業務改善 2026');
  });

  // FR-226 AC-525（異常系: 企業の選択だけでは表示が変わらず、Project 確定後にだけ切り替わり、旧表示が残らない）
  test('FR-226 AC-525 異常系: 別企業の選択中は現在表示を維持し、Project 確定後は新表示だけが最上段に 1 か所残る', async ({ page, start }) => {
    await start();
    await openNewProject(page, '合成株式会社A', '業務改善 2026');
    await page.getByRole('button', { name: 'Project 一覧へ' }).click();
    await page.getByRole('button', { name: '企業を登録' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('textbox', { name: '企業名' }).fill('合成株式会社B');
    await dlg.getByRole('button', { name: '登録' }).click();
    await expect(dlg).toBeHidden();
    await createProject(page, '合成株式会社B', '需要予測');
    await page.getByRole('region', { name: '企業 合成株式会社A' }).getByRole('link', { name: '業務改善 2026' }).click();
    await expect(page.getByTestId('stepper')).toBeVisible();
    const header = page.getByTestId('app-header');
    const target = header.getByTestId('work-target-display');
    const companyBtn = target.getByTestId('current-company-menu');
    const menu = page.getByRole('menu', { name: '企業の Project' });
    /** ヘッダー内の可視文字（開いたメニュー内を除く）に text を含む文字ノードの数 */
    const count = (text: string) => header.evaluate((root, t) => {
      let n = 0;
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let x = w.nextNode(); x; x = w.nextNode()) {
        const el = x.parentElement;
        if (!el || el.closest('[role="menu"]') || !x.textContent?.includes(t)) continue;
        if (el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) n++;
      }
      return n;
    }, text);
    await companyBtn.click();
    await menu.getByRole('button', { name: '合成株式会社B', exact: true }).click();
    await expect(menu.getByRole('menuitemradio', { name: /合成株式会社B.*需要予測/ })).toBeVisible();
    await expect(target).toHaveAccessibleName(/合成株式会社A.*業務改善 2026/);
    expect(await count('業務改善 2026'), '企業だけ選んだ時点で現在作業先は変わらず 1 か所').toBe(1);
    expect(await count('合成株式会社B'), '選択中の企業が最上段表示に出ない').toBe(0);

    await menu.getByRole('menuitemradio', { name: /合成株式会社B.*需要予測/ }).click();
    await expect(page.getByTestId('stepper')).toBeVisible();
    await expect(menu).toBeHidden();
    await expect(target).toHaveAccessibleName(/合成株式会社B.*需要予測/);
    expect(await count('需要予測'), '新しい現在作業先の可視表示は 1 か所').toBe(1);
    expect(await count('合成株式会社B'), '企業名の可視表示は 1 か所').toBe(1);
    expect(await count('業務改善 2026'), '前の Project 名が残る').toBe(0);
    expect(await count('合成株式会社A'), '前の企業名が残る').toBe(0);
  });
});

// ───────────────────────────── FR-227 ─────────────────────────────
test.describe('FR-227 選択した項目に関連する要素の全コンポーネントでのハイライトと減光', () => {
  /** 各コンポーネントの項目（data-entity-id）の強調の内訳 */
  async function tally(page: Page): Promise<Array<{ key: string; items: number; lit: number; dim: number; none: number }>> {
    const out: Array<{ key: string; items: number; lit: number; dim: number; none: number }> = [];
    for (const k of await topKeys(page)) {
      const items = component(page, k).locator('[data-entity-id]');
      const n = await items.count();
      if (n === 0) continue;
      const hl = await items.evaluateAll((els) => els.map((e) => e.getAttribute('data-highlight') ?? ''));
      out.push({
        key: k,
        items: n,
        lit: hl.filter((h) => /selected|related|hover/.test(h)).length,
        dim: hl.filter((h) => /dimmed/.test(h)).length,
        none: hl.filter((h) => !/selected|related|hover|dimmed/.test(h)).length,
      });
    }
    return out;
  }

  // FR-227 AC-526
  test('FR-227 AC-526 お手本パックの項目を 1 つクリックすると、開いているほかのすべてのコンポーネントで関連する項目がハイライトされ、それ以外が薄く表示され（ハイライト数＋減光数＝項目数）、解除すると全項目が元に戻る', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const table = await openScreen(page, 'table');
    const row = table.locator('[role="row"][data-entity-id]').first();
    const id = await row.getAttribute('data-entity-id');
    expect(id, '選んだ行に data-entity-id がない').toBeTruthy();
    const base = await tally(page);
    await row.click();
    await expect(page.getByTestId('selection-indicator')).not.toHaveText('');
    await expect.poll(async () => (await tally(page)).every((t) => t.none === 0), { timeout: 5_000 }).toBe(true);
    const after = await tally(page);
    expect(after.length, '項目を持つコンポーネントが 2 つ以上必要（ほかのコンポーネントへの適用）').toBeGreaterThanOrEqual(2);
    for (const t of after) {
      expect(t.lit + t.dim, `${t.key}: ハイライト数＋減光数が項目数と一致しない（${t.lit}+${t.dim}≠${t.items}）`).toBe(t.items);
    }
    // 同じ ID の項目は、選んだコンポーネント以外でもハイライトされる
    for (const k of await topKeys(page)) {
      if (k === 'table') continue;
      for (const e of await component(page, k).locator(`[data-entity-id="${id}"]`).all()) await expect(e, `${k}: 同じ ID の項目がハイライトされない`).toHaveAttribute('data-highlight', /selected|related/);
    }
    expect(after.some((t) => t.dim > 0), '関連しない項目が薄く表示されない').toBe(true);
    // 解除（Esc）で全項目が元に戻る
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await tally(page)).every((t) => t.dim === 0 && t.lit === 0), { timeout: 5_000 }).toBe(true);
    const restored = await tally(page);
    for (const t of restored) expect(t.items, `${t.key}: 解除後に項目の数が変わった`).toBe(base.find((b) => b.key === t.key)?.items ?? t.items);
  });

  // FR-227 AC-526（異常系: 同じ項目の再クリックでも解除される）
  test('FR-227 AC-526 異常系: 選んだ項目をもう一度クリックすると、ハイライトと減光がすべて元に戻る', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const table = await openScreen(page, 'table');
    const row = table.locator('[role="row"][data-entity-id]').first();
    await row.click();
    await expect.poll(async () => (await tally(page)).some((t) => t.dim > 0), { timeout: 5_000 }).toBe(true);
    await table.locator('[role="row"][data-entity-id]').first().click();
    await expect.poll(async () => (await tally(page)).every((t) => t.dim === 0), { timeout: 5_000 }).toBe(true);
  });
});

// ───────────────────────────── FR-228 ─────────────────────────────
/** 表示中のコンポーネントの実 UI の状態と矩形。工程順は製品の自己申告から決めない。 */
async function stepInfo(page: Page) {
  const out: Array<{ key: string; active: boolean; x: number; y: number; w: number; h: number; hidden: boolean }> = [];
  const states = await page.getByTestId('window-list').getByTestId('window-list-item').evaluateAll((els) =>
    Object.fromEntries(els.map((e) => [e.getAttribute('data-component-key') ?? '', e.getAttribute('data-state') ?? ''])));
  for (const k of await topKeys(page)) {
    // 見出しだけが残る最小化項目は、再配置された表示中の矩形に数えない。
    if (!['front', 'visible'].includes(states[k])) continue;
    const c = component(page, k);
    const b = await box(c);
    out.push({
      key: k,
      active: await c.evaluate((el) => el.contains(document.activeElement)),
      x: b.x, y: b.y, w: b.width, h: b.height,
      hidden: (await c.getAttribute('data-hidden')) === 'true',
    });
  }
  return out;
}

type StepInfo = Awaited<ReturnType<typeof stepInfo>>;
const visibleReflowReason = (page: Page) => page.locator('[role="alert"], [role="status"]')
  .filter({ hasText: /領域|スペース|場所|収ま|不足|画面の幅/ }).last();

/**
 * AC-529 の大きさは作業画面（FR-228）の priority と他の表示中のものを比べる。
 * A-65 の STEPS.screens の具体的な関連集合・順序は要求文にないため、
 * data-step-relevant/rank を正解に使わず、その部分は台帳で判定保留にする。
 */
function expectStepSizes(info: StepInfo, pinned: string | null, resized: string | null, requireExamples: boolean,
  workspace: { x: number; y: number; width: number; height: number }) {
  const sizeTargets = info.filter((i) => i.key !== pinned && i.key !== resized && !i.active);
  const important = sizeTargets.filter((i) => i.key === 'priority');
  const others = sizeTargets.filter((i) => i.key !== 'priority');
  if (requireExamples) {
    expect(important.length, '大きさを比較する重要なものが必要').toBeGreaterThan(0);
    expect(others.length, '大きさを比較する重要でないものが必要').toBeGreaterThan(0);
  }
  for (const high of important) {
    for (const normal of others) {
      if (high.w * high.h > normal.w * normal.h) continue;
      // 同じ面積でも縦横が違うものは「同寸」ではない。
      expect(high.w, `${high.key}/${normal.key}: 同寸を許すには幅も等しい`).toBe(normal.w);
      expect(high.h, `${high.key}/${normal.key}: 同寸を許すには高さも等しい`).toBe(normal.h);
      // すべての他対象を下限まで縮めても作業領域を使い切るなら、並べ直しても拡大不能。
      // これで証明できない同寸は合格扱いしない（固定位置・工程順を含む一般の配置問題を推測しない）。
      const minimumOccupied = info.reduce((sum, item) => {
        const fixed = item.key === high.key || item.key === pinned || item.key === resized || item.active;
        return sum + (fixed ? item.w * item.h : 360 * 240);
      }, 0);
      const contained = info.every((i) => i.x >= workspace.x && i.y >= workspace.y
        && i.x + i.w <= workspace.x + workspace.width && i.y + i.h <= workspace.y + workspace.height);
      const disjoint = info.every((a, index) => info.slice(index + 1).every((b) =>
        a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y));
      if (!contained || !disjoint || minimumOccupied < workspace.width * workspace.height) {
        throw new Error(`${high.key}/${normal.key}: 判定不能: 同寸での拡大不能を作業領域内・非重複・下限の面積飽和から証明できない`);
      }
    }
  }
}

test.describe('FR-228 業務分析のステップの見た目と再配置', () => {
  // FR-296 AC-800/801: 既定の構成の下限（360x240）と作業領域のゾーンにより、1600x900 では 2 行目が画面外になるため、画面の高さを広げて前提を揃える（検証内容は変えない）。
  test.use({ viewport: { width: 1600, height: 1400 } });
  // FR-228 AC-528
  test('FR-228 AC-528 5 つのステップが番号またはアイコンと流れの表示を持ち、高さ・幅とも 44px 以上で、現在のステップが示される', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    const stepper = page.getByTestId('stepper');
    const items = stepper.getByRole('listitem');
    await expect(items).toHaveCount(STEPS.length);
    for (let i = 0; i < STEPS.length; i++) {
      const it = items.nth(i);
      await expect(it).toContainText(STEPS[i]);
      // 番号またはアイコン
      const marker = await it.evaluate((e) => /^\s*[0-9０-９①-⑩]/.test(e.textContent ?? '') || !!e.querySelector('svg, img, [data-step-icon], [data-step-number]'));
      expect(marker, `${STEPS[i]}: 番号もアイコンもない`).toBe(true);
      // 通常のボタンより大きい操作の大きさ
      const b = await box(it.getByRole('button', { name: new RegExp(STEPS[i]) }));
      expect(b.height, `${STEPS[i]}: 高さが ${MIN_TARGET}px 未満`).toBeGreaterThanOrEqual(MIN_TARGET);
      expect(b.width, `${STEPS[i]}: 幅が ${MIN_TARGET}px 未満`).toBeGreaterThanOrEqual(MIN_TARGET);
    }
    // 流れの表示（ステップの間）
    expect(await stepper.getByTestId('step-flow').count(), '次のステップへの流れの表示がない').toBeGreaterThanOrEqual(STEPS.length - 1);
    // 現在のステップ
    await expect(stepper.locator('[data-step-state="current"]')).toHaveCount(1);
    await expect(stepper.locator('[aria-current="step"]')).toHaveCount(1);
  });

  // FR-228 AC-528（異常系: ステップを選んでも、現在のステップの表示は常に 1 つだけで、移った先を示す）
  test('FR-228 AC-528 異常系: ステップを順に押しても、現在のステップは常に 1 つだけで、押したステップを示す', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    for (const s of ['施策計画', '現状分析']) {
      await page.getByTestId('stepper').getByRole('button', { name: s }).click();
      await expect(page.getByTestId('stepper').locator('[data-step-state="current"]')).toHaveCount(1);
      await expect(page.getByTestId('stepper').locator('[data-step-state="current"]')).toContainText(s);
    }
  });

  layoutTest.describe('FR-228 AC-529 の各条件', () => {
  layoutTest.describe.configure({ mode: 'default' });
  // FR-228 AC-529
  layoutTest('FR-228 AC-529 重要度の大きさ・手動サイズとピン・入力等の保持（工程順は対応表待ち）', async ({ page, layoutApp }, testInfo) => {
    layoutTest.setTimeout(300_000);
    expect(layoutApp.initialStorage.origins, '前提: 新しい文脈').toEqual([]);
    await openNewProject(page);
    // 選択・絞り込み・未確定の入力を、再配置前に利用者の操作で用意する（AC-529）。
    await page.getByRole('button', { name: '分析を開始' }).click();
    await page.getByRole('listbox', { name: '分析手法' }).getByRole('option', { name: 'SWOT 分析' }).click();
    const analysis = page.getByTestId('analysis');
    const input = analysis.getByTestId('analysis-params').getByRole('spinbutton').first();
    const filterValue = ((await input.getAttribute('aria-label')) ?? '').replace(/ の値.*$/, '');
    expect(filterValue, '前提: 絞り込みに使う合成項目名').not.toBe('');
    const selected = analysis.getByTestId('analysis-result').getByTestId('result-item').filter({ hasText: filterValue }).first();
    const selectedId = await selected.getAttribute('data-entity-id');
    expect(selectedId, '前提: 選んだ項目の ID').toBeTruthy();
    await selected.click();
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    await analysis.getByRole('searchbox', { name: '絞り込み' }).fill(filterValue);
    await input.fill('7');
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    await expect(input).toHaveValue('7');
    const beforeStepStates: Record<string, string> = await page.getByTestId('window-list').getByTestId('window-list-item').evaluateAll((els) =>
      Object.fromEntries(els.map((el) => [el.getAttribute('data-component-key') ?? '', el.getAttribute('data-state') ?? ''])));
    const step = page.getByTestId('stepper').getByRole('button', { name: 'KPI 測定' });
    await step.click();
    await expect(page.getByTestId('workspace')).toBeVisible();
    await expect(page.getByTestId('stepper').locator('[data-step-state="current"]')).toContainText('KPI 測定');
    await expect(component(page, 'priority').getByRole('heading', { name: '優先順位分析', exact: true })).toBeVisible();
    const afterStepStates: Record<string, string> = await page.getByTestId('window-list').getByTestId('window-list-item').evaluateAll((els) =>
      Object.fromEntries(els.map((el) => [el.getAttribute('data-component-key') ?? '', el.getAttribute('data-state') ?? ''])));
    for (const [key, state] of Object.entries(beforeStepStates)) {
      if (state === 'front' || state === 'visible') {
        expect(afterStepStates[key], `${key}: 再配置で閉じたり背面にしたりしない`).toMatch(/^(front|visible|minimized)$/);
      }
    }
    let keys = await topKeys(page);
    await settle(page, keys);
    // 操作中のコンポーネントは大小比較から除外する。比較の例を作るため、画面外の操作部へフォーカスを移す。
    await page.getByRole('switch', { name: 'サイズの自動調整' }).focus();
    await settle(page, keys);
    const initial = await stepInfo(page);
    const workspace = await box(page.getByTestId('workspace'));
    await testInfo.attach('AC-529-initial-geometry', { body: JSON.stringify({ workspace, initial }, null, 2), contentType: 'application/json' });
    // 面積の大小だけでなく、下限矩形を格子に並べる具体的な配置の存在を確認する。
    const capacity = Math.floor(workspace.width / 360) * Math.floor(workspace.height / 240);
    expect(capacity, '成功条件: 全表示対象を下限で配置できる格子').toBeGreaterThanOrEqual(initial.length);
    for (let i = 0; i < initial.length; i++) {
      expect(initial[i].w, `${initial[i].key}: 幅の下限`).toBeGreaterThanOrEqual(360);
      expect(initial[i].h, `${initial[i].key}: 高さの下限`).toBeGreaterThanOrEqual(240);
      for (let j = i + 1; j < initial.length; j++) {
        const a = initial[i], b = initial[j];
        const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        expect(w * h, `成功条件: ${a.key} と ${b.key} が重ならない`).toBe(0);
      }
    }
    await expect(visibleReflowReason(page), '領域不足による取消しではない').toBeHidden();
    expectStepSizes(initial, null, null, true, workspace);
    // 重要な作業画面以外から、ピン・手動サイズ・手動位置に別の対象を使う。
    const ordinary = initial.filter((i) => i.key !== 'priority');
    expect(ordinary.length, '前提: 独立した 3 つの対象が必要').toBeGreaterThanOrEqual(3);
    const [pinned, resized, mover] = ordinary.slice(0, 3).map((i) => i.key);
    await component(page, pinned).focus();
    await pinButton(component(page, pinned)).click();
    await expect(pinButton(component(page, pinned))).toHaveAccessibleName('ピン止めを外す');
    const beforeResize = await box(component(page, resized));
    await dragEdge(page, component(page, resized), 'se',
      beforeResize.width > 390 ? -30 : 30, beforeResize.height > 270 ? -30 : 30);
    await settle(page, keys);
    const resizedBox = await box(component(page, resized));
    expect(Math.abs(resizedBox.width - beforeResize.width) + Math.abs(resizedBox.height - beforeResize.height),
      '前提: 手動サイズ変更が実際に成功した').toBeGreaterThan(0);
    // 手動位置はピン・手動サイズとは別の対象。移動成功を必須にする。
    const movedBefore = await box(component(page, mover));
    const h = await box(component(page, mover).getByRole('heading').first());
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + 80, h.y + h.height / 2 + 60, { steps: 8 });
    await page.mouse.up();
    await settle(page, keys);
    const movedBox = await box(component(page, mover));
    expect(Math.abs(movedBox.x - movedBefore.x) + Math.abs(movedBox.y - movedBefore.y),
      '前提: マウスでの位置変更が実際に成功した').toBeGreaterThan(0);
    const pinBox = await box(component(page, pinned));
    const manualSize = await box(component(page, resized));
    const beforeManualWorkspace = await box(page.getByTestId('workspace'));
    const pinScroll = await componentScrollOffset(component(page, pinned));
    const moverScroll = await componentScrollOffset(component(page, mover));
    // 別のステップへ移ってから戻る。現在のステップを再クリックするだけの no-op ではない。
    await page.getByTestId('stepper').getByRole('button', { name: '現状分析' }).click();
    await expect(page.getByTestId('stepper').locator('[data-step-state="current"]')).toContainText('現状分析');
    await step.click();
    await expect(page.getByTestId('stepper').locator('[data-step-state="current"]')).toContainText('KPI 測定');
    keys = await topKeys(page);
    await settle(page, keys);
    await page.getByRole('switch', { name: 'サイズの自動調整' }).focus();
    await settle(page, keys);
    const info = await stepInfo(page);
    await expect(visibleReflowReason(page), '手動位置を保持する再配置は取り消されていない').toBeHidden();
    // 手動位置は大きさの比較対象に含め、手動サイズ・ピンと操作中は除く。
    expectStepSizes(info, pinned, resized, false, await box(page.getByTestId('workspace')));
    const pinAfter = await box(component(page, pinned));
    const afterManualWorkspace = await box(page.getByTestId('workspace'));
    const pinScrollAfter = await componentScrollOffset(component(page, pinned));
    expect(pinAfter.x - afterManualWorkspace.x + pinScrollAfter.x, 'ピン止めの x が動いた').toBe(pinBox.x - beforeManualWorkspace.x + pinScroll.x);
    expect(pinAfter.y - afterManualWorkspace.y + pinScrollAfter.y, 'ピン止めの y が動いた').toBe(pinBox.y - beforeManualWorkspace.y + pinScroll.y);
    expect(pinAfter.width, 'ピン止めの幅が変わった').toBe(pinBox.width);
    expect(pinAfter.height, 'ピン止めの高さが変わった').toBe(pinBox.height);
    const resAfter = await box(component(page, resized));
    expect(resAfter.width, '手で変えた幅が上書きされた').toBe(manualSize.width);
    expect(resAfter.height, '手で変えた高さが上書きされた').toBe(manualSize.height);
    const movedAfter = await box(component(page, mover));
    const moverScrollAfter = await componentScrollOffset(component(page, mover));
    expect(movedAfter.x - afterManualWorkspace.x + moverScrollAfter.x, '手で動かした x が上書きされた').toBe(movedBox.x - beforeManualWorkspace.x + moverScroll.x);
    expect(movedAfter.y - afterManualWorkspace.y + moverScrollAfter.y, '手で動かした y が上書きされた').toBe(movedBox.y - beforeManualWorkspace.y + moverScroll.y);
    // 移動先を確認した後で分析画面に戻り、表示していた選択・絞り込み・入力を読む。
    await page.getByTestId('stepper').getByRole('button', { name: '現状分析' }).click();
    await expect(page.getByTestId('stepper').locator('[data-step-state="current"]')).toContainText('現状分析');
    await expect(analysis.getByRole('searchbox', { name: '絞り込み' })).toHaveValue(filterValue);
    await expect(analysis.locator(`[data-testid="result-item"][data-entity-id="${selectedId}"]`).first()).toHaveAttribute('aria-selected', 'true');
    await expect(analysis.getByTestId('analysis-params').getByRole('spinbutton').first()).toHaveValue('7');
  });

  // FR-228 AC-529: 先の工程順の失敗に遮られず、それぞれ実際の入力と直前状態を観測する。
  layoutTest('FR-228 AC-529 マウスで動かした位置を画面移動後・再配置前から保持する', async ({ page, layoutApp }, testInfo) => {
    layoutTest.setTimeout(180_000);
    expect(layoutApp.initialStorage.origins).toEqual([]);
    await verifyManualPosition(page, 'mouse', testInfo);
  });

  // FR-228 AC-529
  layoutTest('FR-228 AC-529 タッチで動かした位置を画面移動後・再配置前から保持する', async ({ layoutApp, browser }, testInfo) => {
    layoutTest.setTimeout(180_000);
    const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
    const page = await context.newPage();
    try {
      expect((await context.storageState()).origins).toEqual([]);
      await gotoAndEnter(page, layoutApp.url);
      await verifyManualPosition(page, 'touch', testInfo);
    } finally { await context.close(); }
  });

  // FR-228 AC-529: 大小・工程順の判定より先に失敗しても、既存の保護検証を独立に実行する。
  layoutTest('FR-228 AC-529 選択・絞り込み・未確定入力を再配置後も保持する', async ({ page, layoutApp }) => {
    layoutTest.setTimeout(180_000);
    expect(layoutApp.initialStorage.origins).toEqual([]);
    await openNewProject(page, '保持試験株式会社', '選択と入力の保持');
    await page.getByRole('button', { name: '分析を開始' }).click();
    await page.getByRole('listbox', { name: '分析手法' }).getByRole('option', { name: 'SWOT 分析' }).click();
    const analysis = page.getByTestId('analysis');
    const input = analysis.getByTestId('analysis-params').getByRole('spinbutton').first();
    const filterValue = ((await input.getAttribute('aria-label')) ?? '').replace(/ の値.*$/, '');
    expect(filterValue, '前提: 絞り込みに使う合成項目名').not.toBe('');
    const selected = analysis.getByTestId('analysis-result').getByTestId('result-item').filter({ hasText: filterValue }).first();
    const selectedId = await selected.getAttribute('data-entity-id');
    expect(selectedId, '前提: 選んだ項目の ID').toBeTruthy();
    await selected.click();
    await analysis.getByRole('searchbox', { name: '絞り込み' }).fill(filterValue);
    await input.fill('7');
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    await expect(input).toHaveValue('7');
    const stepper = page.getByTestId('stepper');
    await stepper.getByRole('button', { name: 'KPI 測定' }).click();
    await expect(stepper.locator('[data-step-state="current"]')).toContainText('KPI 測定');
    await expect(component(page, 'priority').getByRole('heading', { name: '優先順位分析', exact: true })).toBeVisible();
    await stepper.getByRole('button', { name: '現状分析' }).click();
    await expect(stepper.locator('[data-step-state="current"]')).toContainText('現状分析');
    await expect(analysis.getByRole('searchbox', { name: '絞り込み' })).toHaveValue(filterValue);
    await expect(analysis.locator(`[data-testid="result-item"][data-entity-id="${selectedId}"]`).first()).toHaveAttribute('aria-selected', 'true');
    await expect(analysis.getByTestId('analysis-params').getByRole('spinbutton').first()).toHaveValue('7');
  });

  for (const scenario of ['候補なし開始', '候補を使い尽くす'] as const) {
    // FR-228 AC-529 / FR-296 AC-886: 2 条件は別々に実行し、片方の失敗で他方を隠さない。
    layoutTest(`FR-228 AC-529 ${scenario}: 画面移動を維持して再配置と付随変更を一括取消し`, async ({ page, layoutApp }, testInfo) => {
      layoutTest.setTimeout(240_000);
      expect(layoutApp.initialStorage.origins).toEqual([]);
      await verifyStepRollback(page, scenario, testInfo);
    });
  }

  // FR-228 AC-529（異常系: 関連の対応がないステップを押しても、コンポーネントは 1 つも消えず、エラーも出ない）
  layoutTest('FR-228 AC-529 異常系: ステップを順に押してもコンポーネントは 1 つも消えず、ページエラーも出ない', async ({ page, layoutApp, pageErrors }) => {
    layoutTest.setTimeout(180_000);
    expect(layoutApp.initialStorage.origins).toEqual([]);
    await openNewProject(page);
    const counts: number[] = [];
    for (const s of STEPS) {
      await page.getByTestId('stepper').getByRole('button', { name: s }).click();
      const keys = await topKeys(page);
      await settle(page, keys);
      const info = await stepInfo(page);
      expect(info.filter((i) => i.hidden), `${s}: 非表示のコンポーネントがある`).toEqual([]);
      counts.push(info.length);
      expect(info.length, `${s}: コンポーネントが 0 件`).toBeGreaterThanOrEqual(1);
    }
    expect(pageErrors).toEqual([]);
  });
  });
});

/** 前面・背面は絶対 z 値ではなく、各組の相対順を比べる。 */
async function renderedZ(c: Locator): Promise<number> {
  return c.evaluate((el) => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      const z = Number.parseInt(getComputedStyle(node).zIndex, 10);
      if (!Number.isNaN(z)) return z;
    }
    return 0;
  });
}

async function expectAtomicRestore(page: Page, before: NavigationObservation, label: string) {
  const states: Record<string, string> = await page.getByTestId('window-list').getByTestId('window-list-item').evaluateAll((els) =>
    Object.fromEntries(els.map((el) => [el.getAttribute('data-component-key') ?? '', el.getAttribute('data-state') ?? ''])));
  expect(Object.keys(states).sort(), `${label}: 項目の集合`).toEqual(before.windows.map((w) => w.key).sort());
  const workspaceAfter = await box(page.getByTestId('workspace'));
  const zAfter = new Map<string, number>();
  for (const w of before.windows) {
    expect(states[w.key], `${label}: ${w.key} の最小化・表示状態`).toBe(w.state);
    if (w.rect === null) {
      await expect(component(page, w.key), `${label}: ${w.key} の非表示矩形`).toBeHidden();
      continue;
    }
    const c = component(page, w.key);
    const b = await box(c);
    const scrollAfter = await componentScrollOffset(c);
    expect(w.scrollOffset, `${label}: ${w.key} の再配置直前のスクロール位置`).toBeTruthy();
    for (const field of ['x', 'y', 'width', 'height'] as const) {
      const afterValue = field === 'x' ? b.x - workspaceAfter.x + scrollAfter.x : field === 'y' ? b.y - workspaceAfter.y + scrollAfter.y : b[field];
      const beforeValue = field === 'x' ? w.rect.x - before.workspace.x + w.scrollOffset!.x : field === 'y' ? w.rect.y - before.workspace.y + w.scrollOffset!.y : w.rect[field];
      expect(afterValue, `${label}: ${w.key}.${field} を再配置直前に戻す`).toBe(beforeValue);
    }
    if (w.state === 'front' || w.state === 'visible') {
      expect(b.width, `${label}: ${w.key} の幅の下限`).toBeGreaterThanOrEqual(360);
      expect(b.height, `${label}: ${w.key} の高さの下限`).toBeGreaterThanOrEqual(240);
    }
    if (w.z !== null) {
      expect(w.domOrder, `${label}: ${w.key} の描画順の観測`).not.toBeNull();
      zAfter.set(w.key, await renderedZ(c));
    }
    if (w.pinName !== null) {
      await expect(c.getByTestId('component-actions').locator('button[aria-label^="ピン止め"]'), `${label}: ${w.key} のピン状態`)
        .toHaveAttribute('aria-label', w.pinName);
    }
    if (w.viewName !== null) {
      await expect(c.getByTestId('component-actions').locator('button[aria-label^="ビュー"]'), `${label}: ${w.key} のモード`)
        .toHaveAttribute('aria-label', w.viewName);
    }
    if (w.zone !== null) {
      const zone = await c.evaluate((el) => {
        const parent = el.closest('[data-zone-id], [data-zone]');
        return parent?.getAttribute('data-zone-id') ?? parent?.getAttribute('data-zone') ?? null;
      });
      expect(zone, `${label}: ${w.key} のゾーン`).toBe(w.zone);
    }
  }
  const stacked = before.windows.filter((w) => w.z !== null && zAfter.has(w.key));
  expect(Object.values(states).filter((state) => state === 'front' || state === 'visible').length,
    `${label}: 再配置取消し後の同時表示の上限`).toBeLessThanOrEqual(4);
  const domAfter = await page.getByTestId('workspace').evaluate((ws, keys) => {
    const nodes = [...ws.querySelectorAll('[data-testid^="component-"]')];
    return Object.fromEntries(nodes.flatMap((el, index) => {
      const key = (el.getAttribute('data-testid') ?? '').replace(/^component-/, '');
      return keys.includes(key) ? [[key, index]] : [];
    }));
  }, stacked.map((w) => w.key));
  for (let i = 0; i < stacked.length; i++) {
    for (let j = i + 1; j < stacked.length; j++) {
      const a = stacked[i], b = stacked[j];
      expect(domAfter[a.key], `${label}: ${a.key} の描画順`).toBeDefined();
      expect(domAfter[b.key], `${label}: ${b.key} の描画順`).toBeDefined();
      const afterOrder = zAfter.get(a.key)! - zAfter.get(b.key)! || domAfter[a.key] - domAfter[b.key];
      const beforeOrder = a.z! - b.z! || a.domOrder! - b.domOrder!;
      expect(Math.sign(afterOrder), `${label}: ${a.key} と ${b.key} の前後関係`).toBe(Math.sign(beforeOrder));
    }
  }
}

// FR-228 AC-529 / FR-296 AC-886（AC-886 自体は integration。ここではステップ再配置に限る）
async function verifyStepRollback(page: Page, scenario: '候補なし開始' | '候補を使い尽くす', testInfo: import('@playwright/test').TestInfo) {
      await openNewProject(page, `取消試験${scenario}株式会社`, `取消試験 ${scenario}`);
      const stepper = page.getByTestId('stepper');
      await stepper.getByRole('button', { name: 'KPI 測定' }).click();
      await expect(stepper.locator('[data-step-state="current"]')).toContainText('KPI 測定');
      await expect(component(page, 'priority').getByRole('heading', { name: '優先順位分析', exact: true }), 'KPI 測定の作業画面').toBeVisible();
      await settle(page, await topKeys(page));
      let info = await stepInfo(page);
      const important = info.find((i) => i.key === 'priority');
      let normal = info.filter((i) => i.key !== 'priority');
      expect(important, `${scenario}: 前提の作業画面`).toBeTruthy();
      expect(normal.length, `${scenario}: ピン止めできる重要でないコンポーネント`).toBeGreaterThanOrEqual(1);
      // 移動元の作業画面を開いた後も上限を超えないよう、先に 3 件以下にする。
      // 上限超過の処理とステップ再配置を区別し、容量不足だけを検証する。
      while (info.length > 3) {
        const key = normal.at(-1)!.key;
        const c = component(page, key);
        await c.getByTestId('window-controls').getByRole('button', { name: '最小化', exact: true }).click();
        await expect(page.locator(`[data-testid="window-list-item"][data-component-key="${key}"]`)).toHaveAttribute('data-state', 'minimized');
        info = await stepInfo(page);
        normal = info.filter((i) => i.key !== 'priority');
      }
      expect(info.length, `${scenario}: 少なくとも 3 件を表示`).toBeGreaterThanOrEqual(3);
      // 先に全表示項目をピン止めし、別ステップへの移動で候補が先に消費されるのを防ぐ。
      for (const i of info) {
        const c = component(page, i.key);
        await c.focus();
        await pinButton(c).click();
        await expect(pinButton(c), `${i.key}: ピン止め`).toHaveAccessibleName('ピン止めを外す');
      }
      // 取り消せない画面縮小は FR-296 に従い縦積み・縦スクロールに縮退する。
      // その後の再配置が、保護された項目だけでも下限で収まらない条件を数値で検証する。
      await page.setViewportSize({ width: 760, height: 430 });
      const candidate = normal[0].key;
      // 他の作業画面へ移動した後、目的の重要項目と、後者では候補もピンから外す。
      // 現状分析への移動自体で候補を最小化させることなく、目的の操作の直前に用意する。
      await stepper.getByRole('button', { name: '現状分析' }).click();
      await expect(stepper.locator('[data-step-state="current"]')).toContainText('現状分析');
      // 移動元の作業画面を保護し、次のクリックでそれが最小化されることによる
      // 画面移動と再配置の観測上の曖昧さを避ける。
      const source = component(page, 'knowledge-graph');
      await source.hover();
      await expect(pinButton(source)).toHaveAccessibleName('ピン止めする');
      await pinButton(source).click();
      await expect(pinButton(source)).toHaveAccessibleName('ピン止めを外す');
      // 重要な移動先を最後に操作し、候補を残したまま前面化する。
      const release = [...(scenario === '候補を使い尽くす' ? [candidate] : []), important!.key];
      for (const key of release) {
        const c = component(page, key);
        await c.hover();
        await pinButton(c).click();
        await expect(pinButton(c), `${key}: 前提としてピンを外す`).toHaveAccessibleName('ピン止めする');
      }
      await expect(stepper.locator('[data-step-state="current"]'), '前提: 別のステップから移動する').toContainText('現状分析');
      await raiseStepDestination(page, 'priority', '現状分析');
      await settle(page, await topKeys(page));
      if (scenario === '候補を使い尽くす') {
        await expect(page.locator(`[data-testid="window-list-item"][data-component-key="${candidate}"]`),
          '前提: クリック前に候補が表示中').toHaveAttribute('data-state', /^(front|visible)$/);
      }
      // 直前の別操作の通知を今回の取消し理由と誤認しない。
      const reason = visibleReflowReason(page);
      await expect(reason, '前提: 前の操作の通知が消える').toBeHidden({ timeout: 15_000 });
      const before = await observeStepNavigation(page, 'KPI 測定', 'priority');
      await testInfo.attach(`${scenario}-before-reflow`, { body: JSON.stringify(before, null, 2), contentType: 'application/json' });
      expectBeforeReflowObservation(before);
      await expect(stepper.locator('[data-step-state="current"]'), `${scenario}: ステップ選択は取り消さない`).toContainText('KPI 測定');
      await expect(page.locator('[data-testid="window-list-item"][data-component-key="priority"]'),
        `${scenario}: 作業画面への移動は取り消さない`).toHaveAttribute('data-state', 'front');
      await expect(component(page, 'priority').getByRole('heading', { name: '優先順位分析', exact: true }), `${scenario}: 作業画面に留まる`).toBeVisible();
      const visible = before.windows.filter((w) => w.state === 'front' || w.state === 'visible');
      for (const w of visible) expect(['ピン止めする', 'ピン止めを外す'], `${w.key}: 前提のピン状態`).toContain(w.pinName);
      const candidates = visible.filter((w) => w.pinName === 'ピン止めする' && w.key !== 'priority');
      expect(visible.some((w) => w.key === 'priority' && w.pinName === 'ピン止めする'), `${scenario}: 重要な配置対象`).toBe(true);
      if (scenario === '候補なし開始') expect(candidates, '当初から最小化候補がない').toEqual([]);
      else expect(candidates.map((w) => w.key), '当初の最小化候補はこの 1 件だけ').toEqual([candidate]);
      // このシナリオでは手動移動・サイズ変更を行っていない。
      const protectedCount = visible.filter((w) => w.pinName === 'ピン止めを外す' || w.key === 'priority').length;
      expect(before.workspace.width, '幅 360px 未満の例外ではない').toBeGreaterThanOrEqual(360);
      expect(protectedCount * 360 * 240, `${scenario}: 候補をすべて除いても下限寸法の合計が作業領域を超える`)
        .toBeGreaterThan(before.workspace.width * before.workspace.height);
      // 候補の試行を途中表示することは要求しない。取消しが原子的なら DOM に現れなくてもよい。
      // 理由は今回の操作に対応する、利用者に見える通知から読む。
      await expect(reason, `${scenario}: 取消しの理由`).toBeVisible();
      await expect(reason).toContainText(/領域|スペース|場所|収ま|不足|画面の幅/);
      await settle(page, await topKeys(page));
      await expectAtomicRestore(page, before, scenario);
      await expect(stepper.locator('[data-step-state="current"]'), `${scenario}: 取消し後もステップ選択が残る`).toContainText('KPI 測定');
      await expect(page.getByTestId('window-list').locator('[data-testid="window-list-item"][data-component-key="priority"]'),
        `${scenario}: 取消し後も作業画面は前面`).toHaveAttribute('data-state', 'front');
      await expect(component(page, 'priority').getByRole('heading', { name: '優先順位分析', exact: true }),
        `${scenario}: 取消し後も作業画面に留まる`).toBeVisible();
}
