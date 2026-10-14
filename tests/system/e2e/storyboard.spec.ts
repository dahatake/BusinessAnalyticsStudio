// System Test: ストーリーボード（FR-163〜FR-167）。音声合成はモック（実際の Azure 呼び出しはしない）。
// 期待値は要求定義書の受入基準（docs/requirements/app-experience.md）だけから決める。画面の探し方は tests/system/CONTRACT.md §13。
// PARAM-018 コントラスト 4.5 / PARAM-021 点滅 3 回/秒 / PARAM-029 幅 320 / PARAM-048 作成→再生可能 2 秒
// PARAM-052 30 秒 ±PARAM-053 5 秒 / PARAM-054 強調テロップ 20 文字。
// AC-320・AC-327・AC-329〜331 は BLOCKED のため作らない。
import type { Page, Locator } from '@playwright/test';
import { test, expect, hook, contrastRatio, reloadAndEnter } from '../support/fixtures';

const CREATE_MS = 2_000; // PARAM-048
const TARGET_MS = 30_000; // PARAM-052
const TOLERANCE_MS = 5_000; // PARAM-053
const TELOP_MAX = 20; // PARAM-054
const MIN_CONTRAST = 4.5; // PARAM-018
const REFLOW_W = 320; // PARAM-029
const SPEECH_URL = 'https://speech.mock.invalid/tts';

interface UC { name: string; summary: string; persona: string; steps: { title: string; desc: string }[]; effect?: string }
const mk = (n: number, p: string) => Array.from({ length: n }, (_, i) => ({ title: `${p}手順${i + 1} 見出し`, desc: `${p}説明${i + 1} 内容` }));
const UC_A: UC = { name: '受注処理の自動化', summary: '受注入力を減らす', persona: '現場担当者', steps: mk(3, 'A'), effect: '入力時間が半分になる' };
const UC_B: UC = { name: '請求書の確認', summary: '確認の抜けを防ぐ', persona: '経理担当者', steps: mk(4, 'B') };
const UC_6: UC = { name: '六手順の流れ', summary: '長い流れ', persona: '管理者', steps: mk(6, 'F') };
const UC_0: UC = { name: '手順なしの案', summary: '手順 0 件', persona: '担当者', steps: [] };

async function openNewProject(page: Page, company = '合成株式会社S', project = 'SB案件1'): Promise<void> {
  await page.getByRole('button', { name: '企業を登録' }).click();
  let dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: '企業名' }).fill(company);
  await dlg.getByRole('button', { name: '登録' }).click();
  await expect(dlg).toBeHidden();
  await page.getByRole('region', { name: `企業 ${company}` }).getByRole('button', { name: 'Project を作成' }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: 'Project 名' }).fill(project);
  await dlg.getByRole('button', { name: '作成' }).click();
  await expect(dlg).toBeHidden();
  await page.getByRole('region', { name: `企業 ${company}` }).getByRole('link', { name: project }).click();
  await expect(page.getByTestId('stepper')).toBeVisible();
}
async function addUseCase(page: Page, uc: UC): Promise<void> {
  await page.getByTestId('stepper').getByRole('button', { name: 'ユースケース作成' }).click();
  const editor = page.getByTestId('usecase-editor');
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'ユースケースを追加' }).click();
  const dlg = page.getByRole('dialog', { name: 'ユースケース' });
  await dlg.getByRole('textbox', { name: '名称' }).fill(uc.name);
  await dlg.getByRole('textbox', { name: '概要' }).fill(uc.summary);
  await dlg.getByRole('textbox', { name: '対象ペルソナ' }).fill(uc.persona);
  if (uc.effect !== undefined) await dlg.getByRole('textbox', { name: '期待する効果' }).fill(uc.effect);
  for (let i = 0; i < uc.steps.length; i++) {
    await dlg.getByRole('button', { name: '手順を追加' }).click();
    await dlg.getByRole('textbox', { name: `手順 ${i + 1} の見出し` }).fill(uc.steps[i].title);
    await dlg.getByRole('textbox', { name: `手順 ${i + 1} の説明` }).fill(uc.steps[i].desc);
  }
  await dlg.getByRole('button', { name: '保存' }).click();
  await expect(dlg).toBeHidden();
}
function item(page: Page, name: string): Locator {
  return page.getByTestId('usecase-list').getByRole('listitem').filter({ hasText: name });
}
async function create(page: Page, name: string): Promise<void> {
  await item(page, name).getByRole('button', { name: 'ストーリーボードを作成' }).click();
}
function player(page: Page): Locator { return page.getByTestId('storyboard-player'); }
async function play(page: Page, name: string): Promise<Locator> {
  await item(page, name).getByRole('button', { name: 'ストーリーボードを再生' }).click();
  await expect(player(page)).toBeVisible();
  return player(page);
}
/** プロジェクトを開き、ユースケースを登録してストーリーボードを作る */
async function setup(page: Page, ucs: UC[]): Promise<void> {
  await openNewProject(page);
  for (const uc of ucs) await addUseCase(page, uc);
  for (const uc of ucs) if (uc.steps.length > 0) await create(page, uc.name);
}
const text = async (l: Locator) => ((await l.textContent()) ?? '').replace(/\s+/g, ' ').trim();

