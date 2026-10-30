// System Test: その場での編集・全ビューへの反映・入力検証・元に戻す・インポート/エクスポート・編集モード・議論テーマ・時間のかかる処理
// 期待値は要求定義書の受入基準（app-core.md・quality.md）から決める。
import type { Page, Locator } from '@playwright/test';
import { test, expect, openScreen, component, entity, hook, setEditMode, tableRows, captureDownload, reloadAndEnter } from '../support/fixtures';
import { examplePack } from '../support/packs';

const mono = examplePack('mono');

function cellOf(table: Locator, text: string): Locator {
  return table.getByRole('gridcell').filter({ hasText: text }).first();
}
async function editCell(page: Page, cell: Locator, value: string) {
  await cell.dblclick();
  const input = cell.getByRole('textbox').or(cell.getByRole('spinbutton')).first();
  await expect(input).toBeVisible();
  await input.fill(value);
  const committedAt = Date.now();
  await page.keyboard.press('Enter');
  return committedAt;
}
async function makeTheme(page: Page, issue = mono.issues()[0]) {
  const view = await openScreen(page, 'issue-solution');
  await entity(view, issue.id).first().click();
  await page.getByRole('button', { name: '議論テーマにする' }).click();
  const themes = await openScreen(page, 'themes');
  await expect(themes.getByRole('listitem').filter({ hasText: issue.title })).toHaveCount(1);
  return themes;
}

test.describe('FR-044 その場での編集', () => {
  // FR-044 AC-055
  test('FR-044 AC-055 編集モードでセルの書き換え、詳細パネルからの追加・複製・削除の結果が表に出る', async ({ page, start }) => {
    await start();
    await setEditMode(page, true);
    const table = await openScreen(page, 'table');
    const issue = mono.issues()[0];
    await editCell(page, cellOf(table, issue.title), `${issue.title}（改）`);
    await expect(table).toContainText(`${issue.title}（改）`);
    const n0 = await tableRows(table).count();
    await entity(table, issue.id).first().click();
    const detail = component(page, 'detail');
    await detail.getByRole('button', { name: '複製' }).click();
    await expect(tableRows(table)).toHaveCount(n0 + 1);
    await expect(table.getByRole('row').filter({ hasText: `${issue.title}（改）` })).toHaveCount(2);
    await detail.getByRole('button', { name: '追加' }).click();
    await expect(tableRows(table)).toHaveCount(n0 + 2);
    await entity(table, issue.id).first().click();
    await component(page, 'detail').getByRole('button', { name: '削除' }).click();
    const confirm = page.getByRole('alertdialog');
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: /削除/ }).click();
    await expect(tableRows(table)).toHaveCount(n0 + 1);
    await expect(entity(table, issue.id)).toHaveCount(0);
  });
});

