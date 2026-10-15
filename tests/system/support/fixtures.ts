// Playwright のフィクスチャと共通の操作。
// 画面の操作は利用者と同じ手段（クリック・キー・ドラッグ）で行い、判定は画面に見える振る舞いで行う。
// 画面の場所は CONTRACT.md の data-testid・ロール・文言で探す（CSS のクラス名には依存しない）。
import { test as base, expect, type Page, type Locator, type Download } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { startStaticServer, unusedPort, type RunningServer } from './server';
import { examplePack, Pack, type PackKind } from './packs';
import { EVIDENCE_DIR } from './paths';

export { expect };

/** 主要画面（要求定義書 §3.5、[ASSUMPTION] A-13）と data-testid のキー */
export const MAIN_SCREENS = [
  ['canvas', 'キャンバス'],
  ['issue-solution', '課題-解決策分析'],
  ['priority', '優先順位分析'],
  ['knowledge-graph', 'ナレッジグラフ'],
  ['architecture', 'アーキテクチャ図'],
  ['discussion-tree', '議論ツリー'],
  ['gantt', 'ガントチャート'],
  ['whiteboard', 'ホワイトボード'],
  ['settings', '設定パネル'],
] as const;
export type ScreenKey = (typeof MAIN_SCREENS)[number][0];

export const PERSONAS = ['経営層', '事業部門', 'IT', '現場'] as const;

export interface StartOptions {
  /** 'mono'（既定）・'koto'・変種の Pack・null（public/data が空） */
  pack?: PackKind | Pack | null;
  /** 既定は「未接続」（使われていないポート） */
  relayUrl?: string;
  aiMockDelayMs?: number;
  /** 音声合成のモック接続（runtime-config.json の speech。CONTRACT.md §13） */
  speech?: { endpoint: string; key: string };
  /** オープニングを飛ばして本編から始める（既定 true） */
  skipOpening?: boolean;
  /** File System Access API を無効にする（既定 true: ダウンロードで受け取る） */
  disableFileSystemAccess?: boolean;
  /** URL に付け足すパス・クエリ（`?e2e=1` は常に付く） */
  path?: string;
  /** 既存の server を再利用する（再読込・別タブの確認用） */
  server?: RunningServer;
}

export interface AppHandle {
  server: RunningServer;
  pack: Pack;
  url: string;
  /** runtime-config.json で渡した中継プロセスの URL */
  relayUrl: string;
  /** 同じ顧客パックのまま、URL を開き直す */
  reload(opts?: { skipOpening?: boolean }): Promise<void>;
}

export interface Fixtures {
  /** 発生したページエラー（uncaught exception）と console.error */
  pageErrors: string[];
  /** 失敗した通信の要求 */
  failedRequests: string[];
  start: (opts?: StartOptions) => Promise<AppHandle>;
}

export const test = base.extend<Fixtures>({
  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await use(errors);
  },
  failedRequests: async ({ page }, use) => {
    const failed: string[] = [];
    page.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`));
    await use(failed);
  },
  start: async ({ page, pageErrors: _e, failedRequests: _f }, use) => {
    const servers: RunningServer[] = [];
    const factory = async (opts: StartOptions = {}): Promise<AppHandle> => {
      const pack = opts.pack === null ? null : opts.pack instanceof Pack ? opts.pack : examplePack(opts.pack ?? 'mono');
      const relayUrl = opts.relayUrl ?? `http://127.0.0.1:${await unusedPort()}`;
      const server = opts.server ?? (await startStaticServer({
        pack: { root: pack ? pack.root : null },
        runtimeConfig: { relayUrl, aiMock: { delayMs: opts.aiMockDelayMs ?? 0 }, ...(opts.speech ? { speech: opts.speech } : {}) },
      }));
      if (!opts.server) servers.push(server);
      if (opts.disableFileSystemAccess !== false) await disableFsAccess(page);
      const url = `${server.url}/${opts.path ?? ''}${(opts.path ?? '').includes('?') ? '&' : '?'}e2e=1`;
      await page.goto(url);
      if (opts.skipOpening !== false) await skipOpening(page);
      const handle: AppHandle = {
        server,
        pack: pack ?? examplePack('mono'),
        url,
        relayUrl,
        reload: async (o = {}) => {
          await page.reload();
          if (o.skipOpening !== false) await skipOpening(page);
        },
      };
      return handle;
    };
    await use(factory);
    for (const s of servers) await s.close();
  },
});

