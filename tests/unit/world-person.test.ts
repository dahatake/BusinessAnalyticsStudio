// FR-213 AC-508: 種別「人」の内容（個人名・連絡先・社員番号）を理由にした検証エラー・警告は 0 件（Q-037）
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validatePack, type PackFiles } from '../../src/schema';
import { REPO_ROOT, readPackFiles, unclassifiedErrors } from '../../scripts/lib/pack-fs';

const mono = path.join(REPO_ROOT, 'examples', 'mono');
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function withPerson(extra: Record<string, unknown>, kind = 'person'): ReturnType<typeof validatePack> {
  const files: PackFiles = clone(readPackFiles(mono));
  const ents = (files.entities as any).entities; // eslint-disable-line @typescript-eslint/no-explicit-any
  ents.push({
    id: 'ent-mono-person-x', createdBy: 'sample', type: 'role', name: '山田 太郎',
    parentId: 'ent-mono-org-mfg', sourceIds: ['src-mono-002'], world: 'real', kind, ...extra,
  });
  return validatePack(files);
}

describe('FR-213 種別「人」の内容は検証の対象にしない', () => {
  // FR-213 AC-508
  it('FR-213 AC-508 個人名・連絡先・社員番号を持つ種別「人」は、エラーも警告も 0 件', () => {
    const base = validatePack(clone(readPackFiles(mono)));
    const v = withPerson({ email: 'taro.yamada@example.com', phone: '03-0000-0000', employeeNo: 'E12345' });
    expect(v.errors).toEqual([]);
    expect(v.unsourcedNumbers).toEqual(base.unsourcedNumbers);
  });

  // FR-213 AC-508
  it('FR-213 AC-508 ほかの検査（種別と世界区分の組み合わせ）の結果は、種別「人」でも「人」でなくても同じ', () => {
    const person = withPerson({}, 'person').errors.length;
    const thing = withPerson({}, 'thing').errors.length;
    expect(person).toBe(thing);
    const bad = withPerson({ world: 'digital' }, 'person'); // 組み合わせの誤りは通常どおりエラー
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  // FR-213 AC-508
  it('FR-213 AC-508 区分なしの検査も種別「人」の内容を理由にしない', () => {
    expect(unclassifiedErrors(mono)).toEqual([]);
  });
});
