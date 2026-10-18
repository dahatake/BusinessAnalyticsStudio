// System Test: インク・ボード・ホワイトボード・PDF/Markdown 出力・自動保存・大量ストロークの性能
// 期待値は要求定義書の受入基準（app-experience.md）から決める。ボードの中身は CONTRACT.md §6 の window.__edbTest.board で読む。
import JSZip from 'jszip';
import path from 'node:path';
import type { Page, Locator } from '@playwright/test';
import { test, expect, openScreen, component, entity, hook, captureDownload, recordExportConsent, setEditMode, measureFrameTimes, saveEvidence, gotoAndEnter } from '../support/fixtures';
import { examplePack } from '../support/packs';

const mono = examplePack('mono');

interface Stroke { id: string; tool: string; temporary?: boolean; bounds: { x: number; y: number; w: number; h: number } }
interface Item { id: string; type: string; text?: string; x: number; y: number; w: number; h: number; groupId?: string | null; frameId?: string | null; from?: string; to?: string; votes?: number; sourceEntityId?: string; label?: string }
interface Board { id: string; name: string; topicId?: string; background: string; strokes: Stroke[]; items: Item[] }
interface BoardState { activeBoardId: string; boards: Board[]; viewport: { x: number; y: number; width: number; height: number; zoom: number } }

const state = (page: Page) => hook<BoardState>(page, 't.board.state()');
const active = async (page: Page) => { const s = await state(page); return s.boards.find((b) => b.id === s.activeBoardId)!; };