/** 音声合成のモック。mode で応答を変え、送られた文言を記録する */
async function mockSpeech(page: Page, mode: 'ok' | 'fail' | 'timeout'): Promise<string[]> {
  const sent: string[] = [];
  await page.route(`${SPEECH_URL}**`, async (route) => {
    const body = route.request().postData() ?? '';
    sent.push(body);
    if (mode === 'ok') await route.fulfill({ status: 200, contentType: 'audio/wav', body: Buffer.alloc(64) });
    else if (mode === 'fail') await route.fulfill({ status: 500, body: 'mock failure' });
    else await route.abort('timedout');
  });
  return sent;
}
async function openSpeechSettings(page: Page): Promise<Locator> {
  await page.getByTestId('nav-settings').click();
  const box = page.getByRole('region', { name: '音声設定' });
  await expect(box).toBeVisible();
  return box;
}
async function goBackToUseCases(page: Page): Promise<void> {
  await page.getByTestId('stepper').getByRole('button', { name: 'ユースケース作成' }).click();
  await expect(page.getByTestId('usecase-editor')).toBeVisible();
}
/** 最後まで再生する（自動で進む）。ended になるまでの実時間（ms）を返す */
async function playToEnd(p: Locator): Promise<number> {
  const t0 = Date.now();
  await p.getByRole('button', { name: '再生' }).click().catch(() => undefined);
  await expect(p).toHaveAttribute('data-storyboard-state', 'ended', { timeout: 60_000 });
  return Date.now() - t0;
}

test.describe('FR-163 ストーリーボードの作成', () => {
  // FR-163 AC-315
  test('FR-163 AC-315 ユースケース A で作成すると A の手順のシーンが順序どおり並び、各シーンに見出し・字幕・強調テロップがあり、B の内容は含まれない', async ({ page, start }) => {
    await start();
    await setup(page, [UC_A, UC_B]);
    await item(page, UC_A.name).getByRole('button', { name: 'ストーリーボードを編集' }).click();
    const list = page.getByTestId('storyboard-scenes').getByRole('listitem');
    expect(await list.count()).toBeGreaterThanOrEqual(UC_A.steps.length);
    const all = await text(page.getByTestId('storyboard-scenes'));
    expect(all).toContain(UC_A.persona);
    let last = -1;
    for (const s of UC_A.steps) {
      const idx = all.indexOf(s.title.split(' ')[0]);
      expect(idx, `${s.title} が含まれる`).toBeGreaterThan(last);
      last = idx;
    }
    for (let i = 1; i <= await list.count(); i++) {
      await expect(page.getByRole('textbox', { name: `シーン ${i} の見出し` })).not.toHaveValue('');
      await expect(page.getByRole('textbox', { name: `シーン ${i} の字幕` })).not.toHaveValue('');
      await expect(page.getByRole('textbox', { name: `シーン ${i} の強調テロップ` })).not.toHaveValue('');
    }
    // 異常系: ほかのユースケースの内容は混ざらない
    expect(all).not.toContain('B手順');
    expect(all).not.toContain('B説明');
    expect(all).not.toContain(UC_B.persona);
  });

  // FR-163 AC-316
  test('FR-163 AC-316 同じ構成になり 2 秒以内に再生可能・手順 0 件は拒否・字幕の編集は次の再生に反映され元のユースケースは変わらない', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    await addUseCase(page, UC_A);
    await addUseCase(page, UC_0);
    // 手順 0 件は拒否（異常系）
    await create(page, UC_0.name);
    await expect(page.getByRole('alert').filter({ hasText: '手順を 1 つ以上追加する' })).toBeVisible();
    await expect(item(page, UC_0.name).getByRole('button', { name: 'ストーリーボードを再生' })).toBeDisabled();
    // 作成から再生可能まで 2 秒以内
    const t0 = Date.now();
    await create(page, UC_A.name);
    const playBtn = item(page, UC_A.name).getByRole('button', { name: 'ストーリーボードを再生' });
    await expect(playBtn).toBeEnabled({ timeout: CREATE_MS });
    expect(Date.now() - t0).toBeLessThanOrEqual(CREATE_MS + 500);
    const scenesOf = async () => {
      await item(page, UC_A.name).getByRole('button', { name: 'ストーリーボードを編集' }).click();
      const t = await text(page.getByTestId('storyboard-scenes'));
      return t;
    };
    const first = await scenesOf();
    await page.keyboard.press('Escape');
    // 同じユースケースから再作成しても同じ構成
    await create(page, UC_A.name);
    expect(await scenesOf()).toBe(first);
    // 字幕を編集して保存 → 次の再生に反映
    const cap = page.getByRole('textbox', { name: 'シーン 1 の字幕' });
    await cap.fill('編集後の字幕 ABC');
    await page.getByRole('button', { name: '保存' }).click();
    const p = await play(page, UC_A.name);
    await expect(p.getByTestId('storyboard-caption')).toContainText('編集後の字幕 ABC');
    await page.keyboard.press('Escape');
    // 元のユースケースは変わらない
    await item(page, UC_A.name).getByRole('button', { name: '編集', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: 'ユースケース' });
    await expect(dlg.getByRole('textbox', { name: '手順 1 の説明' })).toHaveValue(UC_A.steps[0].desc);
    await expect(dlg).not.toContainText('編集後の字幕 ABC');
  });
});

