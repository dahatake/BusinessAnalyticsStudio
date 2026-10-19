// System Test: 連動（絞り込み・ホバー・URL・キーボード）と分析ビュー（ナレッジグラフ・課題-解決策・優先順位・アーキテクチャ・サマリー・議論ツリー・モック）
// 期待値は要求定義書の受入基準と、お手本パックの内容から決める。
import fs from 'node:fs';
import { createRequire } from 'node:module';
import type { Page, Locator } from '@playwright/test';
import { test, expect, openScreen, component, entity, hook, countBadge, captureDownload, setEditMode, tableRows, gotoAndEnter } from '../support/fixtures';
import { examplePack } from '../support/packs';

const require = createRequire(import.meta.url);
const mono = examplePack('mono');

async function selectedIds(scope: Page | Locator): Promise<string[]> {
  const loc = scope.locator('[data-highlight~="selected"][data-entity-id]');
  return [...new Set(await loc.evaluateAll((els) => els.map((e) => e.getAttribute('data-entity-id')!)))];
}

/** Mermaid のテキストを、ローカルの mermaid ライブラリで解析する（ネットワークを使わない） */
async function parseMermaid(page: Page, text: string): Promise<void> {
  const ctx = await page.context().browser()!.newContext();
  const p = await ctx.newPage();
  await p.setContent('<html><body></body></html>');
  await p.addScriptTag({ path: require.resolve('mermaid/dist/mermaid.min.js') });
  const result = await p.evaluate(async (t) => {
    try {
      // @ts-expect-error グローバルの mermaid
      await window.mermaid.parse(t);
      return 'ok';
    } catch (e: any) {
      return String(e?.message ?? e);
    }
  }, text);
  await ctx.close();
  expect(result, `Mermaid の解析エラー: ${result}`).toBe('ok');
}

test.describe('FR-026 自動の絞り込み', () => {
  // FR-026 AC-031
  test('FR-026 AC-031 2 つ選んで AND/OR を切り替えると件数バッジが積集合と和集合になり、減光と解除ができる', async ({ page, start }) => {
    await start();
    const [a, b] = mono.issues();
    const table = await openScreen(page, 'table');
    const total = await tableRows(table).count();
    const view = await openScreen(page, 'issue-solution');
    const countFor = async (ids: string[], mode?: 'AND' | 'OR') => {
      await page.keyboard.press('Escape');
      await entity(view, ids[0]).first().click();
      for (const id of ids.slice(1)) await entity(view, id).first().click({ modifiers: ['Control'] });
      const t = await openScreen(page, 'table');
      if (mode) await t.getByRole('radio', { name: mode }).check();
      const n = await countBadge(t);
      await expect(tableRows(t)).toHaveCount(n);
      const rows = await tableRows(t).evaluateAll((els) => els.map((e) => e.getAttribute('data-entity-id')));
      await openScreen(page, 'issue-solution');
      return { n, rows };
    };
    const A = await countFor([a.id]);
    const B = await countFor([b.id]);
    const and = await countFor([a.id, b.id], 'AND');
    const or = await countFor([a.id, b.id], 'OR');
    expect(and.n).toBeLessThanOrEqual(Math.min(A.n, B.n));
    expect(or.n).toBeGreaterThanOrEqual(Math.max(A.n, B.n));
    expect(and.n + or.n, '|A∩B|+|A∪B| = |A|+|B| が成り立たない').toBe(A.n + B.n);
    for (const r of and.rows) expect(or.rows).toContain(r);
    // 減光
    const t = await openScreen(page, 'table');
    await t.getByRole('radio', { name: '減光' }).check();
    await expect(tableRows(t)).toHaveCount(total);
    await expect(t.locator('[role="row"][data-highlight~="dimmed"]')).toHaveCount(total - or.n);
    // フィルター解除
    await t.getByRole('button', { name: 'フィルター解除' }).click();
    await expect(tableRows(t)).toHaveCount(total);
    expect(await countBadge(t)).toBe(total);
  });
});

