// System Test: 生成 AI（Microsoft Foundry）による AI 取り込み（FR-289 AC-757〜760）。
// 期待値は要求定義書の受入基準（docs/requirements/app-core.md）だけから決める。Foundry は呼ばない（中継プロセスの差し替え部品 support/ai-import-stub.ts）。
// API キーはダミー値だけを使う。画面の探し方は tests/system/CONTRACT.md §26（実装はこれに合わせる）。
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Locator } from '@playwright/test';
import { test, expect, openScreen, closeSettings } from '../support/fixtures';
import { startAiImportRelayStub } from '../support/ai-import-stub';
import type { AiImportRelayStub } from '../support/ai-import-stub';
import { TMP_DIR } from '../support/paths';

const COMPANY = '合成株式会社AI';
const PROJECT = 'AI取り込み案件';
const LIMIT_BYTES = 10 * 1024 * 1024; // PARAM-125（10 MB）

async function openNewProject(page: Page): Promise<void> {
  await page.getByRole('button', { name: '企業を登録' }).click();
  let dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: '企業名' }).fill(COMPANY);
  await dlg.getByRole('button', { name: '登録' }).click();
  await expect(dlg).toBeHidden();
  await page.getByRole('region', { name: `企業 ${COMPANY}` }).getByRole('button', { name: 'Project を作成' }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: 'Project 名' }).fill(PROJECT);
  await dlg.getByRole('button', { name: '作成' }).click();
  await expect(dlg).toBeHidden();
  await page.getByRole('region', { name: `企業 ${COMPANY}` }).getByRole('link', { name: PROJECT }).click();
  await expect(page.getByTestId('stepper')).toBeVisible();
  await page.getByTestId('stepper').getByRole('button', { name: 'ユースケース作成' }).click();
  const cand = page.getByTestId('usecase-candidates').getByRole('listitem').first();
  await expect(cand).toBeVisible();
  await cand.getByRole('button', { name: '登録', exact: true }).click();
  await expect(page.getByTestId('usecase-list').getByRole('listitem').first()).toBeVisible();
}

/** 取り込みの画面（データカタログの画面）を開き、AI 取り込みの部品を返す */
async function openImportScreen(page: Page): Promise<{ screen: Locator; ai: Locator }> {
  const screen = await openScreen(page, 'data-catalog');
  return { screen, ai: screen.getByTestId('ai-import') };
}

/** 既存のデータ（エンティティの一覧）の文字を返す。反映前後で変わらないことの確認に使う */
async function existingData(screen: Locator): Promise<string[]> {
  return screen.getByTestId('entity-list').getByRole('listitem').allInnerTexts();
}

function writeFile(name: string, data: Buffer | string): string {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const f = path.join(TMP_DIR, name);
  fs.writeFileSync(f, data);
  return f;
}

async function saveFoundryInSettings(page: Page, key: string): Promise<void> {
  const settings = await openScreen(page, 'settings');
  const foundry = settings.getByTestId('foundry-settings');
  await foundry.getByLabel(/エンドポイント/).fill('https://example.invalid/openai/v1');
  await foundry.getByLabel(/デプロイ名/).fill('dummy-deploy');
  await foundry.getByLabel(/API キー/).fill(key);
  await foundry.getByRole('button', { name: /保存/ }).first().click();
  await expect(foundry.getByText('設定済み').first()).toBeVisible();
  await closeSettings(page);
}

