// System Test: Fluent 2 のデザイントークン（文字の段・角丸・影）・色のコントラスト・モーションの全画面への適用
// 期待値は要求定義書の受入基準（docs/requirements/app-experience.md の NFR-UX-015 AC-476・NFR-UX-016 AC-477・NFR-UX-017 AC-480）
// と PARAM（PARAM-074=500 ms）、出典 SRC-024（Fluent 2 の Typography・Shapes・Elevation の値）だけから決める。
// 「全画面」は画面の登録＝左メニューの画面の一覧を走査する（support/screens.ts・CONTRACT.md §21）。
// 表示設定は CONTRACT.md §9: Light/Dark は emulateMedia({colorScheme})、ハイコントラストは forcedColors: 'active'、動きの軽減は reducedMotion。
import AxeBuilder from '@axe-core/playwright';
import type { Page, Locator } from '@playwright/test';
import { test, expect, component, selectPersona, settingsDialog, isOffMenuScreen } from '../support/fixtures';
import { listScreenKeys, gotoScreen, topKeys, actions } from '../support/screens';

const MOTION_MAX_MS = 500; // PARAM-074

/** Fluent 2 の Web の文字の段（Caption 2〜Display）の [文字の大きさ, 行の高さ]（CSS px。SRC-024 Typography） */
const TYPE_RAMP: Array<[number, number]> = [
  [10, 14], // Caption 2
  [12, 16], // Caption 1
  [14, 20], // Body 1
  [16, 22], // Body 2 / Subtitle 2
  [20, 28], // Subtitle 1
  [24, 32], // Title 3
  [28, 36], // Title 2
  [32, 40], // Title 1
  [40, 52], // Large Title
  [68, 92], // Display
];
/** Fluent 2 の角丸のトークン（None 0・Small 2・Medium 4・Large 8・X-Large 12 の px と Circle 50%。SRC-024 Shapes） */
const RADII_PX = [0, 2, 4, 8, 12];
/** Fluent 2 のエレベーションの段の影の形（[x, y, blur] の組。色は Light/Dark で異なるので形で比べる。SRC-024 Elevation） */
const SHADOW_LEVELS: Record<number, number[][]> = {
  4: [[0, 0, 2], [0, 2, 4]],
  8: [[0, 0, 2], [0, 4, 8]],
  16: [[0, 0, 2], [0, 8, 16]],
  28: [[0, 0, 8], [0, 14, 28]],
  64: [[0, 0, 8], [0, 32, 64]],
};
/** NFR-UX-015 の役割と影の段の対応（カード 4、メニュー・ツールチップ 8、ダイアログ 64） */
const ROLE_LEVEL = { card: 4, menu: 8, tooltip: 8, dialog: 64 } as const;

type Theme = 'light' | 'dark' | 'hc';
const THEMES: Theme[] = ['light', 'dark', 'hc'];

async function applyTheme(page: Page, theme: Theme): Promise<void> {
  if (theme === 'hc') await page.emulateMedia({ forcedColors: 'active' });
  else await page.emulateMedia({ colorScheme: theme, forcedColors: 'none' });
}

/**
 * 表示された文字（直下に空白でない文字を持つ見えている要素）の、計算済みの文字の大きさと行の高さの組が文字の段にないもの、
 * 見えている要素の角丸が角丸のトークンにないものを返す。
 * 拡大・縮小できる面（ビュアー・グラフ・キャンバス・ホワイトボード・3D のラベル）の中の文字は、等倍のとき（描画上の倍率が 1）だけ判定する（A-51）。
 */
