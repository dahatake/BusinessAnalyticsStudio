// System Test: オープニング・プレゼンテーションモード・番組構成・演出・ショーコントロールバー
// 期待値は要求定義書の受入基準（app-core.md・app-experience.md・quality.md）と、お手本パックの show.json から決める。
import type { Page } from '@playwright/test';
import { test, expect, openScreen, component, hook, captureDownload, saveEvidence, setEditMode } from '../support/fixtures';
import { examplePack, packWithInternal, countInternal, PACK_FILES } from '../support/packs';

const mono = examplePack('mono');

async function startPresentation(page: Page) {
  await page.getByRole('button', { name: 'プレゼンテーションを開始' }).click();
  await expect(page.getByTestId('progress-bar')).toBeVisible();
}

async function gotoTopicIndex(page: Page, index: number) {
  for (let i = 0; i < index; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('current-topic')).toContainText(mono.topics()[index].topic.title);
}

function topicIndexByType(type: string): number {
  const i = mono.topics().findIndex((t) => t.topic.type === type);
  expect(i, `お手本パックの show.json に type=${type} の議題がない`).toBeGreaterThanOrEqual(0);
  return i;
}

test.describe('FR-016 プレゼンテーションモード', () => {
  // FR-016 AC-019
  test('FR-016 AC-019 → で show.json の順に次の議題へ進み、進行バーが同じチャプターを示し、← で戻る', async ({ page, start }) => {
    await start();
    await startPresentation(page);
    const topics = mono.topics();
    expect(topics.length).toBeGreaterThan(2);
    const current = page.getByTestId('current-topic');
    const bar = page.getByTestId('progress-bar');
    await expect(current).toContainText(topics[0].topic.title);
    for (let i = 1; i < topics.length; i++) {
      await page.keyboard.press('ArrowRight');
      await expect(current).toContainText(topics[i].topic.title);
      await expect(bar.locator('[aria-current="step"]')).toContainText(topics[i].chapter.title);
    }
    // 最後の議題でさらに → を押しても先へ進まない（異常系）
    await page.keyboard.press('ArrowRight');
    await expect(current).toContainText(topics[topics.length - 1].topic.title);
    await page.keyboard.press('ArrowLeft');
    await expect(current).toContainText(topics[topics.length - 2].topic.title);
    await expect(bar.locator('[aria-current="step"]')).toContainText(topics[topics.length - 2].chapter.title);
  });

  // FR-016 AC-192
  test('FR-016 AC-192 プレゼン中は ←/→ が議題の移動でパンせず、↑/↓ と Shift+矢印でパン、終了後は矢印でパン', async ({ page, start }) => {
    await start();
    await openScreen(page, 'canvas');
    await startPresentation(page);
    const surface = component(page, 'canvas').getByTestId('canvas-surface');
    await surface.focus();
    const vp = () => hook<{ x: number; y: number; zoom: number }>(page, 't.canvas.viewport()');
    const topics = mono.topics();
    // → で次の議題（議題の移動による視点の移動は許すが、矢印によるパンは起きない: 議題の中心に合う）
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('current-topic')).toContainText(topics[1].topic.title);
    await expect.poll(() => hook<boolean>(page, 't.canvas.isCentered(a)', topics[1].topic.id)).toBe(true);
    // ↑/↓ はパン
    let v0 = await vp();
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await vp()).y).not.toBe(v0.y);
    await expect(page.getByTestId('current-topic')).toContainText(topics[1].topic.title);
    // Shift+→ はパン（議題は変わらない）
    v0 = await vp();
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(async () => (await vp()).x).not.toBe(v0.x);
    await expect(page.getByTestId('current-topic')).toContainText(topics[1].topic.title);
    // 終了後は → がパン
    await page.getByRole('button', { name: 'プレゼンテーションを終了' }).click();
    await expect(page.getByTestId('progress-bar')).toBeHidden();
    await surface.focus();
    v0 = await vp();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await vp()).x).not.toBe(v0.x);
  });
});