test.describe('FR-289 AI 取り込み（選べる条件）', () => {
  let relay: AiImportRelayStub;
  test.afterEach(async () => { await relay?.close(); });

  // FR-289 AC-757
  test('FR-289 AC-757 Foundry の接続情報が未設定のとき、「AI 取り込み」は選べず（無効）、設定画面で設定する旨の案内が文字で示され、Foundry への送信は 0 回', async ({ page, start }) => {
    relay = await startAiImportRelayStub({ configured: false });
    await start({ relayUrl: relay.url });
    await openNewProject(page);
    const { ai } = await openImportScreen(page);
    await expect(ai).toBeVisible();
    await expect(ai.getByRole('button', { name: 'AI 取り込み' })).toBeDisabled();
    const guide = ai.getByTestId('ai-import-guide');
    await expect(guide).toBeVisible();
    await expect(guide).toContainText(/設定/);
    await expect(guide).toContainText(/Foundry/);
    await expect(guide).toContainText(/接続情報/);
    await page.waitForTimeout(500);
    expect(relay.importCalls(), '未設定なのに Foundry への取り込み要求が送られた').toBe(0);
  });

  // FR-289 AC-757（異常系: 無効のボタンを押す操作をしても、ファイルを選ぶ欄は出ず、送信されない）
  test('FR-289 AC-757 未設定で無効のボタンを強制的に押しても、ファイル選択は出ず送信は 0 回で、案内は残る', async ({ page, start }) => {
    relay = await startAiImportRelayStub({ configured: false });
    await start({ relayUrl: relay.url });
    await openNewProject(page);
    const { ai } = await openImportScreen(page);
    await ai.getByRole('button', { name: 'AI 取り込み' }).click({ force: true }).catch(() => {});
    await expect(ai.getByLabel('AI 取り込みのファイル')).toHaveCount(0);
    await expect(ai.getByTestId('ai-import-guide')).toBeVisible();
    expect(relay.importCalls()).toBe(0);
  });

  // FR-289 AC-758
  test('FR-289 AC-758 設定画面で接続情報を保存すると「AI 取り込み」を選べ、削除すると再び選べず案内が示される', async ({ page, start }) => {
    relay = await startAiImportRelayStub({ configured: false });
    await start({ relayUrl: relay.url });
    await openNewProject(page);
    await saveFoundryInSettings(page, 'dummy-key-for-system-test-0001');
    let { ai } = await openImportScreen(page);
    await expect(ai.getByRole('button', { name: 'AI 取り込み' })).toBeEnabled();
    await expect(ai.getByTestId('ai-import-guide')).toHaveCount(0);

    // 削除 → 再び選べない
    const settings = await openScreen(page, 'settings');
    await settings.getByTestId('foundry-settings').getByRole('button', { name: /削除/ }).first().click();
    await expect(settings.getByTestId('foundry-settings').getByText('設定済み')).toHaveCount(0);
    await closeSettings(page);
    ({ ai } = await openImportScreen(page));
    await expect(ai.getByRole('button', { name: 'AI 取り込み' })).toBeDisabled();
    await expect(ai.getByTestId('ai-import-guide')).toBeVisible();
    expect(relay.importCalls()).toBe(0);
  });
});