/** File System Access API を無効にしたブラウザー（AC-064 など）。 */
export async function disableFsAccess(page: Page): Promise<void> {
  await page.addInitScript(() => {
    for (const k of ['showSaveFilePicker', 'showOpenFilePicker', 'showDirectoryPicker']) {
      try { delete (window as any)[k]; } catch { /* ignore */ }
      Object.defineProperty(window, k, { value: undefined, configurable: true });
    }
  });
}

/** 保存先への書き込みが失敗する File System Access API（AC-188）。 */
export async function failingFsAccess(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fail = async () => { throw new DOMException('書き込みに失敗しました（テストの差し替え）', 'NotAllowedError'); };
    const handle = {
      kind: 'file', name: 'export.md',
      createWritable: async () => ({ write: fail, close: fail, abort: async () => {} }),
      queryPermission: async () => 'granted', requestPermission: async () => 'granted',
    };
    const dir = {
      kind: 'directory', name: 'export',
      getFileHandle: async () => handle, getDirectoryHandle: async () => dir,
      queryPermission: async () => 'granted', requestPermission: async () => 'granted',
    };
    Object.defineProperty(window, 'showSaveFilePicker', { value: async () => handle, configurable: true });
    Object.defineProperty(window, 'showDirectoryPicker', { value: async () => dir, configurable: true });
  });
}

/**
 * 起動時の作業先の選択画面（FR-144 AC-237・AC-239。起動のたびに必ず出る）が出ていれば、デモ（なければ最初の実 Project）を選んで閉じる。
 * 作業先の選択そのものを確かめるテストは `skipOpening: false` で起動し、`pressOpeningEscape` だけ使う。
 */