test.describe('FR-045 全ビューへの即時反映', () => {
  // FR-045 AC-056
  test('FR-045 AC-056 課題の改名・連続変更・追加/削除/undoが再読込なく伝播し、ID・選択・出典が保たれる', async ({ page, start }, info) => {
    await start();
    const pr = await openScreen(page, 'priority');
    const ev = await pr.getByTestId('executive-summary').getByTestId('summary-evidence').innerText();
    const issue = mono.issues().find((i) => ev.includes(i.title));
    expect(issue, 'サマリーの根拠に課題名が表示されていない').toBeTruthy();
    const views = ['knowledge-graph', 'issue-solution', 'gantt'];
    for (const v of views) await expect(await openScreen(page, v), `${v} に課題名がない（前提）`).toContainText(issue.title);
    await setEditMode(page, true);
    const table = await openScreen(page, 'table');
    await entity(table, issue.id).first().click();
    const sources = await component(page, 'detail').getByTestId('source-card').allTextContents();
    const renamed = `改名ST-056 ${issue.title}`;
    let navigations = 0;
    // Only a new main document is a reload. Child iframe navigation or a URL/hash
    // change must not masquerade as reloading the application.
    page.on('request', request => {
      if (request.isNavigationRequest() && request.resourceType() === 'document' && request.frame() === page.mainFrame()) navigations++;
    });
    // Measure commit-to-render, not double-click/typing/navigation by the tester.
    const began = await editCell(page, cellOf(table, issue.title), renamed);
    const remaining = () => Math.max(1, 2000 - (Date.now() - began));
    await expect(entity(table, issue.id).first()).toContainText(renamed, { timeout: remaining() });
    // All these panels were opened above. Observe their real retained DOM in
    // parallel; opening tabs serially would charge user-navigation time to rendering.
    await expect.poll(async () => {
      const texts = await Promise.all(views.map(v => component(page, v).allTextContents()));
      const summary = await component(page, 'priority').getByTestId('executive-summary')
        .getByTestId('summary-evidence').allTextContents();
      return [...texts, summary].every(text => text.join(' ').includes(renamed));
    }, { timeout: remaining(), intervals: [16, 32, 50] }).toBe(true);
    const elapsed = Date.now() - began;
    expect(elapsed, '全ビューが同じ最新名になるまでの実測（各assertionの待機時間ではない）').toBeLessThanOrEqual(2000);
    await info.attach('rename-update-ms', { body: String(elapsed), contentType: 'text/plain' });
    for (const v of views) expect(await (await openScreen(page, v)).textContent()).toContain(renamed);
    expect(await (await openScreen(page, 'priority')).getByTestId('executive-summary').getByTestId('summary-evidence').textContent()).toContain(renamed);
    await openScreen(page, 'table');
    await expect(entity(table, issue.id).first()).toHaveAttribute('data-highlight', /selected/);
    expect(await component(page, 'detail').getByTestId('source-card').allTextContents()).toEqual(sources);
    // Consecutive commits must converge on the final name.
    await editCell(page, cellOf(table, renamed), 'ST-056 中間');
    await editCell(page, cellOf(table, 'ST-056 中間'), 'ST-056 最後');
    for (const v of views) {
      const current = await openScreen(page, v);
      await expect(current).toContainText('ST-056 最後', { timeout: 2000 });
      await expect(current).not.toContainText('ST-056 中間');
    }
    // Add via duplicate, delete that new item, then undo. Compare real table IDs,
    // never counts alone (deleting the wrong record must fail).
    await openScreen(page, 'table');
    const ids = await table.locator('[role="row"][data-entity-id]').evaluateAll(els => els.map(el => el.getAttribute('data-entity-id')!));
    await entity(table, issue.id).first().click();
    await component(page, 'detail').getByRole('button', { name: '複製', exact: true }).click();
    const added = await table.locator('[role="row"][data-entity-id]').evaluateAll((els, old) =>
      els.map(el => el.getAttribute('data-entity-id')!).filter(id => !old.includes(id)), ids);
    expect(added).toHaveLength(1);
    await entity(table, added[0]).first().click();
    await component(page, 'detail').getByRole('button', { name: '削除', exact: true }).click();
    const confirmation = page.getByRole('alertdialog');
    if (await confirmation.isVisible()) await confirmation.getByRole('button', { name: /削除/ }).click();
    await expect(entity(table, added[0])).toHaveCount(0, { timeout: 2000 });
    await expect(entity(table, issue.id).first()).toContainText('ST-056 最後');
    await table.click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect(entity(table, added[0]).first()).toContainText('ST-056 最後', { timeout: 2000 });
    // Undo the duplicate. Deleted records must not leak
    // into the graph, and unchanged original identity must survive.
    await page.keyboard.press('Control+z');
    await expect(entity(table, added[0])).toHaveCount(0);
    for (const v of ['knowledge-graph', 'issue-solution']) {
      const current = await openScreen(page, v);
      await expect(entity(current, added[0])).toHaveCount(0);
      await expect(current).toContainText('ST-056 最後');
    }
    expect(navigations, '再読込が起きた').toBe(0);
  });
});