test.describe('FR-076 オープニング', () => {
  // FR-076 AC-093
  test('FR-076 AC-093 オープニングに顧客名と Project 名のタイトルが出て、長さが 15〜30 秒', async ({ page, start }) => {
    test.setTimeout(120_000);
    await start({ skipOpening: false });
    const opening = page.getByTestId('opening');
    await expect(opening).toBeVisible();
    const t0 = Date.now();
    await expect(opening).toContainText(mono.customerName, { timeout: 30_000 });
    await expect(opening).toContainText(mono.projectName);
    await expect(opening).toContainText(`${mono.customerName} × Microsoft`);
    await expect(opening).toBeHidden({ timeout: 45_000 });
    const sec = (Date.now() - t0) / 1000;
    expect(sec, `オープニングの長さ ${sec} 秒`).toBeGreaterThanOrEqual(15 - 1);
    expect(sec).toBeLessThanOrEqual(30 + 1);
    await expect(page.getByTestId('workspace')).toBeVisible();
  });

  // FR-076 AC-093（スキップ）
  test('FR-076 AC-093 スキップのボタンと Esc で本編に移る', async ({ page, start }) => {
    const app = await start({ skipOpening: false });
    await expect(page.getByTestId('opening')).toBeVisible();
    await page.getByRole('button', { name: 'スキップ' }).click();
    await expect(page.getByTestId('opening')).toBeHidden({ timeout: 3_000 });
    await expect(page.getByTestId('workspace')).toBeVisible();
    // 開き直して、今度は Esc で飛ばす
    await page.goto(app.url);
    await expect(page.getByTestId('opening')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('opening')).toBeHidden({ timeout: 3_000 });
  });
});

test.describe('FR-072 動きを減らす設定', () => {
  // FR-072 AC-088
  test('FR-072 AC-088 prefers-reduced-motion で初回起動すると「停止中」で、オープニングは静止画の版', async ({ page, start }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start({ skipOpening: false });
    const opening = page.getByTestId('opening');
    await expect(opening).toBeVisible();
    await expect(opening).toContainText(mono.customerName);
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    expect(running, '静止画の版なのに動いているアニメーションがある').toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('animation-state')).toContainText('停止中');
  });
});

test.describe('FR-077 番組構成', () => {
  // FR-077 AC-094
  test('FR-077 AC-094 進行バーにチャプターが順に並び、現在のチャプターが文字でも示され、次の予告カードが出る', async ({ page, start }) => {
    await start();
    await startPresentation(page);
    const chapters = mono.chapters();
    const items = page.getByTestId('progress-bar').getByTestId('chapter');
    await expect(items).toHaveCount(chapters.length);
    for (let i = 0; i < chapters.length; i++) await expect(items.nth(i)).toContainText(chapters[i].title);
    const cur = page.getByTestId('progress-bar').locator('[aria-current="step"]');
    await expect(cur).toContainText(chapters[0].title);
    await expect(cur).toContainText('現在');
    await expect(page.getByTestId('next-chapter-card')).toContainText(chapters[1].title);
  });
});

test.describe('FR-078 テロップ', () => {
  // FR-078 AC-095
  test('FR-078 AC-095 テロップが該当チャプターで表示され、出典リンクで出典の詳細が開く', async ({ page, start }) => {
    await start();
    const idx = mono.topics().findIndex((t) => (t.topic.telop?.text ?? '') !== '');
    expect(idx, 'お手本パックの show.json にテロップがない').toBeGreaterThanOrEqual(0);
    const { topic } = mono.topics()[idx];
    await startPresentation(page);
    await gotoTopicIndex(page, idx);
    const telop = page.getByTestId('telop');
    await expect(telop).toContainText(topic.telop.text);
    await telop.getByRole('link').first().click();
    const card = page.getByTestId('source-card');
    await expect(card).toBeVisible();
    const src = mono.sources().find((s) => s.id === topic.telop.sourceIds[0]);
    await expect(card).toContainText(src.title);
    // 別の議題に移ると、そのテロップは表示されない
    if (idx + 1 < mono.topics().length && mono.topics()[idx + 1].topic.telop?.text !== topic.telop.text) {
      await page.keyboard.press('Escape');
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('telop').filter({ hasText: topic.telop.text })).toHaveCount(0);
    }
  });
});

