// verify（FR-127）の既定のスモークテスト: Playwright（Chromium）で、`dist` と顧客パックを重ねて配信したアプリを操作して判定する。
// Playwright は雛形の devDependency には入れない（顧客パックの配布物を軽く保つ）。`tests/system` の `@playwright/test` を使う
// （作業フォルダー → tests/system → 雛形の順に探す）。見つからないときは、対処を添えて不合格にする。
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../lib/pack-fs';
import type { BrowserItemId, Finding, SmokeContext, SmokeRunner } from './verify';

/** 主要画面（要求定義書 §3.5、[ASSUMPTION] A-13）と data-testid のキー */
export const MAIN_SCREEN_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['canvas', 'キャンバス'],
  ['issue-solution', '課題-解決策分析'],
  ['priority', '優先順位分析'],
  ['knowledge-graph', 'ナレッジグラフ'],
  ['architecture', 'アーキテクチャ図'],
  ['discussion-tree', '議論ツリー'],
  ['gantt', 'ガントチャート'],
  ['whiteboard', 'ホワイトボード'],
  ['settings', '設定パネル'],
];

/** ステップごとの待ちの上限（ミリ秒）。全体の上限は verify（PARAM-020）が見張る */
const STEP_TIMEOUT = 8_000;

// Playwright の型は、雛形に入れないので使わない
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function loadPlaywright(workDir: string): Promise<Any> {
  const tried: string[] = [];
  for (const dir of [workDir, path.join(REPO_ROOT, 'tests', 'system'), REPO_ROOT]) {
    try {
      const resolved = createRequire(path.join(dir, 'noop.js')).resolve('@playwright/test');
      const mod = (await import(pathToFileURL(resolved).href)) as Any;
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return chromium;
    } catch { tried.push(dir); }
  }
  throw new Error(`@playwright/test が見つかりません（探した場所: ${tried.join('、')}）`);
}

const firstLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split('\n')[0]!.trim();

/** ステップを実行して、例外を不合格の Finding にする */
async function guard(fn: () => Promise<Finding>): Promise<Finding> {
  try { return await fn(); } catch (e) { return { ok: false, detail: firstLine(e) }; }
}

const hex = (s: string): string => s.trim().toUpperCase();
const rgbOf = (h: string): string => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h.trim());
  return m ? `rgb(${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)})` : '';
};

export const playwrightSmoke: SmokeRunner = {
  async run(ctx: SmokeContext) {
    const chromium = await loadPlaywright(ctx.workDir);
    const browser = await chromium.launch({ headless: true });
    const onAbort = (): void => { void browser.close().catch(() => {}); };
    ctx.signal.addEventListener('abort', onAbort);
    try {
      return await runSmoke(browser, ctx);
    } finally {
      ctx.signal.removeEventListener('abort', onAbort);
      await browser.close().catch(() => {});
    }
  },
};

const NO_FS_ACCESS = (): void => {
  for (const k of ['showSaveFilePicker', 'showOpenFilePicker', 'showDirectoryPicker']) {
    try { delete (window as Any)[k]; } catch { /* ignore */ }
    Object.defineProperty(window, k, { value: undefined, configurable: true });
  }
};

async function newPage(browser: Any, errors: string[]): Promise<{ page: Any; close: () => Promise<void> }> {
  const context = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', colorScheme: 'light', acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(STEP_TIMEOUT);
  await page.addInitScript(NO_FS_ACCESS); // ダウンロードで受け取る
  page.on('pageerror', (e: Error) => errors.push(`pageerror: ${firstLine(e)}`));
  page.on('console', (m: Any) => {
    // 読み込めなかった任意の資源（runtime-config.json など）は、ページエラーに数えない
    if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(`console.error: ${m.text().split('\n')[0]}`);
  });
  return { page, close: () => context.close() };
}

