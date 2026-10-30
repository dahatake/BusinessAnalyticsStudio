// System Test: 分析ビュー（課題・解決策・出典）、AI モック、検索・チャット、中核オブジェクト、レンズ
// 期待値は要求定義書の受入基準（docs/requirements/app-core.md）と、入力したお手本パックの内容から決める。
import { test, expect, openScreen, component, entity, MAIN_SCREENS } from '../support/fixtures';
import { examplePack, makeVariant } from '../support/packs';

const mono = examplePack('mono');

/** 日付の表記ゆれ（2026-10-09／2026/10/09／2026/10/9） */
function dateRe(iso: string): RegExp {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new RegExp(`${y}[-/年]0?${m}[-/月]0?${d}`);
}

test.describe('FR-001 課題の構造化', () => {
  // FR-001 AC-001
  test('FR-001 AC-001 全課題がイシューツリーの階層で、仮説と対象ペルソナ付きで表示される', async ({ page, start }) => {
    await start();
    const view = await openScreen(page, 'issue-solution');
    await view.getByRole('radio', { name: 'イシューツリー' }).check();
    const tree = view.getByRole('tree');
    await expect(tree).toBeVisible();
    // 折りたたまれた枝を利用者と同じ操作で開く
    for (let i = 0; i < 20; i++) {
      const collapsed = tree.locator('[role="treeitem"][aria-expanded="false"]');
      if ((await collapsed.count()) === 0) break;
      await collapsed.first().click();
    }
    const issues = mono.issues();
    expect(issues.length).toBeGreaterThan(1);
    for (const issue of issues) {
      const item = tree.locator(`[role="treeitem"][data-entity-id="${issue.id}"]`);
      await expect(item, `課題 ${issue.id} がツリーにない`).toHaveCount(1);
      await expect(item).toContainText(issue.title);
      await expect(item).toContainText(issue.hypothesis);
      for (const persona of issue.personas ?? []) await expect(item).toContainText(persona);
      if (issue.parentId) {
        const parent = tree.locator(`[role="treeitem"][data-entity-id="${issue.parentId}"]`);
        const pl = Number(await parent.getAttribute('aria-level'));
        await expect(item).toHaveAttribute('aria-level', String(pl + 1));
      } else {
        await expect(item).toHaveAttribute('aria-level', '1');
      }
    }
  });
});

test.describe('FR-002 課題の区分', () => {
  // FR-002 AC-002
  test('FR-002 AC-002 「社外向け」で絞り込むと社外向けの課題だけが表示され件数バッジが一致する', async ({ page, start }) => {
    await start();
    const view = await openScreen(page, 'issue-solution');
    await view.getByRole('radio', { name: '社外向け' }).check();
    const external = mono.issues().filter((i) => i.audience === 'external');
    const internal = mono.issues().filter((i) => i.audience !== 'external');
    expect(external.length, 'お手本パックに社外向けの課題がない').toBeGreaterThan(0);
    expect(internal.length, 'お手本パックに社内向けの課題がない（絞り込みを確かめられない）').toBeGreaterThan(0);
    for (const i of external) await expect(entity(view, i.id).first()).toBeVisible();
    for (const i of internal) await expect(entity(view, i.id)).toHaveCount(0);
    await expect(view.getByTestId('count-badge')).toContainText(String(external.length));
  });

  // FR-002 AC-002（異常系: 区分のない課題）
  test('FR-002 AC-002 異常系: 区分のない課題はスキーマ検証のエラーとして報告される', async ({ page, start }) => {
    let badId = '';
    const pack = makeVariant('mono', 'no-audience', (p) =>
      p.edit('issues', (j) => {
        const list = Array.isArray(j) ? j : j.issues;
        badId = list[list.length - 1].id;
        delete list[list.length - 1].audience;
      }),
    );
    await start({ pack });
    const errors = page.getByTestId('pack-errors');
    await expect(errors).toBeVisible();
    await expect(errors).toContainText('issues.json');
    await expect(errors).toContainText(/audience|区分/);
    await expect(errors).toContainText(badId);
  });
});