async function surface(page: Page): Promise<Locator> {
  const wb = await openScreen(page, 'whiteboard');
  const s = wb.getByTestId('board-surface');
  await expect(s).toBeVisible();
  return s;
}
async function tool(page: Page, name: string | RegExp) {
  // 文字列は完全一致（「ペン」が「蛍光ペン」に当たる strict mode 違反を避ける）。曖昧な指定は RegExp で渡す
  const opt = typeof name === 'string' ? { name, exact: true } : { name };
  await page.getByRole('toolbar', { name: 'インクの道具' }).getByRole('button', opt).click();
}
async function drawLine(page: Page, s: Locator, from: [number, number], to: [number, number]) {
  const b = (await s.boundingBox())!;
  await page.mouse.move(b.x + from[0], b.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(b.x + to[0], b.y + to[1], { steps: 10 });
  await page.mouse.up();
}

test.describe('FR-086 無限キャンバスと複数ボード', () => {
  // FR-086 AC-104
  test('FR-086 AC-104 議題に 2 枚目のボードを追加して方眼にし、全体表示で全ストロークが収まり、3D の上の注釈がビューの切替後も残る', async ({ page, start }) => {
    await start();
    const s = await surface(page);
    const wb = component(page, 'whiteboard');
    const n0 = (await state(page)).boards.length;
    await wb.getByRole('button', { name: 'ボードを追加' }).click();
    await expect.poll(async () => (await state(page)).boards.length).toBe(n0 + 1);
    await wb.getByRole('combobox', { name: '背景' }).click();
    await page.getByRole('option', { name: '方眼' }).click();
    expect((await active(page)).background).toBe('grid');
    await tool(page, 'ペン');
    await drawLine(page, s, [40, 40], [140, 90]);
    await drawLine(page, s, [300, 200], [420, 260]);
    // 遠くまでパンしてから描く
    await page.mouse.move(200, 200);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(600, 0);
    await drawLine(page, s, [100, 100], [200, 160]);
    await wb.getByRole('button', { name: '全体表示' }).click();
    await page.waitForTimeout(500);
    const st = await state(page);
    const vp = st.viewport;
    for (const k of (await active(page)).strokes) {
      expect(k.bounds.x).toBeGreaterThanOrEqual(vp.x - 1);
      expect(k.bounds.y).toBeGreaterThanOrEqual(vp.y - 1);
      expect(k.bounds.x + k.bounds.w).toBeLessThanOrEqual(vp.x + vp.width + 1);
      expect(k.bounds.y + k.bounds.h).toBeLessThanOrEqual(vp.y + vp.height + 1);
    }
    // 3D ビューの上に注釈
    const v3 = await openScreen(page, 'view3d');
    await v3.getByRole('button', { name: '注釈を書く' }).click();
    const overlay = v3.getByTestId('annotation-layer');
    await drawLine(page, overlay, [60, 60], [180, 120]);
    const a0 = await hook<number>(page, 't.annotations.count("view3d")');
    expect(a0).toBeGreaterThan(0);
    await openScreen(page, 'gantt');
    await openScreen(page, 'view3d');
    expect(await hook<number>(page, 't.annotations.count("view3d")')).toBe(a0);
    await expect(component(page, 'view3d').getByTestId('annotation-layer')).toBeVisible();
  });
});

test.describe('FR-088 インクの道具', () => {
  // FR-088 AC-107
  test('FR-088 AC-107 マウスで各道具で描き、投げ縄で移動、ストローク消しゴムで 1 本消し、Ctrl+Z で戻せ、画像を貼り付けられる', async ({ page, start, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await start();
    const s = await surface(page);
    const tools = ['ペン', '蛍光ペン', '直線', '矢印', '矩形', '円', '吹き出し'];
    let y = 30;
    for (const t of tools) {
      await tool(page, t);
      await drawLine(page, s, [40, y], [160, y + 30]);
      y += 50;
    }
    const b1 = await active(page);
    expect(b1.strokes.length + b1.items.filter((i) => i.type === 'shape').length, '各道具の結果がボードにない').toBeGreaterThanOrEqual(tools.length);
    // テキストと付箋
    await tool(page, 'テキスト');
    const box = (await s.boundingBox())!;
    await page.mouse.click(box.x + 400, box.y + 60);
    await page.keyboard.type('テキストST');
    await page.keyboard.press('Escape');
    await tool(page, '付箋');
    await page.mouse.click(box.x + 400, box.y + 160);
    await page.keyboard.type('付箋ST');
    await page.keyboard.press('Escape');
    const b2 = await active(page);
    expect(b2.items.some((i) => i.type === 'text' && i.text?.includes('テキストST'))).toBe(true);
    expect(b2.items.some((i) => i.type === 'sticky' && i.text?.includes('付箋ST'))).toBe(true);
    // 投げ縄で最初のストロークを囲んで移動
    const first = b2.strokes[0];
    await tool(page, '投げ縄');
    await page.mouse.move(box.x + 20, box.y + 15);
    await page.mouse.down();
    for (const [dx, dy] of [[190, 15], [190, 75], [20, 75], [20, 15]]) await page.mouse.move(box.x + dx, box.y + dy, { steps: 4 });
    await page.mouse.up();
    await page.mouse.move(box.x + 100, box.y + 45);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 345, { steps: 8 });
    await page.mouse.up();
    const moved = (await active(page)).strokes.find((k) => k.id === first.id)!;
    expect(moved.bounds.y - first.bounds.y, '投げ縄で移動していない').toBeGreaterThan(100);
    // ストローク単位の消しゴム
    const before = (await active(page)).strokes.length;
    const target = (await active(page)).strokes[1];
    await tool(page, /消しゴム（ストローク/);
    const st = await state(page);
    const sx = (target.bounds.x + target.bounds.w / 2 - st.viewport.x) * st.viewport.zoom;
    const sy = (target.bounds.y + target.bounds.h / 2 - st.viewport.y) * st.viewport.zoom;
    await page.mouse.click(box.x + sx, box.y + sy);
    await expect.poll(async () => (await active(page)).strokes.length).toBe(before - 1);
    expect((await active(page)).strokes.some((k) => k.id === target.id)).toBe(false);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await active(page)).strokes.length).toBe(before);
    // 画像の貼り付け
    await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 40; c.height = 30;
      const g = c.getContext('2d')!; g.fillStyle = '#c33'; g.fillRect(0, 0, 40, 30);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    });
    await s.click({ position: { x: 600, y: 300 } });
    await page.keyboard.press('Control+v');
    await expect.poll(async () => (await active(page)).items.filter((i) => i.type === 'image').length).toBeGreaterThan(0);
  });
});

