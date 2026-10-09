// System Test: 非機能（性能・環境・オフライン・言語・アクセシビリティ・代替表示・ドラッグ以外の操作・通信の限定・表示の明示）
// 期待値は要求定義書の受入基準（docs/requirements/quality.md）と PARAM（§3.3）から決める。
import AxeBuilder from '@axe-core/playwright';
import type { Page, Locator } from '@playwright/test';
import { test, expect, openScreen, component, entity, hook, scene, MAIN_SCREENS, captureDownload, selectPersona, setEditMode } from '../support/fixtures';
import { examplePack } from '../support/packs';
import { startRelayStub } from '../support/relay-stub';

const mono = examplePack('mono');
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

test.describe('NFR-PERF-003 初回表示', () => {
  // NFR-PERF-003 AC-163
  test('NFR-PERF-003 AC-163 ページの読み込み開始からオープニングの最初の表示までが 3 秒以内 @perf', async ({ page, start }) => {
    await page.addInitScript(() => {
      const w = window as any;
      const check = () => {
        const el = document.querySelector('[data-testid="opening"]') as HTMLElement | null;
        if (el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden') {
          requestAnimationFrame(() => { w.__stOpeningShownAt ??= performance.now(); });
          return true;
        }
        return false;
      };
      new MutationObserver(() => { if (w.__stOpeningShownAt === undefined) check(); }).observe(document, { subtree: true, childList: true, attributes: true });
    });
    await start({ skipOpening: false });
    await expect(page.getByTestId('opening')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__stOpeningShownAt)).toBeDefined();
    const ms = await page.evaluate(() => (window as any).__stOpeningShownAt as number);
    test.info().annotations.push({ type: 'opening-ms', description: ms.toFixed(0) });
    expect(ms, `オープニングの最初の表示まで ${ms.toFixed(0)}ms`).toBeLessThanOrEqual(3_000);
  });
});

test.describe('NFR-ENV-001 ブラウザー', () => {
  // NFR-ENV-001 AC-165（canary: 主要な流れ）
  test('NFR-ENV-001 AC-165 Chromium でお手本パックの主要画面を巡るスモークテストがページエラー 0 件', async ({ page, start, pageErrors }) => {
    await start();
    await expect(page).toHaveTitle(new RegExp(mono.customerName));
    for (const [key, name] of MAIN_SCREENS) {
      const c = await openScreen(page, key);
      await expect(c, name).toBeVisible();
      await expect(c.getByRole('heading').first(), `${name} に見出しがない`).toBeVisible();
    }
    expect(pageErrors).toEqual([]);
  });
});

