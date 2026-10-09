// FR-001〜FR-005 の単体テスト（課題-解決策分析のロジックとスキーマ）
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildMeceGroups, buildTreeRows, evaluationItems, filterIssues, filterSolutions, productFits, safeHttpUrl,
  type Issue, type Product, type Solution,
} from '../../src/analysis/model';
import { disableInvalidItems, validatePack, type PackFiles } from '../../src/schema';

const EXAMPLE = path.resolve(__dirname, '../../examples/mono/public');
const readPack = (): PackFiles => {
  const out: Record<string, unknown> = {};
  for (const f of fs.readdirSync(path.join(EXAMPLE, 'data'))) {
    if (f.endsWith('.json')) out[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(EXAMPLE, 'data', f), 'utf8'));
  }
  out.brandProfile = JSON.parse(fs.readFileSync(path.join(EXAMPLE, 'brand/brand-profile.json'), 'utf8'));
  return out as PackFiles;
};

const issue = (id: string, parentId: string | null, audience: 'internal' | 'external'): Issue =>
  ({ id, createdBy: 'sample', parentId, title: id, audience }) as Issue;

describe('FR-001 AC-001 イシューツリー', () => {
  const all = [issue('a', null, 'internal'), issue('b', 'a', 'internal'), issue('c', 'b', 'external'), issue('d', null, 'external')];

  it('上位課題→下位課題の順に、階層つきで並べる', () => {
    const rows = buildTreeRows(all, all, new Set());
    expect(rows.map((r) => [r.issue.id, r.level])).toEqual([['a', 0], ['b', 1], ['c', 2], ['d', 0]]);
    expect(rows[0]).toMatchObject({ hasChildren: true, expanded: true });
  });

  it('折りたたむと下位を含めない', () => {
    const rows = buildTreeRows(all, all, new Set(['a']));
    expect(rows.map((r) => r.issue.id)).toEqual(['a', 'd']);
    expect(rows[0]).toMatchObject({ expanded: false });
  });

  it('MECE: 各課題はちょうど 1 つの上位課題の群に入る', () => {
    const groups = buildMeceGroups(all, all);
    expect(groups.map((g) => g.members.map((m) => m.issue.id))).toEqual([['a', 'b', 'c'], ['d']]);
  });
});

describe('FR-002 AC-002 区分', () => {
  const all = [issue('a', null, 'internal'), issue('b', 'a', 'external'), issue('c', null, 'external')];

  it('区分で絞り込める', () => {
    expect(filterIssues(all, 'external').map((i) => i.id)).toEqual(['b', 'c']);
    expect(filterIssues(all, 'internal').map((i) => i.id)).toEqual(['a']);
    expect(filterIssues(all, 'all')).toHaveLength(3);
  });

  it('絞り込みで上位が消えても、残る最も近い上位からの深さになる', () => {
    const rows = buildTreeRows(all, filterIssues(all, 'external'), new Set());
    expect(rows.map((r) => [r.issue.id, r.level])).toEqual([['b', 0], ['c', 0]]);
  });

  it('絞り込んだ課題の解決策だけが残る', () => {
    const sols = [{ id: 's1', issueId: 'a' }, { id: 's2', issueId: 'b' }] as Solution[];
    expect(filterSolutions(sols, filterIssues(all, 'external')).map((s) => s.id)).toEqual(['s2']);
  });

  it('区分のない課題は、課題の ID つきでスキーマ検証のエラーになる', () => {
    const files = readPack();
    const list = (files.issues as { issues: Array<Record<string, unknown>> }).issues;
    const bad = list[list.length - 1]!;
    delete bad.audience;
    const errors = validatePack(files).errors.filter((e) => e.code === 'schema');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ file: 'public/data/issues.json', path: `issues[${list.length - 1}].audience`, id: bad.id });
  });

  it('お手本パックは検証を通り、社内向け・社外向けの両方を含む', () => {
    const files = readPack();
    expect(validatePack(files).errors).toEqual([]);
    const audiences = new Set((files.issues as { issues: Issue[] }).issues.map((i) => i.audience));
    expect(audiences).toEqual(new Set(['internal', 'external']));
  });
});

