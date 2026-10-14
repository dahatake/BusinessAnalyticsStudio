// System Test: プレゼンテーション — ペルソナ別の分析結果のストーリー（FR-177・FR-178・FR-180）
// 期待値は要求定義書の受入基準（docs/requirements/app-experience.md の FR-177・FR-178・FR-180）だけから決める。
// 画面の探し方は tests/system/CONTRACT.md §12。PARAM-060=2（件）、PARAM-061=2（秒）、PARAM-062=3（件）。
import type { Page, Locator } from '@playwright/test';
import { test, expect, openScreen, PERSONAS } from '../support/fixtures';

const STORY_TOP = 3; // PARAM-062
const FIRST_SCENE_MS = 2_000; // PARAM-061
const MIN_USECASES = 2; // PARAM-060

interface Scene { part: number; solutionId: string | null; text: string; noData: boolean }

async function openStory(page: Page, persona: string): Promise<void> {
  await page.getByRole('button', { name: 'プレゼンテーションを開始' }).click();
  const dlg = page.getByRole('dialog', { name: 'ペルソナの選択' });
  await dlg.getByRole('button', { name: persona }).click();
  await expect(page.getByTestId('story-scene')).toBeVisible();
}

/** → で最後まで進めながら、各シーンを集める。 */
async function collectScenes(page: Page): Promise<Scene[]> {
  const out: Scene[] = [];
  const read = async (): Promise<Scene> => {
    const s = page.getByTestId('story-scene');
    return {
      part: Number(await s.getAttribute('data-story-part')),
      solutionId: await s.getAttribute('data-solution-id'),
      text: (await s.innerText()).trim(),
      noData: (await s.getAttribute('data-no-data')) === 'true',
    };
  };
  const pos = page.getByTestId('story-position');
  for (let i = 0; i < 60; i++) {
    out.push(await read());
    const m = /(\d+)\s*\/\s*(\d+)/.exec((await pos.innerText()) ?? '');
    if (!m || Number(m[1]) >= Number(m[2])) break;
    await page.keyboard.press('ArrowRight');
  }
  return out;
}

async function priorityOrder(page: Page): Promise<string[]> {
  const c = await openScreen(page, 'priority');
  const ids = await c.locator('[data-entity-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-entity-id') ?? ''));
  return Array.from(new Set(ids.filter((i) => i.startsWith('sol-'))));
}

async function usecaseItems(page: Page): Promise<Locator> {
  await page.getByTestId('stepper').getByRole('button', { name: 'ユースケース作成' }).click();
  return page.getByTestId('usecase-list').getByRole('listitem');
}

