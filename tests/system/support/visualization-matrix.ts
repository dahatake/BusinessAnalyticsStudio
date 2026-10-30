// FR-070 AC-086 / FR-045 AC-056 / FR-134 AC-197
// This is an explicit inventory, NOT a discovery loop over shared motion attributes.
// Screen/renderer locations only were obtained from the screen registry; expectations
// (interpolation, deadlines, current information, identity) come from the ACs.
import type { Locator, Page } from '@playwright/test';
import { expect, expectCanvasDrawn, openScreen } from './fixtures';

export const VISUALIZATION_MATRIX = [
  ...['issue-solution', 'matrix', 'ranking', 'knowledge-graph', 'business-graph',
    'architecture', 'discussion-tree', 'table', 'map', 'kpi-okr',
    'twin-view', 'data-catalog', 'spatial-view'].flatMap(screen =>
    (['2D', '3D'] as const).map(mode => ({ screen, mode }))),
  ...['issue-solution', 'business-graph', 'kpi-okr', 'twin-view',
    'data-catalog', 'spatial-view'].map(screen => ({ screen, mode: 'Graph' })),
  { screen: 'gantt', mode: '2D' },
  { screen: 'gantt', mode: '3D' }, // CPU Canvas 2.5D, not WebGL.
  { screen: 'priority', mode: null },
  { screen: 'summary', mode: null },
  { screen: 'whiteboard', mode: null },
] as const;

export async function showRepresentation(page: Page, screen: string, mode: string | null): Promise<Locator> {
  const c = await openScreen(page, screen);
  if (mode) {
    await c.focus();
    await c.getByTestId('component-actions').first().getByRole('button', { name: /^ビュー/ }).click();
    await page.getByRole('menuitemradio', { name: mode, exact: true }).click();
  }
  return c;
}

/** Actual rendered geometry/text, excluding toolbars and test-hook state. */
export async function renderedGeometry(c: Locator): Promise<string> {
  return c.evaluate(root => JSON.stringify(
    Array.from(root.querySelectorAll(
      'svg [data-entity-id], svg path, svg line, svg text, svg circle, ' +
      '[data-zoom-surface] [data-entity-id], [data-testid="result-item"], [data-testid="result-item"] > div, ' +
      '[data-testid="graph-alt"] tbody tr, [role="grid"] [role="row"], canvas',
    )).filter(el => el.getBoundingClientRect().width > 0).map(el => {
      const box = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      return [
        el.tagName, el.getAttribute('data-entity-id'), el.textContent,
        ...['d', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'points', 'transform'].map(k => el.getAttribute(k)),
        box.x, box.y, box.width, box.height, css.opacity, css.transform,
      ];
    }),
  ));
}

export async function assertActualSurface(c: Locator): Promise<void> {
  // Assert actual graphical or tabular output, never data-motion/data-transition presence.
  const output = c.locator('svg:visible, canvas:visible, table:visible, [data-zoom-surface]:visible, [data-entity-id]:visible, [data-testid="executive-summary"]:visible').first();
  await expect(output, '可視の SVG/Canvas/図面/表が必要').toBeVisible();
  const box = await output.boundingBox();
  expect(box && box.width > 0 && box.height > 0).toBeTruthy();
  if (await c.locator('canvas:visible').count()) {
    for (const canvas of await c.locator('canvas:visible').all()) {
      await expectCanvasDrawn(canvas);
    }
  }
}