export async function chooseWorkTarget(page: Page, target?: RegExp | string): Promise<void> {
  const picker = page.getByRole('dialog', { name: '作業先の選択' });
  try {
    await picker.waitFor({ state: 'visible', timeout: 3_000 });
  } catch {
    return;
  }
  const demo = picker.getByRole('option', { name: /デモ/ });
  if (target) await picker.getByRole('option', { name: target }).first().click();
  else if ((await demo.count()) > 0) await demo.first().click();
  else await picker.getByRole('option', { name: /…|\// }).first().click();
  await picker.waitFor({ state: 'hidden', timeout: 5_000 });
}

/** オープニングが出ていれば Esc で飛ばす（作業先の選択は選ばない）。 */
export async function pressOpeningEscape(page: Page): Promise<void> {
  const opening = page.getByTestId('opening');
  try {
    await opening.waitFor({ state: 'visible', timeout: 3_000 });
    await page.keyboard.press('Escape');
    await opening.waitFor({ state: 'hidden', timeout: 5_000 });
  } catch {
    /* オープニングがない場合はそのまま */
  }
}

/**
 * 起動直後のメイン画面（FR-186・FR-144 AC-398。`data-testid="main-screen"`）が出ていれば、ボタン「Project を開く」で
 * 作業先の選択画面へ進む（選択はこの後の chooseWorkTarget が行う）。メイン画面が出ていなければ何もしない。
 * メイン画面そのものを確かめるテストは `skipOpening: false` で起動し、`pressOpeningEscape` だけ使う。
 */
export async function leaveMainScreen(page: Page): Promise<void> {
  const main = page.getByTestId('main-screen');
  try {
    await main.waitFor({ state: 'visible', timeout: 3_000 });
  } catch {
    return;
  }
  await main.getByRole('button', { name: 'Project を開く' }).click();
}

/** オープニングを `Esc` で飛ばし、本編が操作できる状態を待つ。 */
export async function skipOpening(page: Page, target?: RegExp | string): Promise<void> {
  const opening = page.getByTestId('opening');
  try {
    await opening.waitFor({ state: 'visible', timeout: 5_000 });
    await page.keyboard.press('Escape');
    await opening.waitFor({ state: 'hidden', timeout: 5_000 });
  } catch {
    /* オープニングがない（すでに本編）場合はそのまま */
  }
  await leaveMainScreen(page);
  await chooseWorkTarget(page, target);
  await expect(page.getByTestId('workspace')).toBeVisible();
}

/** 再読込（FR-144 AC-239: 毎回選択画面が出る）して、オープニングと作業先の選択を進める。 */
export async function reloadAndEnter(page: Page, target?: RegExp | string): Promise<void> {
  await page.reload();
  await skipOpening(page, target);
}

/** 新しいページ（別の context など）で URL を開き、オープニングと作業先の選択を進める。 */
export async function gotoAndEnter(page: Page, url: string, target?: RegExp | string): Promise<void> {
  await page.goto(url);
  await skipOpening(page, target);
}

/** 画面の切替（ナビゲーション）。CONTRACT.md §4 の `nav-<key>` */
export async function openScreen(page: Page, key: string): Promise<Locator> {
  await page.getByTestId(`nav-${key}`).click();
  const c = component(page, key);
  await expect(c).toBeVisible();
  return c;
}

/** コンポーネント（パネル）。CONTRACT.md §4 の `component-<key>` */
export function component(page: Page, key: string): Locator {
  return page.getByTestId(`component-${key}`);
}

/** コマンドパレット（`Ctrl+K`、[ASSUMPTION] A-05）から操作を実行する。 */
export async function runCommand(page: Page, text: string, commandName?: string): Promise<void> {
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'コマンドパレット' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox').fill(text);
  if (commandName) await expect(dialog.getByRole('option', { name: new RegExp(commandName) }).first()).toBeVisible();
  await page.keyboard.press('Enter');
}

/** ペルソナの切替メニュー */
export async function selectPersona(page: Page, persona: string): Promise<void> {
  await page.getByRole('button', { name: /ペルソナ/ }).click();
  await page.getByRole('menuitemradio', { name: persona }).click();
}

/** 編集モードの ON/OFF（FR-047） */
export async function setEditMode(page: Page, on: boolean): Promise<void> {
  const sw = page.getByRole('switch', { name: '編集モード' });
  if ((await sw.isChecked()) !== on) await sw.click();
  if (on) await expect(sw).toBeChecked();
  else await expect(sw).not.toBeChecked();
}

/** 同じ ID の項目（CONTRACT.md §4 の data-entity-id） */
export function entity(scope: Page | Locator, id: string): Locator {
  return scope.locator(`[data-entity-id="${id}"]`);
}

/** 強調の状態（selected／hover／dimmed／related）。CONTRACT.md §4 */
export async function expectHighlight(loc: Locator, state: 'selected' | 'hover' | 'dimmed' | 'related' | null): Promise<void> {
  if (state === null) await expect(loc.first()).not.toHaveAttribute('data-highlight', /selected|hover|related/);
  else await expect(loc.first()).toHaveAttribute('data-highlight', new RegExp(state));
}

/** テスト用フック（CONTRACT.md §6。`?e2e=1` のときだけ有効） */
export async function hook<T = any>(page: Page, expr: string, arg?: unknown): Promise<T> {
  await page.waitForFunction(() => !!(window as any).__edbTest, undefined, { timeout: 10_000 });
  return page.evaluate(
    ([e, a]) => {
      const t = (window as any).__edbTest;
      // eslint-disable-next-line no-new-func
      const fn = new Function('t', 'a', `return (${e});`);
      return fn(t, a);
    },
    [expr, arg] as const,
  );
}

export interface SceneObject { entityId: string; x: number; y: number; visible: boolean; highlighted: boolean }
export interface SceneInfo { renderer: string; scene: string; frame: number; quality: string; fps: number; industryPreset: string; objectCount: number }

export const scene = {
  info: (page: Page) => hook<SceneInfo>(page, 't.scene.info()'),
  objects: (page: Page) => hook<SceneObject[]>(page, 't.scene.objects()'),
  camera: (page: Page) => hook<{ position: number[]; target: number[]; moving: boolean }>(page, 't.scene.camera()'),
};

/** canvas 要素に何かが描かれている（単色でない）ことを、スクリーンショットの画素のばらつきで確かめる。 */
export async function expectCanvasDrawn(loc: Locator): Promise<void> {
  // 開いた直後の約 1.5 秒は描画を始めない設計（FR-146）。最初の描画を最大 10 秒まで待つ。
  // PNG の生データの多様性で簡易に判定（単色の PNG は圧縮後が非常に小さい）
  await expect
    .poll(async () => (await loc.screenshot()).byteLength, { timeout: 10_000, message: 'canvas が単色（何も描画されていない）' })
    .toBeGreaterThan(3_000);
}

/** 3D の最初の描画（frame > 0）を最大 10 秒まで待つ。開いてすぐ描画を測るケースで使う。 */
export async function waitFirstFrame(page: Page): Promise<number> {
  await expect
    .poll(async () => (await scene.info(page)).frame, { timeout: 10_000, message: '3D の最初の描画が始まらない' })
    .toBeGreaterThan(0);
  return (await scene.info(page)).frame;
}

/** ダウンロードを待って中身を返す。 */
export async function captureDownload(page: Page, action: () => Promise<unknown>, timeout = 30_000): Promise<{ name: string; data: Buffer; download: Download }> {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout }), action()]);
  const p = await download.path();
  const data = fs.readFileSync(p!);
  return { name: download.suggestedFilename(), data, download };
}