test.describe('FR-164 全画面・約 30 秒の再生', () => {
  // FR-164 AC-317
  test('FR-164 AC-317 再生で全画面になり、Esc で全画面と再生が終わり元の画面に戻る。全画面にできない環境では覆う表示で代替し旨を表示する', async ({ page, start }) => {
    await start();
    await setup(page, [UC_A]);
    const before = await page.url();
    const target = await text(page.getByTestId('usecase-list'));
    const p = await play(page, UC_A.name);
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(p).toBeHidden();
    expect(await page.url()).toBe(before);
    await expect(page.getByTestId('usecase-editor')).toBeVisible();
    expect(await text(page.getByTestId('usecase-list'))).toBe(target);
  });
  test('FR-164 AC-317 全画面にできない環境（異常系）では画面全体を覆う表示で代わりにし、その旨が表示される', async ({ page, start }) => {
    await page.addInitScript(() => {
      (Element.prototype as any).requestFullscreen = undefined;
      (Document.prototype as any).exitFullscreen = undefined;
    });
    await start();
    await setup(page, [UC_A]);
    const p = await play(page, UC_A.name);
    await expect(page.getByTestId('storyboard-fullscreen-fallback')).toBeVisible();
    const box = await p.boundingBox();
    const vp = page.viewportSize()!;
    expect(box!.width).toBeGreaterThanOrEqual(vp.width - 1);
    expect(box!.height).toBeGreaterThanOrEqual(vp.height - 1);
    await page.keyboard.press('Escape');
    await expect(p).toBeHidden();
  });

  // FR-164 AC-318
  test('FR-164 AC-318 手順 3 件のストーリーボードを最後まで再生すると総時間が 30 秒 ±5 秒に収まる', async ({ page, start }) => {
    test.setTimeout(120_000);
    await start();
    await setup(page, [UC_A]);
    const p = await play(page, UC_A.name);
    const ms = await playToEnd(p);
    expect(ms).toBeGreaterThanOrEqual(TARGET_MS - TOLERANCE_MS);
    expect(ms).toBeLessThanOrEqual(TARGET_MS + TOLERANCE_MS);
  });
  test('FR-164 AC-318 手順 6 件のストーリーボードも総時間が 30 秒 ±5 秒に収まる（1 シーンあたりは短くなる）', async ({ page, start }) => {
    test.setTimeout(120_000);
    await start();
    await setup(page, [UC_6]);
    const p = await play(page, UC_6.name);
    const ms = await playToEnd(p);
    expect(ms).toBeGreaterThanOrEqual(TARGET_MS - TOLERANCE_MS);
    expect(ms).toBeLessThanOrEqual(TARGET_MS + TOLERANCE_MS);
  });

  // FR-164 AC-319
  test('FR-164 AC-319 P で動きと自動進行が止まり、キーボードだけで再生・一時停止・前後・終了ができる', async ({ page, start }) => {
    await start();
    await setup(page, [UC_A]);
    const p = await play(page, UC_A.name);
    await expect(p).toHaveAttribute('data-motion', 'running');
    await page.keyboard.press('p');
    await expect(p).toHaveAttribute('data-motion', 'stopped');
    const pos = await text(p.getByTestId('storyboard-position'));
    await page.waitForTimeout(2_500);
    expect(await text(p.getByTestId('storyboard-position'))).toBe(pos);
    await page.keyboard.press('ArrowRight');
    await expect(p.getByTestId('storyboard-position')).not.toHaveText(pos);
    await page.keyboard.press('ArrowLeft');
    await expect(p.getByTestId('storyboard-position')).toHaveText(pos);
    await page.keyboard.press('p');
    await expect(p).toHaveAttribute('data-motion', 'running');
    await page.keyboard.press('Escape');
    await expect(p).toBeHidden();
  });
  test('FR-164 AC-319 動きを減らす設定（異常系）では動きなしで全シーンの字幕が読め、点滅は 3 回/秒以下', async ({ page, start }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start();
    await setup(page, [UC_A]);
    const p = await play(page, UC_A.name);
    await expect(p).toHaveAttribute('data-motion', 'stopped');
    const all = await text(p);
    for (const s of UC_A.steps) expect(all).toContain(s.desc.split(' ')[0]);
    const fast = await page.evaluate(() => document.getAnimations().filter((a) => {
      const t = a.effect?.getComputedTiming();
      return !!t && typeof t.duration === 'number' && t.duration < 1000 / 3 && t.iterations === Infinity;
    }).length);
    expect(fast).toBe(0);
  });
});

