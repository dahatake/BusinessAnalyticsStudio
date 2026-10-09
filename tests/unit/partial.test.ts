// FR-102 AC-124 / FR-116 AC-142 の単体テスト（部分的な無効化・編集時の種別）
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyEdit, disableInvalidItems, parsePath, type PackFiles } from '../../src/schema';
import { REPO_ROOT, readPackFiles } from '../../scripts/lib/pack-fs';

const mono = path.join(REPO_ROOT, 'examples', 'mono');
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('FR-102 顧客パックの部分的な無効化', () => {
  // FR-102 AC-124
  it('FR-102 AC-124 1 件の課題だけが不正なら、その課題だけが無効になり他は残る', () => {
    const files: PackFiles = clone(readPackFiles(mono));
    const issues = (files.issues as any).issues as any[];
    const bad = issues[issues.length - 1];
    bad.title = 12345;
    const r = disableInvalidItems(files);
    expect(r.fatal).toBe(false);
    expect(r.issues[0]!.file).toBe('public/data/issues.json');
    expect(r.issues[0]!.path).toBe(`issues[${issues.length - 1}].title`);
    expect(r.disabledIds).toContain(bad.id);
    const rest = (r.files.issues as any).issues as any[];
    expect(rest.map((i) => i.id)).toEqual(issues.slice(0, -1).map((i) => i.id));
  });

  // FR-102 AC-124
  it('FR-102 AC-124 お手本パックは何も無効にならない', () => {
    const r = disableInvalidItems(clone(readPackFiles(mono)));
    expect(r).toMatchObject({ fatal: false, issues: [], disabledIds: [] });
  });

  // FR-102 AC-124
  it('FR-102 AC-124 項目を特定できない誤り（ファイルの欠け）は起動しない', () => {
    const files: PackFiles = clone(readPackFiles(mono));
    delete (files as any).plan;
    expect(disableInvalidItems(files).fatal).toBe(true);
  });

  // FR-102 AC-124
  it('FR-102 AC-124 無効にした課題を参照する項目も無効になる', () => {
    const files: PackFiles = clone(readPackFiles(mono));
    const solutions = (files.issues as any).solutions as any[];
    const target = solutions[0]!;
    (files.issues as any).issues = (files.issues as any).issues.filter((i: any) => i.id !== target.issueId);
    const r = disableInvalidItems(files);
    expect(r.fatal).toBe(false);
    expect(r.disabledIds).toContain(target.id);
  });

  it('FR-102 AC-124 位置の文字列を分解できる', () => {
    expect(parsePath('issues[2].title')).toEqual(['issues', 2, 'title']);
  });
});

describe('FR-116 編集時の作成者の種別', () => {
  // FR-116 AC-142
  it('FR-116 AC-142 値を編集すると種別が human に変わる', () => {
    const v = { id: 'a', createdBy: 'ai' as const, title: 'x' };
    const e = applyEdit(v, { title: 'y' });
    expect(e).toEqual({ id: 'a', createdBy: 'human', title: 'y' });
    expect(v.createdBy).toBe('ai');
  });
});