async function tokenViolations(root: Locator): Promise<{ type: string[]; radius: string[] }> {
  return root.evaluate(
    (el, [ramp, radii]) => {
      const type: string[] = [];
      const radius: string[] = [];
      const visible = (e: Element) => {
        const r = e.getBoundingClientRect();
        const s = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
      };
      const scaleOf = (e: Element): number => {
        // 描画上の倍率（transform: scale や SVG の viewBox による拡大・縮小）
        const ctm = (e as SVGGraphicsElement).getScreenCTM?.();
        if (ctm) return Math.hypot(ctm.a, ctm.b);
        let s = 1;
        for (let p: Element | null = e; p; p = p.parentElement) {
          const t = getComputedStyle(p).transform;
          if (t && t !== 'none') {
            const m = new DOMMatrix(t);
            s *= Math.hypot(m.a, m.b);
          }
        }
        return s;
      };
      const label = (e: Element) => `${e.tagName.toLowerCase()}${e.getAttribute('data-testid') ? `[${e.getAttribute('data-testid')}]` : ''} "${(e.textContent ?? '').trim().slice(0, 16)}"`;
      const all = [el, ...Array.from(el.querySelectorAll('*'))];
      for (const e of all) {
        if (!visible(e)) continue;
        const s = getComputedStyle(e);
        // 文字
        const hasText = Array.from(e.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim());
        if (hasText) {
          const scale = scaleOf(e);
          if (Math.abs(scale - 1) <= 0.01) {
            const fs = parseFloat(s.fontSize);
            const isSvgText = e instanceof SVGElement;
            if (isSvgText) {
              if (!(ramp as number[][]).some(([f]) => Math.abs(f - fs) <= 0.5)) type.push(`${label(e)} ${fs}px（SVG の文字）`);
            } else {
              const lh = s.lineHeight === 'normal' ? NaN : parseFloat(s.lineHeight);
              if (!(ramp as number[][]).some(([f, l]) => Math.abs(f - fs) <= 0.5 && Math.abs(l - lh) <= 0.5)) type.push(`${label(e)} ${fs}px/${s.lineHeight}`);
            }
          }
        }
        // 角丸
        if (!(e instanceof SVGElement)) {
          for (const corner of [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius]) {
            for (const v of corner.split(/\s+/).filter(Boolean)) {
              const ok = v.endsWith('%') ? Math.abs(parseFloat(v) - 50) <= 0.01 || parseFloat(v) === 0 : (radii as number[]).some((r) => Math.abs(r - parseFloat(v)) <= 0.01);
              if (!ok) { radius.push(`${label(e)} ${corner}`); break; }
            }
          }
        }
      }
      return { type: [...new Set(type)], radius: [...new Set(radius)] };
    },
    [TYPE_RAMP, RADII_PX] as const,
  );
}

/** 要素とその子孫で最初に影を持つものの影の形（[x, y, blur] の並び）。影がなければ null */
async function shadowShape(loc: Locator): Promise<number[][] | null> {
  return loc.evaluate((root) => {
    const parse = (v: string): number[][] => {
      const parts: string[] = [];
      let depth = 0, cur = '';
      for (const ch of v) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
      }
      parts.push(cur);
      return parts.map((p) => p.replace(/rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+(?![a-z]*\()/gi, ' ').trim().split(/\s+/).map(parseFloat).slice(0, 3));
    };
    const queue: Element[] = [root];
    for (let p = root.parentElement, i = 0; p && i < 2; p = p.parentElement, i++) queue.push(p);
    const desc = Array.from(root.querySelectorAll('*')).slice(0, 200);
    for (const e of [root, ...desc, ...queue.slice(1)]) {
      const v = getComputedStyle(e).boxShadow;
      if (v && v !== 'none') return parse(v);
    }
    return null;
  });
}

function sameShadow(actual: number[][] | null, level: number): boolean {
  if (!actual) return false;
  const want = SHADOW_LEVELS[level];
  const key = (xs: number[][]) => xs.map((x) => x.map((n) => Math.round(n)).join(',')).sort().join('|');
  return key(actual) === key(want);
}

/**
 * ハイコントラスト（forced-colors）のエレベーションの代わりの境界線（NFR-UX-015 AC-476・A-56）。
 * 面（要素・その子孫・近い祖先 2 段。影の探し方と同じ範囲）のどれかが、4 辺すべてに計算済みの太さ 1px 以上で
 * 線種が none・hidden でない境界線、または同じ条件の輪郭線（outline）を持てば true。
 */