test.describe('FR-165 字幕とテロップ', () => {
  // FR-165 AC-321
  test('FR-165 AC-321 全シーンに字幕が文字で表示され、最初の冒頭に 20 文字以内の強調テロップがあり強調語が見分けられる', async ({ page, start }) => {
    await start();
    await setup(page, [UC_A]);
    const p = await play(page, UC_A.name);
    const telop = p.getByTestId('storyboard-telop');
    await expect(telop).toBeVisible();
    expect(Array.from(await text(telop)).length).toBeLessThanOrEqual(TELOP_MAX);
    expect(await text(telop)).not.toBe('');
    await expect(p.getByTestId('storyboard-emphasis').first()).toBeVisible();
    const fw = (l: Locator) => l.evaluate((e) => getComputedStyle(e).fontWeight + '|' + getComputedStyle(e).color + '|' + getComputedStyle(e).fontSize);
    const cap = p.getByTestId('storyboard-caption');
    expect(await fw(p.getByTestId('storyboard-emphasis').first())).not.toBe(await fw(cap));
    await page.keyboard.press('p'); // 自動進行を止めて 1 シーンずつ確認
    for (let i = 0; i < UC_A.steps.length; i++) {
      await expect(cap).toBeVisible();
      expect(await text(cap)).not.toBe('');
      if (i < UC_A.steps.length - 1) await page.keyboard.press('ArrowRight');
    }
  });

  // FR-165 AC-322
  for (const [label, w, h] of [['全画面', 1600, 900], ['幅 320 の縮退', REFLOW_W, 640]] as const) {
    test(`FR-165 AC-322 ${label}で字幕とテロップが欠けず、コントラスト比 4.5 以上、ミュートと停止のままでも字幕で読める`, async ({ page, start }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await start();
      await setup(page, [UC_A]);
      const p = await play(page, UC_A.name);
      for (const id of ['storyboard-caption', 'storyboard-telop']) {
        const l = p.getByTestId(id);
        await expect(l).toBeVisible();
        const b = (await l.boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(-1);
        expect(b.y).toBeGreaterThanOrEqual(-1);
        expect(b.x + b.width).toBeLessThanOrEqual(w + 1);
        expect(b.y + b.height).toBeLessThanOrEqual(h + 1);
        const overflow = await l.evaluate((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1);
        expect(overflow).toBe(false);
        const [fg, bg] = await l.evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]);
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
      expect(await text(p.getByTestId('storyboard-caption'))).not.toBe('');
    });
  }
});

test.describe('FR-166 スタイルの選択', () => {
  const STYLES = ['3D', 'アニメ', 'Geometric 3D', 'Isometric 3D', 'Whimsical 3D'];
  // FR-166 AC-323
  test('FR-166 AC-323 5 つのスタイル名が表示され、既定は Isometric 3D、ほかを選ぶとそのスタイル名で再生される', async ({ page, start }) => {
    await start();
    await setup(page, [UC_A]);
    const group = page.getByTestId('usecase-editor').getByRole('radiogroup', { name: 'スタイル' });
    for (const s of STYLES) await expect(group.getByRole('radio', { name: s, exact: true })).toBeVisible();
    expect(await group.getByRole('radio').count()).toBe(5);
    let p = await play(page, UC_A.name);
    await expect(p.getByTestId('storyboard-style-name')).toHaveText('Isometric 3D');
    await page.keyboard.press('Escape');
    await group.getByRole('radio', { name: 'Whimsical 3D', exact: true }).check();
    p = await play(page, UC_A.name);
    await expect(p.getByTestId('storyboard-style-name')).toHaveText('Whimsical 3D');
  });

  // FR-166 AC-324
  test('FR-166 AC-324 選んだスタイルが開き直しで復元される', async ({ page, start }) => {
    const app = await start();
    await setup(page, [UC_A]);
    await page.getByRole('radiogroup', { name: 'スタイル' }).getByRole('radio', { name: 'アニメ', exact: true }).check();
    await page.reload();
    await reloadAndEnter(page, '合成株式会社S');
    void app;
    await page.getByRole('region', { name: '企業 合成株式会社S' }).getByRole('link', { name: 'SB案件1' }).click();
    await goBackToUseCases(page);
    await expect(page.getByRole('radiogroup', { name: 'スタイル' }).getByRole('radio', { name: 'アニメ', exact: true })).toBeChecked();
    const p = await play(page, UC_A.name);
    await expect(p.getByTestId('storyboard-style-name')).toHaveText('アニメ');
  });
  test('FR-166 AC-324 WebGL が使えない環境（異常系）では 2D のアニメの表現で再生され、理由が表示され、字幕とテロップは欠けない', async ({ page, start }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      (HTMLCanvasElement.prototype as any).getContext = function (type: string, ...a: unknown[]) {
        if (/webgl/i.test(type)) return null;
        return (orig as any).call(this, type, ...a);
      };
    });
    await start();
    await setup(page, [UC_A]);
    const p = await play(page, UC_A.name);
    await expect(p.getByTestId('storyboard-style-notice')).toContainText('2D');
    await expect(p.getByTestId('storyboard-caption')).toBeVisible();
    await expect(p.getByTestId('storyboard-telop')).toBeVisible();
  });
});