test.describe('FR-027 ホバー・クリック・Esc', () => {
  // FR-027 AC-032
  test('FR-027 AC-032 ホバーで他のビューに一時的なハイライトが出て消え、クリックの選択は Esc で解除される', async ({ page, start }) => {
    await start();
    await page.getByRole('button', { name: /ペルソナ/ }).click();
    await page.getByRole('menuitemradio', { name: '事業部門' }).click();
    const issue = mono.issues()[0];
    const view = component(page, 'issue-solution');
    const tree = component(page, 'discussion-tree');
    const gantt = component(page, 'gantt');
    await expect(view).toBeVisible();
    const others = [tree, gantt];
    await entity(view, issue.id).first().hover();
    let found = 0;
    for (const o of others) found += await o.locator(`[data-entity-id][data-highlight~="hover"]`).count();
    expect(found, 'ホバーで他のビューにハイライトが出ない').toBeGreaterThan(0);
    await page.mouse.move(2, 2);
    for (const o of others) await expect(o.locator('[data-highlight~="hover"]')).toHaveCount(0);
    await entity(view, issue.id).first().click();
    expect(await selectedIds(page)).toContain(issue.id);
    await page.keyboard.press('Escape');
    await expect.poll(() => selectedIds(page)).toEqual([]);
  });

  // FR-027 AC-032（A-04: Esc はまず開いているダイアログを閉じる）
  test('FR-027 AC-032 異常系: ダイアログが開いているときの Esc はダイアログを閉じるだけで選択は残る', async ({ page, start }) => {
    await start();
    const issue = mono.issues()[0];
    const view = await openScreen(page, 'issue-solution');
    await entity(view, issue.id).first().click();
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'ショートカット一覧' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'ショートカット一覧' })).toBeHidden();
    expect(await selectedIds(page)).toContain(issue.id);
  });
});

test.describe('FR-028 URL への反映と復元', () => {
  // FR-028 AC-033
  test('FR-028 AC-033 戻る/進むで選択が戻り、URL を新しいタブで開くと同じ選択状態', async ({ page, start, context }) => {
    await start();
    const [a, b] = mono.issues();
    const view = await openScreen(page, 'issue-solution');
    await entity(view, a.id).first().click();
    await expect.poll(() => selectedIds(page)).toContain(a.id);
    await entity(view, b.id).first().click();
    await expect.poll(() => selectedIds(page)).toContain(b.id);
    await page.goBack();
    await expect.poll(() => selectedIds(page)).toContain(a.id);
    expect(await selectedIds(page)).not.toContain(b.id);
    await page.goForward();
    await expect.poll(() => selectedIds(page)).toContain(b.id);
    const url = page.url();
    expect(url).toContain('#');
    const tab = await context.newPage();
    // 新しいタブもまずメイン画面（FR-144 AC-398）: 「Project を開く」→作業先選択→分析画面
    await gotoAndEnter(tab, url);
    await expect.poll(() => selectedIds(tab)).toContain(b.id);
  });

  // FR-028 AC-033（異常系: 存在しない ID の URL）
  test('FR-028 AC-033 異常系: 存在しない ID を含む URL を開いてもページエラーにならず、選択なしで表示される', async ({ page, start, pageErrors }) => {
    const app = await start();
    const view = await openScreen(page, 'issue-solution');
    await entity(view, mono.issues()[0].id).first().click();
    const bad = page.url().replace(mono.issues()[0].id, 'does-not-exist-999');
    await gotoAndEnter(page, bad);
    await expect.poll(() => selectedIds(page)).toEqual([]);
    expect(pageErrors).toEqual([]);
    void app;
  });
});