test.describe('FR-090 手書き文字の認識', () => {
  // FR-090 AC-109
  test('FR-090 AC-109 手書きの範囲を選んで「決定事項に反映」すると、モックの認識結果が「AI 生成（認識結果）」で追加され、元の手書きが残る', async ({ page, start }) => {
    await start();
    const s = await surface(page);
    await tool(page, 'ペン');
    await drawLine(page, s, [60, 60], [120, 100]);
    await drawLine(page, s, [120, 60], [60, 100]);
    const strokes0 = (await active(page)).strokes.map((k) => k.id);
    await tool(page, '投げ縄');
    const box = (await s.boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    for (const [dx, dy] of [[150, 40], [150, 120], [40, 120], [40, 40]]) await page.mouse.move(box.x + dx, box.y + dy, { steps: 4 });
    await page.mouse.up();
    await page.getByRole('button', { name: '決定事項に反映' }).click();
    const decisions = page.getByTestId('decisions');
    const added = decisions.getByRole('listitem').filter({ hasText: 'AI 生成（認識結果）' });
    await expect(added.first()).toBeVisible({ timeout: 15_000 });
    expect((await active(page)).strokes.map((k) => k.id)).toEqual(expect.arrayContaining(strokes0));
  });

  // FR-090 AC-109（異常系: 何も選ばずに実行できない）
  test('FR-090 AC-109 異常系: 手書きを選んでいないときは「決定事項に反映」が無効', async ({ page, start }) => {
    await start();
    await surface(page);
    await expect(page.getByRole('button', { name: '決定事項に反映' })).toBeDisabled();
  });
});

test.describe('FR-091 ツールバーとプレゼン中の注釈', () => {
  // FR-091 AC-111
  test('FR-091 AC-111 利き手を左にするとツールバーが左に移り、プレゼン中の一時的な注釈はチャプター移動で消え、保存の線は残る', async ({ page, start }) => {
    await start();
    const settings = await openScreen(page, 'settings');
    await settings.getByRole('radio', { name: '左利き' }).check();
    await surface(page);
    const tb = page.getByRole('toolbar', { name: 'インクの道具' });
    const tbb = (await tb.boundingBox())!;
    const vw = page.viewportSize()!.width;
    expect(tbb.x + tbb.width / 2).toBeLessThan(vw / 2);
    // プレゼン中
    await page.getByRole('button', { name: 'プレゼンテーションを開始' }).click();
    const canvasSurface = component(page, 'canvas').getByTestId('canvas-surface');
    await page.getByRole('radio', { name: '一時的な注釈' }).check();
    await tool(page, 'ペン');
    const count = () => hook<{ temporary: number; saved: number }>(page, 't.annotations.presentation()');
    const c0 = await count();
    await drawLine(page, canvasSurface, [100, 100], [200, 150]);
    await expect.poll(async () => (await count()).temporary).toBeGreaterThan(c0.temporary);
    // チャプターを移る
    const chapters = mono.chapters();
    const firstChapterTopics = (chapters[0].topics ?? []).length;
    for (let i = 0; i < firstChapterTopics; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('progress-bar').locator('[aria-current="step"]')).toContainText(chapters[1].title);
    await expect.poll(async () => (await count()).temporary).toBe(0);
    // 保存
    await page.getByRole('radio', { name: '保存' }).check();
    await drawLine(page, canvasSurface, [120, 120], [220, 170]);
    const saved = (await count()).saved;
    expect(saved).toBeGreaterThan(c0.saved);
    for (let i = 0; i < (chapters[1].topics ?? []).length; i++) await page.keyboard.press('ArrowRight');
    expect((await count()).saved).toBe(saved);
  });
});

test.describe('FR-092 PDF 出力', () => {
  // FR-092 AC-112
  test('FR-092 AC-112 A4 横の PDF の 1 ページ目が表紙・2 ページ目が目次で、手書きがベクター、日本語フォントが埋め込まれている', async ({ page, start }) => {
    await start();
    const s = await surface(page);
    await tool(page, 'ペン');
    await drawLine(page, s, [50, 50], [250, 180]);
    await tool(page, 'テキスト');
    const box = (await s.boundingBox())!;
    await page.mouse.click(box.x + 300, box.y + 80);
    await page.keyboard.type('日本語の注記ST');
    await page.keyboard.press('Escape');
    await component(page, 'whiteboard').getByRole('button', { name: 'PDF 出力' }).click();
    const dlg = page.getByRole('dialog', { name: /PDF/ });
    await dlg.getByRole('radio', { name: 'ボード' }).check();
    await dlg.getByRole('radio', { name: 'A4' }).check();
    await dlg.getByRole('radio', { name: '横' }).check();
    const { name, data } = await captureDownload(page, () => dlg.getByRole('button', { name: /出力|ダウンロード/ }).last().click(), 60_000);
    expect(name).toMatch(/\.pdf$/i);
    await saveEvidence('AC-112.pdf', data);
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true, useSystemFonts: false }).promise;
    expect(doc.numPages).toBeGreaterThanOrEqual(3);
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i);
      const [x0, y0, x1, y1] = p.view;
      const w = x1 - x0, h = y1 - y0;
      expect(Math.abs(w - 841.89), `ページ ${i} の幅 ${w}`).toBeLessThan(3);
      expect(Math.abs(h - 595.28), `ページ ${i} の高さ ${h}`).toBeLessThan(3);
    }
    const text = async (i: number) => (await (await doc.getPage(i)).getTextContent()).items.map((t: any) => t.str).join('');
    const cover = await text(1);
    expect(cover.trim().length, '表紙に文字がない').toBeGreaterThan(0);
    expect(cover).not.toContain('目次');
    expect(await text(2)).toContain('目次');
    // 手書きがパス（ベクター）として含まれる
    let paths = 0;
    let japanese = false;
    const fonts: any[] = [];
    for (let i = 3; i <= doc.numPages; i++) {
      const p = await doc.getPage(i);
      const ops = await p.getOperatorList();
      paths += ops.fnArray.filter((f: number) => f === pdfjs.OPS.constructPath).length;
      if (/日本語の注記ST/.test(await text(i))) japanese = true;
      for (const key of Object.keys((p as any).commonObjs?._objs ?? {})) {
        const o = (p as any).commonObjs.has(key) ? (p as any).commonObjs.get(key) : null;
        if (o && o.loadedName) fonts.push(o);
      }
    }
    expect(paths, '手書きがパスとして含まれていない').toBeGreaterThan(0);
    expect(japanese, '日本語の文字がテキストとして含まれていない').toBe(true);
    // 日本語フォントの埋め込み: 本文の PDF にフォントファイル（FontFile2/FontFile3）がある
    const raw = data.toString('latin1');
    expect(/\/FontFile[23]?\s/.test(raw) || fonts.some((f) => f.missingFile === false), 'フォントが埋め込まれていない').toBe(true);
  });
});

