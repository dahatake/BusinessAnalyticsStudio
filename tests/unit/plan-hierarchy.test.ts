import { describe, expect, it } from 'vitest';
import { flattenTree } from '../../src/plan/hierarchy';

type N = { id: string; p?: string };
const items: N[] = [{ id: 'a' }, { id: 'b', p: 'a' }, { id: 'c', p: 'b' }, { id: 'd' }, { id: 'x', p: 'missing' }];
const run = (collapsed: string[] = []) => flattenTree(items, (n) => n.id, (n) => n.p, new Set(collapsed));

describe('flattenTree', () => {
  // FR-035 AC-042: 展開すると下位の行が出る
  it('FR-035 AC-042 展開されていると、親の直後に下位の行が深さつきで並ぶ', () => {
    expect(run().map((r) => [r.item.id, r.depth])).toEqual([['a', 0], ['b', 1], ['c', 2], ['d', 0], ['x', 0]]);
    expect(run().find((r) => r.item.id === 'a')).toMatchObject({ hasChildren: true, expanded: true });
  });

  // FR-035 AC-042: 折りたたむと隠れる
  it('FR-035 AC-042 折りたたむと下位の行（孫を含む）が隠れる', () => {
    expect(run(['a']).map((r) => r.item.id)).toEqual(['a', 'd', 'x']);
    expect(run(['b']).map((r) => r.item.id)).toEqual(['a', 'b', 'd', 'x']);
    expect(run(['a']).find((r) => r.item.id === 'a')?.expanded).toBe(false);
  });

  // FR-035 AC-042: 親が表にない項目は最上位、循環しても 1 度ずつ
  it('FR-035 AC-042 循環していても各項目を 1 度だけ返す', () => {
    const loop: N[] = [{ id: 'p', p: 'q' }, { id: 'q', p: 'p' }];
    expect(flattenTree(loop, (n) => n.id, (n) => n.p, new Set()).map((r) => r.item.id).sort()).toEqual(['p', 'q']);
  });
});