test.describe('FR-029 キーボード・スクリーンリーダー', () => {
  // FR-029 AC-034
  test('FR-029 AC-034 Tab と Enter だけで表の項目を選ぶと aria-live に項目名と関連件数が通知される', async ({ page, start }) => {
    await start();
    const table = await openScreen(page, 'table');
    await page.mouse.move(0, 0);
    let inTable = false;
    for (let i = 0; i < 300 && !inTable; i++) {
      await page.keyboard.press('Tab');
      inTable = await table.evaluate((el) => {
        const a = document.activeElement;
        return !!a && el.contains(a) && !!a.closest('[data-entity-id]');
      });
    }
    expect(inTable, 'Tab だけで表の項目に到達できない').toBe(true);
    const id = await page.evaluate(() => document.activeElement!.closest('[data-entity-id]')!.getAttribute('data-entity-id'));
    await page.keyboard.press('Enter');
    const name = [...mono.issues(), ...mono.entities(), ...mono.solutions(), ...mono.products()].find((e) => e.id === id);
    const live = page.locator('[aria-live="polite"], [aria-live="assertive"]');
    await expect(live.filter({ hasText: name?.title ?? name?.name })).toHaveCount(1);
    const text = (await live.allTextContents()).join(' ');
    expect(text).toMatch(/\d+\s*件/);
  });
});

test.describe('FR-037 ナレッジグラフ', () => {
  type Node = { id: string; type: string; color: string; shape: string; icon: string; visible: boolean };
  // FR-037 AC-044
  test('FR-037 AC-044 ホップ数を範囲内で変えるとその範囲のノードだけが出て、種別フィルターで消え、種別は形かアイコンでも区別される', async ({ page, start }) => {
    await start();
    const g = await openScreen(page, 'knowledge-graph');
    const center = mono.issues()[0];
    await entity(g, center.id).first().click();
    const hop = g.getByRole('slider', { name: 'ホップ数' });
    await expect(hop).toHaveAttribute('aria-valuemin', '1');
    await expect(hop).toHaveAttribute('aria-valuemax', '3');
    const edges = await hook<Array<[string, string]>>(page, 't.graph.allEdges()');
    const dist = new Map<string, number>([[center.id, 0]]);
    const q = [center.id];
    while (q.length) {
      const cur = q.shift()!;
      for (const [s, d] of edges) {
        for (const [x, y] of [[s, d], [d, s]]) if (x === cur && !dist.has(y)) { dist.set(y, dist.get(cur)! + 1); q.push(y); }
      }
    }
    for (const k of [1, 2, 3]) {
      await hop.focus();
      await page.keyboard.press('Home');
      for (let i = 1; i < k; i++) await page.keyboard.press('ArrowRight');
      await expect(hop).toHaveAttribute('aria-valuenow', String(k));
      const nodes = await hook<Node[]>(page, 't.graph.nodes()');
      const vis = nodes.filter((n) => n.visible).map((n) => n.id).sort();
      const expected = [...dist.entries()].filter(([, d]) => d <= k).map(([id]) => id).sort();
      expect(vis, `ホップ数 ${k}`).toEqual(expected);
    }
    // 範囲外にはならない（異常系）
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowRight');
    await expect(hop).toHaveAttribute('aria-valuenow', '3');
    // 種別の区別（色に加えて形かアイコン）
    const nodes = await hook<Node[]>(page, 't.graph.nodes()');
    const types = [...new Set(nodes.map((n) => n.type))];
    expect(types.length).toBeGreaterThan(1);
    const sig = new Set(types.map((t) => { const n = nodes.find((x) => x.type === t)!; return `${n.shape}|${n.icon}`; }));
    expect(sig.size, '種別が形・アイコンで区別されていない').toBe(types.length);
    // 種別フィルター
    const drop = types.find((t) => t !== 'issue')!;
    await g.getByRole('checkbox', { name: new RegExp(drop, 'i') }).uncheck();
    const after = await hook<Node[]>(page, 't.graph.nodes()');
    expect(after.filter((n) => n.visible && n.type === drop)).toEqual([]);
  });

  // FR-037 AC-045
  test('FR-037 AC-045 編集モードでノードとエッジを追加・削除すると表と課題-解決策分析に反映され、「関連を見る」に隣接ノードが出る', async ({ page, start }) => {
    await start();
    await setEditMode(page, true);
    const g = await openScreen(page, 'knowledge-graph');
    await g.getByRole('button', { name: 'ノードを追加' }).click();
    const dlg = page.getByRole('dialog', { name: /ノード/ });
    await dlg.getByRole('textbox', { name: '名前' }).fill('ST追加の課題-045');
    await dlg.getByRole('combobox', { name: '種別' }).click();
    await page.getByRole('option', { name: '課題' }).click();
    await dlg.getByRole('button', { name: /追加|OK|保存/ }).click();
    await expect(g).toContainText('ST追加の課題-045');
    await g.getByRole('button', { name: 'エッジを追加' }).click();
    const edlg = page.getByRole('dialog', { name: /エッジ/ });
    await edlg.getByRole('combobox', { name: /始点|から/ }).click();
    await page.getByRole('option', { name: 'ST追加の課題-045' }).click();
    await edlg.getByRole('combobox', { name: /終点|へ/ }).click();
    await page.getByRole('option', { name: mono.solutions()[0].title }).click();
    await edlg.getByRole('button', { name: /追加|OK|保存/ }).click();
    await expect(await openScreen(page, 'table')).toContainText('ST追加の課題-045');
    await expect(await openScreen(page, 'issue-solution')).toContainText('ST追加の課題-045');
    // 関連を見る（選択中の項目の再クリックは選択解除になる（FR-227）ので、すでに選択済みなら押さない）
    const mini = component(page, 'issue-solution').getByTestId('related-mini');
    if (!((await mini.textContent()) ?? '').includes(mono.solutions()[0].title)) await component(page, 'issue-solution').getByText('ST追加の課題-045').first().click();
    await expect(mini).toContainText(mono.solutions()[0].title);
    // 削除
    const g2 = await openScreen(page, 'knowledge-graph');
    const delBtn = g2.getByRole('button', { name: /削除/ });
    if (!(await delBtn.isEnabled().catch(() => false))) await g2.getByText('ST追加の課題-045').first().click();
    await delBtn.click();
    await page.getByRole('button', { name: /削除する|OK|はい/ }).click().catch(() => {});
    await expect(await openScreen(page, 'table')).not.toContainText('ST追加の課題-045');
    await expect(await openScreen(page, 'issue-solution')).not.toContainText('ST追加の課題-045');
  });

  // FR-037 AC-045（異常系: 編集モード OFF ではノードを追加できない）
  test('FR-037 AC-045 異常系: 編集モードが OFF のときノードの追加ボタンが無効', async ({ page, start }) => {
    await start();
    await setEditMode(page, false);
    const g = await openScreen(page, 'knowledge-graph');
    await expect(g.getByRole('button', { name: 'ノードを追加' })).toBeDisabled();
  });
});