test.describe('FR-093 インクの Markdown 出力', () => {
  // FR-093 AC-114
  test('FR-093 AC-114 2 枚のボードを Markdown で出力すると ZIP に 2 つの .md と assets/ があり、front matter・チェックリスト・実在する相対リンクがある', async ({ page, start }) => {
    await start();
    const s = await surface(page);
    const wb = component(page, 'whiteboard');
    await tool(page, 'ペン');
    await drawLine(page, s, [50, 50], [200, 120]);
    await wb.getByRole('button', { name: 'ボードを追加' }).click();
    await tool(page, 'ペン');
    await drawLine(page, s, [80, 80], [220, 160]);
    await wb.getByRole('button', { name: 'Markdown 出力' }).click();
    const dlg = page.getByRole('dialog', { name: /Markdown/ });
    await dlg.getByRole('radio', { name: /すべてのボード|全体/ }).check();
    const { name, data } = await captureDownload(page, () => dlg.getByRole('button', { name: /出力|ダウンロード/ }).last().click());
    expect(name).toMatch(/\.zip$/);
    const zip = await JSZip.loadAsync(data);
    const files = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
    const mds = files.filter((f) => f.endsWith('.md'));
    expect(mds.length).toBe(2);
    expect(files.some((f) => /(^|\/)assets\/.+\.(png|svg|jpe?g|webp)$/i.test(f))).toBe(true);
    for (const m of mds) {
      const t = await zip.files[m].async('string');
      expect(t, `${m} に front matter がない`).toMatch(/^---\r?\n[\s\S]*?\r?\n---/);
      expect(t, `${m} にチェックリストがない`).toMatch(/^\s*[-*] \[[ xX]\] /m);
      const links = [...t.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((x) => x[1]);
      expect(links.length).toBeGreaterThan(0);
      for (const href of links) {
        expect(href).not.toMatch(/^(\/|[a-z]+:)/i);
        expect(files).toContain(path.posix.normalize(path.posix.join(path.posix.dirname(m), decodeURI(href))));
      }
    }
  });
});

test.describe('FR-094 Engagement サマリーパック', () => {
  // FR-094 AC-115
  test('FR-094 AC-115 「Engagement サマリーパック」を押すと PDF と Markdown を含む 1 つの ZIP がダウンロードされる', async ({ page, start }) => {
    await start();
    await recordExportConsent(page); // FR-219: 了承の記録を先に入力する
    const { name, data } = await captureDownload(page, () => page.getByRole('button', { name: 'Engagement サマリーパック' }).click(), 60_000);
    expect(name).toMatch(/\.zip$/);
    const zip = await JSZip.loadAsync(data);
    const files = Object.keys(zip.files);
    expect(files.some((f) => /\.pdf$/i.test(f))).toBe(true);
    expect(files.some((f) => /\.md$/i.test(f))).toBe(true);
    const pdf = files.find((f) => /\.pdf$/i.test(f))!;
    expect((await zip.files[pdf].async('nodebuffer')).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

test.describe('FR-095 自動保存と大量ストローク', () => {
  // FR-095 AC-116
  test('FR-095 AC-116 線を描いて 2 秒待ってタブを強制的に閉じ、開き直すと線が残っている', async ({ page, start, context }) => {
    const app = await start();
    const s = await surface(page);
    await tool(page, 'ペン');
    await drawLine(page, s, [60, 60], [260, 160]);
    const ids = (await active(page)).strokes.map((k) => k.id);
    expect(ids.length).toBeGreaterThan(0);
    await page.waitForTimeout(2_000 + 500);
    await page.close({ runBeforeUnload: false });
    const p2 = await context.newPage();
    await gotoAndEnter(p2, app.url);
    await p2.getByTestId('nav-whiteboard').click();
    const all = await hook<BoardState>(p2, 't.board.state()');
    const strokes = all.boards.flatMap((b) => b.strokes.map((k) => k.id));
    expect(strokes).toEqual(expect.arrayContaining(ids));
  });

  // FR-095 AC-117（性能。chromium-perf のプロジェクトで実行する）
  test('FR-095 AC-117 20000 本のストロークのボードでパン/ズームしたフレーム時間の中央値が 16ms 以下 @perf', async ({ page, start }) => {
    test.setTimeout(180_000);
    await start();
    const s = await surface(page);
    await hook(page, 't.ink.loadSynthetic(a)', 20000);
    await expect.poll(async () => (await active(page)).strokes.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(20000);
    const b = (await s.boundingBox())!;
    const median = await measureFrameTimes(page, async () => {
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      for (let i = 0; i < 20; i++) {
        await page.mouse.down();
        await page.mouse.move(b.x + b.width / 2 + 150, b.y + b.height / 2 + 60, { steps: 10 });
        await page.mouse.up();
        await page.mouse.wheel(0, i % 2 ? 240 : -240);
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      }
    });
    test.info().annotations.push({ type: 'frame-median-ms', description: median.toFixed(2) });
    expect(median, `フレーム時間の中央値 ${median.toFixed(2)}ms`).toBeLessThanOrEqual(16);
  });
});

test.describe('FR-096 キーボードだけでの作成', () => {
  // FR-096 AC-118
  test('FR-096 AC-118 キーボードだけで付箋・テキスト・図形を追加し、PDF のプレビューで範囲を確かめ、出力まで行える', async ({ page, start }) => {
    await start();
    await surface(page);
    const n0 = (await active(page)).items.length;
    const tb = page.getByRole('toolbar', { name: 'インクの道具' });
    for (const [name, text] of [['付箋', '付箋KB'], ['テキスト', 'テキストKB'], ['矩形', '']] as const) {
      await tb.getByRole('button', { name, exact: true }).focus();
      await page.keyboard.press('Enter');
      // 道具を選んだ状態で Enter を押すと、ボードの表示範囲の中央に追加される
      await component(page, 'whiteboard').getByTestId('board-surface').focus();
      await page.keyboard.press('Enter');
      if (text) await page.keyboard.type(text);
      await page.keyboard.press('Escape');
    }
    const items = (await active(page)).items;
    expect(items.length).toBe(n0 + 3);
    expect(items.some((i) => i.type === 'sticky' && i.text?.includes('付箋KB'))).toBe(true);
    expect(items.some((i) => i.type === 'text' && i.text?.includes('テキストKB'))).toBe(true);
    expect(items.some((i) => i.type === 'shape')).toBe(true);
    await component(page, 'whiteboard').getByRole('button', { name: 'PDF 出力' }).focus();
    await page.keyboard.press('Enter');
    const dlg = page.getByRole('dialog', { name: /PDF/ });
    await expect(dlg.getByTestId('pdf-preview')).toBeVisible();
    await expect(dlg.getByTestId('pdf-preview')).toContainText(/付箋KB|テキストKB/);
    const { name } = await captureDownload(page, async () => {
      await dlg.getByRole('button', { name: /出力|ダウンロード/ }).last().focus();
      await page.keyboard.press('Enter');
    }, 60_000);
    expect(name).toMatch(/\.pdf$/i);
  });
});

test.describe('FR-097 ホワイトボード', () => {
  // FR-097 AC-119
  test('FR-097 AC-119 付箋 3 枚・コネクター・フレーム・グループ・整列の結果が表示され、再読込後も残る', async ({ page, start }) => {
    const app = await start();
    const s = await surface(page);
    const box = (await s.boundingBox())!;
    await tool(page, '付箋');
    for (const [x, y, t] of [[100, 100, 'A'], [260, 140, 'B'], [420, 90, 'C']] as const) {
      await page.mouse.click(box.x + x, box.y + y);
      await page.keyboard.type(`付箋${t}`);
      await page.keyboard.press('Escape');
    }
    const st = (await active(page)).items.filter((i) => i.type === 'sticky');
    expect(st.length).toBe(3);
    const [a, b] = st;
    await tool(page, 'コネクター');
    await page.mouse.click(box.x + 100, box.y + 100);
    await page.mouse.click(box.x + 260, box.y + 140);
    const conn = (await active(page)).items.find((i) => i.type === 'connector')!;
    expect([conn.from, conn.to].sort()).toEqual([a.id, b.id].sort());
    // すべて選んでフレーム・グループ・整列
    await s.focus();
    await page.keyboard.press('Control+a');
    await page.getByRole('button', { name: 'フレームで囲む' }).click();
    await page.keyboard.press('Control+a');
    await page.getByRole('button', { name: 'グループにする' }).click();
    await page.getByRole('button', { name: '整列' }).click();
    await page.getByRole('menuitem', { name: '上揃え' }).click();
    const after = (await active(page)).items;
    const frame = after.find((i) => i.type === 'frame')!;
    expect(frame).toBeTruthy();
    const stickies = after.filter((i) => i.type === 'sticky');
    for (const k of stickies) {
      expect(k.frameId).toBe(frame.id);
      expect(k.groupId).toBeTruthy();
    }
    expect(new Set(stickies.map((k) => k.groupId)).size).toBe(1);
    expect(new Set(stickies.map((k) => Math.round(k.y))).size, '上揃えになっていない').toBe(1);
    await page.waitForTimeout(2_500);
    await app.reload();
    await surface(page);
    const re = (await active(page)).items;
    expect(re.filter((i) => i.type === 'sticky').map((i) => i.text).sort()).toEqual(['付箋A', '付箋B', '付箋C']);
    expect(re.some((i) => i.type === 'connector')).toBe(true);
    expect(re.some((i) => i.type === 'frame')).toBe(true);
    expect(new Set(re.filter((i) => i.type === 'sticky').map((k) => k.groupId)).size).toBe(1);
  });
});

test.describe('FR-098 カードの配置とリンク', () => {
  // FR-098 AC-120
  test('FR-098 AC-120 課題をドラッグ&ドロップでボードに置き、カードで課題名を変えると表とナレッジグラフも変わる', async ({ page, start }) => {
    await start();
    await setEditMode(page, true);
    const issue = mono.issues()[0];
    await page.getByRole('button', { name: /ペルソナ/ }).click();
    await page.getByRole('menuitemradio', { name: '事業部門' }).click();
    const view = component(page, 'issue-solution');
    const s = await surface(page);
    await entity(view, issue.id).first().dragTo(s);
    await expect.poll(async () => (await active(page)).items.filter((i) => i.type === 'card' && i.sourceEntityId === issue.id).length).toBe(1);
    const card = component(page, 'whiteboard').locator(`[data-entity-id="${issue.id}"]`).first();
    await card.dblclick();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('カードで改名ST-120');
    await page.keyboard.press('Enter');
    await expect(await openScreen(page, 'table')).toContainText('カードで改名ST-120');
    await expect(await openScreen(page, 'knowledge-graph')).toContainText('カードで改名ST-120');
  });

  // FR-098 AC-120（メニューから）
  test('FR-098 AC-120 メニューの「ボードに配置」でも課題をカードとして置ける', async ({ page, start }) => {
    await start();
    const issue = mono.issues()[1];
    const view = await openScreen(page, 'issue-solution');
    await entity(view, issue.id).first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'ボードに配置' }).click();
    await surface(page);
    await expect.poll(async () => (await active(page)).items.filter((i) => i.type === 'card' && i.sourceEntityId === issue.id).length).toBe(1);
  });
});

test.describe('FR-099 クラスタリング・ドット投票・タイマー', () => {
  // FR-099 AC-121
  test('FR-099 AC-121 付箋のクラスタリングで「AI 生成」のグループに分かれ、ドット投票の票数とタイマーの残り時間が文字で出る', async ({ page, start }) => {
    await start();
    const s = await surface(page);
    const box = (await s.boundingBox())!;
    await tool(page, '付箋');
    const texts = ['在庫の欠品', '在庫の過剰', '配送の遅延', '配送コスト', '人手不足'];
    for (let i = 0; i < texts.length; i++) {
      await page.mouse.click(box.x + 80 + i * 110, box.y + 120);
      await page.keyboard.type(texts[i]);
      await page.keyboard.press('Escape');
    }
    const wb = component(page, 'whiteboard');
    await wb.getByRole('button', { name: 'クラスタリング' }).click();
    await expect(wb.getByText('AI 生成').first()).toBeVisible({ timeout: 15_000 });
    const items = (await active(page)).items.filter((i) => i.type === 'sticky');
    const groups = new Set(items.map((i) => i.groupId).filter(Boolean));
    expect(groups.size, '付箋がグループに分かれていない').toBeGreaterThanOrEqual(2);
    // ドット投票
    await wb.getByRole('button', { name: 'ドット投票' }).click();
    const sticky = wb.locator('[data-wb-type="sticky"]').filter({ hasText: '人手不足' });
    await sticky.click();
    await sticky.click();
    await expect(sticky.getByTestId('vote-count')).toContainText('2');
    // タイマー
    await wb.getByRole('button', { name: 'タイマー' }).click();
    await page.getByRole('button', { name: '開始' }).click();
    const remain = page.getByTestId('timer-remaining');
    await expect(remain).toContainText(/\d{1,2}:\d{2}/);
    const t0 = await remain.innerText();
    await page.waitForTimeout(2_100);
    expect(await remain.innerText()).not.toBe(t0);
  });
});