test.describe('FR-046 入力検証・元に戻す・変更履歴・インポート/エクスポート', () => {
  // FR-046 AC-057
  test('FR-046 AC-057 数値の欄に文字を入れると保存されず原因が出て、Ctrl+Z/Ctrl+Y ができ、変更履歴に種別・日時・項目・前後の値が残る', async ({ page, start }) => {
    await start();
    await setEditMode(page, true);
    const table = await openScreen(page, 'table');
    const issue = mono.issues()[0];
    await entity(table, issue.id).first().click();
    const detail = component(page, 'detail');
    const cost = detail.getByTestId('attr-cost').getByRole('spinbutton').or(detail.getByTestId('attr-cost').getByRole('textbox')).first();
    await detail.getByTestId('attr-cost').getByRole('button', { name: '編集' }).click().catch(() => {});
    const before = await cost.inputValue();
    await cost.fill('abc');
    await cost.press('Enter');
    await expect(detail.getByRole('alert').or(page.getByRole('alert')).first()).toContainText(/数値/);
    await page.keyboard.press('Escape');
    await expect(detail.getByTestId('attr-cost').getByTestId('attr-value')).toContainText(before);
    // 正しい値での編集 → 元に戻す → やり直し
    const tcell = cellOf(table, issue.title);
    await editCell(page, tcell, `${issue.title}-Z`);
    await expect(table).toContainText(`${issue.title}-Z`);
    await table.click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect(table).not.toContainText(`${issue.title}-Z`);
    await expect(table).toContainText(issue.title);
    await page.keyboard.press('Control+y');
    await expect(table).toContainText(`${issue.title}-Z`);
    // 変更履歴
    await page.getByRole('button', { name: '変更履歴' }).click();
    const hist = page.getByTestId('change-history');
    const row = hist.getByRole('row').filter({ hasText: `${issue.title}-Z` }).first();
    await expect(row).toContainText('human');
    await expect(row).toContainText(/\d{4}[-/]\d{1,2}[-/]\d{1,2}.*\d{1,2}:\d{2}/);
    await expect(row).toContainText(issue.title);
    await expect(row).toContainText(/名前|タイトル|課題名/);
    await expect(hist.getByRole('row').filter({ hasText: 'abc' })).toHaveCount(0);
  });

  // FR-046 AC-058
  test('FR-046 AC-058 JSON と CSV でエクスポートし、編集後にインポートすると置き換わり、「サンプルに戻す」で初期値に戻る', async ({ page, start }) => {
    await start();
    await setEditMode(page, true);
    const table = await openScreen(page, 'table');
    const issue = mono.issues()[0];
    const exportAs = async (fmt: 'JSON' | 'CSV') => {
      await table.getByRole('button', { name: 'データのエクスポート' }).click();
      return captureDownload(page, () => page.getByRole('menuitem', { name: fmt }).click());
    };
    const json = await exportAs('JSON');
    expect(json.name).toMatch(/\.json$/);
    JSON.parse(json.data.toString('utf8'));
    const csv = await exportAs('CSV');
    expect(csv.name).toMatch(/\.csv$/);
    expect(csv.data.toString('utf8')).toContain(issue.title);
    // 編集してからインポートすると、ファイルの内容に置き換わる
    for (const [file, label] of [[json, 'JSON'], [csv, 'CSV']] as const) {
      await editCell(page, cellOf(table, issue.title), `${issue.title}-一時`);
      await expect(table).toContainText(`${issue.title}-一時`);
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), table.getByRole('button', { name: 'データのインポート' }).click()]);
      await chooser.setFiles({ name: file.name, mimeType: label === 'JSON' ? 'application/json' : 'text/csv', buffer: file.data });
      await page.getByRole('button', { name: /置き換え|インポート|OK/ }).last().click().catch(() => {});
      await expect(table, `${label} のインポート`).not.toContainText(`${issue.title}-一時`);
      await expect(table).toContainText(issue.title);
    }
    // サンプルに戻す
    await editCell(page, cellOf(table, issue.title), `${issue.title}-戻す前`);
    await page.getByRole('button', { name: 'サンプルに戻す' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /戻す|OK|はい/ }).click().catch(() => {});
    await expect(table).not.toContainText(`${issue.title}-戻す前`);
    await expect(table).toContainText(issue.title);
  });

  // FR-046 AC-058（異常系: 不正な行を含む CSV）
  test('FR-046 AC-058 異常系: 不正な行を含む CSV は取り込まれず、行番号と理由が表示される', async ({ page, start }) => {
    await start();
    await setEditMode(page, true);
    const table = await openScreen(page, 'table');
    await table.getByRole('button', { name: 'データのエクスポート' }).click();
    const csv = await captureDownload(page, () => page.getByRole('menuitem', { name: 'CSV' }).click());
    const lines = csv.data.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    expect(lines.length).toBeGreaterThan(2);
    const cols = lines[0].split(',').length;
    // 3 行目（データの 2 行目）を列数の合わない行にし、2 行目の課題名を書き換える
    lines[1] = lines[1].replace(mono.issues()[0].title, `${mono.issues()[0].title}-不正CSV`);
    lines[2] = Array(cols + 3).fill('壊れた値').join(',');
    const bad = Buffer.from(lines.join('\n'), 'utf8');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), table.getByRole('button', { name: 'データのインポート' }).click()]);
    await chooser.setFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: bad });
    const err = page.getByRole('alert').first();
    await expect(err).toContainText(/3\s*行/);
    await expect(err).toContainText(/列|形式|不正/);
    await expect(table).not.toContainText(`${mono.issues()[0].title}-不正CSV`);
  });
});