describe('FR-002 AC-002 / FR-102 AC-124 区分のない課題の部分的な無効化', () => {
  const load = () => {
    const files = JSON.parse(JSON.stringify(readPack())) as PackFiles;
    return { files, list: (files.issues as { issues: Array<Record<string, any>> }).issues, sols: (files.issues as { solutions: Array<Record<string, any>> }).solutions };
  };

  // FR-002 AC-002, FR-102 AC-124
  it('FR-002 AC-002 末尾の課題の audience がなくても、その課題だけが無効になり、他の課題と解決策は残る', () => {
    const { files, list, sols } = load();
    const bad = list[list.length - 1]!;
    delete bad.audience;
    const r = disableInvalidItems(files);
    expect(r.fatal).toBe(false);
    expect(r.issues[0]).toMatchObject({ file: 'public/data/issues.json', path: `issues[${list.length - 1}].audience`, id: bad.id });
    expect(r.disabledIds).toEqual([bad.id]);
    const rest = r.files.issues as { issues: Array<{ id: string }>; solutions: Array<{ id: string }> };
    expect(rest.issues.map((i) => i.id)).toEqual(list.slice(0, -1).map((i) => i.id));
    expect(rest.solutions.map((s) => s.id)).toEqual(sols.map((s) => s.id));
  });

  // FR-002 AC-002, FR-102 AC-124（現状の仕様の固定。要求との食い違いは CONFLICTS として報告済み）
  it('FR-002 AC-002 上位課題の audience がないと、その課題を参照する下位課題と解決策も連鎖で無効になる', () => {
    const { files, list } = load();
    const parent = list.find((i) => i.parentId === null && list.some((c) => c.parentId === i.id))!;
    delete parent.audience;
    const r = disableInvalidItems(files);
    const children = list.filter((c) => c.parentId === parent.id).map((c) => c.id);
    expect(r.disabledIds).toEqual(expect.arrayContaining([parent.id, ...children]));
    // 無関係な課題は残る
    const unrelated = list.filter((i) => i.id !== parent.id && !children.includes(i.id)).map((i) => i.id);
    const rest = (r.files.issues as { issues: Array<{ id: string }> }).issues.map((i) => i.id);
    expect(unrelated.length).toBeGreaterThan(0);
    for (const id of unrelated) expect(rest).toContain(id);
  });
});

describe('FR-003 AC-003 評価属性', () => {
  it('5 項目を、値（単位つき）と出典 ID で並べる', () => {
    const files = readPack();
    const first = (files.issues as { issues: Issue[] }).issues[0]!;
    const items = evaluationItems(first);
    expect(items.map((i) => i.label)).toEqual(['優先順位', 'コスト', 'ROI', '実現性', 'リスク']);
    for (const item of items) {
      expect(item.display, item.label).toBeTruthy();
      expect(item.sourceIds.length, item.label).toBeGreaterThan(0);
    }
    expect(items[0]!.display).toBe('1 位');
  });

  it('未設定の項目は display が空で、出典も空', () => {
    const items = evaluationItems(issue('x', null, 'internal'));
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.display === undefined && i.sourceIds.length === 0)).toBe(true);
  });

  it('出典のない評価値はスキーマ検証のエラー（FR-115）', () => {
    const files = readPack();
    const first = (files.issues as { issues: Array<{ evaluation: { roi: Record<string, unknown> } }> }).issues[0]!;
    first.evaluation.roi.sourceIds = [];
    expect(validatePack(files).errors.some((e) => e.path.startsWith('issues[0].evaluation.roi'))).toBe(true);
  });
});

describe('FR-004 AC-004 出典の URL', () => {
  it('http/https だけをリンクにする', () => {
    expect(safeHttpUrl('https://example.invalid/a')).toBe('https://example.invalid/a');
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeHttpUrl('not a url')).toBeUndefined();
    expect(safeHttpUrl(undefined)).toBeUndefined();
  });
});

describe('FR-005 AC-005 Microsoft 製品と適合理由', () => {
  const products = [{ id: 'p1', name: '製品 1' }, { id: 'p2', name: '製品 2' }] as Product[];

  it('関連付けた製品と、その適合理由を返す', () => {
    const sol = { id: 's', issueId: 'i', productIds: ['p2'], productFits: [{ productId: 'p2', reason: '理由 2' }] } as Solution;
    expect(productFits(sol, products)).toEqual([{ product: products[1], reason: '理由 2' }]);
  });

  it('適合理由がない製品は reason が空になる', () => {
    const sol = { id: 's', issueId: 'i', productIds: ['p1'] } as Solution;
    expect(productFits(sol, products)).toEqual([{ product: products[0], reason: undefined }]);
  });

  it('製品が 0 件なら空配列（画面は「製品の関連付けなし」）', () => {
    expect(productFits({ id: 's', issueId: 'i', productIds: [] } as unknown as Solution, products)).toEqual([]);
    expect(productFits({ id: 's', issueId: 'i' } as Solution, products)).toEqual([]);
  });
});
