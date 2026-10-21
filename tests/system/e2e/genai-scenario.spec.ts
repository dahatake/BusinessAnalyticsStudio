// System Test: 生成AIの効果的な活用シナリオの分析の画面（FR-284 AC-733）と Foundry 実接続の切替・失敗時の代替（FR-285 AC-739）
// 期待値は要求定義書の受入基準（docs/requirements/app-core.md）だけから決める。外部サービスは呼ばない（Foundry は差し替え部品）。
// API キーの値はどこにも書かない。画面の探し方は tests/system/CONTRACT.md §25（実装はこれに合わせる）。
import { test, expect } from '../support/fixtures';
import { openScreen, closeSettings, recordExportConsent, continuePersonConfirm, component } from '../support/fixtures';
import { startFoundryRelayStub, startRelayStub } from '../support/relay-stub';
import type { FoundryStubMode, RelayStub } from '../support/relay-stub';
import type { Page, Locator } from '@playwright/test';

const SCREEN_NAME = '生成AIの効果的な活用シナリオの分析';
const SCREEN_KEY = 'genai-scenario';

async function registerCompany(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '企業を登録' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: '企業名' }).fill(name);
  await dlg.getByRole('button', { name: '登録' }).click();
  await expect(dlg).toBeHidden();
}

async function openNewProject(page: Page, company: string, name: string): Promise<void> {
  await registerCompany(page, company);
  await page.getByRole('region', { name: `企業 ${company}` }).getByRole('button', { name: 'Project を作成' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: 'Project 名' }).fill(name);
  await dlg.getByRole('button', { name: '作成' }).click();
  await expect(dlg).toBeHidden();
  await page.getByRole('region', { name: `企業 ${company}` }).getByRole('link', { name }).click();
  await expect(page.getByTestId('stepper')).toBeVisible();
}

/** 分析の処理（中継プロセスへの分析要求）の回数。/health などの状態確認は数えない */
function analyzeCalls(relay: RelayStub): number {
  return relay.received.filter((r) => r.path === '/foundry/analyze').length;
}

function screenOf(page: Page): Locator {
  return component(page, SCREEN_KEY);
}

test.describe('FR-284 生成AIの効果的な活用シナリオの分析（画面）', () => {
  // FR-284 AC-733
  test('FR-284 AC-733 左メニューに画面が出て、開くと [分析実行] と入力欄がある。開いた直後・入力した直後は実行されず、押したときだけ実行される', async ({ page, start }) => {
    const relay = await startFoundryRelayStub('ok');
    try {
      await start({ relayUrl: relay.url });
      await openNewProject(page, '合成株式会社A', 'Project A');

      const nav = page.getByRole('navigation', { name: '画面', exact: true });
      await expect(nav.getByTestId(`nav-${SCREEN_KEY}`)).toBeVisible();
      await expect(nav.getByTestId(`nav-${SCREEN_KEY}`)).toContainText(SCREEN_NAME);

      await openScreen(page, SCREEN_KEY);
      const screen = screenOf(page);
      await expect(screen.getByRole('button', { name: '分析実行' })).toBeVisible();
      const input = screen.getByRole('textbox', { name: /解決策/ });
      await expect(input).toBeVisible();

      // 開いた直後: 実行されない（結果なし・呼び出し 0 回）
      await page.waitForTimeout(500);
      await expect(screen.getByRole('region', { name: '分析結果' })).toHaveCount(0);
      expect(analyzeCalls(relay), '開いただけで分析が実行された').toBe(0);

      // 入力した直後: 実行されない
      await input.fill('問い合わせメールの大量の文章を要約し、担当部署へ振り分ける。');
      await page.waitForTimeout(500);
      await expect(screen.getByRole('region', { name: '分析結果' })).toHaveCount(0);
      expect(analyzeCalls(relay), '入力しただけで分析が実行された').toBe(0);

      // [分析実行] を押したときだけ結果が出る（既定はモック: 外部への分析要求は 0 回）
      await screen.getByRole('button', { name: '分析実行' }).click();
      await expect(screen.getByRole('region', { name: '分析結果' })).toBeVisible();
      expect(analyzeCalls(relay), '既定（実接続なし）で外部への分析要求が送られた').toBe(0);
    } finally {
      await relay.close();
    }
  });

  // FR-284 AC-733（異常系: 画面の入口が複数の画面を開いても、押さない限り結果は出ない）
  test('FR-284 AC-733 ほかの画面へ移って戻っても、[分析実行] を押すまで結果は出ず実行もされない', async ({ page, start }) => {
    const relay = await startFoundryRelayStub('ok');
    try {
      await start({ relayUrl: relay.url });
      await openNewProject(page, '合成株式会社A', 'Project A');
      await openScreen(page, SCREEN_KEY);
      await screenOf(page).getByRole('textbox', { name: /解決策/ }).fill('毎月の請求金額を計算する。');
      await openScreen(page, 'canvas');
      await openScreen(page, SCREEN_KEY);
      await expect(screenOf(page).getByRole('region', { name: '分析結果' })).toHaveCount(0);
      expect(analyzeCalls(relay)).toBe(0);
    } finally {
      await relay.close();
    }
  });
});

