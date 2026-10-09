// 機密確認の対象件数（NFR-SEC-003 AC-178）。確認の画面そのものは System Test（IT-011）で確かめる。
import { describe, expect, it } from 'vitest';
import { countInternal } from '../../src/schema';

describe('NFR-SEC-003 機密確認の件数', () => {
  // NFR-SEC-003 AC-178
  it('NFR-SEC-003 AC-178 internal の項目を深く辿って数える。shareable・区分のない項目は数えない', () => {
    const data = {
      issues: [
        { id: 'a', classification: 'internal', title: '社内' },
        { id: 'b', classification: 'shareable' },
        { id: 'c', title: '区分なし' },
      ],
      nested: { items: [{ id: 'd', classification: 'internal', child: { id: 'e', classification: 'internal' } }] },
    };
    expect(countInternal(data)).toBe(3);
  });

  it('NFR-SEC-003 AC-178 internal がなければ 0（確認の画面を出さない）。null・文字列・空でも壊れない', () => {
    expect(countInternal({ issues: [{ id: 'a', classification: 'shareable' }] })).toBe(0);
    expect(countInternal(null)).toBe(0);
    expect(countInternal('internal')).toBe(0);
    expect(countInternal([])).toBe(0);
    expect(countInternal(undefined)).toBe(0);
  });

  it('NFR-SEC-003 AC-178 入力を変更しない', () => {
    const data = { a: [{ classification: 'internal', v: 1 }] };
    const copy = structuredClone(data);
    countInternal(data);
    expect(data).toEqual(copy);
  });
});