test.describe('FR-167 設定画面と字幕の読み上げ（音声はモック）', () => {
  const SPEECH = { endpoint: SPEECH_URL, key: 'mock-key-not-secret' };
  async function enableSpeech(page: Page): Promise<void> {
    const box = await openSpeechSettings(page);
    const sw = box.getByRole('switch', { name: '字幕の読み上げ' });
    if (!(await sw.isChecked())) await sw.click();
    await page.getByRole('button', { name: 'ミュート', pressed: true }).click().catch(() => undefined);
  }
  async function toUseCases(page: Page): Promise<void> {
    await page.getByTestId('nav-canvas').click().catch(() => undefined);
    await page.getByTestId('stepper').getByRole('button', { name: 'ユースケース作成' }).click();
  }

  // FR-167 AC-325
  test('FR-167 AC-325 モック接続で「設定済み」と表示され、音声を有効にして再生すると各シーンの字幕と同じ文言が要求として送られ、送信が画面に表示される', async ({ page, start }) => {
    const sent = await mockSpeech(page, 'ok');
    await start({ speech: SPEECH });
    await setup(page, [UC_A]);
    const box = await openSpeechSettings(page);
    await expect(box.getByTestId('speech-status')).toHaveText('設定済み');
    await enableSpeech(page);
    await toUseCases(page);
    const p = await play(page, UC_A.name);
    await page.keyboard.press('p');
    const caps: string[] = [];
    for (let i = 0; i < UC_A.steps.length; i++) {
      caps.push(await text(p.getByTestId('storyboard-caption')));
      if (i < UC_A.steps.length - 1) await page.keyboard.press('ArrowRight');
    }
    await expect(p.getByTestId('speech-sending-notice')).toBeVisible();
    await expect.poll(() => sent.length).toBeGreaterThanOrEqual(UC_A.steps.length);
    for (const c of caps) expect(sent.join('\n')).toContain(c);
  });

  // FR-167 AC-326
  for (const mode of ['fail', 'timeout'] as const) {
    test(`FR-167 AC-326 モックが ${mode} を返しても再生は字幕だけで最後まで進み、原因と直し方が表示される`, async ({ page, start }) => {
      test.setTimeout(120_000);
      await mockSpeech(page, mode);
      await start({ speech: SPEECH });
      await setup(page, [UC_A]);
      await enableSpeech(page);
      await toUseCases(page);
      const p = await play(page, UC_A.name);
      await expect(p.getByTestId('speech-error')).toBeVisible({ timeout: 30_000 });
      await expect(p.getByTestId('speech-error')).toContainText(/原因|直し方|確認/);
      await expect(p).toHaveAttribute('data-storyboard-state', 'ended', { timeout: 60_000 });
      await expect(p.getByTestId('storyboard-caption')).toBeVisible();
    });
  }
  test('FR-167 AC-326 接続先が未設定のとき、再生は字幕だけで進み、原因と直し方が表示される', async ({ page, start }) => {
    const sent = await mockSpeech(page, 'ok');
    await start();
    await setup(page, [UC_A]);
    const box = await openSpeechSettings(page);
    await expect(box.getByTestId('speech-status')).toHaveText('未設定');
    await enableSpeech(page);
    await toUseCases(page);
    const p = await play(page, UC_A.name);
    await expect(p.getByTestId('speech-error')).toBeVisible();
    await expect(p.getByTestId('storyboard-caption')).toBeVisible();
    expect(sent.length).toBe(0);
  });
  test('FR-167 AC-326 オフラインでも再生は字幕だけで進み、原因と直し方が表示される', async ({ page, start, context }) => {
    await mockSpeech(page, 'ok');
    await start({ speech: SPEECH });
    await setup(page, [UC_A]);
    await enableSpeech(page);
    await toUseCases(page);
    await context.setOffline(true);
    const p = await play(page, UC_A.name);
    await expect(p.getByTestId('speech-error')).toBeVisible({ timeout: 30_000 });
    await expect(p.getByTestId('storyboard-caption')).toBeVisible();
    await context.setOffline(false);
  });
  test('FR-167 AC-326 ミュートのまま（既定）のときは読み上げの要求が送られない', async ({ page, start }) => {
    const sent = await mockSpeech(page, 'ok');
    await start({ speech: SPEECH });
    await setup(page, [UC_A]);
    const p = await play(page, UC_A.name);
    await page.keyboard.press('p');
    for (let i = 0; i < UC_A.steps.length - 1; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1_000);
    expect(sent.length).toBe(0);
    await expect(p.getByTestId('speech-sending-notice')).toBeHidden();
  });

  // FR-167 AC-328
  test('FR-167 AC-328 設定画面（音声設定）はキーボードだけで開いて読み上げを切り替えられ、状態が文字で示され、名前を持つ', async ({ page, start }) => {
    await start({ speech: SPEECH });
    await openNewProject(page);
    await page.getByTestId('nav-settings').focus();
    await page.keyboard.press('Enter');
    const box = page.getByRole('region', { name: '音声設定' });
    await expect(box).toBeVisible();
    await expect(box.getByTestId('speech-status')).toHaveText(/設定済み|未設定/);
    const sw = box.getByRole('switch', { name: '字幕の読み上げ' });
    await sw.focus();
    const before = await sw.isChecked();
    await page.keyboard.press('Space');
    expect(await sw.isChecked()).toBe(!before);
    await page.keyboard.press('Space');
    expect(await sw.isChecked()).toBe(before);
    for (const c of await box.getByRole('switch').all()) expect(await c.getAttribute('aria-label') ?? await text(c)).not.toBe('');
  });
  test('FR-167 AC-328 接続先が未設定のとき（異常系）の状態とエラーが文字で示される', async ({ page, start }) => {
    await start();
    await openNewProject(page);
    const box = await openSpeechSettings(page);
    await expect(box.getByTestId('speech-status')).toHaveText('未設定');
    const sw = box.getByRole('switch', { name: '字幕の読み上げ' });
    await sw.focus();
    await page.keyboard.press('Space');
    await expect(box.getByRole('alert')).toContainText(/未設定|設定/);
  });
});

void hook;