async function runSmoke(browser: Any, ctx: SmokeContext): Promise<Record<BrowserItemId, Finding>> {
  const errors: string[] = [];
  const main = await newPage(browser, errors);
  const { page } = main;

  // 起動: オープニングの顧客名・Project 名、タイトル
  let opened = true;
  const names = await guard(async () => {
    await page.goto(ctx.url, { waitUntil: 'load' });
    const opening = page.getByTestId('opening');
    try { await opening.waitFor({ state: 'visible' }); } catch { opened = false; throw new Error('オープニングが表示されませんでした（顧客パックの読み込みに失敗した可能性があります）'); }
    const text = ((await opening.textContent()) ?? '').replace(/\s+/g, ' ');
    const missing = [ctx.customer, ctx.projectName].filter((n) => n && !text.includes(n));
    if (missing.length) throw new Error(`オープニングに「${missing.join('」「')}」がありません（表示: ${text.slice(0, 60)}）`);
    await page.waitForFunction((c: string) => document.title.includes(c), ctx.customer);
    const title = await page.title();
    if (!title.includes(ctx.projectName)) throw new Error(`タイトル「${title}」に Project 名「${ctx.projectName}」がありません`);
    return { ok: true, detail: `タイトル「${title}」、オープニングに顧客名・Project 名` };
  });
  if (!names.ok) {
    names.remedy = '顧客パックの customer.json の name・projectName と、雛形の表示（src/app/App.tsx）を確かめてください。';
  }

  // Esc でオープニングを飛ばす
  const keyResults: string[] = [];
  const keyProblems: string[] = [];
  if (opened) {
    try {
      await page.keyboard.press('Escape');
      await page.getByTestId('opening').waitFor({ state: 'hidden' });
      await page.getByTestId('workspace').waitFor({ state: 'visible' });
      keyResults.push('Esc でオープニングを飛ばせた');
    } catch (e) { keyProblems.push(`Esc でオープニングを飛ばせません: ${firstLine(e)}`); }
  } else keyProblems.push('オープニングが出ないため Esc を確かめられません');

  // Primary 色の反映（実効色。FR-060 の補正後）
  const primary = await guard(async () => {
    const v: { varColor: string; btn: string } = await page.evaluate(() => {
      const p = document.querySelector('.fui-FluentProvider');
      const b = document.querySelector('[data-appearance="primary"]');
      return {
        varColor: p ? getComputedStyle(p).getPropertyValue('--colorBrandBackground').trim() : '',
        btn: b ? getComputedStyle(b).backgroundColor : '',
      };
    });
    const want = hex(ctx.effectivePrimary);
    if (hex(v.varColor) === want || v.btn === rgbOf(want)) return { ok: true, detail: `実効色 ${want} が画面に反映されています` };
    throw new Error(`Primary 色の実効色 ${want} が画面に反映されていません（画面: ${v.varColor || v.btn || '取得できず'}）`);
  });
  if (!primary.ok) primary.remedy = 'brand-profile.json の colors.primary と、テーマの適用（src/theme/AppThemeProvider.tsx）を確かめてください。';

  // P: アニメーションの停止・再開
  try {
    const state = page.getByTestId('animation-state');
    await state.waitFor({ state: 'visible' });
    await page.keyboard.press('p');
    await page.waitForFunction(() => /停止中/.test(document.querySelector('[data-testid="animation-state"]')?.textContent ?? ''));
    await page.keyboard.press('p');
    await page.waitForFunction(() => /再生中/.test(document.querySelector('[data-testid="animation-state"]')?.textContent ?? ''));
    keyResults.push('P で停止・再開できた');
  } catch (e) { keyProblems.push(`P でアニメーションを停止・再開できません: ${firstLine(e)}`); }

  // M: ミュートの切替
  try {
    await page.mouse.move(300, 300);
    const mute = page.getByTestId('show-control-bar').getByRole('button', { name: /ミュート/ }).first();
    await mute.waitFor({ state: 'visible' });
    const before = await mute.getAttribute('aria-pressed');
    await page.keyboard.press('m');
    let after = before;
    for (let i = 0; i < 30 && after === before; i++) { await page.waitForTimeout(100); after = await mute.getAttribute('aria-pressed'); }
    if (after === before) throw new Error(`M を押してもミュートの表示（aria-pressed=${before}）が変わりません`);
    await page.keyboard.press('m'); // 元に戻す
    keyResults.push('M でミュートが切り替わった');
  } catch (e) { keyProblems.push(`M でミュートを切り替えられません（ミュートボタン・show-control-bar）: ${firstLine(e)}`); }

  const keys: Finding = keyProblems.length
    ? { ok: false, detail: keyProblems.join(' / '), remedy: 'Esc（オープニング）・P（アニメーション。src/motion/control.ts）・M（ミュート。FR-074）のキー操作が有効か確かめてください。' }
    : { ok: true, detail: keyResults.join('、') };

  // 主要画面の「サンプル」と、チャットの「AI 生成」
  const labels = await guard(async () => {
    const problems: string[] = [];
    for (const [key, name] of MAIN_SCREEN_KEYS) {
      const nav = page.getByTestId(`nav-${key}`);
      if ((await nav.count()) === 0) { problems.push(`${name} の画面がありません`); continue; }
      await nav.click();
      const c = page.getByTestId(`component-${key}`);
      await c.waitFor({ state: 'visible' });
      if (ctx.hasSample && (await c.getByText('サンプル', { exact: false }).count()) === 0) problems.push(`${name} に「サンプル」の表示がありません`);
    }
    if ((await page.getByTestId('nav-chat').count()) === 0) problems.push('チャットの画面がありません');
    else {
      await page.getByTestId('nav-chat').click();
      const chat = page.getByTestId('component-chat');
      await chat.getByRole('textbox', { name: /質問/ }).fill('最も優先度の高い課題は何ですか？');
      await chat.getByRole('button', { name: '送信' }).click();
      const answer = chat.getByTestId('chat-answer').last();
      await answer.waitFor({ state: 'visible' });
      if (!((await answer.textContent()) ?? '').includes('AI 生成')) problems.push('チャットの回答に「AI 生成」の表示がありません');
    }
    if (problems.length) throw new Error(problems.join(' / '));
    return { ok: true, detail: `主要画面 ${MAIN_SCREEN_KEYS.length} 件の${ctx.hasSample ? '「サンプル」' : '表示'}と、チャットの「AI 生成」を確認` };
  });
  if (!labels.ok) labels.remedy = '主要画面を Panel で包み（FR-008）、AI の回答に「AI 生成」のラベルを付けてください（NFR-LEGAL-002）。';

  // Markdown のエクスポートと復元（議論メモ。保存 → 空の状態のブラウザーで読み込む）
  const markdown = await guard(async () => {
    await page.getByRole('button', { name: '保存', exact: true }).first().click();
    const dlg = page.getByRole('dialog', { name: /保存/ });
    await dlg.waitFor({ state: 'visible' });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dlg.getByRole('button', { name: '保存', exact: true }).last().click(),
    ]);
    const name: string = download.suggestedFilename();
    const text = (await import('node:fs')).readFileSync(await download.path(), 'utf8');
    if (!/\.md$/i.test(name)) throw new Error(`保存したファイル「${name}」が .md ではありません`);
    if (!text.startsWith('---') || !/```json/.test(text)) throw new Error('保存した Markdown に front matter と JSON のブロックがありません');
    const fresh = await newPage(browser, errors);
    try {
      await fresh.page.goto(ctx.url, { waitUntil: 'load' });
      await fresh.page.keyboard.press('Escape');
      await fresh.page.getByTestId('workspace').waitFor({ state: 'visible' });
      await fresh.page.getByTestId('memo-file-input').setInputFiles({ name, mimeType: 'text/markdown', buffer: Buffer.from(text, 'utf8') });
      const notice = fresh.page.getByTestId('file-notice');
      await notice.waitFor({ state: 'visible' });
      if ((await notice.getAttribute('role')) === 'alert') throw new Error(`復元できませんでした: ${((await notice.textContent()) ?? '').slice(0, 80)}`);
    } finally { await fresh.close(); }
    return { ok: true, detail: `「${name}」を保存し、空の状態から読み込んで復元できた` };
  });
  if (!markdown.ok) markdown.remedy = '議論データの保存・復元（FR-051・FR-056、src/discussion/）と、全量エクスポート（FR-052）を確かめてください。';

  await main.close();
  const pageErrors: Finding = errors.length
    ? { ok: false, detail: `ページエラー ${errors.length} 件: ${errors.slice(0, 3).join(' / ')}`, remedy: 'ブラウザーのコンソールで、顧客パックの読み込みと画面の描画のエラーを確かめてください（FR-102）。' }
    : { ok: true, detail: 'ページエラー 0 件' };

  return { 'page-errors': pageErrors, primary, names, labels, keys, markdown };
}