async function hasHcBoundary(loc: Locator): Promise<boolean> {
  return loc.evaluate((root) => {
    const ok = (w: string, st: string) => parseFloat(w) >= 1 && st !== 'none' && st !== 'hidden';
    const boundary = (e: Element) => {
      const s = getComputedStyle(e);
      const border =
        ok(s.borderTopWidth, s.borderTopStyle) &&
        ok(s.borderRightWidth, s.borderRightStyle) &&
        ok(s.borderBottomWidth, s.borderBottomStyle) &&
        ok(s.borderLeftWidth, s.borderLeftStyle);
      const outline = ok(s.outlineWidth, s.outlineStyle); // outline は 4 辺に同じ線を描く
      return border || outline;
    };
    // 面の輪郭として数えるのは、面とほぼ同じ大きさの要素だけ（中のボタンや項目の枠を面の境界線と誤認しない）
    const area = (e: Element) => { const r = e.getBoundingClientRect(); return r.width * r.height; };
    const a0 = area(root);
    const anc: Element[] = [];
    for (let p = root.parentElement, i = 0; p && i < 2 && p !== document.body; p = p.parentElement, i++) if (area(p) <= a0 * 1.5) anc.push(p);
    const desc = Array.from(root.querySelectorAll('*')).slice(0, 200).filter((d) => area(d) >= a0 * 0.9);
    return [root, ...desc, ...anc].some(boundary);
  });
}

/**
 * 役割の面のエレベーションの判定（NFR-UX-015 AC-476）。Light・Dark は役割の段の影と一致、
 * ハイコントラストは 4 辺の境界線か輪郭線。合わないときは理由の文字列、合えば null。
 */
async function surfaceOk(loc: Locator, theme: Theme, level: number): Promise<string | null> {
  if (theme === 'hc') return (await hasHcBoundary(loc)) ? null : '4 辺の境界線（1px 以上・none/hidden でない）も輪郭線もない';
  const shape = await shadowShape(loc);
  return sameShadow(shape, level) ? null : `影 ${JSON.stringify(shape)} が段 ${level} と一致しない`;
}