test.describe('NFR-ENV-002 外部サーバーなし・オフライン', () => {
  // NFR-ENV-002 AC-167
  test('NFR-ENV-002 AC-167 localhost 以外への通信を遮断しても、主要画面・3D・音声・エクスポートでページエラーと失敗した通信が 0 件', async ({ page, start, pageErrors, failedRequests, context }) => {
    const blocked: string[] = [];
    await context.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.protocol.startsWith('http') && !LOOPBACK.has(u.hostname)) {
        blocked.push(u.href);
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    const app = await start();
    for (const [key] of MAIN_SCREENS) await openScreen(page, key);
    await openScreen(page, 'view3d');
    await page.waitForTimeout(1_000);
    // 音声の再生
    await page.mouse.move(300, 300);
    await page.getByTestId('show-control-bar').getByRole('button', { name: /ミュート/ }).first().click();
    await page.mouse.click(400, 300);
    await page.waitForTimeout(1_000);
    // エクスポート
    await page.keyboard.press('Control+Shift+E');
    const dlg = page.getByRole('dialog', { name: /エクスポート/ });
    await captureDownload(page, () => dlg.getByRole('button', { name: 'エクスポート', exact: true }).click());
    expect(blocked, '外部への通信を試みた').toEqual([]);
    // 標準の検証条件では中継プロセスが未接続（§3.5）。その接続の確認の失敗だけは「未接続」の条件そのものなので数えない（CONTRACT.md §5）
    expect(failedRequests.filter((f) => !f.includes(app.relayUrl)), '失敗した通信').toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

test.describe('NFR-L10N-001 日本語', () => {
  const ALLOWED = [
    'Microsoft', 'Copilot', 'Azure', 'Fluent', 'Power', 'BI', 'Teams', 'Dynamics', 'Fabric', 'GitHub', 'WorkIQ', 'Web', 'AI', 'ROI', 'KPI', 'PDF', 'ZIP', 'JSON', 'CSV',
    'Markdown', 'Mermaid', 'SVG', 'PNG', 'WebM', 'WebGL2', 'WebGPU', 'FPS', 'fps', '2D', '3D', '2.5D', 'AsIs', 'ToBe', 'Light', 'Dark', 'Low', 'Medium', 'High', 'Ultra',
    'Executive', 'Showcase', 'Entertainment', 'IT', 'LOGO', 'Before', 'After', 'TOP5', 'BGM', 'RAG', 'Engagement', 'Project', 'Ctrl', 'Shift', 'Alt', 'Cmd', 'Esc', 'Enter',
    'Tab', 'M', 'P', 'F', 'E', 'H', 'S', 'K', 'Z', 'Y', 'A3', 'A4', '16:9', 'C4', 'Capability', 'Map', 'URL', 'ID', 'md', 'zip',
  ];
  // NFR-L10N-001 AC-168
  test('NFR-L10N-001 AC-168 文書の言語属性が ja で、主要画面のボタン・メニュー・見出しの文言が日本語', async ({ page, start }) => {
    await start();
    await expect(page.locator('html')).toHaveAttribute('lang', /^ja/);
    const proper = new Set<string>([
      ...ALLOWED,
      ...[mono.customerName, mono.projectName, ...mono.products().map((p) => p.name), ...mono.entities().map((e) => e.name)].flatMap((s) => String(s).split(/[\s/・]+/)),
    ]);
    const bad: string[] = [];
    for (const [key, name] of MAIN_SCREENS) {
      const c = await openScreen(page, key);
      const texts = await c.locator('button, [role="button"], [role="menuitem"], [role="tab"], h1, h2, h3, h4, [role="heading"]').evaluateAll((els) =>
        els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim()).filter(Boolean),
      );
      for (const t of texts) {
        if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(t)) continue;
        const words = t.split(/[\s/+()（）:：×,、.\-–—|>›]+/).filter((w) => /[A-Za-z]/.test(w));
        if (words.some((w) => !proper.has(w))) bad.push(`${name}: ${t}`);
      }
    }
    expect(bad, '日本語でない文言').toEqual([]);
  });
});

test.describe('NFR-A11Y-001 WCAG 2.2 AA・キーボード', () => {
  // NFR-A11Y-001 AC-169
  test('NFR-A11Y-001 AC-169 主要画面それぞれに WCAG 2.2 A/AA の自動検査をかけると違反が 0 件', async ({ page, start }) => {
    await start();
    for (const [key, name] of MAIN_SCREENS) {
      await openScreen(page, key);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']).analyze();
      const v = r.violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
      expect(v, `${name} のアクセシビリティ違反`).toEqual([]);
    }
  });

  // NFR-A11Y-001 AC-170
  test('NFR-A11Y-001 AC-170 主要画面の操作要素すべてに Tab で到達でき、フォーカスが見え、罠がなく、ナレーションに字幕が出る', async ({ page, start }) => {
    test.setTimeout(240_000);
    await start();
    for (const [key, name] of MAIN_SCREENS) {
      const c = await openScreen(page, key);
      const total = await c.evaluate((root) => {
        const sel = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="slider"], [role="tab"][aria-selected="true"], [role="treeitem"][tabindex="0"]';
        const els = [...root.querySelectorAll(sel)].filter((e) => {
          const h = e as HTMLElement;
          return h.offsetParent !== null && !(h as HTMLButtonElement).disabled && h.getAttribute('aria-hidden') !== 'true' && !h.closest('[inert]');
        });
        els.forEach((e, i) => e.setAttribute('data-st-focus', String(i)));
        return els.length;
      });
      expect(total, `${name} に操作要素がない`).toBeGreaterThan(0);
      await page.getByTestId(`nav-${key}`).focus();
      const visited = new Set<string>();
      let left = 0;
      let noRing: string[] = [];
      for (let i = 0; i < total * 3 + 60; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const a = document.activeElement as HTMLElement | null;
          if (!a) return null;
          const s = getComputedStyle(a);
          const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
          return { id: a.getAttribute('data-st-focus'), ring, label: (a.getAttribute('aria-label') || a.textContent || a.tagName).trim().slice(0, 30) };
        });
        if (!info) continue;
        if (info.id !== null) {
          visited.add(info.id);
          if (!info.ring) noRing.push(info.label);
          left = 0;
        } else left++;
        if (visited.size === total && left > 0) break;
      }
      expect(visited.size, `${name}: Tab で到達できない要素がある（${visited.size}/${total}）`).toBe(total);
      expect(left, `${name}: フォーカスがコンポーネントの外に出ない（キーボードの罠）`).toBeGreaterThan(0);
      noRing = [...new Set(noRing)];
      expect(noRing, `${name}: フォーカスの位置が見えない要素`).toEqual([]);
    }
    // 音声を伴う演出（ナビゲーター）の字幕
    const idx = mono.topics().findIndex((t) => (t.topic.narration ?? '') !== '');
    await page.getByRole('button', { name: 'プレゼンテーションを開始' }).click();
    for (let i = 0; i < idx; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('subtitles')).not.toBeEmpty({ timeout: 15_000 });
  });
});

