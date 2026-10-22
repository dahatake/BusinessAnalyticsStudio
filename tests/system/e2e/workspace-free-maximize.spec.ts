// Oracles: FR-013 AC-591/592 (app-core.md), not the layout implementation.
// UI locations only: CONTRACT.md, panel-handle and the public pane menu.
import type { Locator, Page } from '@playwright/test';
import { test, expect, component, openScreen, selectPersona } from '../support/fixtures';

type Box = { x: number; y: number; width: number; height: number };
// Public workspace navigation keys. Settings is a modal, not a freely placed pane.
const PANES = [
  'issue-solution', 'priority', 'summary', 'matrix', 'ranking',
  'knowledge-graph', 'business-graph', 'architecture', 'discussion-tree', 'table',
  'gantt', 'map', 'kpi-okr', 'twin-view', 'sources',
  'mock-app', 'usecase', 'data-catalog', 'spatial-view', 'whiteboard', 'themes', 'chat',
] as const;
const TOL = 2; // CSS-pixel rounding only; not an area-only/fullscreen-state oracle.

async function box(c: Locator): Promise<Box> {
  const b = await c.boundingBox();
  expect(b, 'visible rectangle required').not.toBeNull();
  return b!;
}

async function sameBox(c: Locator, expected: Box, message: string) {
  await expect.poll(async () => {
    const actual = await box(c);
    return Math.max(...(['x', 'y', 'width', 'height'] as const)
      .map((p) => Math.abs(actual[p] - expected[p])));
  }, { message }).toBeLessThanOrEqual(TOL);
}

async function menu(c: Locator, name: string) {
  await c.focus();
  await c.getByTestId('component-menu').click();
  await c.page().getByRole('menuitem', { name, exact: true }).click();
}

async function icon(c: Locator, name: '最大化' | '通常表示') {
  await c.focus();
  await c.getByTestId('component-actions').getByRole('button', { name, exact: true }).click();
}

async function setup(page: Page, key: string) {
  await selectPersona(page, '事業部門');
  await page.getByRole('button', { name: '既定のレイアウトに戻す', exact: true }).click();
  const c = await openScreen(page, key);
  const workspace = page.getByTestId('workspace');
  const ws = await box(workspace);
  // Reference is the SAME pane on the SAME screen and workspace size, in default layout.
  await icon(c, '最大化');
  await sameBox(c, ws, 'default maximize must itself cover the full workspace');
  const reference = await box(c);
  await icon(c, '通常表示');
  await menu(c, '自由に動かせる配置にする');
  // Make the starting rectangle unambiguously smaller than the work area.
  // Bound the setup loop: a broken resize cannot silently turn this into a full-size test.
  for (const [dimension, command] of [
    ['width', '幅を狭める'], ['height', '高さを狭める'],
  ] as const) {
    for (let n = 0; n < 16 && (await box(c))[dimension] > ws[dimension] * 0.55; n++) {
      await menu(c, command);
    }
    expect((await box(c))[dimension], `${key}: smaller starting ${dimension}`)
      .toBeLessThanOrEqual(ws[dimension] * 0.55 + TOL);
  }
  // Drag the public handle, not CSS classes, style injection, storage or a store hook.
  const beforeDrag = await box(c);
  const handle = await box(c.getByTestId('panel-handle').first());
  const dx = ws.x + ws.width * 0.20 - beforeDrag.x;
  const dy = ws.y + ws.height * 0.20 - beforeDrag.y;
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => {
    const b = await box(c);
    return Math.min(b.x - ws.x, b.y - ws.y,
      ws.x + ws.width - b.x - b.width, ws.y + ws.height - b.y - b.height);
  }, { message: `${key}: free rectangle must be away from ALL workspace edges` }).toBeGreaterThan(16);
  const free = await box(c);
  await sameBox(workspace, ws, 'setup must not change workspace geometry');
  return { c, workspace, ws, reference, free };
}