test.describe('FR-038 課題-解決策分析ビュー', () => {
  // FR-038 AC-046
  test('FR-038 AC-046 イシューツリー・サンキー図・マトリクスに切り替えても同じ課題が選択され、原因・解決策・効果・製品と出典リンクが示される', async ({ page, start }) => {
    await start();
    const issue = mono.issues().find((i) => mono.solutions().some((s) => (s.issueIds ?? []).includes(i.id)))!;
    const sols = mono.solutions().filter((s) => (s.issueIds ?? []).includes(issue.id));
    const view = await openScreen(page, 'issue-solution');
    await entity(view, issue.id).first().click();
    for (const mode of ['イシューツリー', 'サンキー図', 'マトリクス']) {
      await view.getByRole('radio', { name: mode }).check();
      await expect(entity(view, issue.id).first(), mode).toHaveAttribute('data-highlight', /selected/);
      for (const c of issue.causes ?? []) await expect(view, `${mode} に原因がない`).toContainText(c.title ?? c);
      for (const s of sols) {
        await expect(entity(view, s.id).first(), `${mode} に解決策がない`).toBeVisible();
        for (const e of s.effects ?? []) await expect(view).toContainText(e.title ?? e);
        for (const pid of s.productIds ?? []) await expect(view).toContainText(mono.products().find((p) => p.id === pid).name);
        await expect(entity(view, s.id).first().getByRole('link').first(), `${mode} の解決策に出典リンクがない`).toBeVisible();
      }
    }
  });
});

