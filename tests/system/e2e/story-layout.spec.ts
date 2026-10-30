// System Test: プレゼンテーション — 全シーンの要素が重ならず、画面外にはみ出さない（FR-178 AC-740）
// 期待値は要求定義書の受入基準（docs/requirements/app-experience.md の FR-178 AC-740）だけから決める。
// 画面の探し方は tests/system/CONTRACT.md §12（story-scene 内の要素 data-story-el）。PARAM-029=320（CSS px）。
import type { Page } from '@playwright/test';
import { test, expect, PERSONAS } from '../support/fixtures';
import { makeVariant } from '../support/packs';

const NARROW = 320; // PARAM-029
const SIZES = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: `${NARROW}x640（小さい幅）`, width: NARROW, height: 640 },
] as const;
const ELEMENT_KINDS = ['kicker', 'big', 'big-label', 'heading', 'body-line', 'cta'];
const LONG = '、長い文章が折り返して複数行になることを確かめるための追加の説明文を続けて書く、長い文章が折り返して複数行になることを確かめるための追加の説明文';

interface Box { kind: string; x: number; y: number; w: number; h: number; text: string }
interface SceneBoxes { index: number; boxes: Box[]; vw: number; vh: number }

async function openStory(page: Page, persona: string): Promise<void> {
  await page.getByRole('button', { name: 'プレゼンテーションを開始' }).click();
  await page.getByRole('dialog', { name: 'ペルソナの選択' }).getByRole('button', { name: persona }).click();
  await expect(page.getByTestId('story-scene')).toBeVisible();
}

/** 現在のシーン内の要素（data-story-el）の描画上の外接矩形。Range で文字の描画矩形も含める。 */
async function measure(page: Page): Promise<{ boxes: Box[]; vw: number; vh: number }> {
  return page.evaluate(() => {
    const scene = document.querySelector('[data-testid="story-scene"]')!;
    const boxes: Box[] = [];
    scene.querySelectorAll<HTMLElement>('[data-story-el]').forEach((el) => {
      const r = el.getBoundingClientRect();
      let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const q of Array.from(range.getClientRects())) {
        x1 = Math.min(x1, q.left); y1 = Math.min(y1, q.top); x2 = Math.max(x2, q.right); y2 = Math.max(y2, q.bottom);
      }
      if (x2 - x1 <= 0 || y2 - y1 <= 0) return; // 表示されていない要素は対象外
      boxes.push({ kind: el.getAttribute('data-story-el') ?? '', x: x1, y: y1, w: x2 - x1, h: y2 - y1, text: (el.textContent ?? '').trim().slice(0, 30) });
    });
    return { boxes, vw: window.innerWidth, vh: window.innerHeight };
  });
}

async function eachScene(page: Page): Promise<SceneBoxes[]> {
  const out: SceneBoxes[] = [];
  const pos = page.getByTestId('story-position');
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1200); // 導入の演出が落ち着くのを待つ
    out.push({ index: i + 1, ...(await measure(page)) });
    const m = /(\d+)\s*\/\s*(\d+)/.exec((await pos.innerText()) ?? '');
    if (!m || Number(m[1]) >= Number(m[2])) break;
    await page.keyboard.press('ArrowRight');
  }
  return out;
}

const EPS = 1; // サブピクセルの丸め

function problems(scenes: SceneBoxes[]): string[] {
  const bad: string[] = [];
  for (const s of scenes) {
    const kinds = new Set(s.boxes.map((b) => b.kind));
    if (s.boxes.length === 0) bad.push(`シーン ${s.index}: data-story-el の要素が 1 つもない`);
    if (!kinds.has('heading')) bad.push(`シーン ${s.index}: heading がない`);
    for (const b of s.boxes) {
      if (!ELEMENT_KINDS.includes(b.kind)) bad.push(`シーン ${s.index}: 未知の data-story-el=${b.kind}`);
      if (b.x < -EPS || b.y < -EPS || b.x + b.w > s.vw + EPS || b.y + b.h > s.vh + EPS) {
        bad.push(`シーン ${s.index}: ${b.kind}「${b.text}」が画面外（${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)}x${Math.round(b.h)} / ${s.vw}x${s.vh}）`);
      }
    }
    for (let i = 0; i < s.boxes.length; i++) {
      for (let j = i + 1; j < s.boxes.length; j++) {
        const a = s.boxes[i], b = s.boxes[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > EPS && oy > EPS) bad.push(`シーン ${s.index}: ${a.kind}「${a.text}」と ${b.kind}「${b.text}」が交差`);
      }
    }
  }
  return bad;
}

test.describe('FR-178 プレゼンテーション: 全シーンの要素の配置（重なり・はみ出しがない）', () => {
  for (const size of SIZES) {
    // FR-178 AC-740
    test(`FR-178 AC-740 ${size.name}: 経営層の全シーンで、kicker・big・ラベル・見出し・本文・CTA の外接矩形が互いに交差せず画面外にもはみ出さない`, async ({ page, start }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await start();
      await openStory(page, '経営層');
      const scenes = await eachScene(page);
      expect(scenes.length, 'シーンが 2 つ以上').toBeGreaterThan(1);
      expect(scenes.some((s) => s.boxes.some((b) => b.kind === 'big')), '大きな数値 big を持つシーンがある').toBe(true);
      expect(problems(scenes)).toEqual([]);
    });
  }

  // FR-178 AC-740（big のラベルが big の下で重ならない例）
  test('FR-178 AC-740 big のラベルは big の下に置かれ、重ならない（例: 「5 / 5」と「実現性」）', async ({ page, start }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await start();
    await openStory(page, '経営層');
    const scenes = await eachScene(page);
    let checked = 0;
    for (const s of scenes) {
      const big = s.boxes.find((b) => b.kind === 'big');
      const label = s.boxes.find((b) => b.kind === 'big-label');
      if (!big || !label) continue;
      checked++;
      expect(label.y, `シーン ${s.index}: ラベルの上端が big の下端以降`).toBeGreaterThanOrEqual(big.y + big.h - EPS);
    }
    expect(checked, 'big とラベルを持つシーンがある').toBeGreaterThan(0);
  });

  // FR-178 AC-740（異常系: 見出し・本文が長い）
  for (const size of SIZES) {
    test(`FR-178 AC-740 異常系 ${size.name}: 見出し・本文が長く複数行に折り返しても、全ペルソナの全シーンで交差・はみ出しがない`, async ({ page, start }) => {
      const longPack = makeVariant('mono', `long-text-${size.width}`, (p) => {
        const KEYS = new Set(['name', 'title', 'label', 'summary', 'description', 'text', 'body', 'reason', 'rationale']);
        const walk = (v: any): void => {
          if (Array.isArray(v)) v.forEach(walk);
          else if (v && typeof v === 'object') {
            for (const k of Object.keys(v)) {
              if (typeof v[k] === 'string' && KEYS.has(k) && v[k].length > 0) v[k] = v[k] + LONG;
              else walk(v[k]);
            }
          }
        };
        for (const f of ['entities', 'issues', 'products', 'plan', 'show'] as const) p.edit(f, walk);
      });
      await page.setViewportSize({ width: size.width, height: size.height });
      await start({ pack: longPack });
      for (const persona of PERSONAS) {
        await openStory(page, persona);
        const scenes = await eachScene(page);
        expect(problems(scenes), `${persona}`).toEqual([]);
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('story-scene')).toHaveCount(0);
      }
    });
  }
});
