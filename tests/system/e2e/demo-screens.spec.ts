// System Test: FR-287 デモの全画面（27 件）の説明（screenGuides）とデータの表示、実際の Project との分離
// 期待値は受入基準だけから決める（実装は読まない）。
import { test, expect, openScreen, component, setEditMode, tableRows, chooseWorkTarget, closeSettings } from '../support/fixtures';
import { examplePack } from '../support/packs';

/** 登録簿（27 件）。設定パネルはモーダル */
const KEYS = [
  'canvas', 'issue-solution', 'priority', 'summary', 'matrix', 'ranking', 'knowledge-graph', 'business-graph',
  'architecture', 'discussion-tree', 'table', 'gantt', 'view3d', 'drawing2d', 'map', 'kpi-okr', 'twin-view',
  'sources', 'mock-app', 'usecase', 'data-catalog', 'spatial-view', 'whiteboard', 'themes', 'settings',
  'genai-scenario', 'chat',
] as const;

/**
 * AC-750 の検証の表: 画面のキー → 表示するデータの種類（行・ノード・付箋・図形・場所・工程・メッセージ）。
 * settings（設定パネル）は対象外（入力欄の既定値の説明で足りる）。
 */
export const DATA_KIND: Record<string, string> = {
  canvas: 'ノード（議題・章）', 'issue-solution': '行（課題・解決策）', priority: '行（課題・解決策）', summary: '行（サマリーの項目）',
  matrix: 'ノード（課題・解決策の点）', ranking: '行（順位）', 'knowledge-graph': 'ノード', 'business-graph': 'ノード',
  architecture: '図形（構成要素）', 'discussion-tree': 'ノード', table: '行', gantt: '工程', view3d: '図形', drawing2d: '図形',
  map: '場所', 'kpi-okr': '行（KPI/OKR）', 'twin-view': 'ノード', sources: '行（出典）', 'mock-app': '図形（画面の部品）',
  usecase: '行（ユースケース）', 'data-catalog': '行（データエンティティ）', 'spatial-view': '図形（空間）', whiteboard: '付箋',
  themes: '行（議論テーマ）', 'genai-scenario': '行（シナリオ）', chat: 'メッセージ',
};

const DATA_SELECTOR = [
  '[data-entity-id]', 'tbody tr', '[role="row"]', '[role="listitem"]', 'li', '[data-node-id]', '[data-sticky-id]',
  'svg rect', 'svg circle', 'svg path', 'canvas', '[role="log"] *', '[data-testid^="chat-message"]',
].join(', ');
const EMPTY = /データなし|データがありません|空です|0 件|0件/;

async function guideOf(kind: 'mono' | 'koto', key: string): Promise<string> {
  const g = examplePack(kind).json('customer').screenGuides ?? {};
  return String(g[key] ?? '');
}

for (const kind of ['mono', 'koto'] as const) {
  test.describe(`FR-287 デモ（${kind}）`, () => {
    // FR-287 AC-749
    test(`FR-287 AC-749 ${kind}: 27 画面のどれも、見出しまたは補足に screenGuides の説明が表示される`, async ({ page, start }) => {
      await start({ pack: kind });
      const missing: string[] = [];
      for (const key of KEYS) {
        const guide = await guideOf(kind, key);
        expect(guide.length, `${key}: screenGuides がない`).toBeGreaterThan(0);
        const c = await openScreen(page, key);
        const shown = (await c.innerText()).replace(/\s+/g, '');
        if (!shown.includes(guide.replace(/\s+/g, ''))) missing.push(key);
        if (key === 'settings') await closeSettings(page);
      }
      expect(missing, `説明が表示されない画面: ${missing.join(', ')}`).toEqual([]);
    });

    // FR-287 AC-750
    test(`FR-287 AC-750 ${kind}: 設定パネルを除く 26 画面がデータを 1 件以上表示し、「データなし」「空」「0 件」にならない`, async ({ page, start }) => {
      await start({ pack: kind });
      expect(Object.keys(DATA_KIND)).toHaveLength(26);
      const problems: string[] = [];
      for (const key of KEYS.filter((k) => k !== 'settings')) {
        const c = await openScreen(page, key);
        const text = await c.innerText();
        // 画面の説明（screenGuides）自体に含まれる語は除いて、空表示の語を調べる
        const body = text.replace(await guideOf(kind, key), '');
        if (EMPTY.test(body)) problems.push(`${key}: 空の表示（${DATA_KIND[key]}）`);
        else if ((await c.locator(DATA_SELECTOR).count()) < 1) problems.push(`${key}: ${DATA_KIND[key]}が 0 件`);
      }
      expect(problems, problems.join(' / ')).toEqual([]);
    });
  });
}

test.describe('FR-287 デモと実際の Project の分離', () => {
  // FR-287 AC-752
  test('FR-287 AC-752 実際の Project の画面に、デモの screenGuides・企業名が現れない', async ({ page, start }) => {
    await start({ pack: null, skipOpening: false });
    await chooseWorkTarget(page, /実|新規|Project|…|\//);
    const mono = examplePack('mono');
    const koto = examplePack('koto');
    const forbidden = [mono.customerName, koto.customerName];
    for (const k of ['mono', 'koto'] as const) forbidden.push(...Object.values<string>(examplePack(k).json('customer').screenGuides ?? {}));
    const seen: string[] = [];
    for (const key of KEYS) {
      const c = await openScreen(page, key);
      const t = (await c.innerText()).replace(/\s+/g, '');
      for (const f of forbidden) if (f && t.includes(f.replace(/\s+/g, ''))) seen.push(`${key}: ${f.slice(0, 20)}`);
      if (key === 'settings') await closeSettings(page);
    }
    expect(seen, `デモの内容が実際の Project に現れた: ${seen.join(' / ')}`).toEqual([]);
  });

  // FR-287 AC-752（異常系: デモの編集・削除が実際の Project に影響しない）
  test('FR-287 AC-752 デモで行を削除しても、実際の Project の一覧表に影響しない（異常系: 混入なし）', async ({ page, start }) => {
    await start({ pack: 'mono' });
    await openScreen(page, 'table');
    await setEditMode(page, true);
    const before = await tableRows(component(page, 'table')).count();
    expect(before).toBeGreaterThan(0);
    await tableRows(component(page, 'table')).first().click();
    await component(page, 'detail').getByRole('button', { name: '削除' }).click();
    await expect(tableRows(component(page, 'table'))).toHaveCount(before - 1);
    // 実際の Project へ切り替える（作業先の選択）
    await page.reload();
    await chooseWorkTarget(page, /実|新規|Project|…|\//);
    await openScreen(page, 'table');
    const t = await component(page, 'table').innerText();
    expect(t).not.toContain(examplePack('mono').customerName);
  });
});
