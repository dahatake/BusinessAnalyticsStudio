// System Test: チャットの Microsoft Foundry 送信（FR-286 AC-741〜AC-747）
// 期待値は要求定義書の受入基準だけから決める。画面の探し方は CONTRACT.md §26。
// Foundry は差し替え部品の中継（support/relay-stub.ts の startChatFoundryStub。POST /foundry/ask）。本物は呼ばない。
import type { Page, Locator } from '@playwright/test';
import { test, expect, openScreen, closeSettings, recordExportConsent, continuePersonConfirm, settingsDialog } from '../support/fixtures';
import { startChatFoundryStub } from '../support/relay-stub';
import type { ChatFoundryAskMode } from '../support/relay-stub';
import { examplePack } from '../support/packs';

const mono = examplePack('mono');
const HISTORY_PAIRS = 5; // PARAM-123
const marker = (i: number) => `QMARKER${String(i).padStart(2, '0')}X`;
const amarker = (i: number) => `AMARKER${String(i).padStart(2, '0')}X`;

async function chatScreen(page: Page): Promise<Locator> {
  return openScreen(page, 'chat');
}

/** 質問を送る。種別「人」の確認が出たら続行する（FR-219。了承の記録は済み） */
async function ask(page: Page, chat: Locator, text: string, wait = true): Promise<void> {
  await chat.getByRole('textbox', { name: /質問/ }).fill(text);
  await chat.getByRole('button', { name: '送信' }).click();
  if (wait) await continuePersonConfirm(page, () => false, 1000);
}

// AC-741〜743・745〜747 は検証レベル=integration（System Test の台帳では blocked）。差し替え部品での挙動の見本として残し、FR286_IT=1 のときだけ実行する。AC-744（system）は常に実行する。
const itOnly = !process.env.FR286_IT;