test.describe('NFR-A11Y-003 視覚的な表現の代替', () => {
  type Shown = { ids: string[] };
  const shown: Record<string, (page: Page, c: Locator) => Promise<Shown>> = {
    view3d: async (page) => ({ ids: (await scene.objects(page)).filter((o) => o.visible).map((o) => o.entityId) }),
    map: async (page) => ({ ids: (await hook<Array<{ entityId: string }>>(page, 't.map.markers()')).map((m) => m.entityId) }),
    'knowledge-graph': async (page) => ({ ids: (await hook<Array<{ id: string; visible: boolean }>>(page, 't.graph.nodes()')).filter((n) => n.visible).map((n) => n.id) }),
    matrix: async (_p, c) => ({ ids: await c.locator('[data-entity-id]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-entity-id')!))]) }),
  };
  const all = () => [...mono.issues(), ...mono.solutions(), ...mono.products(), ...mono.entities()];
  // NFR-A11Y-003 AC-173
  test('NFR-A11Y-003 AC-173 3D・地図・ナレッジグラフ・2×2 で「表で見る」を選ぶと同じ件数・同じ値の表が出て、表の選択が元の表現でも選択される', async ({ page, start }) => {
    await start();
    for (const key of Object.keys(shown)) {
      const c = await openScreen(page, key);
      const s = await shown[key](page, c);
      expect(s.ids.length, `${key} に表示中の項目がない`).toBeGreaterThan(0);
      await c.getByRole('button', { name: '表で見る' }).click();
      const t = c.getByRole('table').or(c.getByRole('grid')).first();
      await expect(t).toBeVisible();
      const rows = t.locator('[role="row"][data-entity-id], tr[data-entity-id]');
      await expect(rows, key).toHaveCount(s.ids.length);
      const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-entity-id')!));
      expect(ids.sort()).toEqual([...s.ids].sort());
      for (const id of ids.slice(0, 5)) {
        const e = all().find((x) => x.id === id);
        if (e) await expect(rows.filter({ has: page.locator(`[data-entity-id="${id}"]`) }).or(t.locator(`[data-entity-id="${id}"]`)).first()).toContainText(e.title ?? e.name);
      }
      const pick = ids[0];
      await t.locator(`[data-entity-id="${pick}"]`).first().click();
      await c.getByRole('button', { name: /元の表示|表を閉じる|戻る/ }).click();
      if (key === 'view3d') await expect.poll(async () => (await scene.objects(page)).find((o) => o.entityId === pick)?.highlighted).toBe(true);
      else if (key === 'map') await expect.poll(async () => (await hook<Array<{ entityId: string; selected: boolean }>>(page, 't.map.markers()')).find((m) => m.entityId === pick)?.selected).toBe(true);
      else if (key === 'knowledge-graph') await expect.poll(async () => (await hook<Array<{ id: string; selected: boolean }>>(page, 't.graph.nodes()')).find((n) => n.id === pick)?.selected).toBe(true);
      else await expect(entity(c, pick).first()).toHaveAttribute('data-highlight', /selected/);
    }
  });
});

test.describe('NFR-A11Y-004 ドラッグ以外の操作', () => {
  // NFR-A11Y-004 AC-174
  test('NFR-A11Y-004 AC-174 ドラッグを使わずに、コンポーネントの移動と大きさ、カードの配置、重み、ノードの移動ができる', async ({ page, start }) => {
    await start();
    await selectPersona(page, '事業部門');
    // 移動（メニュー）
    const gantt = component(page, 'gantt');
    const g0 = (await gantt.boundingBox())!;
    await gantt.getByTestId('component-menu').click();
    await page.getByRole('menuitem', { name: '上へ移動' }).click();
    await expect.poll(async () => Math.round((await gantt.boundingBox())!.y)).not.toBe(Math.round(g0.y));
    // 大きさ（キーボード）
    const sep = page.getByRole('separator').first();
    await sep.focus();
    const v0 = await sep.getAttribute('aria-valuenow');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => sep.getAttribute('aria-valuenow')).not.toBe(v0);
    // カードの配置（メニュー）
    const issue = mono.issues()[0];
    const view = await openScreen(page, 'issue-solution');
    await entity(view, issue.id).first().focus();
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'ボードに配置' }).click();
    await openScreen(page, 'whiteboard');
    const items = await hook<any>(page, 't.board.state()');
    expect(items.boards.flatMap((b: any) => b.items).some((i: any) => i.type === 'card' && i.sourceEntityId === issue.id)).toBe(true);
    // 重み（数値入力）
    const pr = await openScreen(page, 'priority');
    const num = pr.getByRole('spinbutton', { name: /の重み$/ }).first();
    const w0 = await num.inputValue();
    await num.fill(String(Number(w0) === 1 ? 2 : 1));
    await num.press('Enter');
    await expect(pr.getByRole('slider', { name: /の重み$/ }).first()).toHaveAttribute('aria-valuenow', String(Number(w0) === 1 ? 2 : 1));
    // ノードの移動（キーボード: フォーカスしたノードを Alt+矢印キー）
    await setEditMode(page, true);
    const g = await openScreen(page, 'knowledge-graph');
    const node = entity(g, issue.id).first();
    await node.focus();
    const before = (await hook<Array<{ id: string; x: number; y: number }>>(page, 't.graph.nodes()')).find((n) => n.id === issue.id)!;
    for (let i = 0; i < 5; i++) await page.keyboard.press('Alt+ArrowRight');
    const after = (await hook<Array<{ id: string; x: number; y: number }>>(page, 't.graph.nodes()')).find((n) => n.id === issue.id)!;
    expect(after.x, 'キーボードでノードが動かない').not.toBe(before.x);
  });
});