test.describe('FR-177 プレゼンテーション: ペルソナ別の分析結果のストーリー', () => {
  // FR-177 AC-356
  test('FR-177 AC-356 お手本パックで経営層を選ぶと、①解決策（優先順位の上位 3 件）②理由の値③KPI/OKR④ユースケースが、この順にデータの値として現れる', async ({ page, start }) => {
    await start();
    const order = (await priorityOrder(page)).slice(0, STORY_TOP);
    expect(order.length, '優先順位の画面に解決策が必要').toBe(STORY_TOP);
    const uc = await usecaseItems(page);
    const ucNames = (await uc.locator('[data-testid="usecase-name"]').allInnerTexts()).map((s) => s.trim()).filter(Boolean);
    expect(ucNames.length, 'ユースケースが登録済みである（FR-180）').toBeGreaterThan(0);
    await openStory(page, '経営層');
    await expect(page.locator('[data-testid="story"]')).toBeVisible();
    const scenes = await collectScenes(page);
    const p1 = scenes.filter((s) => s.part === 1).map((s) => s.solutionId);
    expect(p1, '① 優先順位の高い順の上位 3 件').toEqual(order);
    const parts = scenes.map((s) => s.part);
    const firstIdx = [1, 2, 3, 4].map((p) => parts.indexOf(p));
    expect(firstIdx.every((i) => i >= 0), `①〜④がすべて含まれる（${parts.join(',')}）`).toBe(true);
    expect([...firstIdx].sort((a, b) => a - b), '①〜④の順').toEqual(firstIdx);
    const reasons = scenes.filter((s) => s.part === 2).map((s) => s.text).join('\n');
    for (const label of ['ROI', 'コスト', 'インパクト', '実現性']) expect(reasons, `② 理由に ${label} の値`).toMatch(new RegExp(`${label}[^\\n]*\\d`));
    expect(scenes.filter((s) => s.part === 3).map((s) => s.text).join('\n').length, '③ KPI/OKR の名前').toBeGreaterThan(0);
    const usecaseText = scenes.filter((s) => s.part === 4).map((s) => s.text).join('\n');
    expect(ucNames.some((n) => usecaseText.includes(n)), '④ ユースケースの名称が顧客パックのデータの値と一致').toBe(true);
    expect(scenes.some((s) => s.noData), '「データなし」のシーンが現れない').toBe(false);
  });

  // FR-177 AC-356（異常系: ペルソナを選ばずに閉じればストーリーは始まらない）
  test('FR-177 AC-356 異常系: ペルソナを選ばずに Esc で閉じると、ストーリーは始まらず、フルスクリーンにもならない', async ({ page, start }) => {
    await start();
    await page.getByRole('button', { name: 'プレゼンテーションを開始' }).click();
    await expect(page.getByRole('dialog', { name: 'ペルソナの選択' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('story-scene')).toHaveCount(0);
    expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  });

  // FR-177 AC-357
  test('FR-177 AC-357 4 つのペルソナのそれぞれで①〜④が含まれ、②の理由の指標の種類がペルソナごとに異なる', async ({ page, start }) => {
    await start();
    const want: Record<string, RegExp[]> = {
      経営層: [/ROI/, /コスト/, /KPI|OKR/],
      事業部門: [/課題/, /業務/],
      IT: [/既存環境/, /実現性/],
      現場: [/日々の作業/],
    };
    const reasonOf: Record<string, string> = {};
    for (const p of PERSONAS) {
      await openStory(page, p);
      const scenes = await collectScenes(page);
      expect(new Set(scenes.map((s) => s.part)), `${p}: ①〜④`).toEqual(new Set([1, 2, 3, 4]));
      const reason = scenes.filter((s) => s.part === 2).map((s) => s.text).join('\n');
      for (const re of want[p]) expect(reason, `${p}: 理由に ${re}`).toMatch(re);
      reasonOf[p] = reason;
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('story-scene')).toHaveCount(0);
    }
    expect(new Set(Object.values(reasonOf)).size, '理由の内容がペルソナごとに異なる').toBe(PERSONAS.length);
  });

  // FR-177 AC-357（異常系: 経営層の指標が他ペルソナに流用されない）
  test('FR-177 AC-357 異常系: 「現場」の理由に、経営層向けの指標（ROI・コスト）だけを並べた表示は現れない', async ({ page, start }) => {
    await start();
    await openStory(page, '現場');
    const scenes = await collectScenes(page);
    const reason = scenes.filter((s) => s.part === 2).map((s) => s.text).join('\n');
    expect(reason).toMatch(/日々の作業/);
    expect(reason, '現場の理由に経営層の指標（KPI/OKR の達成度）が主題として並ばない').not.toMatch(/投資判断/);
  });
});

test.describe('FR-178 プレゼンテーション: フルスクリーンのドラマチックな演出と操作', () => {
  // FR-178 AC-359
  test('FR-178 AC-359 開始の操作から 2 秒以内に最初のシーンがフルスクリーンで表示され、1 メッセージ（見出しと数字か一言）を大きな文字で示し、冒頭に結果の数字がある', async ({ page, start }) => {
    await start();
    await page.getByRole('button', { name: 'プレゼンテーションを開始' }).click();
    const dlg = page.getByRole('dialog', { name: 'ペルソナの選択' });
    const t0 = Date.now();
    await dlg.getByRole('button', { name: '経営層' }).click();
    const scene = page.getByTestId('story-scene');
    await expect(scene).toBeVisible({ timeout: FIRST_SCENE_MS });
    expect(Date.now() - t0, '開始から最初のシーンまで').toBeLessThanOrEqual(FIRST_SCENE_MS + 200);
    expect(await page.evaluate(() => document.fullscreenElement !== null), 'document.fullscreenElement が設定される').toBe(true);
    const h = scene.getByRole('heading').first();
    await expect(h).toBeVisible();
    const sizes = await page.evaluate(() => {
      const hd = document.querySelector('[data-testid="story-scene"] h1,[data-testid="story-scene"] h2,[data-testid="story-scene"] [role="heading"]') as HTMLElement;
      return { h: parseFloat(getComputedStyle(hd).fontSize), body: parseFloat(getComputedStyle(document.body).fontSize) };
    });
    expect(sizes.h, '見出しは本文より大きな文字').toBeGreaterThan(sizes.body);
    expect(await scene.getByRole('heading').count(), '1 シーン 1 メッセージ（見出しは 1 つ）').toBe(1);
    expect(await scene.innerText(), '冒頭のシーンに分析の結果を示す数字がある').toMatch(/\d/);
  });

  // FR-178 AC-359（異常系: フルスクリーンを許さない環境でも、ストーリーは止まらない）
  test('FR-178 AC-359 異常系: フルスクリーンが使えない環境でもストーリーは表示され、アプリはエラーで止まらない', async ({ page, start }) => {
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = () => Promise.reject(new TypeError('denied'));
    });
    await start();
    await openStory(page, '経営層');
    await expect(page.getByTestId('story-scene')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('story-scene')).toBeVisible();
  });
});