test.describe('FR-079 Before/After・ランキング・ROI', () => {
  // FR-079 AC-096
  test('FR-079 AC-096 Before/After スライダーをキーボードとポインターで動かせ、TOP5 が順位どおり', async ({ page, start }) => {
    await start();
    // ランキング表の順位（優先順位分析）
    const pr = await openScreen(page, 'priority');
    const rankRows = pr.getByTestId('ranking-row');
    const expected = (await rankRows.allInnerTexts()).slice(0, 5);
    expect(expected.length).toBe(5);
    await startPresentation(page);
    await gotoTopicIndex(page, topicIndexByType('before-after'));
    const slider = page.getByRole('slider', { name: /Before\/After/ });
    await slider.focus();
    const v0 = Number(await slider.getAttribute('aria-valuenow'));
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => Number(await slider.getAttribute('aria-valuenow'))).toBeGreaterThan(v0);
    const b = (await slider.boundingBox())!;
    await page.mouse.click(b.x + b.width * 0.1, b.y + b.height / 2);
    await expect.poll(async () => Number(await slider.getAttribute('aria-valuenow'))).toBeLessThan(v0 + 1);
    const ri = topicIndexByType('ranking');
    await page.getByRole('button', { name: 'プレゼンテーションを終了' }).click();
    await startPresentation(page);
    await gotoTopicIndex(page, ri);
    const top = page.getByTestId('top5-ranking').getByRole('listitem');
    await expect(top).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      const name = expected[i].split(/\t|\n/).find((s) => s.trim() && !/^\d+$/.test(s.trim()))!.trim();
      await expect(top.nth(i)).toContainText(name);
      await expect(top.nth(i)).toContainText(String(i + 1));
    }
  });

  // FR-079 AC-096（紙吹雪は Entertainment のときだけ）
  test('FR-079 AC-096 ROI 発表の紙吹雪は Entertainment のときだけ出る', async ({ page, start }) => {
    await start();
    const idx = topicIndexByType('roi');
    const setIntensity = async (name: string) => {
      for (let i = 0; i < 3; i++) {
        if ((await page.getByTestId('intensity').innerText()).includes(name)) return;
        await page.keyboard.press('e');
      }
      await expect(page.getByTestId('intensity')).toContainText(name);
    };
    for (const name of ['Executive', 'Showcase', 'Entertainment']) {
      await page.keyboard.press('Escape');
      await setIntensity(name);
      await startPresentation(page);
      await gotoTopicIndex(page, idx);
      if (name === 'Entertainment') await expect(page.getByTestId('confetti')).toBeVisible();
      else {
        await page.waitForTimeout(1500);
        await expect(page.getByTestId('confetti')).toHaveCount(0);
      }
      await page.getByRole('button', { name: 'プレゼンテーションを終了' }).click();
    }
  });
});