test.describe('FR-039 優先順位分析', () => {
  // FR-039 AC-047
  test('FR-039 AC-047 重みを変えるとランキングと 2×2 が更新され、重み付きスコアが Σ（重み×評価値）と一致する', async ({ page, start }) => {
    await start();
    const pr = await openScreen(page, 'priority');
    const ranking = component(page, 'ranking');
    const readRows = async () => {
      const headers = (await ranking.getByRole('columnheader').allInnerTexts()).map((h) => h.trim());
      const rows = ranking.getByRole('row').filter({ has: page.getByRole('cell') });
      const out: Array<{ cells: string[]; id: string }> = [];
      for (let i = 0; i < (await rows.count()); i++) {
        out.push({ cells: (await rows.nth(i).getByRole('cell').allInnerTexts()).map((c) => c.trim()), id: (await rows.nth(i).getAttribute('data-entity-id'))! });
      }
      return { headers, rows: out };
    };
    const weights = async () => {
      const sliders = pr.getByRole('slider', { name: /の重み$/ });
      const w: Record<string, number> = {};
      for (let i = 0; i < (await sliders.count()); i++) {
        const name = (await sliders.nth(i).getAttribute('aria-label'))!.replace(/の重み$/, '').trim();
        w[name] = Number(await sliders.nth(i).getAttribute('aria-valuenow'));
      }
      return w;
    };
    const check = async () => {
      const w = await weights();
      const { headers, rows } = await readRows();
      const scoreCol = headers.findIndex((h) => /スコア/.test(h));
      expect(scoreCol).toBeGreaterThanOrEqual(0);
      const scores: number[] = [];
      for (const r of rows) {
        let sum = 0;
        for (const [k, v] of Object.entries(w)) {
          const col = headers.findIndex((h) => h.startsWith(k));
          expect(col, `ランキング表に ${k} の列がない`).toBeGreaterThanOrEqual(0);
          sum += v * Number(r.cells[col].replace(/[^0-9.\-]/g, ''));
        }
        const shown = Number(r.cells[scoreCol].replace(/[^0-9.\-]/g, ''));
        expect(Math.abs(shown - sum), `スコア ${shown} ≠ Σ ${sum}`).toBeLessThanOrEqual(0.05 * Math.max(1, Math.abs(sum)) + 0.01);
        scores.push(shown);
      }
      for (let i = 1; i < scores.length; i++) expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
      return rows.map((r) => r.id);
    };
    const order0 = await check();
    const matrix = component(page, 'matrix');
    const pos0 = await matrix.locator('[data-entity-id]').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return `${e.getAttribute('data-entity-id')}:${Math.round(b.x)},${Math.round(b.y)}`; }));
    // キーボードで重みを変える
    const first = pr.getByRole('slider', { name: /の重み$/ }).first();
    await first.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const order1 = await check();
    const pos1 = await matrix.locator('[data-entity-id]').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return `${e.getAttribute('data-entity-id')}:${Math.round(b.x)},${Math.round(b.y)}`; }));
    expect(order1.join() !== order0.join() || pos1.join() !== pos0.join(), '重みを変えても順位も配置も変わらない').toBe(true);
    // 数値入力でも
    const num = pr.getByRole('spinbutton', { name: /の重み$/ }).last();
    await num.fill('0');
    await num.press('Enter');
    await check();
  });

  // FR-039 AC-047（異常系: 範囲外の重み）
  test('FR-039 AC-047 異常系: 重みに数値でない値や範囲外の値を入れても反映されず原因が表示される', async ({ page, start }) => {
    await start();
    const pr = await openScreen(page, 'priority');
    const num = pr.getByRole('spinbutton', { name: /の重み$/ }).first();
    const before = await num.inputValue();
    await num.fill('-5');
    await num.press('Enter');
    await expect(pr.getByRole('alert').or(pr.locator('[aria-invalid="true"]')).first()).toBeVisible();
    await num.press('Escape');
    await expect(pr.getByRole('slider', { name: /の重み$/ }).first()).toHaveAttribute('aria-valuenow', before);
  });
});