test.describe('NFR-UX-015 デザイントークンによる見た目の一元化', () => {
  for (const theme of THEMES) {
    // NFR-UX-015 AC-476
    test(`NFR-UX-015 AC-476 ${theme}: 全画面で文字の大きさと行の高さが Fluent 2 の文字の段、角丸が角丸のトークン、ダイアログ・メニュー・ツールチップ・カードの影が役割の段（ハイコントラストは 4 辺の境界線）`, async ({ page, start }) => {
      test.setTimeout(300_000);
      await applyTheme(page, theme);
      await start();
      await selectPersona(page, '事業部門');
      const keys = await listScreenKeys(page);
      const bad: string[] = [];
      let cards = 0;
      const shadowBad: string[] = [];
      for (const key of keys) {
        const c = await gotoScreen(page, key);
        const v = await tokenViolations(page.locator('body'));
        bad.push(...v.type.map((x) => `${key} 文字: ${x}`), ...v.radius.map((x) => `${key} 角丸: ${x}`));
        // カード（CONTRACT.md §21: data-surface="card"）
        const cardLocs = page.locator('[data-surface="card"]');
        const n = await cardLocs.count();
        for (let i = 0; i < n; i++) {
          if (!(await cardLocs.nth(i).isVisible())) continue;
          cards++;
          // Light・Dark は影の段、ハイコントラスト（forced-colors）は 4 辺の境界線か輪郭線（A-56・SRC-027）
          const r = await surfaceOk(cardLocs.nth(i), theme, ROLE_LEVEL.card);
          if (r) shadowBad.push(`${key} カード ${i}: ${r}`);
        }
        // 設定はモーダルの dialog（FR-223）。component-menu・component-actions を持たないので、dialog の中で文字の段・角丸を判定する
        if (key === 'settings') {
          const sd = settingsDialog(page);
          const sv = await tokenViolations(sd);
          bad.push(...sv.type.map((x) => `settings ダイアログの文字: ${x}`), ...sv.radius.map((x) => `settings ダイアログの角丸: ${x}`));
          const sr = await surfaceOk(sd, theme, ROLE_LEVEL.dialog);
          if (sr) shadowBad.push(`settings ダイアログ: ${sr}`);
          continue;
        }
        // メニュー（その他の操作）
        await c.focus();
        await c.getByTestId('component-menu').first().click();
        const menu = page.getByRole('menu').last();
        await expect(menu, `${key}: その他の操作のメニューが開かない`).toBeVisible();
        const mv = await tokenViolations(menu);
        bad.push(...mv.type.map((x) => `${key} メニューの文字: ${x}`), ...mv.radius.map((x) => `${key} メニューの角丸: ${x}`));
        const mr = await surfaceOk(menu, theme, ROLE_LEVEL.menu);
        if (mr) shadowBad.push(`${key} メニュー: ${mr}`);
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        // ツールチップ（見出しの操作アイコン）
        await c.focus();
        const iconBtn = actions(c).getByRole('button').first();
        await iconBtn.hover();
        const tip = page.getByRole('tooltip').first();
        await expect(tip, `${key}: ツールチップが出ない`).toBeVisible();
        const tv = await tokenViolations(tip);
        bad.push(...tv.type.map((x) => `${key} ツールチップの文字: ${x}`), ...tv.radius.map((x) => `${key} ツールチップの角丸: ${x}`));
        const tr = await surfaceOk(tip, theme, ROLE_LEVEL.tooltip);
        if (tr) shadowBad.push(`${key} ツールチップ: ${tr}`);
        await page.mouse.move(1, 1);
      }
      // ダイアログ（コマンドパレット）
      await page.keyboard.press('Control+k');
      const dlg = page.getByRole('dialog', { name: 'コマンドパレット' });
      await expect(dlg).toBeVisible();
      const dv = await tokenViolations(dlg);
      bad.push(...dv.type.map((x) => `ダイアログの文字: ${x}`), ...dv.radius.map((x) => `ダイアログの角丸: ${x}`));
      const dr = await surfaceOk(dlg, theme, ROLE_LEVEL.dialog);
      if (dr) shadowBad.push(`ダイアログ: ${dr}`);
      await page.keyboard.press('Escape');

      expect(bad, '文字の段・角丸のトークンに合わない表示').toEqual([]);
      expect(cards, 'カード（data-surface="card"）が全画面で 1 つも見つからない（エレベーションを判定できない）').toBeGreaterThan(0);
      expect(shadowBad, theme === 'hc' ? 'ハイコントラストで面の境界線（4 辺・1px 以上）がない' : '役割に対応付けた段の影と一致しない').toEqual([]);
    });
  }

  // NFR-UX-015 AC-476（異常系: 画面を狭くしてコンポーネントがタブにまとめられた状態・最大化した状態でも、文字の段と角丸がトークンのまま）
  test('NFR-UX-015 AC-476 異常系: 画面を狭くしてタブにまとめられた状態と最大化した状態でも、文字の段と角丸がトークンに合う', async ({ page, start }) => {
    test.setTimeout(180_000);
    await start();
    await selectPersona(page, '事業部門');
    await page.setViewportSize({ width: 600, height: 800 });
    const v1 = await tokenViolations(page.locator('body'));
    expect([...v1.type, ...v1.radius], '狭い幅でトークンに合わない').toEqual([]);
    await page.setViewportSize({ width: 1600, height: 900 });
    const [k] = await topKeys(page);
    const c = component(page, k);
    await c.focus();
    await actions(c).getByRole('button', { name: '最大化' }).click();
    const v2 = await tokenViolations(page.locator('body'));
    expect([...v2.type, ...v2.radius], '最大化した状態でトークンに合わない').toEqual([]);
  });
});

/**
 * 文字以外の要素（操作部品の中のアイコン、入力欄の境界）の隣の色とのコントラスト比が 3:1 未満のもの（WCAG 2.2 の 1.4.11）。
 * 無効の部品は WCAG の例外として除く。
 */
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
      // アイコン
      for (const svg of Array.from(el.querySelectorAll('svg'))) {
        if (!visible(svg)) continue;
        const s = getComputedStyle(svg);
        const fill = parse(s.fill && s.fill !== 'none' && !s.fill.startsWith('url') ? s.fill : s.color);
        if (fill.length < 3) continue;
        const r = ratio(fill.slice(0, 3), bgOf(el));
        if (r < 3) bad.push(`アイコン「${name}」: ${r.toFixed(2)}`);
      }
      // 入力欄の境界
      if (el.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select, [role="combobox"]')) {
        const s = getComputedStyle(el);
        const parentBg = bgOf(el.parentElement);
        const sides = [
          [s.borderTopWidth, s.borderTopColor], [s.borderRightWidth, s.borderRightColor],
          [s.borderBottomWidth, s.borderBottomColor], [s.borderLeftWidth, s.borderLeftColor],
        ].filter(([w]) => parseFloat(w) >= 1).map(([, c]) => ratio(parse(c).slice(0, 3), parentBg));
        const own = ratio(bgOf(el), parentBg);
        const best = Math.max(own, ...sides, 0);
        if (best < 3) bad.push(`入力欄の境界「${name}」: ${best.toFixed(2)}`);
      }
    }
    return [...new Set(bad)];
  }, 'button, a[href], input, textarea, select, [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="combobox"], [role="slider"], [role="menuitem"]');
}