test.describe('FR-003 課題の評価属性', () => {
  // FR-003 AC-003
  test('FR-003 AC-003 課題の詳細パネルに 5 項目が値と出典リンク付きで表示される', async ({ page, start }) => {
    await start();
    const view = await openScreen(page, 'issue-solution');
    const issues = mono.issues();
    for (const issue of [issues[0], issues[issues.length - 1]]) {
      await entity(view, issue.id).first().click();
      const detail = component(page, 'detail');
      await expect(detail).toBeVisible();
      for (const [key, label] of [['priority', '優先順位'], ['cost', 'コスト'], ['roi', 'ROI'], ['feasibility', '実現性'], ['risk', 'リスク']]) {
        const row = detail.getByTestId(`attr-${key}`);
        await expect(row, `${label} の行がない`).toBeVisible();
        await expect(row).toContainText(label);
        const value = (await row.getByTestId('attr-value').innerText()).trim();
        expect(value, `${label} の値が空`).not.toBe('');
        await expect(row.getByRole('link').first(), `${label} に出典リンクがない`).toBeVisible();
      }
    }
  });
});

test.describe('FR-004 解決策の出典', () => {
  // FR-004 AC-004
  test('FR-004 AC-004 出典カードにタイトル・URL・取得日・確度があり、URL は新しいタブで開く', async ({ page, start }) => {
    await start();
    const view = await openScreen(page, 'issue-solution');
    const sol = mono.solutions().find((s) => (s.sourceIds ?? []).length > 0);
    expect(sol, 'お手本パックに出典付きの解決策がない').toBeTruthy();
    const src = mono.sources().find((s) => s.id === sol.sourceIds[0]);
    await entity(view, sol.id).first().click();
    await component(page, 'detail').getByRole('button', { name: new RegExp(src.title) }).first().click();
    const card = page.getByTestId('source-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText(src.title);
    await expect(card).toContainText(dateRe(src.retrievedAt));
    await expect(card).toContainText(/確度/);
    await expect(card).toContainText(/高|中|低|推定/);
    const link = card.getByRole('link', { name: new RegExp(src.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
    await expect(link).toHaveAttribute('href', src.url);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });
});

test.describe('FR-005 Microsoft 製品の関連付け', () => {
  // FR-005 AC-005
  test('FR-005 AC-005 解決策を選ぶと関連する製品の名前と適合理由が表示される', async ({ page, start }) => {
    await start();
    const view = await openScreen(page, 'issue-solution');
    const sol = mono.solutions().find((s) => (s.productIds ?? []).length > 0);
    expect(sol, 'お手本パックに製品を関連付けた解決策がない').toBeTruthy();
    await entity(view, sol.id).first().click();
    const detail = component(page, 'detail');
    for (const pid of sol.productIds) {
      const product = mono.products().find((p) => p.id === pid);
      const row = detail.getByTestId('product-fit').filter({ hasText: product.name });
      await expect(row).toBeVisible();
      const reason = (await row.getByTestId('product-fit-reason').innerText()).trim();
      expect(reason.length, `${product.name} の適合理由が空`).toBeGreaterThan(5);
    }
  });

  // FR-005 AC-005（異常系: 製品 0 件）
  test('FR-005 AC-005 異常系: 製品が 0 件の解決策では「製品の関連付けなし」と表示される', async ({ page, start }) => {
    let solId = '';
    const pack = makeVariant('mono', 'no-product', (p) =>
      p.edit('issues', (j) => {
        const s = j.solutions[0];
        s.productIds = [];
        solId = s.id;
      }),
    );
    await start({ pack });
    const view = await openScreen(page, 'issue-solution');
    await entity(view, solId).first().click();
    await expect(component(page, 'detail')).toContainText('製品の関連付けなし');
  });
});

test.describe('FR-006 生成 AI の価値', () => {
  const LABELS: Record<string, RegExp> = {
    parameter: /パラメーター/,
    fusion: /融合/,
    chatRag: /RAG/,
    workflow: /業務フロー/,
  };
  // FR-006 AC-006
  test('FR-006 AC-006 生成 AI の解決策の詳細に、指定した価値だけがラベルと説明文で表示される', async ({ page, start }) => {
    await start();
    const view = await openScreen(page, 'issue-solution');
    const sol = mono.solutions().find((s) => (s.genAiValues ?? []).length > 0 && s.genAiValues.length < 4);
    expect(sol, 'お手本パックに生成 AI の価値を一部だけ指定した解決策がない').toBeTruthy();
    await entity(view, sol.id).first().click();
    const values = component(page, 'detail').getByTestId('genai-value');
    await expect(values).toHaveCount(sol.genAiValues.length);
    for (const key of Object.keys(LABELS)) {
      const has = values.filter({ hasText: LABELS[key] });
      if (sol.genAiValues.includes(key)) {
        await expect(has).toHaveCount(1);
        const text = (await has.innerText()).replace(LABELS[key], '').trim();
        expect(text.length, `${key} の説明文がない`).toBeGreaterThan(5);
      } else {
        await expect(has).toHaveCount(0);
      }
    }
  });
});

test.describe('FR-007 Feature ごとの工程', () => {
  // FR-007 AC-007
  test('FR-007 AC-007 Feature を選ぶとガントでその工程が強調され、開始日・終了日・担当・作業内容が表示される', async ({ page, start }) => {
    await start();
    const gantt = await openScreen(page, 'gantt');
    const feature = mono.features()[0];
    const tasks = mono.tasks().filter((t) => t.featureId === feature.id);
    const others = mono.tasks().filter((t) => t.featureId !== feature.id);
    expect(tasks.length).toBeGreaterThan(0);
    await entity(gantt, feature.id).first().click();
    for (const t of tasks) {
      const bar = entity(gantt, t.id).first();
      await expect(bar).toHaveAttribute('data-highlight', /selected|related/);
      await bar.focus();
      const info = page.getByTestId('task-info');
      await expect(info).toBeVisible();
      await expect(info).toContainText(dateRe(t.start));
      await expect(info).toContainText(dateRe(t.end));
      await expect(info).toContainText(t.owner);
      await expect(info).toContainText(t.work);
    }
    for (const t of others) await expect(entity(gantt, t.id).first()).not.toHaveAttribute('data-highlight', /selected|related/);
  });
});

test.describe('FR-008 サンプルの明示', () => {
  // FR-008 AC-008
  test('FR-008 AC-008 主要画面のそれぞれに「サンプル」の表示があり、支援技術からも読み取れる', async ({ page, start }) => {
    await start();
    for (const [key, name] of MAIN_SCREENS) {
      const c = await openScreen(page, key);
      const badge = c.getByText('サンプル', { exact: false }).first();
      await expect(badge, `${name} に「サンプル」の表示がない`).toBeVisible();
      expect(await c.ariaSnapshot(), `${name} の「サンプル」が支援技術から読めない`).toContain('サンプル');
    }
  });
});

test.describe('FR-009 出典と確度', () => {
  // FR-009 AC-009
  test('FR-009 AC-009 数値にホバーまたはフォーカスすると出典の種別・取得日・確度が表示される', async ({ page, start }) => {
    await start();
    const view = await openScreen(page, 'priority');
    const num = view.getByTestId('numeric-value').first();
    await expect(num).toBeVisible();
    await num.hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(/WorkIQ|Web|推定/);
    await expect(tip).toContainText(/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/);
    await expect(tip).toContainText(/確度/);
    await expect(tip).toContainText(/高|中|低|推定/);
    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden();
    // キーボードのフォーカスでも同じ
    await num.focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await expect(page.getByRole('tooltip')).toContainText(/確度/);
  });
});

test.describe('FR-011 AI モック', () => {
  // FR-011 AC-013
  test('FR-011 AC-013 「AI: モック」が常に見え、チャットの回答に「AI 生成（モック）」が付く', async ({ page, start }) => {
    await start();
    const status = page.getByTestId('ai-status');
    for (const key of ['priority', 'issue-solution', 'settings']) {
      await openScreen(page, key);
      await expect(status).toBeVisible();
      await expect(status).toContainText('AI: モック');
    }
    const chat = await openScreen(page, 'chat');
    await chat.getByRole('textbox', { name: /質問/ }).fill('最も優先度の高い課題は何ですか？');
    await chat.getByRole('button', { name: '送信', exact: true }).click();
    const answer = chat.getByTestId('chat-answer').last();
    await expect(answer).toBeVisible();
    await expect(answer).toContainText('AI 生成（モック）');
    await expect(status).toContainText('AI: モック');
  });
});

test.describe('FR-017 検索とチャット', () => {
  // FR-017 AC-020
  test('FR-017 AC-020 課題名の一部で検索すると種別ごとに表示され、選ぶと選択状態になる', async ({ page, start }) => {
    await start();
    const issue = mono.issues()[0];
    const part = issue.title.slice(1, Math.min(issue.title.length, 4));
    const search = page.getByRole('searchbox', { name: /検索/ });
    await search.fill(part);
    const results = page.getByTestId('search-results');
    await expect(results).toBeVisible();
    for (const kind of ['課題', '解決策', '製品']) {
      // 一致するものがある種別は見出しつきのグループで表示される
      const any = [...mono.issues().map((i) => ['課題', i.title]), ...mono.solutions().map((s) => ['解決策', s.title]), ...mono.products().map((p) => ['製品', p.name])]
        .some(([k, t]) => k === kind && String(t).includes(part));
      if (any) await expect(results.getByRole('group', { name: new RegExp(kind) })).toBeVisible();
    }
    const hit = results.getByRole('group', { name: /課題/ }).getByRole('option', { name: new RegExp(issue.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
    await hit.click();
    await expect(page.locator(`[data-entity-id="${issue.id}"][data-highlight~="selected"]`).first()).toBeVisible();
  });

  // FR-017 AC-020（異常系: 0 件）
  test('FR-017 AC-020 異常系: 一致しない語では「該当なし」と表示される', async ({ page, start }) => {
    await start();
    await page.getByRole('searchbox', { name: /検索/ }).fill('ｚｑｘ存在しない語９９');
    await expect(page.getByTestId('search-results')).toContainText('該当なし');
  });

  // FR-017 AC-021
  test('FR-017 AC-021 チャットの回答に顧客パックの出典カードが 1 件以上と「AI 生成」が付く', async ({ page, start }) => {
    await start();
    const chat = await openScreen(page, 'chat');
    await chat.getByRole('textbox', { name: /質問/ }).fill(`${mono.issues()[0].title} の解決策は？`);
    await chat.getByRole('button', { name: '送信', exact: true }).click();
    const answer = chat.getByTestId('chat-answer').last();
    await expect(answer).toContainText('AI 生成');
    const cards = answer.getByTestId('source-card');
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
    const titles = mono.sources().map((s) => s.title);
    for (const t of await cards.allInnerTexts()) {
      expect(titles.some((x) => t.includes(x)), `出典カード「${t}」が顧客パックの出典にない`).toBe(true);
    }
  });

  // FR-017 AC-021（異常系: 空の質問）
  test('FR-017 AC-021 異常系: 空の質問は送信できない', async ({ page, start }) => {
    await start();
    const chat = await openScreen(page, 'chat');
    await chat.getByRole('textbox', { name: /質問/ }).fill('');
    await expect(chat.getByRole('button', { name: '送信', exact: true })).toBeDisabled();
  });
});

test.describe('FR-018 中核オブジェクト', () => {
  // FR-018 AC-022
  test('FR-018 AC-022 選定理由パネルに候補・観点・理由が表示され、候補の変更が再読込後も保たれる', async ({ page, start }) => {
    const app = await start();
    const cands = mono.coreObjectCandidates();
    expect(cands.length, 'お手本パックの中核オブジェクトの候補が 2 件以上ない').toBeGreaterThan(1);
    await page.getByRole('button', { name: '選定理由' }).click();
    const panel = component(page, 'core-object');
    await expect(panel).toBeVisible();
    for (const c of cands) await expect(panel).toContainText(c.name);
    await expect(panel.getByTestId('comparison-criteria')).not.toBeEmpty();
    await expect(panel.getByTestId('selection-reason')).not.toBeEmpty();
    const center = page.getByTestId('core-object');
    const current = (await center.getAttribute('data-entity-id')) ?? '';
    const other = cands.find((c) => c.id !== current)!;
    await panel.getByRole('radio', { name: other.name }).check();
    await expect(center).toHaveAttribute('data-entity-id', other.id);
    await expect(center).toContainText(other.name);
    await app.reload();
    await expect(page.getByTestId('core-object')).toHaveAttribute('data-entity-id', other.id);
  });
});

test.describe('FR-019 レンズ', () => {
  // FR-019 AC-023
  test('FR-019 AC-023 「並置」でビジネス側を選ぶと同じ ID の IT 側も強調され、用語にフォーカスで定義が出る', async ({ page, start }) => {
    await start();
    await page.getByRole('radio', { name: '並置' }).check();
    const biz = page.getByTestId('lens-business');
    const it = page.getByTestId('lens-it');
    await expect(biz).toBeVisible();
    await expect(it).toBeVisible();
    const first = biz.locator('[data-entity-id]').first();
    const id = (await first.getAttribute('data-entity-id'))!;
    await first.click();
    await expect(entity(it, id).first()).toHaveAttribute('data-highlight', /selected|related/);
    // 用語集
    const glossary: Array<{ term: string; definition: string }> = mono.json('customer').glossary ?? [];
    expect(glossary.length, 'お手本パックに用語集がない').toBeGreaterThan(0);
    const term = page.locator(`[data-glossary-term="${glossary[0].term}"]`).first();
    await term.focus();
    await expect(page.getByRole('tooltip')).toContainText(glossary[0].definition);
  });
});