test.describe('FR-040 アーキテクチャ図', () => {
  // FR-040 AC-049
  test('FR-040 AC-049 AsIs から ToBe に切り替えると追加・削除・変更がラベルでも区別してハイライトされる', async ({ page, start }) => {
    await start();
    const arch = mono.json('architecture');
    const asis: any[] = arch.asis.elements;
    const tobe: any[] = arch.tobe.elements;
    const added = tobe.filter((e) => !asis.some((a) => a.id === e.id));
    const removed = asis.filter((e) => !tobe.some((a) => a.id === e.id));
    const changed = tobe.filter((e) => { const a = asis.find((x) => x.id === e.id); return a && JSON.stringify(a) !== JSON.stringify(e); });
    expect(added.length && removed.length && changed.length, 'お手本パックの AsIs/ToBe に追加・削除・変更の全種がない').toBeTruthy();
    const v = await openScreen(page, 'architecture');
    await v.getByRole('radio', { name: 'AsIs' }).check();
    await v.getByRole('radio', { name: 'ToBe' }).check();
    for (const [list, label] of [[added, '追加'], [removed, '削除'], [changed, '変更']] as const) {
      for (const e of list) {
        const el = entity(v, e.id).first();
        await expect(el).toHaveAttribute('data-diff', label === '追加' ? 'added' : label === '削除' ? 'removed' : 'changed');
        await expect(el).toContainText(label);
      }
    }
    const unchanged = tobe.filter((e) => !added.includes(e) && !changed.includes(e));
    for (const e of unchanged) await expect(entity(v, e.id).first()).not.toHaveAttribute('data-diff', /added|removed|changed/);
  });

  // FR-040 AC-050
  test('FR-040 AC-050 Mermaid・SVG・PNG の 3 ファイルが出力され Mermaid が解析でき、JSON 編集の追加が図に反映される', async ({ page, start }) => {
    await start();
    const v = await openScreen(page, 'architecture');
    const out: Record<string, Buffer> = {};
    for (const [fmt, re] of [['Mermaid', /\.(mmd|mermaid|md)$/], ['SVG', /\.svg$/], ['PNG', /\.png$/]] as const) {
      await v.getByRole('button', { name: '図を出力' }).click();
      const { name, data } = await captureDownload(page, () => page.getByRole('menuitem', { name: fmt }).click());
      expect(name).toMatch(re);
      out[fmt] = data;
    }
    expect(out.PNG.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(out.SVG.toString('utf8')).toContain('<svg');
    let mmd = out.Mermaid.toString('utf8');
    const fence = mmd.match(/```mermaid\s*([\s\S]*?)```/);
    if (fence) mmd = fence[1];
    await parseMermaid(page, mmd);
    // JSON 編集
    await setEditMode(page, true);
    await v.getByRole('button', { name: 'JSON 編集' }).click();
    const editor = page.getByRole('textbox', { name: /JSON/ });
    const json = JSON.parse(await editor.inputValue());
    const target = json.tobe?.elements ?? json.elements;
    target.push({ ...target[0], id: 'arch-st-050', name: 'ST追加の要素-050' });
    await editor.fill(JSON.stringify(json, null, 2));
    await page.getByRole('button', { name: /適用|保存/ }).click();
    await expect(entity(v, 'arch-st-050').first()).toBeVisible();
    await expect(v).toContainText('ST追加の要素-050');
  });

  // FR-040 AC-050（異常系: 壊れた JSON）
  test('FR-040 AC-050 異常系: 壊れた JSON は適用されず原因が表示される', async ({ page, start }) => {
    await start();
    const v = await openScreen(page, 'architecture');
    await setEditMode(page, true);
    await v.getByRole('button', { name: 'JSON 編集' }).click();
    const editor = page.getByRole('textbox', { name: /JSON/ });
    const original = await editor.inputValue();
    await editor.fill('{ "elements": [ ');
    await page.getByRole('button', { name: /適用|保存/ }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await v.getByRole('button', { name: 'JSON 編集' }).click();
    expect(JSON.parse(await page.getByRole('textbox', { name: /JSON/ }).inputValue())).toEqual(JSON.parse(original));
  });
});

test.describe('FR-041 エグゼクティブサマリー', () => {
  // FR-041 AC-051
  test('FR-041 AC-051 各コンポーネントの上部に結論・根拠の数値・推奨アクションがあり「AI 生成（モック）」、固定した編集版は上書きされない', async ({ page, start }) => {
    await start();
    for (const key of ['issue-solution', 'priority', 'gantt', 'architecture']) {
      const c = await openScreen(page, key);
      const s = c.getByTestId('executive-summary');
      await expect(s, `${key} にサマリーがない`).toBeVisible();
      const cb = (await c.boundingBox())!;
      const sb = (await s.boundingBox())!;
      expect(sb.y - cb.y, `${key} のサマリーが上部にない`).toBeLessThan(cb.height / 3);
      await expect(s.getByTestId('summary-conclusion')).not.toBeEmpty();
      await expect(s.getByTestId('summary-evidence')).toContainText(/\d/);
      await expect(s.getByTestId('summary-action')).not.toBeEmpty();
      await expect(s).toContainText('AI 生成（モック）');
    }
    // 編集して固定
    await setEditMode(page, true);
    const c = await openScreen(page, 'priority');
    const s = c.getByTestId('executive-summary');
    await s.getByRole('button', { name: '編集' }).click();
    await s.getByRole('textbox').first().fill('固定した結論 ST-051');
    await s.getByRole('button', { name: '固定' }).click();
    await expect(s).toContainText('編集版');
    await expect(s).toContainText('固定した結論 ST-051');
    // データを変える
    const pr = component(page, 'priority');
    const slider = pr.getByRole('slider', { name: /の重み$/ }).first();
    await slider.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await expect(s).toContainText('固定した結論 ST-051');
    await expect(s).toContainText('編集版');
  });
});

test.describe('FR-042 議論ツリー', () => {
  async function prepareTheme(page: Page) {
    const issue = mono.issues()[0];
    const view = await openScreen(page, 'issue-solution');
    await entity(view, issue.id).first().click();
    await page.getByRole('button', { name: '議論テーマにする' }).click();
    const themes = await openScreen(page, 'themes');
    await expect(themes).toContainText(issue.title);
    await themes.getByRole('textbox', { name: '選択肢' }).fill('案A: 段階導入／案B: 一括導入');
    await themes.getByRole('textbox', { name: '決定事項' }).fill('案A で進める');
    return { issue, themes };
  }

  // FR-042 AC-052
  test('FR-042 AC-052 「ツリーを生成」でモックの AI が 5 種類の枝を持つツリーを返し、各ノードに「AI 生成」と根拠のリンクが付く', async ({ page, start }) => {
    await start();
    const { themes } = await prepareTheme(page);
    await themes.getByRole('button', { name: 'ツリーを生成' }).click();
    const tree = component(page, 'discussion-tree');
    await expect(tree).toBeVisible();
    const nodes = tree.getByRole('treeitem');
    await expect(nodes.first()).toBeVisible({ timeout: 15_000 });
    for (const kind of ['論点', '課題', '解決策', '決定事項', '次のアクション']) {
      await expect(tree.locator(`[role="treeitem"][data-node-kind="${kind}"]`).first(), `${kind} の枝がない`).toBeVisible();
    }
    const n = await nodes.count();
    for (let i = 0; i < n; i++) {
      const node = nodes.nth(i);
      if ((await node.getAttribute('aria-level')) === '1') continue;
      await expect(node).toContainText('AI 生成');
      await expect(node.getByRole('link').first(), '根拠のリンクがない').toBeAttached();
    }
  });

  // FR-042 AC-053
  test('FR-042 AC-053 ノードの手動の追加・移動・削除で「人が編集」になり、選ぶと他のビューがハイライトされ、4 形式で出力できる', async ({ page, start }) => {
    await start();
    const { themes } = await prepareTheme(page);
    await themes.getByRole('button', { name: 'ツリーを生成' }).click();
    const tree = component(page, 'discussion-tree');
    await expect(tree.getByRole('treeitem').first()).toBeVisible({ timeout: 15_000 });
    await setEditMode(page, true);
    // 追加
    const parent = tree.locator('[role="treeitem"][data-node-kind="論点"]').first();
    await parent.click();
    await tree.getByRole('button', { name: 'ノードを追加' }).click();
    await page.keyboard.type('ST追加ノード-053');
    await page.keyboard.press('Enter');
    const added = tree.getByRole('treeitem', { name: /ST追加ノード-053/ });
    await expect(added).toContainText('人が編集');
    // 移動（キーボード: 移動先を選ぶメニュー）
    const moved = tree.locator('[role="treeitem"][data-node-kind="解決策"]').first();
    await moved.click();
    await tree.getByRole('button', { name: '移動' }).click();
    await page.getByRole('menuitem').first().click();
    await expect(moved).toContainText('人が編集');
    // 削除
    await added.click();
    await tree.getByRole('button', { name: '削除' }).click();
    await expect(tree.getByRole('treeitem', { name: /ST追加ノード-053/ })).toHaveCount(0);
    // 選ぶと他のビューの関連項目がハイライトされる
    const linked = tree.locator('[role="treeitem"][data-entity-id]').first();
    const id = (await linked.getAttribute('data-entity-id'))!;
    await linked.click();
    const others = page.locator(`[data-entity-id="${id}"][data-highlight~="selected"], [data-entity-id="${id}"][data-highlight~="related"]`);
    expect(await others.count()).toBeGreaterThan(1);
    // 4 形式
    for (const [fmt, re] of [['PNG', /\.png$/], ['SVG', /\.svg$/], ['Mermaid', /\.(mmd|mermaid|md)$/], ['JSON', /\.json$/]] as const) {
      await tree.getByRole('button', { name: 'ツリーを出力' }).click();
      const { name, data } = await captureDownload(page, () => page.getByRole('menuitem', { name: fmt }).click());
      expect(name).toMatch(re);
      expect(data.byteLength).toBeGreaterThan(0);
      if (fmt === 'JSON') JSON.parse(data.toString('utf8'));
    }
  });
});

test.describe('FR-043 ミニ・モックアプリ', () => {
  // FR-043 AC-054
  test('FR-043 AC-054 解決策を選ぶとそのモックが表示され、画面間を遷移でき、枠を切り替えられ、「モック（イメージ）」と表示される', async ({ page, start }) => {
    await start();
    const mock = mono.mocks()[0];
    const sol = mono.solutions().find((s) => s.id === mock.solutionId)!;
    const view = await openScreen(page, 'issue-solution');
    await entity(view, sol.id).first().click();
    const m = await openScreen(page, 'mock-app');
    await expect(m).toContainText('モック（イメージ）');
    const screens: any[] = mock.screens;
    expect(screens.length).toBeGreaterThanOrEqual(1);
    expect(screens.length).toBeLessThanOrEqual(3);
    await expect(m.getByTestId('mock-screen')).toContainText(screens[0].title);
    if (screens.length > 1) {
      await m.getByTestId('mock-screen').getByRole('button', { name: screens[1].title }).click();
      await expect(m.getByTestId('mock-screen')).toContainText(screens[1].title);
    }
    const frame = m.getByTestId('device-frame');
    const ratios: number[] = [];
    for (const d of ['スマホ', 'タブレット', 'PC']) {
      await m.getByRole('radio', { name: d }).check();
      const b = (await frame.boundingBox())!;
      ratios.push(b.width / b.height);
    }
    expect(ratios[0]).toBeLessThan(ratios[2]);
    expect(new Set(ratios.map((r) => r.toFixed(2))).size).toBe(3);
  });
});

void fs;