test.describe('FR-285 Foundry 実接続の切替と失敗時の代替（差し替え部品）', () => {
  /** 実接続を有効にする（設定の画面。了承の記録 → 有効化の確認）。キーは差し替え部品の /health が「設定済み」を返すことで表す */
  async function enableRealConnection(page: Page): Promise<void> {
    await recordExportConsent(page);
    const settings = await openScreen(page, 'settings');
    const region = settings.getByRole('region', { name: '生成AIの活用分析の接続' });
    await region.getByRole('switch', { name: '実接続を有効にする' }).click();
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog').filter({ hasText: /有料/ })).last();
    await confirm.getByRole('button', { name: /有効にする|同意|続行/ }).click();
    await expect(region.getByRole('switch', { name: '実接続を有効にする' })).toBeChecked();
    await closeSettings(page);
  }

  // FR-285 AC-739（設定画面の表示）
  test('FR-285 AC-739 設定画面に、有料サービスの旨・送信される情報の種類・実接続の有効化（既定は無効）が出て、キーの値は出ない', async ({ page, start }) => {
    const relay = await startFoundryRelayStub('ok');
    try {
      await start({ relayUrl: relay.url });
      const settings = await openScreen(page, 'settings');
      const region = settings.getByRole('region', { name: '生成AIの活用分析の接続' });
      await expect(region).toBeVisible();
      await expect(region).toContainText(/有料/);
      await expect(region).toContainText(/費用/);
      await expect(region).toContainText(/送信/);
      await expect(region).toContainText(/解決策/);
      await expect(region).toContainText(/課題/);
      const sw = region.getByRole('switch', { name: '実接続を有効にする' });
      await expect(sw).toBeVisible();
      await expect(sw).not.toBeChecked();
      // 既定のエンドポイントとデプロイ名が見え、変更できる（FR-285）
      await expect(region.getByRole('textbox', { name: 'エンドポイント' })).toHaveValue('https://GraphcRecordingPanel.services.ai.azure.com/openai/v1');
      await expect(region.getByRole('textbox', { name: 'デプロイ名' })).toHaveValue('gpt-chat-latest');
      // キーの値は出さない（入力欄・表示・ページ全体）。環境変数名だけの説明は許す
      await expect(region.getByRole('textbox', { name: /キー/ })).toHaveCount(0);
      const html = await page.content();
      expect(html).not.toMatch(/FOUNDRY_API_KEY\s*[=:]\s*\S{8,}/);
      expect(html).not.toMatch(/\bsk-[A-Za-z0-9]{16,}/);
    } finally {
      await relay.close();
    }
  });

  const CAUSES: Array<{ mode: FoundryStubMode; label: string; text: RegExp }> = [
    { mode: 'key-missing', label: 'キー未設定', text: /キー.*(未設定|設定されていません)/ },
    { mode: 'unreachable', label: '接続不可', text: /接続(できません|できない|不可|に失敗)/ },
    { mode: 'timeout', label: 'タイムアウト', text: /タイムアウト|60\s*秒/ },
    { mode: 'upstream-status', label: '非 2xx', text: /(ステータス|HTTP|エラー応答).*(500|非\s*2xx|2xx)|500/ },
  ];

  // FR-285 AC-739（異常系: 原因ごと）
  for (const c of CAUSES) {
    test(`FR-285 AC-739 差し替え部品が「${c.label}」を返すと、原因が分かる文言と FR-284 のルールベースの結果が代替で表示される`, async ({ page, start }) => {
      const relay = await startFoundryRelayStub(c.mode);
      try {
        await start({ relayUrl: relay.url });
        await openNewProject(page, '合成株式会社A', 'Project A');
        await enableRealConnection(page);
        await openScreen(page, SCREEN_KEY);
        const screen = screenOf(page);
        await screen.getByRole('textbox', { name: /解決策/ }).fill('問い合わせメールの大量の文章を要約し、担当部署へ振り分ける。');
        await screen.getByRole('button', { name: '分析実行' }).click();
        // 種別「人」の確認が出たら続行する（FR-219。了承の記録は済み）
        await continuePersonConfirm(page, () => false, 1500);

        const notice = screen.getByRole('alert');
        await expect(notice).toBeVisible();
        await expect(notice).toContainText(c.text);
        // 代替のルールベースの結果（結論・判断基準・代替案）が出る
        const result = screen.getByRole('region', { name: '分析結果' });
        await expect(result).toBeVisible();
        await expect(result).toContainText(/適する|条件付き|不要|不向き/);
        await expect(result).toContainText(/代替/);
        expect(analyzeCalls(relay), '実接続の要求が 1 回だけ送られる（自動の再試行なし）').toBe(1);
        // キーの値はどこにも出ない
        const html = await page.content();
        expect(html).not.toMatch(/\bsk-[A-Za-z0-9]{16,}/);
      } finally {
        await relay.close();
      }
    });
  }

  // FR-285 AC-739（原因ごとに文言が違う）
  test('FR-285 AC-739 原因（キー未設定・接続不可・タイムアウト・非 2xx）ごとに表示の文言が異なる', async ({ page, start }) => {
    const seen = new Map<string, string>();
    for (const c of CAUSES) {
      const relay = await startFoundryRelayStub(c.mode);
      try {
        await start({ relayUrl: relay.url });
        await openNewProject(page, `合成株式会社${c.mode}`, 'Project A');
        await enableRealConnection(page);
        await openScreen(page, SCREEN_KEY);
        const screen = screenOf(page);
        await screen.getByRole('textbox', { name: /解決策/ }).fill('毎月の請求金額を計算する。');
        await screen.getByRole('button', { name: '分析実行' }).click();
        await continuePersonConfirm(page, () => false, 1500);
        const notice = screen.getByRole('alert');
        await expect(notice).toBeVisible();
        seen.set(c.mode, ((await notice.innerText()) ?? '').trim());
      } finally {
        await relay.close();
      }
    }
    expect(new Set(seen.values()).size, `原因ごとの文言が同じ: ${JSON.stringify([...seen])}`).toBe(CAUSES.length);
  });

  // FR-285 AC-737（system の画面から見た既定: 実接続なしなら startRelayStub の中継への分析要求も 0 回）
  test('FR-285 AC-739 実接続を有効にしない既定のままでは、失敗の通知は出ず、外部への要求も送られない', async ({ page, start }) => {
    const relay = await startRelayStub();
    try {
      await start({ relayUrl: relay.url });
      await openNewProject(page, '合成株式会社A', 'Project A');
      await openScreen(page, SCREEN_KEY);
      const screen = screenOf(page);
      await screen.getByRole('textbox', { name: /解決策/ }).fill('毎月の請求金額を計算する。');
      await screen.getByRole('button', { name: '分析実行' }).click();
      await expect(screen.getByRole('region', { name: '分析結果' })).toBeVisible();
      await expect(screen.getByRole('alert')).toHaveCount(0);
      expect(relay.received.filter((r) => r.path.startsWith('/foundry'))).toHaveLength(0);
    } finally {
      await relay.close();
    }
  });
});
