// System Test: 生成AIの接続先の選択（Microsoft Foundry／GitHub Copilot SDK）と、中継プロセスでの保存・再起動後の保持
// 期待値は要求定義書の受入基準（docs/requirements/app-core.md の FR-275 AC-769）だけから決める。
// 画面の探し方と中継の口は CONTRACT.md §30。中継は実物（scripts/relay/relay.ts の startRelay）をこのプロセスの中で起動し、
// Copilot SDK は差し替え部品（未サインイン）を渡す。実 GitHub・実 Foundry・実 gh には接続しない。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect, selectPersona, openScreen, settingsDialog, closeSettings, recordExportConsent } from '../support/fixtures';
import { startGenaiRelay, aiProviderStatus, chooseProvider, enableCommonConnection, GENAI_DUMMY_KEY } from '../support/genai-relay';
import { unusedPort } from '../support/server';
import { startRelay } from '../../../scripts/relay/relay';

const DUMMY_KEY = 'dummy-foundry-key-st-769-0000';
const DUMMY_TOKEN = 'ghp_dummyTokenForSystemTest769xxxxxxxx';

/** Copilot SDK の差し替え部品（未サインイン。呼ばれても外部へ出ない） */
const stubSdk = {
  status: async () => ({ signedIn: false }),
  complete: async () => {
    throw new Error('stub sdk: not available');
  },
};

async function launchRelay(port: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return startRelay({ sdk: stubSdk, port } as any);
}

function providerGroup(scope: Locator): Locator {
  return scope.getByRole('radiogroup', { name: '生成AIの接続先' });
}

function readAllFiles(dir: string): string {
  if (!fs.existsSync(dir)) return '';
  let out = '';
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out += readAllFiles(p);
    else out += fs.readFileSync(p).toString('latin1') + fs.readFileSync(p).toString('utf8');
  }
  return out;
}

async function getProvider(relayUrl: string): Promise<{ status: number; text: string; body: any }> {
  const r = await fetch(`${relayUrl}/ai/provider`);
  const text = await r.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: r.status, text, body };
}

async function openSettings(page: Page): Promise<Locator> {
  await openScreen(page, 'settings');
  return settingsDialog(page);
}