test.describe('FR-289 AI 取り込み（プレビュー・上限・失敗・キーの秘匿）', () => {
  let relay: AiImportRelayStub;
  test.afterEach(async () => { await relay?.close(); });

  // FR-289 AC-759
  test('FR-289 AC-759 PDF を AI 取り込みで選ぶとプレビューが示され、確認の操作をするまで既存のデータは変わらず、反映すると変わる', async ({ page, start }) => {
    relay = await startAiImportRelayStub({ configured: true });
    await start({ relayUrl: relay.url });
    await openNewProject(page);
    const { screen, ai } = await openImportScreen(page);
    const before = await existingData(screen);
    await ai.getByRole('button', { name: 'AI 取り込み' }).click();
    await ai.getByLabel('AI 取り込みのファイル').setInputFiles(writeFile('ai-sample.pdf', '%PDF-1.4 synthetic'));
    const preview = ai.getByRole('region', { name: '取り込みのプレビュー' });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('合成AI取り込みエンティティ');
    expect(relay.importCalls()).toBe(1);
    expect(await existingData(screen), '確認前に既存のデータが変わった').toEqual(before);
    await page.waitForTimeout(500);
    expect(await existingData(screen)).toEqual(before);

    await preview.getByRole('button', { name: '反映' }).click();
    await expect(screen.getByTestId('entity-list')).toContainText('合成AI取り込みエンティティ');
  });

  // FR-289 AC-759（異常系: 破棄すると既存のデータは変わらない）
  test('FR-289 AC-759 プレビューを破棄すると既存のデータは変わらない。画像・Office 文書・非定型テキストも同じくプレビューが出る', async ({ page, start }) => {
    relay = await startAiImportRelayStub({ configured: true });
    await start({ relayUrl: relay.url });
    await openNewProject(page);
    const { screen, ai } = await openImportScreen(page);
    const before = await existingData(screen);
    await ai.getByRole('button', { name: 'AI 取り込み' }).click();
    const input = ai.getByLabel('AI 取り込みのファイル');
    const files = [
      writeFile('ai-sample.png', Buffer.from('89504e470d0a1a0a', 'hex')),
      writeFile('ai-sample.docx', 'PK synthetic'),
      writeFile('ai-sample.txt', '合成の議事メモです。'),
    ];
    for (const f of files) {
      await input.setInputFiles(f);
      const preview = ai.getByRole('region', { name: '取り込みのプレビュー' });
      await expect(preview, `${path.basename(f)} のプレビュー`).toBeVisible();
      await preview.getByRole('button', { name: '破棄' }).click();
      await expect(preview).toHaveCount(0);
      expect(await existingData(screen)).toEqual(before);
    }
  });

  // FR-289 AC-759（異常系: 上限超過）
  test('FR-289 AC-759 上限（PARAM-125 の 10 MB）を超えるファイルは Foundry へ送られず、理由が示され、既存のデータは変わらない', async ({ page, start }) => {
    relay = await startAiImportRelayStub({ configured: true });
    await start({ relayUrl: relay.url });
    await openNewProject(page);
    const { screen, ai } = await openImportScreen(page);
    const before = await existingData(screen);
    await ai.getByRole('button', { name: 'AI 取り込み' }).click();
    await ai.getByLabel('AI 取り込みのファイル').setInputFiles(writeFile('ai-too-big.pdf', Buffer.alloc(LIMIT_BYTES + 1, 0x20)));
    const alert = ai.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/10\s*MB/);
    await expect(alert).toContainText(/大き|超/);
    await expect(ai.getByRole('region', { name: '取り込みのプレビュー' })).toHaveCount(0);
    expect(relay.importCalls(), '上限超過のファイルが送られた').toBe(0);
    expect(await existingData(screen)).toEqual(before);
  });

  // FR-289 AC-759（上限ちょうどは送れる）
  test('FR-289 AC-759 上限ちょうど（10 MB）のファイルは送られ、プレビューが示される', async ({ page, start }) => {
    relay = await startAiImportRelayStub({ configured: true });
    await start({ relayUrl: relay.url });
    await openNewProject(page);
    const { ai } = await openImportScreen(page);
    await ai.getByRole('button', { name: 'AI 取り込み' }).click();
    await ai.getByLabel('AI 取り込みのファイル').setInputFiles(writeFile('ai-limit.pdf', Buffer.alloc(LIMIT_BYTES, 0x20)));
    await expect(ai.getByRole('region', { name: '取り込みのプレビュー' })).toBeVisible();
    expect(relay.importCalls()).toBe(1);
  });

  // FR-289 AC-759（異常系: Foundry の応答の失敗）
  test('FR-289 AC-759 Foundry の応答が失敗したとき、原因と次の行動が示され、プレビューは出ず既存のデータは変わらない', async ({ page, start }) => {
    relay = await startAiImportRelayStub({ configured: true, mode: 'upstream-error' });
    await start({ relayUrl: relay.url });
    await openNewProject(page);
    const { screen, ai } = await openImportScreen(page);
    const before = await existingData(screen);
    await ai.getByRole('button', { name: 'AI 取り込み' }).click();
    await ai.getByLabel('AI 取り込みのファイル').setInputFiles(writeFile('ai-fail.pdf', '%PDF-1.4 synthetic'));
    const alert = ai.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/500|失敗|エラー/); // 原因
    await expect(alert).toContainText(/もう一度|再度|確認|設定|試/); // 次の行動
    await expect(ai.getByRole('region', { name: '取り込みのプレビュー' })).toHaveCount(0);
    expect(await existingData(screen)).toEqual(before);
  });

  // FR-289 AC-760
  test('FR-289 AC-760 AI 取り込みの間とその後、API キー（末尾を含む）が画面・ブラウザーへの応答・コンソールに現れず、ブラウザーの通信先は localhost だけ', async ({ page, start }) => {
    const KEY = 'dummy-key-ai-import-ZQ7X4';
    relay = await startAiImportRelayStub({ configured: true, initialKey: KEY });
    const hosts = new Set<string>();
    const consoleTexts: string[] = [];
    const bodies: string[] = [];
    page.on('request', (r) => { try { hosts.add(new URL(r.url()).hostname); } catch { /* data: など */ } });
    page.on('console', (m) => consoleTexts.push(m.text()));
    page.on('pageerror', (e) => consoleTexts.push(String(e)));
    page.on('response', async (res) => {
      if (/\/foundry\/import/.test(res.url())) bodies.push(await res.text().catch(() => ''));
    });
    await start({ relayUrl: relay.url });
    await openNewProject(page);
    const { screen, ai } = await openImportScreen(page);
    await ai.getByRole('button', { name: 'AI 取り込み' }).click();
    await ai.getByLabel('AI 取り込みのファイル').setInputFiles(writeFile('ai-key.pdf', '%PDF-1.4 synthetic'));
    await expect(ai.getByRole('region', { name: '取り込みのプレビュー' })).toBeVisible();
    // 失敗系の文言にも出ない（上限超過の表示）
    await ai.getByLabel('AI 取り込みのファイル').setInputFiles(writeFile('ai-key-big.pdf', Buffer.alloc(LIMIT_BYTES + 1, 0x20)));
    await expect(ai.getByRole('alert')).toBeVisible();

    const tail = KEY.slice(-5);
    const screenText = (await screen.innerText()) + (await page.locator('body').innerText());
    for (const [where, text] of [['画面', screenText], ['応答', bodies.join('\n')], ['コンソール', consoleTexts.join('\n')]] as const) {
      expect(text, `${where}にキーが出た`).not.toContain(KEY);
      expect(text, `${where}にキーの末尾が出た`).not.toContain(tail);
    }
    expect(bodies.length, '取り込み要求の応答を確認できなかった').toBeGreaterThan(0);
    // 取り込み要求の本文（ブラウザー → 中継）にもキーは含まれない
    expect(relay.received.filter((r) => r.path === '/foundry/import').every((r) => !r.body.includes(KEY))).toBe(true);
    for (const h of hosts) expect(['127.0.0.1', 'localhost', '[::1]', '::1', ''], `localhost 以外への通信: ${h}`).toContain(h);
  });
});