/** 証跡（スクリーンショット・ファイル）を work/ の下に保存し、テストにも添付する。 */
export async function saveEvidence(name: string, data: Buffer | string): Promise<string> {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const p = path.join(EVIDENCE_DIR, name);
  fs.writeFileSync(p, data);
  await test.info().attach(name, { path: p });
  return p;
}

/** 表（データ表）の本文の行 */
export function tableRows(scope: Locator): Locator {
  return scope.getByRole('row').filter({ has: scope.page().getByRole('cell') });
}

/** 件数バッジ（CONTRACT.md §4 の `count-badge`）の数値 */
export async function countBadge(scope: Locator): Promise<number> {
  const t = (await scope.getByTestId('count-badge').innerText()).replace(/[^0-9]/g, '');
  return Number(t);
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * 入力のあったフレームの処理時間（ms）の中央値を測る（性能の確認用。AC-117）。
 * 60Hz の rAF の周期（約 16.7ms）は実装の速さではなく表示の周期なので、rAF の間隔は測らない。
 * 1 フレームの処理時間 = 入力イベントの発生（event.timeStamp）から、そのフレームの描画更新の後（rAF の直後に
 * MessageChannel で戻る最初のタスク）までの時間。入力のなかったフレームは数えない。
 * ウォームアップとして `during` を 1 回流して捨て、その後 `rounds` 回（既定 3）測って、各回の中央値の中央値を返す。
 * どの回も計測が 20 件未満なら、計測できていないので失敗にする（未計測を合格にしない）。
 * `during` は繰り返し実行できる操作にすること。
 */
export async function measureFrameTimes(page: Page, during: () => Promise<void>, rounds = 3): Promise<number> {
  const MIN_SAMPLES = 20;
  const start = () =>
    page.evaluate(() => {
      const w = window as any;
      w.__stWork = [];
      w.__stRun = true;
      let lastInput: number | null = null;
      const onInput = (e: Event) => { lastInput = e.timeStamp; };
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) {
        window.addEventListener(type, onInput, { capture: true, passive: true });
      }
      w.__stStop = () => {
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) {
          window.removeEventListener(type, onInput, { capture: true } as EventListenerOptions);
        }
      };
      const ch = new MessageChannel();
      let t0: number | null = null;
      ch.port1.onmessage = () => {
        if (t0 !== null) w.__stWork.push(performance.now() - t0);
        t0 = null;
      };
      const tick = () => {
        if (lastInput !== null) {
          t0 = lastInput;
          lastInput = null;
          ch.port2.postMessage(0);
        }
        if (w.__stRun) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  const stop = () =>
    page.evaluate(async () => {
      const w = window as any;
      await new Promise((r) => setTimeout(r, 100));
      w.__stRun = false;
      w.__stStop();
      return w.__stWork as number[];
    });

  // ウォームアップ（結果は捨てる）
  await start();
  await during();
  await stop();

  const medians: number[] = [];
  for (let i = 0; i < rounds; i++) {
    await start();
    await during();
    const work = await stop();
    if (work.length < MIN_SAMPLES) {
      throw new Error(`フレーム処理時間の計測が ${work.length} 件（${MIN_SAMPLES} 件未満）で、性能を判定できない（${i + 1} 回目）`);
    }
    medians.push(median(work));
  }
  return median(medians);
}

/** 計算済みスタイルの色を `rgb(r, g, b)` で比べるための正規化 */
export function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(v, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/** WCAG の相対輝度とコントラスト比 */
export function contrastRatio(rgb1: string, rgb2: string): number {
  const lum = (s: string) => {
    const [r, g, b] = (s.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0']).slice(0, 3).map(Number).map((c) => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(rgb1), lum(rgb2)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
