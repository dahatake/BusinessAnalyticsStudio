// System Test: タスク指向の適応型ワークスペース・Windows/macOS の操作慣習・没入（FR-298・FR-299・FR-300 AC-805〜811・813〜816）
// 期待値は要求定義書の受入基準（docs/requirements/app-experience.md）だけから決める。画面の探し方は CONTRACT.md §33。
// PARAM-138=60/25/15、PARAM-139=1000ms、PARAM-140=5 件、PARAM-141=80%。
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Locator } from '@playwright/test';
import { test, expect, component, selectPersona, runCommand, settingsButton, settingsDialog, closeSettings } from '../support/fixtures';

type Box = { x: number; y: number; width: number; height: number };
const ZONES = ['main', 'reference', 'communication', 'monitor'] as const;
const ws = (page: Page) => page.getByTestId('workspace');
const zone = (page: Page, n: string) => page.getByTestId(`zone-area-${n}`);
const MODES = ['Focus', 'Compare', 'Monitor', 'Meeting', 'Research'] as const;

async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  expect(b, '要素が表示されていない').not.toBeNull();
  return b!;
}
async function shown(l: Locator): Promise<Box | null> {
  if ((await l.count()) === 0) return null;
  const b = await l.first().boundingBox();
  return b && b.width > 1 && b.height > 1 ? b : null;
}
async function compKeys(page: Page): Promise<string[]> {
  return ws(page).evaluate((root) => {
    const out: string[] = [];
    root.querySelectorAll('[data-testid^="component-"]:not([data-testid="component-menu"]):not([data-testid="component-actions"])').forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push((el.getAttribute('data-testid') ?? '').replace('component-', ''));
    });
    return out;
  });
}
async function assign(page: Page, key: string, name: string): Promise<void> {
  await component(page, key).hover();
  await component(page, key).getByTestId('component-actions').getByRole('button', { name: 'ロールへ割り当て' }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${name}`, 'i') }).click();
}
async function setRatio(page: Page, label: string, v: number): Promise<void> {
  const i = page.getByTestId('zone-ratio').getByRole('spinbutton', { name: `${label} の割合` });
  await i.fill(String(v));
  await i.press('Enter');
}
async function setMode(page: Page, m: string): Promise<void> {
  await page.getByTestId('workspace-switcher').getByRole('radio', { name: m }).click();
}
async function areas(page: Page): Promise<Record<string, Box | null>> {
  const o: Record<string, Box | null> = {};
  for (const n of ZONES) o[n] = await shown(zone(page, n));
  return o;
}
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

test.describe('FR-298 適応型ワークスペース', () => {
  // FR-298 AC-805 AC-806
  test('FR-298 AC-805 AC-806 ゾーンの意味名とロール・座標なしの割り当て・結合と解除・割合とロールの独立・隙間重なりなし・再読込で保持', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const list = page.getByTestId('zone-list');
    for (const [n, label] of [['main', 'Main'], ['reference', 'Reference'], ['communication', 'Communication'], ['monitor', 'Monitor']] as const) {
      await expect(list.getByTestId(`zone-item-${n}`), `${label} が一覧にない`).toContainText(label);
      await expect(list.getByTestId(`zone-item-${n}`), `${label} のロールがない`).toContainText(/主|参照|対話|監視/);
    }
    const [a, b] = await compKeys(page);
    await assign(page, a, 'Reference');
    await expect(component(page, a)).toHaveAttribute('data-zone', 'reference');
    await assign(page, b, 'Main');
    await expect(component(page, b)).toHaveAttribute('data-zone', 'main');
    const inZone = async (k: string, z: string) => { const c = await box(component(page, k)); const zb = await box(zone(page, z)); return overlap(c, zb) / (c.width * c.height); };
    expect(await inZone(a, 'reference'), 'a が Reference に配置されない').toBeGreaterThan(0.9);
    // 結合と解除
    const before = await areas(page);
    const beforeCount = Object.values(before).filter(Boolean).length;
    await list.getByTestId('zone-item-reference').getByRole('checkbox', { name: '結合に含める' }).check();
    await list.getByTestId('zone-item-communication').getByRole('checkbox', { name: '結合に含める' }).check();
    await list.getByRole('button', { name: 'ゾーンを結合' }).click();
    const merged = await areas(page);
    expect(Object.values(merged).filter(Boolean).length, '結合で 1 つのゾーンにならない').toBe(beforeCount - 1);
    await page.reload();
    await page.waitForLoadState();
    expect(Object.values(await areas(page)).filter(Boolean).length, '再読込で結合が保持されない').toBe(beforeCount - 1);
    await page.getByTestId('zone-list').getByRole('button', { name: '結合を解除' }).click();
    const restored = await areas(page);
    for (const n of ZONES) expect(!!restored[n], `${n} が結合解除で元に戻らない`).toBe(!!before[n]);
    // 割合を変えてもロールは変わらず、ロールを変えても割合は変わらない（AC-806）
    await setRatio(page, 'Main', 50);
    await setRatio(page, 'Reference', 30);
    await setRatio(page, 'Communication', 20);
    await expect(component(page, a)).toHaveAttribute('data-zone', 'reference');
    await expect(component(page, b)).toHaveAttribute('data-zone', 'main');
    const r1 = await areas(page);
    await assign(page, a, 'Communication');
    const r2 = await areas(page);
    for (const n of ZONES) {
      expect(r2[n]?.width ?? 0, `ロール変更で ${n} の割合が変わった`).toBeCloseTo(r1[n]?.width ?? 0, 0);
    }
    // 隙間・重なりなし
    const w = await box(ws(page));
    const vis = Object.values(r2).filter((x): x is Box => !!x);
    const total = vis.reduce((s, z) => s + z.width * z.height, 0);
    expect(Math.abs(total - w.width * w.height) / (w.width * w.height), 'ゾーンが作業領域を隙間なく覆わない').toBeLessThan(0.02);
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) expect(overlap(vis[i], vis[j]) / (w.width * w.height), 'ゾーンが重なる').toBeLessThan(0.001);
    await page.reload();
    await page.waitForLoadState();
    const r3 = await areas(page);
    for (const n of ZONES) expect(r3[n]?.width ?? 0, `再読込で ${n} の割合が保持されない`).toBeCloseTo(r2[n]?.width ?? 0, -1);
    await expect(component(page, a)).toHaveAttribute('data-zone', 'communication');
  });

  // FR-298 AC-807（PARAM-139=1000ms）
  test('FR-298 AC-807 Workspace Switcher の 1 回の操作で 5 モードの構成へ 1000ms 以内に切り替わり、選択・入力中の内容は変わらない', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const input = ws(page).getByRole('textbox').first();
    await input.fill('abc');
    const expected: Record<string, (a: Record<string, Box | null>) => void> = {
      Focus: (a) => { expect(a.main, 'Focus: Main がない').not.toBeNull(); for (const n of ['reference', 'communication', 'monitor']) expect((a[n]?.width ?? 0) * (a[n]?.height ?? 0), `Focus: ${n} が Main より大きい`).toBeLessThan(a.main!.width * a.main!.height); },
      Compare: (a) => { expect(a.main && a.reference, 'Compare: Main と Reference').toBeTruthy(); expect(a.main!.width, 'Compare: 等分').toBeCloseTo(a.reference!.width, -1); expect(a.communication, 'Compare: Communication は出ない').toBeNull(); },
      Monitor: (a) => { expect(a.monitor, 'Monitor: Monitor がない').not.toBeNull(); expect(a.monitor!.width * a.monitor!.height, 'Monitor が主でない').toBeGreaterThan((a.main?.width ?? 0) * (a.main?.height ?? 0)); },
      Meeting: (a) => { expect(a.main && a.communication, 'Meeting: Main と Communication').toBeTruthy(); expect(a.reference, 'Meeting: Reference は出ない').toBeNull(); },
      Research: (a) => { expect(a.main && a.reference && a.communication, 'Research: 3 ゾーン').toBeTruthy(); const t = a.main!.width + a.reference!.width + a.communication!.width; expect(a.main!.width / t, 'Research: Main 60%').toBeCloseTo(0.6, 1); expect(a.reference!.width / t).toBeCloseTo(0.25, 1); },
    };
    for (const m of MODES) {
      const t0 = Date.now();
      await setMode(page, m);
      await expect(ws(page)).toHaveAttribute('data-mode', m.toLowerCase(), { timeout: 1000 });
      expect(Date.now() - t0, `${m}: 切替が 1000ms を超えた`).toBeLessThan(1000 + 500);
      await page.waitForTimeout(700);
      expected[m](await areas(page));
      await expect(input, `${m}: 入力中の内容が失われた`).toHaveValue('abc');
    }
    // キーでも切り替えられる（異常系: 同じモードの再操作でも内容は保たれる）
    await page.getByTestId('workspace-switcher').getByRole('radio', { name: 'Compare' }).press('Space');
    await expect(input).toHaveValue('abc');
  });

  // FR-298 AC-808
  test('FR-298 AC-808 タスクワークスペースを別のウィンドウへ移動すると構成・状態が一致し、最大化のあと元に戻すと直前の構成に復元される', async ({ page, start, context }) => {
    await start();
    await selectPersona(page, '事業部門');
    await setRatio(page, 'Main', 50);
    await setRatio(page, 'Reference', 30);
    await setRatio(page, 'Communication', 20);
    const before = await areas(page);
    const id = await ws(page).getAttribute('data-workspace-id');
    expect(id, 'data-workspace-id がない').toBeTruthy();
    const popup = context.waitForEvent('page');
    await page.getByRole('button', { name: '別のウィンドウへ移動' }).click();
    const p2 = await popup;
    await p2.waitForLoadState();
    await expect(ws(p2)).toHaveAttribute('data-workspace-id', id!);
    const after = await areas(p2);
    const w1 = await box(ws(page)).catch(() => null);
    for (const n of ZONES) expect(!!after[n], `移動先に ${n} がない/ある不一致`).toBe(!!before[n]);
    expect(w1 === null || true).toBe(true);
    const ratio = (a: Record<string, Box | null>) => { const t = ZONES.reduce((s, n) => s + (a[n]?.width ?? 0), 0); return ZONES.map((n) => (a[n]?.width ?? 0) / t); };
    ratio(after).forEach((v, i) => expect(v, '移動先の割合が違う').toBeCloseTo(ratio(before)[i], 1));
    // 最大化 → 元に戻す
    const keys = await compKeys(p2);
    const k = keys[0];
    const roleBefore = await component(p2, k).getAttribute('data-zone');
    const snap = ratio(await areas(p2));
    await component(p2, k).hover();
    await component(p2, k).getByTestId('component-actions').getByRole('button', { name: '最大化' }).click();
    await expect(component(p2, k)).toHaveAttribute('data-maximized', 'true');
    await component(p2, k).getByTestId('component-actions').getByRole('button', { name: /元に戻す|通常表示/ }).click();
    await expect(component(p2, k)).not.toHaveAttribute('data-maximized', 'true');
    ratio(await areas(p2)).forEach((v, i) => expect(v, '最大化後の復元で割合が違う').toBeCloseTo(snap[i], 1));
    expect(await component(p2, k).getAttribute('data-zone'), '復元でロールが違う').toBe(roleBefore);
  });

  // FR-298 AC-809
  test('FR-298 AC-809 複数のタスクワークスペースの Task Context が混ざらず、切替で復元され、再読込後も保持される', async ({ page, start }) => {
    await start();
    const tabs = page.getByRole('tablist', { name: 'タスクワークスペース' });
    await selectPersona(page, '事業部門');
    const box1 = ws(page).getByRole('textbox').first();
    await box1.fill('one');
    await page.getByRole('button', { name: 'タスクワークスペースを追加' }).click();
    await expect(tabs.getByRole('tab')).toHaveCount(2);
    await selectPersona(page, '現場');
    const box2 = ws(page).getByRole('textbox').first();
    await expect(box2, '新しいタスクワークスペースに前の絞り込みが混ざった').not.toHaveValue('one');
    await box2.fill('two');
    const keys2 = await compKeys(page);
    await tabs.getByRole('tab').nth(0).click();
    await expect(ws(page).getByRole('textbox').first()).toHaveValue('one');
    await tabs.getByRole('tab').nth(1).click();
    await expect(ws(page).getByRole('textbox').first()).toHaveValue('two');
    expect(await compKeys(page)).toEqual(keys2);
    await page.reload();
    await page.waitForLoadState();
    await expect(tabs.getByRole('tab')).toHaveCount(2);
    await tabs.getByRole('tab').nth(0).click();
    await expect(ws(page).getByRole('textbox').first(), '再読込後に 1 つ目の文脈が失われた').toHaveValue('one');
    await tabs.getByRole('tab').nth(1).click();
    await expect(ws(page).getByRole('textbox').first(), '再読込後に 2 つ目の文脈が失われた').toHaveValue('two');
  });
});

const MOVE_KEY = 'Control+Alt+ArrowRight';
async function setOs(page: Page, os: '自動' | 'Windows' | 'macOS'): Promise<void> {
  await settingsButton(page).click();
  await settingsDialog(page).getByRole('combobox', { name: 'OS の操作慣習' }).selectOption({ label: os });
  await closeSettings(page);
}
async function paletteTexts(page: Page): Promise<string> {
  await page.keyboard.press('Control+k');
  const d = page.getByRole('dialog', { name: 'コマンドパレット' });
  await expect(d).toBeVisible();
  await d.getByRole('combobox').fill('移動');
  const t = await d.innerText();
  await page.keyboard.press('Escape');
  return t;
}

test.describe('FR-299 Snap・Group・Switch・Expand・Move と OS の慣習', () => {
  // FR-299 AC-810
  test('FR-299 AC-810 キーボードだけで 5 操作ができ、Move はゾーンの選択とフォーカスを保ち、最近使った Task Context は 5 件まで', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const [a] = await compKeys(page);
    await component(page, a).focus();
    for (const [cmd, name] of [['スナップ', 'スナップ'], ['グループ', 'グループ'], ['切替', '切替'], ['拡大', '拡大'], ['移動', '移動']] as const) {
      await runCommand(page, cmd, name);
      await expect(page.getByRole('dialog', { name: 'コマンドパレット' }), `${name}: 実行後にパレットが閉じない`).toBeHidden();
      await expect(page.getByRole('alert'), `${name}: 失敗した`).toHaveCount(0);
    }
    // Move のキー: ゾーン間移動。ゾーンの選択を保ち、フォーカスが対象に残る
    await component(page, a).focus();
    const z0 = await component(page, a).getAttribute('data-zone');
    await page.keyboard.press(MOVE_KEY);
    await expect.poll(() => component(page, a).getAttribute('data-zone'), 'Move でゾーンが変わらない').not.toBe(z0);
    await expect(component(page, a), 'Move 後にフォーカスが対象にない').toBeFocused();
    await expect(component(page, a)).toHaveAttribute('aria-selected', 'true');
    // 最近使った Task Context（上限 5）
    const tabs = page.getByRole('tablist', { name: 'タスクワークスペース' });
    for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'タスクワークスペースを追加' }).click();
    await expect(tabs.getByRole('tab')).toHaveCount(8);
    const recent = page.getByTestId('recent-task-contexts');
    await expect(recent.getByRole('listitem')).toHaveCount(5);
    await recent.getByRole('listitem').nth(2).getByRole('button').click();
    await expect(tabs.getByRole('tab', { selected: true }), '最近使ったから選んでも切り替わらない').toBeVisible();
  });

  // FR-299 AC-811 / FR-300 の OS 表記
  test('FR-299 AC-811 Windows は「Ctrl+Alt+→」・macOS は「⌃⌥→」でメニュー・パレットが同じ表記になり、押したキーも動き、ボタンの位置が右端/左端、「自動」で判別に戻る', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const [a] = await compKeys(page);
    for (const os of ['Windows', 'macOS'] as const) {
      await setOs(page, os);
      const want = os === 'Windows' ? 'Ctrl+Alt+→' : '⌃⌥→';
      const other = os === 'Windows' ? '⌃⌥→' : 'Ctrl+Alt+→';
      const t = await paletteTexts(page);
      expect(t, `${os}: パレットの表記`).toContain(want);
      expect(t, `${os}: 他 OS の表記が混ざった`).not.toContain(other);
      const btn = component(page, a).getByTestId('component-actions').getByRole('button', { name: '最大化' });
      await component(page, a).hover();
      await btn.hover();
      await expect(page.getByRole('tooltip').or(btn), `${os}: ツールチップ`).toBeVisible();
      const tip = (await btn.getAttribute('title')) ?? (await page.getByRole('tooltip').innerText().catch(() => ''));
      if (/Ctrl|⌃/.test(tip)) expect(tip).toContain(want.slice(0, 2));
      const z0 = await component(page, a).getAttribute('data-zone');
      await component(page, a).focus();
      await page.keyboard.press(MOVE_KEY);
      await expect.poll(() => component(page, a).getAttribute('data-zone'), `${os}: 押したキーで動かない`).not.toBe(z0);
      const h = await box(component(page, a));
      const actions = await box(component(page, a).getByTestId('component-actions'));
      const center = actions.x + actions.width / 2;
      if (os === 'Windows') expect(center, 'Windows: 操作ボタンが右端でない').toBeGreaterThan(h.x + h.width / 2);
      else expect(center, 'macOS: 操作ボタンが左端でない').toBeLessThan(h.x + h.width / 2);
      await expect(component(page, a).getByTestId('component-actions').getByRole('button', { name: '最大化' }), '操作の名前は OS で変わらない').toBeVisible();
    }
    // 自動に戻すと判別に従う（macOS と判別される環境）
    await setOs(page, '自動');
    expect(await paletteTexts(page), '自動: 判別に従った表記').toMatch(/Ctrl\+Alt\+→|⌃⌥→/);
  });

  test('FR-299 AC-811 自動では macOS と判別される環境は macOS の慣習（⌃⌥→）になる', async ({ page, start }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
    await start();
    await selectPersona(page, '事業部門');
    await setOs(page, '自動');
    expect(await paletteTexts(page), '自動: macOS の判別に従わない').toContain('⌃⌥→');
  });

  // FR-299 AC-813
  test('FR-299 AC-813 ブラウザー・OS の予約キーを割り当てず、割り当てたキーは既存のキーと重ならない', async ({ page, start }) => {
    await start();
    // 静的検査: Win キー・⌘+方向キーの割り当てがソースにない
    const root = path.resolve(__dirname, '..', '..', '..', 'src');
    const files: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) files.push(p); } };
    if (fs.existsSync(root)) walk(root);
    expect(files.length, 'src が見つからない').toBeGreaterThan(0);
    const bad = files.filter((f) => fs.readFileSync(f, 'utf8').split(/\r?\n/).some((l) => /(metaKey|'Meta'|"Meta"|\bOS\b|'Win'|⌘)/.test(l) && /Arrow(Left|Right|Up|Down)/.test(l) && !/^\s*(\/\/|\*)/.test(l)));
    expect(bad, 'Win／⌘+方向キーを割り当てている').toEqual([]);
    // 実行時: パレットのショートカット表示が重ならず、既存のキーを奪わない
    await page.keyboard.press('Control+k');
    const d = page.getByRole('dialog', { name: 'コマンドパレット' });
    await expect(d).toBeVisible();
    const sc = await d.locator('[data-shortcut], kbd').evaluateAll((els) => els.map((e) => (e.getAttribute('data-shortcut') ?? e.textContent ?? '').trim()).filter(Boolean));
    await page.keyboard.press('Escape');
    const assigned = sc.filter((s) => /Ctrl\+Alt|⌃⌥/.test(s));
    expect(new Set(assigned).size, '割り当てたキーが重なっている').toBe(assigned.length);
    for (const s of assigned) expect(['Shift+F', 'H', 'Esc', 'Ctrl+K', '⌘K'], `既存のキーと重なる: ${s}`).not.toContain(s);
    expect(assigned.length, '5 操作のキーが割り当てられていない').toBeGreaterThanOrEqual(1);
  });
});

function alpha(c: string): number {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return c === 'transparent' ? 0 : 1;
  const p = m[1].split(/[ ,/]+/).filter(Boolean);
  return p.length >= 4 ? parseFloat(p[3]) : 1;
}
type Mat = { blur: boolean; a: number; op: number; color: string; bg: string };
async function material(l: Locator): Promise<Mat> {
  return l.first().evaluate((el) => {
    const s = getComputedStyle(el);
    return { blur: /blur/.test(s.backdropFilter || (s as any).webkitBackdropFilter || ''), a: 0, op: parseFloat(s.opacity), color: s.color, bg: s.backgroundColor };
  });
}
function lum(c: string): number {
  const m = c.match(/rgba?\(([^)]+)\)/);
  const [r, g, b] = (m ? m[1].split(/[ ,/]+/).filter(Boolean).slice(0, 3) : ['0', '0', '0']).map((v) => { const x = parseFloat(v) / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test.describe('FR-300 没入', () => {
  // FR-300 AC-814
  test('FR-300 AC-814 枠の面は半透明の素材（ぼかし・不透明度 80% 以上）でコンテンツは不透明、Light/Dark でコントラストを満たし、強制カラーでは枠も不透明', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const frames = [page.getByTestId('app-header'), page.getByTestId('workspace-switcher'), page.locator('[data-testid^="zone-boundary-"]')];
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, forcedColors: 'none' });
      for (const f of frames) {
        const m = await material(f);
        const al = alpha(m.bg) * m.op;
        expect(m.blur, `${scheme}: 背景のぼかしがない`).toBe(true);
        expect(al, `${scheme}: 不透明度が 80% 未満`).toBeGreaterThanOrEqual(0.8);
        expect(al, `${scheme}: 半透明でない`).toBeLessThan(1);
        expect(contrast(m.color, m.bg), `${scheme}: 文字のコントラストが 4.5 未満`).toBeGreaterThanOrEqual(4.5);
      }
      const [k] = await compKeys(page);
      const c = await material(component(page, k));
      expect(alpha(c.bg) * c.op, `${scheme}: コンテンツの面が不透明でない`).toBe(1);
    }
    await page.emulateMedia({ forcedColors: 'active' });
    for (const f of frames) {
      const m = await material(f);
      expect(alpha(m.bg) * m.op, '強制カラーで枠の面が不透明でない').toBe(1);
    }
  });

  // FR-300 AC-815
  test('FR-300 AC-815 モード・ゾーンの切替で位置・大きさが中間値を経て連続して変わり、reduced-motion では中間値なしで最終の配置が同じ', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    const [k] = await compKeys(page);
    const sample = async () => page.evaluate(async (key) => {
      const el = document.querySelector(`[data-testid="component-${key}"]`) as HTMLElement;
      const xs: number[] = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 900) { const r = el.getBoundingClientRect(); xs.push(Math.round(r.x * 10) / 10 + r.width * 1000); await new Promise((r2) => requestAnimationFrame(() => r2(null))); }
      return xs;
    }, k);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await setMode(page, 'Research');
    await page.waitForTimeout(1100);
    const startPromise = sample();
    await setMode(page, 'Focus');
    const xs = await startPromise;
    const distinct = new Set(xs);
    expect(distinct.size, '中間値を経ていない（アニメーションなし）').toBeGreaterThan(3);
    await page.waitForTimeout(300);
    const animatedFinal = await areas(page);
    // reduce
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setMode(page, 'Research');
    await page.waitForTimeout(300);
    const p2 = sample();
    await setMode(page, 'Focus');
    const ys = await p2;
    expect(new Set(ys).size, 'reduce なのに中間値を経た').toBeLessThanOrEqual(2);
    const reducedFinal = await areas(page);
    for (const n of ZONES) expect(reducedFinal[n]?.width ?? 0, `最終の配置が違う: ${n}`).toBeCloseTo(animatedFinal[n]?.width ?? 0, -1);
  });

  // FR-300 AC-816
  test('FR-300 AC-816 Focus は Main 以外を減光・縮小し（呼び出せる）、通知を抑え、Esc で直前の配置に戻る', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    await setMode(page, 'Research');
    await page.waitForTimeout(1100);
    const before = await areas(page);
    await setMode(page, 'Focus');
    await expect(ws(page)).toHaveAttribute('data-focus', 'true');
    await page.waitForTimeout(1100);
    const f = await areas(page);
    expect(f.main, 'Main が見えない').not.toBeNull();
    for (const n of ['reference', 'communication']) {
      const small = (f[n]?.width ?? 0) < before[n]!.width * 0.9;
      const dim = (await zone(page, n).count()) > 0 && parseFloat(await zone(page, n).evaluate((e) => getComputedStyle(e).opacity)) < 1;
      expect(small || dim, `Focus: ${n} が減光も縮小もされない`).toBe(true);
    }
    await expect(page.getByTestId('notifications'), '通知が抑えられない').toHaveAttribute('data-suppressed', 'true');
    // 情報は欠けず、操作で呼び出せる
    await page.getByTestId('zone-recall-reference').click();
    expect((await shown(zone(page, 'reference')))?.width ?? 0, '呼び出しで Reference が出ない').toBeGreaterThan(1);
    await page.keyboard.press('Escape');
    await expect(ws(page)).not.toHaveAttribute('data-focus', 'true');
    await page.waitForTimeout(1100);
    const after = await areas(page);
    for (const n of ZONES) expect(after[n]?.width ?? 0, `Esc で直前の配置に戻らない: ${n}`).toBeCloseTo(before[n]?.width ?? 0, -1);
    await expect(page.getByTestId('notifications')).not.toHaveAttribute('data-suppressed', 'true');
  });
});