test.describe('NFR-SEC-002 外部への通信の限定と明示', () => {
  // NFR-SEC-002 AC-176
  test('NFR-SEC-002 AC-176 接続済みの差し替え部品で質問すると送信中の表示が出て、送信内容を画面で確認でき、通信先は localhost だけ', async ({ page, start }) => {
    const relay = await startRelayStub({ delayMs: 2_000, sourceIds: [mono.sources()[0].id] });
    const hosts = new Set<string>();
    page.on('request', (r) => { const u = new URL(r.url()); if (u.protocol.startsWith('http')) hosts.add(u.hostname); });
    try {
      await start({ relayUrl: relay.url });
      // FR-132: 明示的に有効にするまではモック
      await expect(page.getByTestId('ai-status')).toContainText('AI: モック');
      const settings = await openScreen(page, 'settings');
      await settings.getByRole('switch', { name: /実接続/ }).click();
      const confirm = page.getByRole('alertdialog');
      await expect(confirm).toContainText(/顧客名|議論|顧客パック/);
      await confirm.getByRole('button', { name: /有効にする|確認/ }).click();
      await expect(page.getByTestId('ai-status')).toContainText('接続済み');
      const chat = await openScreen(page, 'chat');
      const q = '送信内容の確認ST-176';
      await chat.getByRole('textbox', { name: /質問/ }).fill(q);
      await chat.getByRole('button', { name: '送信' }).click();
      await expect(page.getByTestId('sending-indicator')).toBeVisible();
      await expect(page.getByTestId('sending-indicator')).toContainText(/送信中/);
      await page.getByTestId('sending-indicator').getByRole('button', { name: /送信内容/ }).click();
      await expect(page.getByTestId('sent-content')).toContainText(q);
      await expect(chat.getByTestId('chat-answer').last()).toContainText('差し替え部品の回答です。', { timeout: 15_000 });
      expect(relay.received.some((r) => r.body.includes(q))).toBe(true);
      expect([...hosts].filter((h) => !LOOPBACK.has(h)), 'localhost 以外への通信').toEqual([]);
    } finally {
      await relay.close();
    }
  });
});

test.describe('NFR-LEGAL-002 サンプル・AI 生成・モックの明示', () => {
  // NFR-LEGAL-002 AC-180
  test('NFR-LEGAL-002 AC-180 主要画面に「サンプル」、AI の回答・サマリー・ツリーに「AI 生成」、ミニ・モックアプリに「モック（イメージ）」', async ({ page, start }) => {
    await start();
    for (const [key, name] of MAIN_SCREENS) {
      const c = await openScreen(page, key);
      await expect(c.getByText('サンプル').first(), name).toBeVisible();
    }
    const chat = await openScreen(page, 'chat');
    await chat.getByRole('textbox', { name: /質問/ }).fill('概要を教えて');
    await chat.getByRole('button', { name: '送信' }).click();
    await expect(chat.getByTestId('chat-answer').last()).toContainText('AI 生成');
    await expect((await openScreen(page, 'priority')).getByTestId('executive-summary')).toContainText('AI 生成');
    // ツリー
    const view = await openScreen(page, 'issue-solution');
    await entity(view, mono.issues()[0].id).first().click();
    await page.getByRole('button', { name: '議論テーマにする' }).click();
    const themes = await openScreen(page, 'themes');
    await themes.getByRole('button', { name: 'ツリーを生成' }).click();
    const tree = component(page, 'discussion-tree');
    await expect(tree.getByRole('treeitem').nth(1)).toContainText('AI 生成', { timeout: 15_000 });
    // モック
    const sol = mono.solutions().find((s) => mono.mocks().some((m) => m.solutionId === s.id))!;
    await entity(await openScreen(page, 'issue-solution'), sol.id).first().click();
    await expect(await openScreen(page, 'mock-app')).toContainText('モック（イメージ）');
  });
});