test.describe('FR-286 チャットの Foundry 送信', () => {
  // FR-286 AC-741
  test('FR-286 AC-741 設定・有効・了承がそろうと、質問は /foundry/ask へ 1 回だけ送られ、Copilot の中継は 0 回で、回答が表示される', async ({ page, start }) => {
    test.skip(itOnly, 'integration の AC。FR286_IT=1 で実行');
    const relay = await startChatFoundryStub({ foundry: 'ready' });
    try {
      await start({ relayUrl: relay.url });
      await recordExportConsent(page);
      const chat = await chatScreen(page);
      await ask(page, chat, `${marker(1)} ${mono.issues()[0].title} の解決策は？`);
      await expect(chat.getByTestId('chat-answer').last()).toContainText(amarker(1));
      expect(relay.foundryAskBodies().length, 'Foundry の呼び出しが 1 回でない').toBe(1);
      expect(relay.copilotAskCount(), 'Copilot の中継を呼んだ').toBe(0);
    } finally {
      await relay.close();
    }
  });

  // FR-286 AC-741（異常系: 条件が欠ける）
  for (const c of [
    { label: '未設定', foundry: 'not-configured' as const, consent: true },
    { label: '無効', foundry: 'disabled' as const, consent: true },
    { label: '了承なし', foundry: 'ready' as const, consent: false },
  ]) {
    test(`FR-286 AC-741 異常系: ${c.label}のときは Foundry を呼ばず、従来どおり（Copilot の中継またはモック）で答える`, async ({ page, start }) => {
    test.skip(itOnly, 'integration の AC。FR286_IT=1 で実行');
      const relay = await startChatFoundryStub({ foundry: c.foundry });
      try {
        await start({ relayUrl: relay.url });
        if (c.consent) await recordExportConsent(page);
        const chat = await chatScreen(page);
        await ask(page, chat, `${marker(1)} ${mono.issues()[0].title} の解決策は？`);
        const answer = chat.getByTestId('chat-answer').last();
        await expect(answer).toBeVisible();
        await expect(answer).not.toContainText(amarker(1));
        expect(relay.foundryAskBodies().length, 'Foundry を呼んだ').toBe(0);
      } finally {
        await relay.close();
      }
    });
  }

  // FR-286 AC-742
  test('FR-286 AC-742 2 ターン目以降の Foundry への入力に、直近の会話（PARAM-123 組）が時系列で含まれ、それより古い組は含まれない', async ({ page, start }) => {
    test.skip(itOnly, 'integration の AC。FR286_IT=1 で実行');
    const relay = await startChatFoundryStub();
    try {
      await start({ relayUrl: relay.url });
      await recordExportConsent(page);
      const chat = await chatScreen(page);
      const turns = HISTORY_PAIRS + 2;
      for (let i = 1; i <= turns; i++) {
        await ask(page, chat, `${marker(i)} ${mono.issues()[0].title} について教えて`);
        await expect(chat.getByTestId('chat-answer').last()).toContainText(amarker(i));
      }
      const bodies = relay.foundryAskBodies();
      expect(bodies.length).toBe(turns);
      // 1 ターン目: 履歴なし
      expect(bodies[0]).toContain(marker(1));
      expect(bodies[0]).not.toContain(amarker(1));
      // 最後のターン: 直近の組だけが時系列で入り、古い組は入らない
      const last = bodies[turns - 1];
      const firstKept = turns - HISTORY_PAIRS;
      for (let i = firstKept; i < turns; i++) {
        expect(last, `直近の組 ${i} がない`).toContain(marker(i));
        expect(last).toContain(amarker(i));
      }
      for (let i = 1; i < firstKept; i++) {
        expect(last, `古い組 ${i} が含まれる`).not.toContain(marker(i));
        expect(last).not.toContain(amarker(i));
      }
      const order = Array.from({ length: HISTORY_PAIRS }, (_, k) => last.indexOf(marker(firstKept + k)));
      expect([...order].sort((a, b) => a - b), '時系列でない').toEqual(order);
      expect(last).toContain(marker(turns));
    } finally {
      await relay.close();
    }
  });

  // FR-286 AC-742（入力が上限を超えるとき）
  test('FR-286 AC-742 入力が上限（PARAM-114 トークン）を超えるときは、古い履歴から落とされ、切り詰めた旨が画面に表示される', async ({ page, start }) => {
    test.skip(itOnly, 'integration の AC。FR286_IT=1 で実行');
    const relay = await startChatFoundryStub();
    try {
      await start({ relayUrl: relay.url });
      await recordExportConsent(page);
      const chat = await chatScreen(page);
      const filler = '長い前置きの文章です。'.repeat(500);
      for (let i = 1; i <= 3; i++) {
        await ask(page, chat, `${marker(i)} ${filler}`);
        await expect(chat.getByTestId('chat-answer').last()).toContainText(amarker(i));
      }
      await ask(page, chat, `${marker(4)} 要点を教えて`);
      await expect(chat.getByTestId('chat-answer').last()).toContainText(amarker(4));
      const last = relay.foundryAskBodies()[3];
      expect(last).toContain(marker(4));
      expect(last, '最も古い履歴が落とされていない').not.toContain(marker(1));
      await expect(chat.getByTestId('chat-trim-notice')).toBeVisible();
      await expect(chat.getByTestId('chat-trim-notice')).toContainText(/切り詰|古い履歴|省略/);
    } finally {
      await relay.close();
    }
  });

  // FR-286 AC-743
  test('FR-286 AC-743 Foundry への入力に顧客パックの根拠が含まれ、回答に根拠にした出典カードが 1 件以上と「AI 生成」が付き、根拠にない出典のカードは付かない', async ({ page, start }) => {
    test.skip(itOnly, 'integration の AC。FR286_IT=1 で実行');
    const relay = await startChatFoundryStub();
    try {
      await start({ relayUrl: relay.url });
      await recordExportConsent(page);
      const chat = await chatScreen(page);
      await ask(page, chat, `${mono.issues()[0].title} の解決策は？`);
      const answer = chat.getByTestId('chat-answer').last();
      await expect(answer).toContainText(amarker(1));
      await expect(answer).toContainText('AI 生成');
      await expect(answer).toContainText(/Foundry/);
      const sent = relay.foundryAskBodies()[0];
      expect(sent, '質問に近い顧客パックの項目が入力にない').toContain(mono.issues()[0].title);
      const cards = answer.getByTestId('source-card');
      expect(await cards.count()).toBeGreaterThanOrEqual(1);
      const titles = mono.sources().map((s) => s.title);
      for (const t of await cards.allInnerTexts()) {
        const hit = titles.find((x) => t.includes(x));
        expect(hit, `出典カード「${t}」が顧客パックの出典にない`).toBeTruthy();
        // 根拠として入力に添えた出典のカードだけが付く
        expect(sent, `根拠にしていない出典「${hit}」のカードが付いた`).toContain(hit!);
      }
    } finally {
      await relay.close();
    }
  });

  // FR-286 AC-743（異常系: 顧客パックにない話題）
  test('FR-286 AC-743 異常系: 顧客パックにない話題では、パックにない項目は根拠として示されない', async ({ page, start }) => {
    test.skip(itOnly, 'integration の AC。FR286_IT=1 で実行');
    const relay = await startChatFoundryStub();
    try {
      await start({ relayUrl: relay.url });
      await recordExportConsent(page);
      const chat = await chatScreen(page);
      await ask(page, chat, 'ｚｑｘ存在しない語９９ について教えて');
      const answer = chat.getByTestId('chat-answer').last();
      await expect(answer).toContainText(amarker(1));
      const titles = mono.sources().map((s) => s.title);
      for (const t of await answer.getByTestId('source-card').allInnerTexts()) {
        expect(titles.some((x) => t.includes(x)), `パックにない出典「${t}」のカード`).toBe(true);
      }
      const sent = relay.foundryAskBodies()[0];
      for (const c of await answer.getByTestId('source-card').allInnerTexts()) {
        const hit = titles.find((x) => c.includes(x))!;
        expect(sent).toContain(hit);
      }
    } finally {
      await relay.close();
    }
  });

  // FR-286 AC-744
  test('FR-286 AC-744 標準の検証条件（Foundry 未設定。モック）で、送信中の表示・「送信内容を確認」・「新しい会話」が従来どおり動く', async ({ page, start }) => {
    await start({ aiMockDelayMs: 800 });
    const chat = await chatScreen(page);
    await chat.getByRole('textbox', { name: /質問/ }).fill(`${mono.issues()[0].title} の解決策は？`);
    // 「送信内容を確認」
    await chat.getByRole('button', { name: /送信内容を確認/ }).click();
    const preview = page.getByTestId('chat-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(mono.issues()[0].title);
    await page.keyboard.press('Escape');
    // 送信中の表示
    await chat.getByRole('button', { name: '送信' }).click();
    await expect(chat.getByTestId('chat-sending')).toBeVisible();
    const answer = chat.getByTestId('chat-answer').last();
    await expect(answer).toContainText('AI 生成（モック）');
    await expect(chat.getByTestId('chat-sending')).toBeHidden();
    expect(await answer.getByTestId('source-card').count()).toBeGreaterThanOrEqual(1);
    // 「新しい会話」で履歴が消える
    await chat.getByRole('button', { name: '新しい会話' }).click();
    await expect(chat.getByTestId('chat-answer')).toHaveCount(0);
  });

  // FR-286 AC-745
  test('FR-286 AC-745 送信中は進行の表示があり二重に送信できず、「送信内容を確認」に質問・履歴・根拠が出てキーの値は出ない', async ({ page, start }) => {
    test.skip(itOnly, 'integration の AC。FR286_IT=1 で実行');
    const relay = await startChatFoundryStub({ delayMs: 1200 });
    try {
      await start({ relayUrl: relay.url });
      await recordExportConsent(page);
      const chat = await chatScreen(page);
      await ask(page, chat, `${marker(1)} ${mono.issues()[0].title} について`, false);
      await expect(chat.getByTestId('chat-sending')).toBeVisible();
      await expect(chat.getByRole('button', { name: '送信' })).toBeDisabled();
      await continuePersonConfirm(page, () => false, 1000);
      await expect(chat.getByTestId('chat-answer').last()).toContainText(amarker(1));
      expect(relay.foundryAskBodies().length, '二重に送信された').toBe(1);

      // 2 ターン目の前に確認: 送る質問・渡す履歴・添える根拠
      await chat.getByRole('textbox', { name: /質問/ }).fill(`${marker(2)} 続きを教えて`);
      await chat.getByRole('button', { name: /送信内容を確認/ }).click();
      const preview = page.getByTestId('chat-preview');
      await expect(preview).toBeVisible();
      await expect(preview).toContainText(marker(2));
      await expect(preview).toContainText(marker(1));
      await expect(preview).toContainText(amarker(1));
      await expect(preview).toContainText(mono.issues()[0].title);
      await expect(preview).not.toContainText(/dummy-key|sk-[A-Za-z0-9]{16,}|0000$/);
      await page.keyboard.press('Escape');

      // 「新しい会話」: 表示中の履歴が消え、次の入力に前の会話が含まれない
      await chat.getByRole('button', { name: '新しい会話' }).click();
      await expect(chat.getByTestId('chat-answer')).toHaveCount(0);
      await ask(page, chat, `${marker(3)} あらためて教えて`);
      await expect(chat.getByTestId('chat-answer').last()).toBeVisible();
      const bodies = relay.foundryAskBodies();
      const last = bodies[bodies.length - 1];
      expect(last).toContain(marker(3));
      expect(last).not.toContain(marker(1));
      expect(last).not.toContain(amarker(1));
    } finally {
      await relay.close();
    }
  });

  // FR-286 AC-746
  const FAILS: Array<{ mode: ChatFoundryAskMode; label: string; text: RegExp }> = [
    { mode: 'timeout', label: 'timeout', text: /タイムアウト/ },
    { mode: 'error', label: 'error', text: /エラー/ },
    { mode: 'person-unconfirmed', label: '未確認（FR-219）', text: /確認/ },
    { mode: 'consent', label: '了承なし', text: /了承/ },
  ];
  for (const c of FAILS) {
    test(`FR-286 AC-746 異常系: Foundry が「${c.label}」を返すと、理由が表示され、Copilot・モックへ切り替えず、利用者の操作で再送信できる`, async ({ page, start }) => {
    test.skip(itOnly, 'integration の AC。FR286_IT=1 で実行');
      const relay = await startChatFoundryStub({ askMode: c.mode });
      try {
        await start({ relayUrl: relay.url });
        await recordExportConsent(page);
        const chat = await chatScreen(page);
        await ask(page, chat, `${marker(1)} ${mono.issues()[0].title} の解決策は？`);
        const notice = chat.getByTestId('chat-error');
        await expect(notice).toBeVisible();
        await expect(notice).toContainText(c.text);
        await expect(chat.getByTestId('chat-answer').filter({ hasText: /モック|Copilot 差し替え/ })).toHaveCount(0);
        expect(relay.copilotAskCount(), 'Copilot の中継へ切り替えた').toBe(0);
        expect(relay.foundryAskBodies().length, '自動の再送信をした').toBe(1);
        await expect(page.locator('body')).not.toContainText(/dummy-key|sk-[A-Za-z0-9]{16,}/);
        // 再送信は利用者の操作で行える
        relay.setAskMode('ok');
        await chat.getByRole('button', { name: /再送信|もう一度|再試行/ }).or(chat.getByRole('button', { name: '送信' })).first().click();
        await continuePersonConfirm(page, () => false, 1000);
        await expect(chat.getByTestId('chat-answer').last()).toContainText(/AMARKER\d+X/);
        expect(relay.foundryAskBodies().length).toBe(2);
      } finally {
        await relay.close();
      }
    });
  }

  // FR-286 AC-746（中継プロセスの停止）
  test('FR-286 AC-746 異常系: 中継プロセスが停止しているときは、その旨の理由が表示され、モックの回答は表示されない', async ({ page, start }) => {
    test.skip(itOnly, 'integration の AC。FR286_IT=1 で実行');
    const relay = await startChatFoundryStub();
    await start({ relayUrl: relay.url });
    await recordExportConsent(page);
    const chat = await chatScreen(page);
    await relay.close();
    await ask(page, chat, `${marker(1)} ${mono.issues()[0].title} の解決策は？`);
    const notice = chat.getByTestId('chat-error');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/中継/);
    await expect(chat.getByTestId('chat-answer').filter({ hasText: /AI 生成（モック）/ })).toHaveCount(0);
  });

  // FR-286 AC-747
  test('FR-286 AC-747 1 日の回数の上限に達した後の質問は、Foundry を呼ばず理由が表示され、呼び出しは回数に数えられ、記録に質問・回答の文章を含まない', async ({ page, start }) => {
    test.skip(itOnly, 'integration の AC。FR286_IT=1 で実行');
    const relay = await startChatFoundryStub();
    try {
      await start({ relayUrl: relay.url });
      await recordExportConsent(page);
      // 上限を 1 回にする（下げる変更は確認なし）
      const settings = await openScreen(page, 'settings');
      const usage = settings.getByTestId('ai-usage');
      await usage.getByLabel(/1 日.*(上限|回数)|(上限|回数).*1 日/).first().fill('1');
      await usage.getByRole('button', { name: /保存|適用/ }).first().click();
      await closeSettings(page);

      const chat = await chatScreen(page);
      await ask(page, chat, `${marker(1)} ${mono.issues()[0].title} の解決策は？`);
      await expect(chat.getByTestId('chat-answer').last()).toContainText(amarker(1));
      expect(relay.foundryAskBodies().length).toBe(1);

      // 上限に達した後
      await ask(page, chat, `${marker(2)} 続きを教えて`);
      const notice = chat.getByTestId('chat-error');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(/上限|停止|予算/);
      expect(relay.foundryAskBodies().length, '上限後に Foundry を呼んだ').toBe(1);
      expect(relay.copilotAskCount()).toBe(0);

      // 利用量の記録: 回数に数えられ、質問・回答の文章・キーは入らない
      await openScreen(page, 'settings');
      const u = settingsDialog(page).getByTestId('ai-usage');
      await expect(u).toContainText(/1\s*(\/|／|回)/);
      const text = await u.innerText();
      expect(text).not.toContain(marker(1));
      expect(text).not.toContain(amarker(1));
      expect(text).not.toMatch(/dummy-key|sk-[A-Za-z0-9]{16,}/);
    } finally {
      await relay.close();
    }
  });

  // FR-286 AC-747（失敗した呼び出しも数える）
  test('FR-286 AC-747 失敗した Foundry 呼び出しも回数に数えられる（上限 1 回の後は呼ばれない）', async ({ page, start }) => {
    test.skip(itOnly, 'integration の AC。FR286_IT=1 で実行');
    const relay = await startChatFoundryStub({ askMode: 'error' });
    try {
      await start({ relayUrl: relay.url });
      await recordExportConsent(page);
      const settings = await openScreen(page, 'settings');
      const usage = settings.getByTestId('ai-usage');
      await usage.getByLabel(/1 日.*(上限|回数)|(上限|回数).*1 日/).first().fill('1');
      await usage.getByRole('button', { name: /保存|適用/ }).first().click();
      await closeSettings(page);
      const chat = await chatScreen(page);
      await ask(page, chat, `${marker(1)} 教えて`);
      await expect(chat.getByTestId('chat-error')).toBeVisible();
      relay.setAskMode('ok');
      await ask(page, chat, `${marker(2)} もう一度`);
      await expect(chat.getByTestId('chat-error')).toContainText(/上限|停止|予算/);
      expect(relay.foundryAskBodies().length, '失敗した呼び出しが回数に数えられていない').toBe(1);
    } finally {
      await relay.close();
    }
  });
});