test.describe('FR-080 AI ナビゲーター', () => {
  // FR-080 AC-097
  test('FR-080 AC-097 ナビゲーターが台本を字幕で表示し「AI 生成」が付き、音声合成が未設定でもエラーにならない', async ({ page, start, pageErrors }) => {
    await start();
    const idx = mono.topics().findIndex((t) => (t.topic.narration ?? '') !== '');
    expect(idx, 'お手本パックの show.json に台本（narration）がない').toBeGreaterThanOrEqual(0);
    await startPresentation(page);
    await gotoTopicIndex(page, idx);
    const nav = page.getByTestId('navigator');
    await expect(nav).toBeVisible();
    await expect(nav).toContainText('AI 生成');
    const sub = page.getByTestId('subtitles');
    const firstWords = String(mono.topics()[idx].topic.narration).slice(0, 10);
    await expect(sub).toContainText(firstWords, { timeout: 15_000 });
    expect(pageErrors).toEqual([]);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('FR-081 ショート動画', () => {
  // FR-081 AC-099
  test('FR-081 AC-099 ショート動画を書き出すと 9:16 の WebM がダウンロードされ、「サンプル」の透かしがある', async ({ page, start, browser }) => {
    test.setTimeout(240_000);
    await start();
    await page.getByRole('button', { name: 'ショート動画を書き出す' }).click();
    const dialog = page.getByRole('dialog', { name: /ショート動画/ });
    // 書き出しの画面に透かしの表示があること（画面で確かめられる部分）
    await expect(dialog.getByText('サンプル').first()).toBeVisible();
    const { name, data } = await captureDownload(page, () => dialog.getByRole('button', { name: '書き出す' }).click(), 180_000);
    expect(name).toMatch(/\.webm$/i);
    expect(data.subarray(0, 4).toString('hex'), 'WebM（EBML）の先頭ではない').toBe('1a45dfa3');
    await saveEvidence('AC-099-short.webm', data);
    // 再生して縦横比と先頭のフレームを確かめる
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await p2.setContent('<video id="v" muted playsinline></video><canvas id="c"></canvas>');
    const dims = await p2.evaluate(async (b64) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const v = document.getElementById('v') as HTMLVideoElement;
      v.src = URL.createObjectURL(new Blob([bin], { type: 'video/webm' }));
      await new Promise((r, j) => { v.onloadeddata = r; v.onerror = j; });
      v.currentTime = 1;
      await new Promise((r) => (v.onseeked = r));
      const c = document.getElementById('c') as HTMLCanvasElement;
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d')!.drawImage(v, 0, 0);
      return { w: v.videoWidth, h: v.videoHeight, frame: c.toDataURL('image/png') };
    }, data.toString('base64'));
    expect(Math.abs(dims.w / dims.h - 9 / 16), `縦横比 ${dims.w}x${dims.h}`).toBeLessThan(0.01);
    await saveEvidence('AC-099-frame.png', Buffer.from(dims.frame.split(',')[1], 'base64'));
    // 透かしの文字の判定は、フレームの証跡（AC-099-frame.png）を確認する（OCR は使わない）
    test.info().annotations.push({ type: 'evidence', description: '動画の透かし「サンプル」はフレームの証跡で確認' });
    await ctx.close();
  });
});

test.describe('FR-082 クイズとリアクション', () => {
  // FR-082 AC-100
  test('FR-082 AC-100 クイズに全問回答すると成熟度の結果が出て、リアクションを押すと表示が出て件数が増える', async ({ page, start }) => {
    await start();
    await startPresentation(page);
    await gotoTopicIndex(page, topicIndexByType('quiz'));
    const quiz = page.getByTestId('quiz');
    await expect(quiz).toBeVisible();
    const groups = quiz.getByRole('radiogroup');
    const n = await groups.count();
    expect(n).toBeGreaterThan(0);
    // 未回答のままでは結果を出せない（異常系）
    await expect(quiz.getByRole('button', { name: '結果を見る' })).toBeDisabled();
    for (let i = 0; i < n; i++) await groups.nth(i).getByRole('radio').first().check();
    await quiz.getByRole('button', { name: '結果を見る' }).click();
    await expect(page.getByTestId('quiz-result')).toContainText('成熟度');
    const reactions = page.getByTestId('reactions');
    const btn = reactions.getByRole('button').first();
    const count = async () => Number((await btn.getByTestId('reaction-count').innerText()).replace(/\D/g, '') || '0');
    const c0 = await count();
    await btn.click();
    await expect(page.getByTestId('reaction-burst').first()).toBeVisible();
    await expect.poll(count).toBe(c0 + 1);
  });
});

test.describe('FR-083 演出強度', () => {
  // FR-083 AC-101
  test('FR-083 AC-101 E を押すたびに Executive→Showcase→Entertainment→Executive と変わり文字で表示される', async ({ page, start }) => {
    await start();
    const ind = page.getByTestId('intensity');
    const order = ['Executive', 'Showcase', 'Entertainment'];
    const text = await ind.innerText();
    const cur = order.findIndex((o) => text.includes(o));
    expect(cur).toBeGreaterThanOrEqual(0);
    for (let i = 1; i <= 4; i++) {
      await page.keyboard.press('e');
      const expected = order[(cur + i) % 3];
      await expect(ind).toContainText(expected);
      if (i <= 3) await saveEvidence(`AC-101-${expected}.png`, await page.screenshot());
    }
  });
});

test.describe('FR-084 ショーコントロールバー', () => {
  const CONTROLS: Array<[string, RegExp]> = [
    ['再生/停止', /再生|停止/],
    ['ミュート/音量', /ミュート/],
    ['演出強度', /演出強度/],
    ['3D 品質', /品質/],
    ['Light/Dark', /テーマ|Light|Dark|ダーク|ライト/],
    ['全画面', /全画面/],
    ['プレゼンタービュー', /プレゼンタービュー/],
    ['レーザーポインター', /レーザーポインター/],
    ['オープニングの再生', /オープニング/],
  ];
  // FR-084 AC-102
  test('FR-084 AC-102 9 種類の操作があり、3 秒操作がないと隠れ、ポインターかフォーカスで再表示、フォーカス中は隠れない', async ({ page, start }) => {
    await start();
    const bar = page.getByTestId('show-control-bar');
    await page.mouse.move(400, 400);
    await expect(bar).toBeVisible();
    for (const [label, re] of CONTROLS) await expect(bar.getByRole('button', { name: re }).or(bar.getByRole('slider', { name: re })).first(), label).toBeVisible();
    await expect(bar.getByRole('slider', { name: /音量/ })).toBeVisible();
    // 操作がない状態が 3 秒続くと隠れる
    await page.waitForTimeout(3_000 + 800);
    await expect(bar).toBeHidden();
    await page.mouse.move(500, 500);
    await expect(bar).toBeVisible();
    // キーボードのフォーカスで再表示し、バーの中にフォーカスがある間は隠れない
    await page.waitForTimeout(3_800);
    await expect(bar).toBeHidden();
    await bar.getByRole('button', { name: /演出強度/ }).focus();
    await expect(bar).toBeVisible();
    await page.waitForTimeout(3_000 + 1_500);
    await expect(bar).toBeVisible();
  });
});

test.describe('FR-085 ショートカット一覧', () => {
  // FR-085 AC-103
  test('FR-085 AC-103 ? でショートカット一覧が開き、必要なキーが説明付きで載り、Esc で閉じる', async ({ page, start }) => {
    await start();
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: 'ショートカット一覧' });
    await expect(dialog).toBeVisible();
    for (const key of ['M', 'P', 'F', '←', '→', 'E', 'Shift+F', 'H', 'Ctrl+S', 'Ctrl+Shift+E']) {
      const row = dialog.getByRole('row').filter({ has: page.getByRole('cell', { name: key, exact: true }) });
      await expect(row, `${key} が一覧にない`).toHaveCount(1);
      const cells = await row.getByRole('cell').allInnerTexts();
      expect(cells.filter((c) => c.trim() !== key).join('').trim().length, `${key} に説明がない`).toBeGreaterThan(1);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('NFR-A11Y-002 演出を OFF にしたときの利用', () => {
  // NFR-A11Y-002 AC-172
  test('NFR-A11Y-002 AC-172 ミュートと停止のままプレゼンを最後まで進め、選択・編集・エクスポートができ、テロップとランキングが文字で出る', async ({ page, start }) => {
    test.setTimeout(180_000);
    await start();
    await expect(page.getByRole('button', { name: /ミュート/ }).first()).toBeVisible();
    await page.keyboard.press('p');
    await expect(page.getByTestId('animation-state')).toContainText('停止中');
    await startPresentation(page);
    const topics = mono.topics();
    for (let i = 0; i < topics.length; i++) {
      if (i > 0) await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('current-topic')).toContainText(topics[i].topic.title);
      const t = topics[i].topic;
      if (t.telop?.text) await expect(page.getByTestId('telop')).toContainText(t.telop.text);
      if (t.type === 'ranking') {
        const items = page.getByTestId('top5-ranking').getByRole('listitem');
        await expect(items).toHaveCount(5);
        for (const s of await items.allInnerTexts()) expect(s.trim().length).toBeGreaterThan(1);
      }
    }
    await page.getByRole('button', { name: 'プレゼンテーションを終了' }).click();
    // 選択・編集・エクスポート
    const table = await openScreen(page, 'table');
    await table.getByRole('row').nth(1).click();
    await setEditMode(page, true);
    const cell = table.getByRole('gridcell').filter({ hasText: mono.issues()[0].title }).first();
    await cell.dblclick();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('演出OFFで編集');
    await page.keyboard.press('Enter');
    await expect(table).toContainText('演出OFFで編集');
    const { name } = await captureDownload(page, () => page.keyboard.press('Control+s'));
    expect(name).toMatch(/\.(md|zip)$/);
    await expect(page.getByTestId('animation-state')).toContainText('停止中');
  });
});

test.describe('NFR-SEC-003 機密確認', () => {
  // NFR-SEC-003 AC-178
  test('NFR-SEC-003 AC-178 internal を含むパックでプレゼンを始めると件数と確認の画面が出て、確認するまで開始しない', async ({ page, start }) => {
    const pack = packWithInternal('mono');
    const n = countInternal(pack);
    expect(n).toBeGreaterThan(0);
    await start({ pack });
    await page.getByRole('button', { name: 'プレゼンテーションを開始' }).click();
    const dlg = page.getByRole('alertdialog', { name: /機密/ });
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText(String(n));
    await expect(page.getByTestId('progress-bar')).toBeHidden();
    // 取り消すと開始しない（異常系）
    await dlg.getByRole('button', { name: /キャンセル|取り消し/ }).click();
    await expect(page.getByTestId('progress-bar')).toBeHidden();
    // 確認すると開始する
    await page.getByRole('button', { name: 'プレゼンテーションを開始' }).click();
    await page.getByRole('alertdialog', { name: /機密/ }).getByRole('button', { name: /確認/ }).click();
    await expect(page.getByTestId('progress-bar')).toBeVisible();
  });

  // NFR-SEC-003 AC-178（internal がなければ確認の画面は出ない）
  test('NFR-SEC-003 AC-178 internal を含まないお手本パックでは確認なしで開始する', async ({ page, start }) => {
    expect(countInternal(mono)).toBe(0);
    await start();
    await startPresentation(page);
    await expect(page.getByRole('alertdialog', { name: /機密/ })).toHaveCount(0);
  });
});

void PACK_FILES;
