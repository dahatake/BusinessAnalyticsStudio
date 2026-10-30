// FR-070 AC-086. Scope/remaining lifecycle coverage is explicit in visualization-coverage.md.
import { test, expect } from '../support/fixtures';
import { assertActualSurface, renderedGeometry, settledGeometry, showRepresentation, VISUALIZATION_MATRIX } from '../support/visualization-matrix';

for (const row of VISUALIZATION_MATRIX) {
  test(`FR-070 AC-086 ${row.screen}/${row.mode ?? '2D/Canvas'} 初回表示・停止時の実描画と最終状態`, async ({ page, start }, info) => {
    await start();
    const c = await showRepresentation(page, row.screen, row.mode);
    await assertActualSurface(c);
    await info.attach('rendered-surface', { body: await c.screenshot(), contentType: 'image/png' });
    // Pausing must show the final state, not freeze an intermediate animation.
    const control = page.getByTestId('animation-state');
    if ((await control.innerText()).includes('再生中')) await control.click();
    const geometry = await settledGeometry(c);
    await page.waitForTimeout(100);
    expect(await renderedGeometry(c), '停止後に図形・位置・軸・ラベルが変わり続ける').toBe(geometry);
    expect(await c.evaluate(root => root.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length)).toBe(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(control).toContainText('停止中');
    await assertActualSurface(c);
    expect(await renderedGeometry(c)).toBe(geometry);
  });
}