async function textContrastViolations(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  return r.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')}: ${n.any.map((a) => a.message).join(' ').slice(0, 120)}`));
}

test.describe('NFR-UX-016 色の役割とコントラスト', () => {
  for (const theme of THEMES) {
    // NFR-UX-016 AC-477
    test(`NFR-UX-016 AC-477 ${theme}: 全画面で文字は 4.5:1（大きな文字は 3:1）未満が 0 件、アイコンと操作部品の境界は 3:1 未満が 0 件`, async ({ page, start }) => {
      test.setTimeout(300_000);
      await applyTheme(page, theme);
      await start();
      await selectPersona(page, '事業部門');
      const keys = await listScreenKeys(page);
      const text: string[] = [];
      const nonText: string[] = [];
      for (const key of keys) {
        await gotoScreen(page, key);
        text.push(...(await textContrastViolations(page)).map((x) => `${key}: ${x}`));
        nonText.push(...(await nonTextContrastFailures(page)).map((x) => `${key}: ${x}`));
      }
      expect(text, '文字のコントラスト不足').toEqual([]);
      expect(nonText, 'アイコン・操作部品の境界のコントラスト不足').toEqual([]);
    });
  }

  // NFR-UX-016 AC-477（異常系: 一時的な表示（ダイアログ・メニュー）を開いた状態でも、3 つのテーマでコントラスト不足が 0 件）
  test('NFR-UX-016 AC-477 異常系: コマンドパレットと「その他の操作」メニューを開いた状態でも、Light・Dark・ハイコントラストでコントラスト不足が 0 件', async ({ page, start }) => {
    test.setTimeout(180_000);
    await start();
    await selectPersona(page, '事業部門');
    const [k] = await topKeys(page);
    const bad: string[] = [];
    for (const theme of THEMES) {
      await applyTheme(page, theme);
      const c = component(page, k);
      await c.focus();
      await c.getByTestId('component-menu').first().click();
      await expect(page.getByRole('menu').last()).toBeVisible();
      bad.push(...(await textContrastViolations(page)).map((x) => `${theme} メニュー: ${x}`));
      bad.push(...(await nonTextContrastFailures(page)).map((x) => `${theme} メニュー: ${x}`));
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+k');
      await expect(page.getByRole('dialog', { name: 'コマンドパレット' })).toBeVisible();
      bad.push(...(await textContrastViolations(page)).map((x) => `${theme} ダイアログ: ${x}`));
      bad.push(...(await nonTextContrastFailures(page)).map((x) => `${theme} ダイアログ: ${x}`));
      await page.keyboard.press('Escape');
    }
    expect(bad).toEqual([]);
  });
});

/** 直前に記録した後に始まった動き（Web Animations。CSS の transition・animation を含む）の情報 */
async function markAnimations(page: Page): Promise<void> {
  await page.evaluate(() => { (window as any).__stSeenAnims = new WeakSet(document.getAnimations()); });
}
interface AnimInfo { endTime: number; props: string[]; target: string; running: boolean }
async function newAnimations(page: Page): Promise<AnimInfo[]> {
  return page.evaluate(() => {
    const seen: WeakSet<Animation> = (window as any).__stSeenAnims ?? new WeakSet();
    return document.getAnimations().filter((a) => !seen.has(a)).map((a) => {
      const eff = a.effect as KeyframeEffect | null;
      const timing = eff?.getComputedTiming();
      const props = (a as any).transitionProperty
        ? [String((a as any).transitionProperty)]
        : (eff?.getKeyframes() ?? []).flatMap((k) => Object.keys(k).filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x)));
      const t = eff?.target as Element | null;
      return {
        endTime: Number(timing?.endTime ?? 0),
        props: [...new Set(props)],
        target: t ? `${t.tagName.toLowerCase()}${t.getAttribute('data-testid') ? `[${t.getAttribute('data-testid')}]` : ''}${t.getAttribute('role') ? `(${t.getAttribute('role')})` : ''}` : '',
        running: a.playState === 'running',
      };
    });
  });
}
const nextFrames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function ensurePlaying(page: Page): Promise<void> {
  if (!(await page.getByTestId('animation-state').innerText()).includes('再生中')) await page.keyboard.press('p');
  await expect(page.getByTestId('animation-state')).toContainText('再生中');
}