test.describe('FR-275 生成AIの接続先の選択', () => {
  // FR-275 AC-769
  test('FR-275 AC-769 設定画面に「生成AIの接続先」の単一選択が 1 つだけあり既定は Microsoft Foundry、Copilot SDK を選ぶと Copilot の欄、Foundry を選ぶと Foundry の欄が示され、選択は GET・PUT /ai/provider で保存され認証情報を含まず、中継の再起動後も保たれる', async ({ page, start }) => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-ac769-'));
    const prevData = process.env.EDB_RELAY_DATA;
    process.env.EDB_RELAY_DATA = dataDir;
    const port = await unusedPort();
    let relay = await launchRelay(port);
    try {
      // 認証情報（Foundry のダミーのキー）を中継に保存しておく。以後の /ai/provider の応答と保存内容に出てはならない
      const saved = await fetch(`${relay.url}/foundry/config`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: 'https://st-ac769.services.ai.azure.com/openai/v1', deployment: 'st-deploy', key: DUMMY_KEY }),
      });
      expect(saved.status, 'Foundry の接続情報を保存できない').toBe(200);

      // 既定は Microsoft Foundry（中継の口でも）
      const g0 = await getProvider(relay.url);
      expect(g0.status, 'GET /ai/provider が使えない').toBe(200);
      expect(g0.body?.provider, '既定の接続先が Microsoft Foundry でない').toBe('foundry');
      expect(g0.text).not.toContain(DUMMY_KEY);

      await start({ relayUrl: relay.url });
      await selectPersona(page, '事業部門');
      let settings = await openSettings(page);

      // 単一選択が 1 つだけ。選択肢は 2 つで、既定は Microsoft Foundry
      await expect(providerGroup(settings)).toHaveCount(1);
      const group = providerGroup(settings);
      await expect(group.getByRole('radio')).toHaveCount(2);
      const foundryRadio = group.getByRole('radio', { name: /Microsoft Foundry/ });
      const copilotRadio = group.getByRole('radio', { name: /GitHub Copilot SDK/ });
      await expect(foundryRadio).toBeChecked();
      await expect(copilotRadio).not.toBeChecked();
      // Foundry を選んでいるときは Foundry の欄（AC-703）が示される
      await expect(settings.getByTestId('foundry-settings')).toBeVisible();

      // GitHub Copilot SDK を選ぶと Copilot の設定欄（認証方式・サインイン状態・モデル名）が示される
      await copilotRadio.check();
      await expect(copilotRadio).toBeChecked();
      await expect(foundryRadio).not.toBeChecked();
      const copilot = settings.getByTestId('copilot-settings');
      await expect(copilot).toBeVisible();
      await expect(copilot.getByRole('radiogroup', { name: '認証方式' })).toBeVisible();
      await expect(copilot.getByRole('radio', { name: /サインイン/ })).toBeVisible();
      await expect(copilot.getByRole('radio', { name: /トークン/ })).toBeVisible();
      await expect(copilot.getByTestId('copilot-signin-status')).toBeVisible();
      const model = copilot.getByRole('textbox', { name: /モデル名/ });
      await expect(model).toBeVisible();
      // モデル名は任意（空のままでよい）
      await expect(model).toHaveValue('');

      // 選択は中継の GET /ai/provider で取得でき、認証情報を含まない
      await expect.poll(async () => (await getProvider(relay.url)).body?.provider, { message: '選択が中継に保存されない' }).toBe('copilot');
      const g1 = await getProvider(relay.url);
      expect(g1.text).not.toContain(DUMMY_KEY);
      expect(g1.text).not.toContain(DUMMY_TOKEN);

      // 異常系: PUT に認証情報らしき値を混ぜても、応答・取得・保存内容に出ない
      const put = await fetch(`${relay.url}/ai/provider`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'copilot', token: DUMMY_TOKEN, key: DUMMY_KEY }),
      });
      const putText = await put.text();
      expect(putText).not.toContain(DUMMY_TOKEN);
      expect(putText).not.toContain(DUMMY_KEY);
      const g2 = await getProvider(relay.url);
      expect(g2.body?.provider).toBe('copilot');
      expect(g2.text).not.toContain(DUMMY_TOKEN);
      expect(g2.text).not.toContain(DUMMY_KEY);
      const stored = readAllFiles(dataDir);
      expect(stored, '保存内容に Copilot のトークンの値が含まれる').not.toContain(DUMMY_TOKEN);
      expect(stored, '保存内容に Foundry のキーの平文が含まれる').not.toContain(DUMMY_KEY);
      // 画面にも出ない
      await expect(settings).not.toContainText(DUMMY_KEY);
      await expect(settings).not.toContainText(DUMMY_TOKEN);

      // 中継プロセスを再起動しても選択が保たれる（同じデータフォルダー・同じポート）
      await relay.close();
      relay = await launchRelay(port);
      const g3 = await getProvider(relay.url);
      expect(g3.status).toBe(200);
      expect(g3.body?.provider, '中継の再起動後に選択が失われた').toBe('copilot');
      expect(g3.text).not.toContain(DUMMY_KEY);
      expect(g3.text).not.toContain(DUMMY_TOKEN);

      // 画面を開き直しても Copilot SDK が選ばれている
      await start({ relayUrl: relay.url });
      await selectPersona(page, '事業部門');
      settings = await openSettings(page);
      const group2 = providerGroup(settings);
      await expect(group2.getByRole('radio', { name: /GitHub Copilot SDK/ })).toBeChecked();
      await expect(settings.getByTestId('copilot-settings')).toBeVisible();

      // Microsoft Foundry に戻すと Foundry の欄が示され、中継にも保存される
      await group2.getByRole('radio', { name: /Microsoft Foundry/ }).check();
      await expect(settings.getByTestId('foundry-settings')).toBeVisible();
      await expect.poll(async () => (await getProvider(relay.url)).body?.provider).toBe('foundry');

      // ブラウザーの保存領域に認証情報がない
      const storage = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
      expect(storage).not.toContain(DUMMY_KEY);
      expect(storage).not.toContain(DUMMY_TOKEN);
    } finally {
      await relay.close().catch(() => undefined);
      if (prevData === undefined) delete process.env.EDB_RELAY_DATA;
      else process.env.EDB_RELAY_DATA = prevData;
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

// FR-275 AC-773（上部の AI の状態表示に接続先の名前と実接続の状態。差し替え部品は support/genai-relay.ts。CONTRACT.md §31）
test.describe('FR-275 AI の状態表示に生成AIの接続先', () => {
  // FR-275 AC-773（異常系: 実接続が無効・接続先の切替で有効化が解除されたときはモック）
  test('FR-275 AC-773 上部の AI の状態表示に接続先「GitHub Copilot」「Microsoft Foundry」とモックが文字で示され、条件をそろえて有効にするとモックが有効の表示に変わり、接続先を切り替えるとモックに戻り、キー・トークンの値は出ない', async ({ page, start }) => {
    const g = await startGenaiRelay();
    try {
      await g.saveFoundryConfig();
      await start({ relayUrl: g.url });
      const st = aiProviderStatus(page);
      await expect(st, '上部の AI の状態表示に接続先の表示がない').toBeVisible();
      // 既定は Microsoft Foundry で、実接続は無効なのでモック
      await expect(st).toContainText('Microsoft Foundry');
      await expect(st).toContainText('モック');
      // GitHub Copilot SDK を選ぶと「GitHub Copilot」とモック
      await chooseProvider(page, 'copilot');
      await closeSettings(page);
      await expect(st).toContainText('GitHub Copilot');
      await expect(st).not.toContainText('Microsoft Foundry');
      await expect(st).toContainText('モック');
      // Microsoft Foundry に切り替えると「Microsoft Foundry」とモック
      await chooseProvider(page, 'foundry');
      await closeSettings(page);
      await expect(st).toContainText('Microsoft Foundry');
      await expect(st).not.toContainText('GitHub Copilot');
      await expect(st).toContainText('モック');
      // AC-706 の条件（了承・接続情報・有効化と確認）をそろえて有効にすると、モックの表示が有効の表示に変わる
      await recordExportConsent(page);
      await enableCommonConnection(page);
      await expect(st).toContainText('Microsoft Foundry');
      await expect(st, '実接続を有効にしてもモックのまま').not.toContainText('モック');
      await expect(st).toContainText(/有効|接続済み/);
      // 異常系: 接続先を切り替えると有効化が解除され（FR-275）、モックに戻る。再び有効にすると有効の表示
      await chooseProvider(page, 'copilot');
      await closeSettings(page);
      await expect(st).toContainText('GitHub Copilot');
      await expect(st, '接続先の切替の後もモックにならない').toContainText('モック');
      await enableCommonConnection(page);
      await expect(st).toContainText('GitHub Copilot');
      await expect(st).not.toContainText('モック');
      // どの表示にもキー・トークンの値が含まれない
      expect(await page.locator('body').innerText()).not.toContain(GENAI_DUMMY_KEY);
      expect(await page.content()).not.toContain(GENAI_DUMMY_KEY);
    } finally {
      await g.close();
    }
  });
});