test.describe('FR-180 デモの作業先のユースケースなど不足するデータの補完', () => {
  // FR-180 AC-364
  for (const kind of ['mono', 'koto'] as const) {
    test(`FR-180 AC-364 デモ（${kind}）で、ペルソナごとに 2 件以上のユースケースが一覧にあり、各項目が揃い、どのペルソナのストーリーにも「データなし」が 0 件`, async ({ page, start }) => {
      await start({ pack: kind });
      const items = await usecaseItems(page);
      const n = await items.count();
      expect(n).toBeGreaterThanOrEqual(MIN_USECASES * PERSONAS.length);
      const byPersona: Record<string, number> = {};
      for (let i = 0; i < n; i++) {
        const it = items.nth(i);
        const persona = (await it.getAttribute('data-persona')) ?? '';
        byPersona[persona] = (byPersona[persona] ?? 0) + 1;
        for (const id of ['usecase-name', 'usecase-summary', 'usecase-steps', 'usecase-effect', 'usecase-solution', 'usecase-kpi']) {
          expect((await it.getByTestId(id).first().innerText()).trim().length, `${i + 1} 件目の ${id}`).toBeGreaterThan(0);
        }
      }
      for (const p of PERSONAS) expect(byPersona[p] ?? 0, `${p} のユースケース件数`).toBeGreaterThanOrEqual(MIN_USECASES);
      for (const p of PERSONAS) {
        await openStory(page, p);
        const scenes = await collectScenes(page);
        expect(scenes.filter((s) => s.noData || /データなし/.test(s.text)).length, `${p}: 「データなし」のシーン`).toBe(0);
        expect(new Set(scenes.map((s) => s.part)), `${p}: ①〜④`).toEqual(new Set([1, 2, 3, 4]));
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('story-scene')).toHaveCount(0);
      }
    });
  }

  // FR-180 AC-364（異常系: 実 Project にデモのユースケースが現れない）
  test('FR-180 AC-364 異常系: 実際の Project（空）を開いてもデモのユースケースは一覧に現れない', async ({ page, start }) => {
    await start({ pack: null, skipOpening: true });
    await page.getByRole('button', { name: '企業を登録' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('textbox', { name: '企業名' }).fill('合成株式会社AC364');
    await dlg.getByRole('button', { name: '登録' }).click();
    await expect(dlg).toBeHidden();
    await page.getByRole('region', { name: '企業 合成株式会社AC364' }).getByRole('button', { name: 'Project を作成' }).click();
    const d2 = page.getByRole('dialog');
    await d2.getByRole('textbox', { name: 'Project 名' }).fill('実Project364');
    await d2.getByRole('button', { name: '作成' }).click();
    await expect(d2).toBeHidden();
    await page.getByRole('region', { name: '企業 合成株式会社AC364' }).getByRole('link', { name: '実Project364' }).click();
    const items = await usecaseItems(page);
    await expect(items).toHaveCount(0);
  });
});