test.describe('FR-047 編集モード', () => {
  // FR-047 AC-059
  test('FR-047 AC-059 編集モードが OFF のとき、ダブルクリックや Enter で編集状態にならず、追加・削除が無効', async ({ page, start }) => {
    await start();
    await setEditMode(page, false);
    const table = await openScreen(page, 'table');
    const cell = cellOf(table, mono.issues()[0].title);
    await cell.dblclick();
    await expect(cell.getByRole('textbox')).toHaveCount(0);
    await cell.focus();
    await page.keyboard.press('Enter');
    await expect(cell.getByRole('textbox')).toHaveCount(0);
    await entity(table, mono.issues()[0].id).first().click();
    const detail = component(page, 'detail');
    await expect(detail.getByRole('button', { name: '追加' })).toBeDisabled();
    await expect(detail.getByRole('button', { name: '削除' })).toBeDisabled();
    // 既定は OFF（[ASSUMPTION] A-12）
    await page.evaluate(() => localStorage.clear());
    await reloadAndEnter(page);
    await expect(page.getByRole('switch', { name: '編集モード' })).not.toBeChecked();
  });
});

test.describe('FR-048 議論テーマ', () => {
  // FR-048 AC-060
  test('FR-048 AC-060 課題からテーマを作り、名前を編集し、確認の後に削除し、元に戻すで復元できる', async ({ page, start }) => {
    await start();
    await setEditMode(page, true);
    const issue = mono.issues()[0];
    const themes = await makeTheme(page, issue);
    const item = themes.getByRole('listitem').filter({ hasText: issue.title });
    await item.getByRole('button', { name: '名前を編集' }).click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('テーマ改名ST-060');
    await page.keyboard.press('Enter');
    await expect(themes.getByRole('listitem').filter({ hasText: 'テーマ改名ST-060' })).toHaveCount(1);
    const n = await themes.getByRole('listitem').count();
    await themes.getByRole('listitem').filter({ hasText: 'テーマ改名ST-060' }).getByRole('button', { name: '削除' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm, '削除の前に確認がない').toBeVisible();
    // 取り消すと削除されない（異常系）
    await confirm.getByRole('button', { name: /キャンセル/ }).click();
    await expect(themes.getByRole('listitem')).toHaveCount(n);
    await themes.getByRole('listitem').filter({ hasText: 'テーマ改名ST-060' }).getByRole('button', { name: '削除' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /削除/ }).click();
    await expect(themes.getByRole('listitem')).toHaveCount(n - 1);
    await page.getByRole('button', { name: '元に戻す' }).first().click();
    await expect(themes.getByRole('listitem').filter({ hasText: 'テーマ改名ST-060' })).toHaveCount(1);
  });
});

test.describe('FR-049 議論の記録', () => {
  const FIELDS = ['選択肢', '戦略的提言', '根拠', 'コスト/効果', '決定事項', '未決事項'];
  // FR-049 AC-061
  test('FR-049 AC-061 テーマに 7 種類の項目を入力して再読込すると、すべての入力が残る', async ({ page, start }) => {
    const app = await start();
    await setEditMode(page, true);
    const themes = await makeTheme(page);
    for (const f of FIELDS) await themes.getByRole('textbox', { name: f, exact: true }).fill(`${f}の入力ST-061`);
    await themes.getByRole('button', { name: '次のアクションを追加' }).click();
    const act = themes.getByTestId('next-action').last();
    await act.getByRole('textbox', { name: '内容' }).fill('次のアクションST-061');
    await act.getByRole('textbox', { name: '担当' }).fill('担当者ST');
    await act.getByLabel('期限').fill('2026-11-30');
    await act.getByLabel('期限').press('Enter');
    await page.waitForTimeout(500);
    await app.reload();
    const t2 = await openScreen(page, 'themes');
    await t2.getByRole('listitem').filter({ hasText: mono.issues()[0].title }).click();
    for (const f of FIELDS) await expect(t2.getByRole('textbox', { name: f, exact: true })).toHaveValue(`${f}の入力ST-061`);
    const a2 = t2.getByTestId('next-action').filter({ has: page.getByRole('textbox', { name: '内容' }) }).last();
    await expect(a2.getByRole('textbox', { name: '内容' })).toHaveValue('次のアクションST-061');
    await expect(a2.getByRole('textbox', { name: '担当' })).toHaveValue('担当者ST');
    await expect(a2.getByLabel('期限')).toHaveValue(/2026[-/]11[-/]30/);
  });

  // FR-049 AC-061（異常系: 日付でない期限）
  test('FR-049 AC-061 異常系: 次のアクションの期限に日付でない値を入れると保存されず原因が表示される', async ({ page, start }) => {
    const app = await start();
    await setEditMode(page, true);
    const themes = await makeTheme(page);
    await themes.getByRole('button', { name: '次のアクションを追加' }).click();
    const act = themes.getByTestId('next-action').last();
    await act.getByRole('textbox', { name: '内容' }).fill('期限の検証ST');
    const due = act.getByLabel('期限');
    await due.evaluate((el: HTMLInputElement) => { if (el.type === 'date') el.type = 'text'; });
    await due.fill('来週あたり');
    await due.press('Enter');
    await expect(act.getByRole('alert').or(page.getByRole('alert')).first()).toContainText(/日付/);
    await app.reload();
    const t2 = await openScreen(page, 'themes');
    await t2.getByRole('listitem').filter({ hasText: mono.issues()[0].title }).click();
    await expect(t2.getByLabel('期限').filter({ hasText: '来週あたり' })).toHaveCount(0);
    for (const v of await t2.getByLabel('期限').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))) expect(v).not.toBe('来週あたり');
  });
});

