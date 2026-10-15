// System Test: ストーリーの代替の手段と動きの配慮（NFR-A11Y-008 AC-367・AC-368・AC-370・AC-371。AC-369 は manual）
// 期待値は要求定義書の受入基準だけから決める。画面の探し方は tests/system/CONTRACT.md §12。PARAM-047=5（秒）。
import type { Page } from '@playwright/test';
import { test, expect, PERSONAS } from '../support/fixtures';

const SCENE_MS = 5_000; // PARAM-047
const START = 'プレゼンテーションを開始';

async function openStory(page: Page, persona: string): Promise<void> {
  await page.getByRole('button', { name: START }).click();
  await page.getByRole('dialog', { name: 'ペルソナの選択' }).getByRole('button', { name: persona }).click();
  await expect(page.getByTestId('story-scene')).toBeVisible();
}

async function position(page: Page): Promise<{ n: number; total: number }> {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(await page.getByTestId('story-position').innerText());
  expect(m, '位置表示は n / 全体').not.toBeNull();
  return { n: Number(m![1]), total: Number(m![2]) };
}

/** → で最後まで進めながら、各シーンの見出しを順に集める。 */
async function headingsInOrder(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < 60; i++) {
    out.push((await page.getByTestId('story-scene').getByRole('heading').first().innerText()).trim());
    const p = await position(page);
    if (p.n >= p.total) break;
    await page.keyboard.press('ArrowRight');
  }
  return out;
}

async function closeStory(page: Page): Promise<void> {
  for (let i = 0; i < 4 && (await page.getByTestId('story').count()) > 0; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId('story')).toHaveCount(0);
}

const insideStory = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('[data-testid="story"]'));