/** 対象の要素と子孫の計算済みの transition・animation の所要時間の最大（ms） */
async function maxDuration(loc: Locator, withDescendants: boolean): Promise<number> {
  return loc.evaluate((root, deep) => {
    const ms = (v: string) => Math.max(0, ...v.split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) : parseFloat(x) * 1000)).filter((n) => !Number.isNaN(n)));
    const els = deep ? [root, ...Array.from(root.querySelectorAll('*'))] : [root, ...Array.from(root.children)];
    let m = 0;
    for (const e of els) {
      const s = getComputedStyle(e);
      m = Math.max(m, ms(s.transitionDuration) + ms(s.transitionDelay), ms(s.animationDuration) + ms(s.animationDelay));
    }
    return m;
  }, withDescendants);
}

/** 画面の情報と操作の写し（見出しの文字と操作部品の名前） */
async function screenSnapshot(c: Locator): Promise<string[]> {
  return c.evaluate((root) => Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],button,a[href],input,[role="button"],[role="tab"],[role="switch"]'))
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; })
    .map((e) => `${e.tagName.toLowerCase()}:${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40)}`));
}

test.describe('NFR-UX-017 Fluent 2 のモーション', () => {
  // NFR-UX-017 AC-480
  test('NFR-UX-017 AC-480 アニメーション再生中、画面の切替はフェードで、ダイアログ・メニューの出入りの動きが 500ms 以内に完了する', async ({ page, start }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await start();
    await selectPersona(page, '事業部門');
    await ensurePlaying(page);
    // 画面の切替の動きは左メニューの押下の直後に測る。左メニューに項目を持たない画面（FR-220 AC-590 の view3d・drawing2d）は
    // コマンドパレット（それ自体がダイアログの動きを伴う）でしか開けないので、切替の 2 画面は左メニューにある画面から選ぶ。
    const keys: string[] = [];
    for (const k of await listScreenKeys(page)) if (!(await isOffMenuScreen(page, k))) keys.push(k);
    const [a, b] = [keys[0], keys[1]];
    await gotoScreen(page, a);
    await page.waitForTimeout(MOTION_MAX_MS + 200);
    // 画面の切替
    await markAnimations(page);
    await page.getByTestId(`nav-${b}`).click();
    await nextFrames(page);
    const sw = await newAnimations(page);
    expect(sw.some((x) => x.props.some((p) => p === 'opacity' || p === 'all')), `画面の切替がフェード（opacity の動き）でない: ${JSON.stringify(sw)}`).toBe(true);
    const finite = (xs: AnimInfo[]) => xs.filter((x) => Number.isFinite(x.endTime));
    expect(finite(sw).filter((x) => x.endTime > MOTION_MAX_MS), '画面の切替の動きが 500ms を超える').toEqual([]);
    await page.waitForTimeout(MOTION_MAX_MS + 100);
    expect(finite(await newAnimations(page)).filter((x) => x.running), '画面の切替の動きが 500ms 以内に完了しない').toEqual([]);
    // ダイアログ（コマンドパレット）の出入り
    for (const step of ['開く', '閉じる'] as const) {
      await markAnimations(page);
      await page.keyboard.press(step === '開く' ? 'Control+k' : 'Escape');
      await nextFrames(page);
      const xs = finite(await newAnimations(page));
      expect(xs.filter((x) => x.endTime > MOTION_MAX_MS), `ダイアログを${step}動きが 500ms を超える`).toEqual([]);
      await page.waitForTimeout(MOTION_MAX_MS + 100);
      expect(finite(await newAnimations(page)).filter((x) => x.running), `ダイアログを${step}動きが 500ms 以内に完了しない`).toEqual([]);
    }
    await expect(page.getByRole('dialog', { name: 'コマンドパレット' })).toBeHidden();
    // メニュー（その他の操作）の出入り
    const c = component(page, b);
    for (const step of ['開く', '閉じる'] as const) {
      await markAnimations(page);
      if (step === '開く') await c.getByTestId('component-menu').first().click();
      else await page.keyboard.press('Escape');
      await nextFrames(page);
      const xs = finite(await newAnimations(page));
      expect(xs.filter((x) => x.endTime > MOTION_MAX_MS), `メニューを${step}動きが 500ms を超える`).toEqual([]);
      await page.waitForTimeout(MOTION_MAX_MS + 100);
      expect(finite(await newAnimations(page)).filter((x) => x.running), `メニューを${step}動きが 500ms 以内に完了しない`).toEqual([]);
    }
  });

  // NFR-UX-017 AC-480（prefers-reduced-motion: reduce。全画面）
  test('NFR-UX-017 AC-480 prefers-reduced-motion を reduce にすると、全画面で画面の切替・ダイアログ・メニューの transition・animation の所要時間が 0 で、情報と操作は変わらない', async ({ page, start }) => {
    test.setTimeout(300_000);
    await start();
    await selectPersona(page, '事業部門');
    await ensurePlaying(page);
    const keys = await listScreenKeys(page);
    const bad: string[] = [];
    for (const key of keys) {
      // 動きの軽減なしの情報と操作
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const c0 = await gotoScreen(page, key);
      await page.waitForTimeout(MOTION_MAX_MS + 100);
      const normal = await screenSnapshot(c0);
      // 動きの軽減あり
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const other = keys.find((k) => k !== key)!;
      await gotoScreen(page, other);
      await markAnimations(page);
      // 左メニューの項目（左メニューにない画面はコマンド。FR-220 AC-590）で切り替える
      const c = await gotoScreen(page, key);
      await expect(c).toBeVisible();
      await nextFrames(page);
      const sw = (await newAnimations(page)).filter((x) => x.endTime > 0);
      if (sw.length) bad.push(`${key} 画面の切替: ${JSON.stringify(sw.slice(0, 3))}`);
      const d0 = await maxDuration(c, false);
      if (d0 > 0) bad.push(`${key} 画面: ${d0}ms`);
      expect(await screenSnapshot(c), `${key}: 動きの軽減で表示される情報・操作が変わる`).toEqual(normal);
      // メニュー（設定はモーダルの dialog で component-menu を持たない。FR-223）
      if (key === 'settings') continue;
      await c.focus();
      await markAnimations(page);
      await c.getByTestId('component-menu').first().click();
      const menu = page.getByRole('menu').last();
      await expect(menu).toBeVisible();
      const dm = await maxDuration(menu, true);
      if (dm > 0) bad.push(`${key} メニュー: ${dm}ms`);
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      const ma = (await newAnimations(page)).filter((x) => x.endTime > 0);
      if (ma.length) bad.push(`${key} メニューの出入り: ${JSON.stringify(ma.slice(0, 3))}`);
      // ダイアログ
      await markAnimations(page);
      await page.keyboard.press('Control+k');
      const dlg = page.getByRole('dialog', { name: 'コマンドパレット' });
      await expect(dlg).toBeVisible();
      const dd = await maxDuration(dlg, true);
      if (dd > 0) bad.push(`${key} ダイアログ: ${dd}ms`);
      await page.keyboard.press('Escape');
      await expect(dlg).toBeHidden();
      const da = (await newAnimations(page)).filter((x) => x.endTime > 0);
      if (da.length) bad.push(`${key} ダイアログの出入り: ${JSON.stringify(da.slice(0, 3))}`);
    }
    expect(bad, '動きの軽減でも所要時間が 0 でない').toEqual([]);
  });

  // NFR-UX-017 AC-480（異常系: ダイアログを開いたまま reduce に切り替えても、閉じる・開き直す動きが残らない）
  test('NFR-UX-017 AC-480 異常系: ダイアログを開いたまま prefers-reduced-motion を reduce に切り替えても、閉じる・開き直すときに動きが残らない', async ({ page, start }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await start();
    await ensurePlaying(page);
    await page.keyboard.press('Control+k');
    const dlg = page.getByRole('dialog', { name: 'コマンドパレット' });
    await expect(dlg).toBeVisible();
    await page.waitForTimeout(MOTION_MAX_MS + 100);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await markAnimations(page);
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await page.keyboard.press('Control+k');
    await expect(dlg).toBeVisible();
    expect((await newAnimations(page)).filter((x) => x.endTime > 0), '動きが残っている').toEqual([]);
    expect(await maxDuration(dlg, true)).toBe(0);
  });
});