test.describe('FR-050 顧客の決定と AI の提案', () => {
  // FR-050 AC-062
  test('FR-050 AC-062 AI 提案のテーマを「決定」にすると「顧客決定」と表示され、AI の提案は別の欄に残り、文字のラベルで区別される', async ({ page, start }) => {
    await start();
    await setEditMode(page, true);
    const themes = await openScreen(page, 'themes');
    await themes.getByRole('button', { name: 'テーマを提案' }).click();
    const proposed = themes.getByRole('listitem').filter({ hasText: 'AI 提案' }).first();
    await expect(proposed).toBeVisible({ timeout: 15_000 });
    await proposed.click();
    const aiText = (await themes.getByTestId('ai-proposal').innerText()).trim();
    expect(aiText.length).toBeGreaterThan(0);
    await themes.getByRole('combobox', { name: '決定ステータス' }).click();
    await page.getByRole('option', { name: '決定' }).click();
    const decided = themes.getByRole('listitem').filter({ hasText: '顧客決定' }).first();
    await expect(decided).toBeVisible();
    await expect(themes.getByTestId('ai-proposal')).toContainText(aiText.slice(0, 20));
    await expect(themes.getByTestId('decision-status')).toContainText('顧客決定');
    await expect(themes.getByTestId('decision-status')).not.toContainText('AI 提案');
  });
});

test.describe('NFR-UX-003 時間のかかる処理', () => {
  // NFR-UX-003 AC-187
  test('NFR-UX-003 AC-187 遅いモックの AI でツリー生成中も進行表示があり、移動と選択ができ、「取り消し」で止まる', async ({ page, start }) => {
    await start({ aiMockDelayMs: 15_000 });
    await setEditMode(page, true);
    const themes = await makeTheme(page);
    const treeBefore = await openScreen(page, 'discussion-tree');
    const decisionsBefore = await treeBefore.locator('[role="treeitem"][data-node-kind="決定事項"]').count();
    await openScreen(page, 'themes');
    await themes.getByRole('button', { name: 'ツリーを生成' }).click();
    const progress = page.getByRole('progressbar', { name: /生成/ }).or(page.getByRole('status').filter({ hasText: /生成中/ })).first();
    await expect(progress).toBeVisible();
    // 支援技術への通知
    const live = page.locator('[aria-live]').filter({ hasText: /生成中/ });
    expect((await live.count()) + (await page.locator('[aria-busy="true"]').count())).toBeGreaterThan(0);
    // その間も操作できる
    await openScreen(page, 'canvas');
    const v0 = await hook<{ x: number; y: number }>(page, 't.canvas.viewport()');
    await component(page, 'canvas').getByTestId('canvas-surface').focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await hook<{ x: number }>(page, 't.canvas.viewport()')).x).not.toBe(v0.x);
    const view = await openScreen(page, 'issue-solution');
    await entity(view, mono.issues()[1].id).first().click();
    await expect(entity(view, mono.issues()[1].id).first()).toHaveAttribute('data-highlight', /selected/);
    // 取り消し
    await page.getByRole('button', { name: '取り消し' }).click();
    await expect(progress).toBeHidden();
    await page.waitForTimeout(16_000);
    const tree = await openScreen(page, 'discussion-tree');
    // 先に出ている議論ツリー（デモ）の決定事項は残るので、取り消した生成結果で増えていないことを比較する
    await expect(tree.locator('[role="treeitem"][data-node-kind="決定事項"]')).toHaveCount(decisionsBefore);
  });
});