test.describe('NFR-A11Y-008 ストーリーの代替の手段と動きの配慮', () => {
  // NFR-A11Y-008 AC-367
  test('NFR-A11Y-008 AC-367 テキスト表示に切り替えると、全シーンの見出しが同じ順序で読め、切替の前後で位置が保たれる', async ({ page, start }) => {
    await start();
    await openStory(page, '経営層');
    const heads = await headingsInOrder(page);
    expect(heads.length).toBeGreaterThan(3);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const before = await position(page);
    expect(before.n).toBe(3);

    await page.getByRole('button', { name: 'テキスト表示' }).click();
    const text = page.getByTestId('story-text');
    await expect(text).toBeVisible();
    const items = text.getByTestId('story-text-item');
    await expect(items).toHaveCount(before.total);
    const itemHeads = (await items.getByRole('heading').allInnerTexts()).map((t) => t.trim());
    expect(itemHeads, '演出と同じ順序・同じ見出し').toEqual(heads);
    await expect(items.nth(before.n - 1)).toHaveAttribute('aria-current', 'step');
    expect(await position(page), '切替の直後も位置が同じ').toEqual(before);

    await page.getByRole('button', { name: '演出の表示に戻る' }).click();
    await expect(page.getByTestId('story-scene')).toBeVisible();
    expect(await position(page), '戻した後も位置が保たれる').toEqual(before);
  });

  // NFR-A11Y-008 AC-367
  test('NFR-A11Y-008 AC-367 シーンが変わると、シーン名と現在位置（n/全体）が支援技術向けの通知領域に出る', async ({ page, start }) => {
    await start();
    await openStory(page, '経営層');
    const live = page.getByTestId('story-announce');
    await expect(live).toHaveAttribute('aria-live', /polite|assertive/);
    const p0 = await position(page);
    await expect(live).toContainText(`${p0.n} / ${p0.total}`);
    await page.keyboard.press('ArrowRight');
    await expect(live).toContainText(`${p0.n + 1} / ${p0.total}`);
    const kicker = await page.getByTestId('story-scene').getAttribute('aria-label');
    expect(kicker, 'シーンに名前（支援技術向け）がある').toBeTruthy();
    await expect(live).toContainText(kicker!);
    // 異常系: 先頭でさらに ← を押しても位置は範囲外にならない
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowLeft');
    expect((await position(page)).n).toBe(1);
    await expect(live).toContainText(`1 / ${p0.total}`);
  });

  // NFR-A11Y-008 AC-368
  test('NFR-A11Y-008 AC-368 優先度（順位）が色だけでなく文字（「n 位」）でも示される', async ({ page, start }) => {
    await start();
    await openStory(page, '経営層');
    await page.getByRole('button', { name: 'テキスト表示' }).click();
    const all = await page.getByTestId('story-text').innerText();
    for (const rank of [1, 2, 3]) expect(all, `${rank} 位が文字で示される`).toMatch(new RegExp(`${rank}\\s*位`));
    // 異常系: 順位を持たない別ペルソナでも、優先度は文字で示される（現場は「第 n 位」）
    await closeStory(page);
    await openStory(page, '現場');
    await page.getByRole('button', { name: 'テキスト表示' }).click();
    expect(await page.getByTestId('story-text').innerText()).toMatch(/\d+\s*位/);
  });

  // NFR-A11Y-008 AC-368
  test('NFR-A11Y-008 AC-368 自動再生はキーボード（Space）で一時停止でき、一時停止中は進まない', async ({ page, start }) => {
    test.setTimeout(60_000);
    await start();
    await openStory(page, '経営層');
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: '自動再生を一時停止' })).toBeVisible();
    const p0 = await position(page);
    await expect.poll(async () => (await position(page)).n, { timeout: SCENE_MS + 4_000 }).toBeGreaterThan(p0.n);
    await page.keyboard.press('Space'); // 一時停止
    await expect(page.getByRole('button', { name: '自動再生', exact: true })).toBeVisible();
    const paused = await position(page);
    await page.waitForTimeout(SCENE_MS + 1_500);
    expect(await position(page), '一時停止中は自動で進まない').toEqual(paused);
  });

  // NFR-A11Y-008 AC-368（異常系: 既定では自動で進まない）
  test('NFR-A11Y-008 AC-368 異常系: 自動再生を始めなければ、時間が経ってもシーンは自動で進まない', async ({ page, start }) => {
    test.setTimeout(60_000);
    await start();
    await openStory(page, '経営層');
    const p0 = await position(page);
    await page.waitForTimeout(SCENE_MS + 1_500);
    expect(await position(page)).toEqual(p0);
  });

  // NFR-A11Y-008 AC-368
  test('NFR-A11Y-008 AC-368 OS の「視差効果を減らす」では、シーンに動き（アニメーション）が付かない', async ({ page, start }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start();
    await openStory(page, '経営層');
    for (let i = 0; i < 3; i++) {
      const names = await page.getByTestId('story-scene').evaluate((el) =>
        [el, ...Array.from(el.querySelectorAll('*'))].map((e) => getComputedStyle(e).animationName));
      expect(names.every((n) => n === 'none'), `動きなし（${Array.from(new Set(names)).join(',')}）`).toBe(true);
      await page.keyboard.press('ArrowRight');
    }
  });

  // NFR-A11Y-008 AC-370
  test('NFR-A11Y-008 AC-370 ストーリー中の Tab・Shift+Tab のフォーカスはストーリーの外へ抜けない', async ({ page, start }) => {
    await start();
    await openStory(page, '経営層');
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      expect(await insideStory(page), `Tab ${i + 1} 回目`).toBe(true);
    }
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await insideStory(page), `Shift+Tab ${i + 1} 回目`).toBe(true);
    }
  });

  // NFR-A11Y-008 AC-370
  test('NFR-A11Y-008 AC-370 Esc で閉じると、開く前の画面とフォーカス（開始ボタン）に戻る。テキスト表示中でも同じ', async ({ page, start }) => {
    await start();
    for (const textMode of [false, true]) {
      const startBtn = page.getByRole('button', { name: START });
      await startBtn.focus();
      await openStory(page, '経営層');
      if (textMode) await page.getByRole('button', { name: 'テキスト表示' }).click();
      await closeStory(page);
      await expect(startBtn, '開く前の画面に戻る').toBeVisible();
      await expect(startBtn, '開く前のフォーカスの位置に戻る').toBeFocused();
    }
  });

  // NFR-A11Y-008 AC-371
  test('NFR-A11Y-008 AC-371 終了後にペルソナの選択へ戻れ、別のペルソナを選ぶと、そのペルソナの切り口で最初から再生される', async ({ page, start }) => {
    await start();
    await openStory(page, '経営層');
    const execP2 = await (async () => {
      await page.keyboard.press('Home');
      for (let i = 0; i < 60; i++) {
        if ((await page.getByTestId('story-scene').getAttribute('data-story-part')) === '2') return (await page.getByTestId('story-scene').innerText()).trim();
        await page.keyboard.press('ArrowRight');
      }
      return '';
    })();
    expect(execP2.length).toBeGreaterThan(0);
    const last = await position(page);
    expect(last.n).toBeGreaterThan(1); // 途中（理由のシーン）まで進めた状態で終了する
    await closeStory(page);

    await page.getByRole('button', { name: START }).click();
    const dlg = page.getByRole('dialog', { name: 'ペルソナの選択' });
    await expect(dlg, 'ペルソナの選択へ戻れる').toBeVisible();
    for (const p of PERSONAS) await expect(dlg.getByRole('button', { name: p })).toBeVisible();
    await dlg.getByRole('button', { name: '現場' }).click();
    await expect(page.getByTestId('story')).toHaveAttribute('data-persona', '現場');
    const pos = await position(page);
    expect(pos.n, '最初から再生される').toBe(1);
    expect(await page.getByTestId('story-scene').getAttribute('data-story-part')).toBe('1');
    // 現場の切り口（理由に「日々の作業」）で、経営層の理由と異なる
    await page.getByRole('button', { name: 'テキスト表示' }).click();
    expect(await page.getByTestId('story-text').innerText()).toContain('日々の作業');
  });

  // NFR-A11Y-008 AC-371（異常系: 最後のシーンまで進めて終了しても、選び直せる）
  test('NFR-A11Y-008 AC-371 異常系: 最後のシーンで終了しても、同じペルソナを選び直すと最初から再生される', async ({ page, start }) => {
    await start();
    await openStory(page, 'IT');
    const total = (await position(page)).total;
    for (let i = 1; i < total; i++) await page.keyboard.press('ArrowRight');
    expect((await position(page)).n).toBe(total);
    await closeStory(page);
    await openStory(page, 'IT');
    expect((await position(page)).n).toBe(1);
  });
});