async function maximized(s: Awaited<ReturnType<typeof setup>>) {
  await sameBox(s.workspace, s.ws, 'same workspace dimensions during maximize');
  await sameBox(s.c, s.reference, 'free maximize must match default maximize x/y/width/height');
  await sameBox(s.c, s.ws, 'maximized rectangle must cover workspace, not just its old free host');
  const b = await box(s.c);
  expect(Math.abs(b.x - s.free.x) + Math.abs(b.y - s.free.y), 'position actually changes').toBeGreaterThan(16);
  expect(b.width - s.free.width, 'width actually changes').toBeGreaterThan(16);
  expect(b.height - s.free.height, 'height actually changes').toBeGreaterThan(16);
  // Hit-test a grid across the visible rectangle, not merely data-maximized or z-index.
  // Descendants of the target are allowed; another panel covering it is not.
  await expect.poll(() => s.c.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [0.02, 0.25, 0.5, 0.75, 0.98].every((fx) =>
      [0.02, 0.25, 0.5, 0.75, 0.98].every((fy) => {
        const top = document.elementFromPoint(r.x + r.width * fx, r.y + r.height * fy);
        return top !== null && el.contains(top);
      }));
  }), { message: 'maximized pane must not be obscured by another component' }).toBe(true);
}

for (const key of PANES) {
  // FR-013 AC-591: all freely placeable screen panes, explicitly including issue-solution.
  test(`FR-013 AC-591 free-maximize ${key}: actual full rectangle and no occlusion`, async ({ page, start }) => {
    const app = await start();
    const s = await setup(page, key);
    // Establish that the freely placed rectangle, not an unsaved transient size, persists.
    await app.reload();
    await sameBox(s.c, s.free, 'precondition: free placement persisted before maximize');
    await icon(s.c, '最大化');
    await maximized(s);
  });

  for (const restore of ['restore-button', 'restore-escape'] as const) {
    // FR-013 AC-592: each restore route is independent, with persisted setup verified first.
    test(`FR-013 AC-592 ${restore} ${key}: exact free rectangle survives reload`, async ({ page, start }) => {
      const app = await start();
      const s = await setup(page, key);
      await app.reload();
      await sameBox(s.workspace, s.ws, 'reload must keep workspace geometry');
      await sameBox(s.c, s.free, 'precondition: original free rectangle was saved');
      await icon(s.c, '最大化');
      await maximized(s);
      if (restore === 'restore-button') await icon(s.c, '通常表示');
      else await page.keyboard.press('Escape');
      await sameBox(s.workspace, s.ws, 'restore must keep workspace geometry');
      await sameBox(s.c, s.free, 'restore returns to pre-maximize free rectangle');
      await app.reload(); // same browser context and persona; no persona re-selection/reset
      await sameBox(s.workspace, s.ws, 'same workspace after persisted restore');
      await sameBox(s.c, s.free, 'maximize/restore must not overwrite saved free rectangle');
    });
  }
}

// FR-013 AC-016 AC-592: negative/regression path, repeated keyboard cycles must not
// accumulate a full-size saved rectangle. Existing AC-016 input/H/double-click cases stay intact.
test('FR-013 AC-016 AC-592 keyboard-repeat issue-solution: no saved-rectangle drift', async ({ page, start }) => {
  const app = await start();
  const s = await setup(page, 'issue-solution');
  await app.reload();
  await sameBox(s.c, s.free, 'saved setup before keyboard regression');
  for (let n = 0; n < 3; n++) {
    await s.c.focus();
    await page.keyboard.press('Shift+F');
    await maximized(s);
    await page.keyboard.press('Escape');
    await sameBox(s.c, s.free, 'repeated Esc must not drift or preserve maximized dimensions');
  }
  await app.reload();
  await sameBox(s.workspace, s.ws, 'unchanged work area after keyboard cycles');
  await sameBox(s.c, s.free, 'keyboard-only maximize/restore must not corrupt saved placement');
});
