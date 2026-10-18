// 画面の登録（全画面）の走査と、見出しの操作（ピン止め・ビュー）の共通の操作。
// 「全画面」は、利用者が見る画面の一覧＝左メニュー（navigation「画面」）の `nav-<key>` を走査して得る（CONTRACT.md §21）。
// 期待値は要求定義書の受入基準から決め、実装の一覧（コード）からは決めない。主要画面（MAIN_SCREENS）が欠けていれば失敗にする。
import type { Page, Locator } from '@playwright/test';
import { expect, component, MAIN_SCREENS } from './fixtures';

export async function box(loc: Locator) {
  const b = await loc.boundingBox();
  expect(b, '要素が表示されていない').not.toBeNull();
  return b!;
}

/** 左メニューの画面の一覧（nav-toggle を除く）。並びは表示の順。 */
export async function listScreenKeys(page: Page): Promise<string[]> {
  const nav = page.getByRole('navigation', { name: '画面', exact: true });
  await expect(nav).toBeAttached();
  const keys = await nav.locator('[data-testid^="nav-"]').evaluateAll((els) =>
    els.map((e) => (e.getAttribute('data-testid') ?? '').replace(/^nav-/, '')).filter((k) => k && k !== 'toggle'),
  );
  const uniq = [...new Set(keys)];
  for (const [k, name] of MAIN_SCREENS) expect(uniq, `画面の一覧に主要画面「${name}」がない`).toContain(k);
  return uniq;
}

/** 画面を開く。左メニューが見えない幅では、ボタン「メニュー」から開く（AC-186 と同じ手段）。 */
export async function gotoScreen(page: Page, key: string): Promise<Locator> {
  const nav = page.getByTestId(`nav-${key}`);
  if (!(await nav.isVisible())) await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await nav.click();
  const c = component(page, key);
  await expect(c, `画面 ${key} が開かない`).toBeVisible();
  return c;
}

/** 直下のコンポーネント（component-menu・component-actions と入れ子を除く）の key 一覧 */
export async function topKeys(page: Page): Promise<string[]> {
  return page.getByTestId('workspace').evaluate((ws) => {
    const sel = '[data-testid^="component-"]:not([data-testid="component-menu"]):not([data-testid="component-actions"])';
    const out: string[] = [];
    ws.querySelectorAll(sel).forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (!el.parentElement?.closest(sel) && r.width > 0 && r.height > 0) out.push((el.getAttribute('data-testid') ?? '').replace('component-', ''));
    });
    return out;
  });
}

/** コンポーネントの見出しの操作アイコン（FR-150。フォーカスしたコンポーネントに出る） */
export function actions(c: Locator): Locator {
  return c.getByTestId('component-actions').first();
}

/** 見出しのピンのアイコン（FR-215。名前は「ピン止めする」か「ピン止めを外す」） */
export function pinButton(c: Locator): Locator {
  return actions(c).getByRole('button', { name: /^ピン止め(する|を外す)$/ });
}

/** 見出しの「ビュー」ボタン（FR-217・FR-218・NFR-UX-018。名前は「ビュー」で始まり、現在の表示モードと世界の表示を文字で示す） */
export function viewButton(c: Locator): Locator {
  return actions(c).getByRole('button', { name: /^ビュー/ });
}

/** コンポーネントにフォーカスして「ビュー」のメニューを開き、menu を返す。 */
export async function openViewMenu(page: Page, c: Locator): Promise<Locator> {
  await c.focus();
  await viewButton(c).click();
  const menu = page.getByRole('menu').filter({ has: page.getByRole('menuitemradio', { name: '両方' }) }).last();
  await expect(menu, '「ビュー」のメニューが開かない').toBeVisible();
  return menu;
}

/** 「ビュー」のメニューで選ぶ（2D・3D・現実世界・デジタル世界・両方）。 */
export async function chooseView(page: Page, c: Locator, item: '2D' | '3D' | '現実世界' | 'デジタル世界' | '両方'): Promise<void> {
  const menu = await openViewMenu(page, c);
  const opt = menu.getByRole('menuitemradio', { name: item, exact: true });
  await expect(opt, `${item} が選べない`).toBeEnabled();
  await opt.click();
  await expect(viewButton(c), `「ビュー」ボタンに現在の表示「${item}」が文字で示されない`).toContainText(item);
}

/** 表示の状態（CONTRACT.md §6・§21 のフック `t.view.state(key)`） */
export interface ViewState {
  mode: '2d' | '3d';
  world: 'real' | 'digital' | 'both';
  itemIds: string[];
  selectedIds: string[];
  twinLinks: Array<[string, string]>;
}

/** 操作の対象（ボタン・リンク・切替・入力）の選択子（AC-485 など） */
export const INTERACTIVE_SELECTOR =
  'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="slider"], [role="combobox"], [role="spinbutton"], [role="treeitem"]';
