// 生成AIの共通接続（FR-275）の差し替え部品つきの中継と、設定画面での接続先の選択・実接続の有効化の共通の操作。
// FR-275 AC-773（上部の AI の状態表示）・FR-290 AC-775（生成 AI によるストーリーの作成）が使う。CONTRACT.md §31。
// 中継は実物（scripts/relay/relay.ts の startRelay）をこのプロセスの中で起動し、外部への口だけを差し替える:
//   - GitHub Copilot SDK: `sdk`（status はサインイン済み、complete は呼ばれた入力を記録して決まった文章を返す）
//   - Microsoft Foundry: `foundryFetch`（呼ばれた URL・本文を記録し、Responses API 形式 `{ output_text }` で決まった文章を返す）
// 実 GitHub・実 Foundry・実 gh には接続しない。データフォルダーは一時フォルダー（環境変数 EDB_RELAY_DATA）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, openScreen, settingsDialog, closeSettings } from './fixtures';
import { unusedPort } from './server';
import { startRelay } from '../../../scripts/relay/relay';

export const GENAI_DUMMY_KEY = 'dummy-foundry-key-st-genai-0000';
export const GENAI_ENDPOINT = 'https://st-genai.services.ai.azure.com/openai/v1';

export interface GenaiCall { url?: string; body: string }

export interface GenaiStubOptions {
  /** Copilot SDK の差し替え部品が返す文章 */
  copilotText?: string;
  /** Foundry の差し替え部品が返す文章（Responses API の output_text） */
  foundryText?: string;
  /** 応答までの待ち時間（作成中の表示を確かめるため） */
  delayMs?: number;
}

export interface GenaiRelay {
  url: string;
  copilotCalls: GenaiCall[];
  foundryCalls: GenaiCall[];
  /** 共通接続の Foundry の接続情報（ダミーのキー）を中継に保存する */
  saveFoundryConfig(): Promise<void>;
  close(): Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startGenaiRelay(opts: GenaiStubOptions = {}): Promise<GenaiRelay> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-genai-'));
  const prevData = process.env.EDB_RELAY_DATA;
  process.env.EDB_RELAY_DATA = dataDir;
  const delay = opts.delayMs ?? 0;
  const copilotCalls: GenaiCall[] = [];
  const foundryCalls: GenaiCall[] = [];
  const sdk = {
    status: async () => ({ signedIn: true }),
    complete: async (_kind: string, prompt: string) => {
      copilotCalls.push({ body: String(prompt) });
      if (delay) await sleep(delay);
      return opts.copilotText ?? '差し替え部品（GitHub Copilot SDK）の応答です。';
    },
  };
  const foundryFetch = (async (input: unknown, init?: { body?: unknown }) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input);
    foundryCalls.push({ url, body: typeof init?.body === 'string' ? init.body : String(init?.body ?? '') });
    if (delay) await sleep(delay);
    return new Response(JSON.stringify({ output_text: opts.foundryText ?? '差し替え部品（Microsoft Foundry）の応答です。' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  const port = await unusedPort();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const relay = await startRelay({ sdk, port, foundryFetch } as any);
  return {
    url: relay.url,
    copilotCalls,
    foundryCalls,
    saveFoundryConfig: async () => {
      const r = await fetch(`${relay.url}/foundry/config`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: GENAI_ENDPOINT, deployment: 'st-genai-deploy', key: GENAI_DUMMY_KEY }),
      });
      expect(r.status, 'Foundry の接続情報を中継に保存できない').toBe(200);
    },
    close: async () => {
      await relay.close().catch(() => undefined);
      if (prevData === undefined) delete process.env.EDB_RELAY_DATA;
      else process.env.EDB_RELAY_DATA = prevData;
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** 画面上部の AI の状態表示のうち、生成AIの接続先と実接続の状態（FR-275 AC-773。CONTRACT.md §31） */
export function aiProviderStatus(page: Page): Locator {
  return page.getByTestId('ai-status').getByTestId('ai-provider-status');
}

/** 設定の「生成AIの接続先」（AC-769）で接続先を選ぶ。設定は開いたまま返す */
export async function chooseProvider(page: Page, provider: 'foundry' | 'copilot'): Promise<Locator> {
  const settings = await openScreen(page, 'settings');
  const group = settings.getByRole('radiogroup', { name: '生成AIの接続先' });
  const radio = group.getByRole('radio', { name: provider === 'foundry' ? /Microsoft Foundry/ : /GitHub Copilot SDK/ });
  if (!(await radio.isChecked())) await radio.check();
  await expect(radio).toBeChecked();
  return settings;
}

/**
 * 共通接続の実接続を有効にする（設定の switch「実接続を有効にする」→ 費用・送信内容の確認 → 有効）。
 * 了承の記録（recordExportConsent）と接続情報は先にそろえておく。終わると設定を閉じる。
 */
export async function enableCommonConnection(page: Page): Promise<void> {
  const settings = await openScreen(page, 'settings');
  const sw = settings.getByRole('switch', { name: '実接続を有効にする', exact: true }).filter({ visible: true }).first();
  await expect(sw, '共通接続の実接続の switch がない').toBeVisible();
  if (!(await sw.isChecked())) {
    await sw.click();
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog').filter({ hasText: /有料|費用/ }).filter({ hasNotText: '生成AIの接続先' })).last();
    await confirm.getByRole('button', { name: /有効にする|同意|続行/ }).first().click();
  }
  await expect(sw, '共通接続の実接続が有効にならない').toBeChecked();
  await expect(settingsDialog(page)).toBeVisible();
  await closeSettings(page);
}
