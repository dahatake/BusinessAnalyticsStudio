// FR-295 背面（非表示扱い）の状態・一覧・バッジ・巡回・呼び出し、FR-296 PARAM-136 の数え方の単体テスト
// AC-797・AC-824・AC-872・AC-873・AC-874
import { describe, expect, it } from 'vitest';
import { leaf, split } from '../../src/workspace/layoutModel';
import { MAX_DEFAULT_VISIBLE, decideLeftover } from '../../src/workspace/windowLimits';
import { navSummary, navTarget, shownCount, switchOrder, windowStates, WINDOW_STATE_LABEL } from '../../src/workspace/windowStates';

const layout = split('row', [leaf('a'), leaf('b'), leaf('c'), leaf('d')]);
const base = { keys: ['a', 'b', 'c', 'd', 'e'], layout, minimized: new Set<string>(), closed: new Set<string>(), usedAt: { a: 4, b: 3, c: 2, d: 1 } };

describe('FR-295 背面（非表示扱い）', () => {
  it('FR-295 AC-797 AC-872 背面は「背面」の状態で一覧に残り、前面にならない', () => {
    const st = windowStates({ ...base, behind: new Set(['a', 'c']) });
    expect(st.a).toBe('behind');
    expect(st.c).toBe('behind');
    expect(st.b).toBe('front'); // 背面を除いた表示中のうち最も最近使ったもの
    expect(st.d).toBe('visible');
    expect(st.e).toBe('minimized'); // 木にない・閉じていない
    expect(WINDOW_STATE_LABEL.behind).toBe('背面');
  });

  it('FR-295 AC-797 最小化は背面より優先し、閉じたものは閉じたまま', () => {
    const st = windowStates({ ...base, minimized: new Set(['a']), closed: new Set(['e']), behind: new Set(['a', 'e']) });
    expect(st.a).toBe('minimized');
    expect(st.e).toBe('closed');
  });

  it('FR-295 AC-824 左メニューのバッジ・青いバーは背面を数えない（背面だけの画面には出ない）', () => {
    const st = windowStates({ ...base, behind: new Set(['c', 'd']) });
    const sum = navSummary(st, { a: 'S1', b: 'S1', c: 'S2', d: 'S2', e: 'S3' });
    expect(sum.S1).toEqual({ count: 2, hasFront: true });
    expect(sum.S2).toBeUndefined();
    expect(sum.S3).toEqual({ count: 1, hasFront: false }); // 最小化は数える
  });

  it('FR-295 AC-872 背面を前面に出して通常の表示中にすると、バッジの数に含まれる', () => {
    const st = windowStates({ ...base, behind: new Set(['c']) });
    expect(navSummary(st, { c: 'S2' }).S2).toBeUndefined();
    const after = windowStates({ ...base, behind: new Set() });
    expect(after.c).toBe('visible');
    expect(navSummary(after, { c: 'S2' }).S2).toEqual({ count: 1, hasFront: false });
  });

  it('FR-295 AC-872 AC-873 Ctrl+Alt+PageDown／PageUp の巡回に背面を含めない', () => {
    const st = windowStates({ ...base, behind: new Set(['b', 'c']) });
    const order = switchOrder(st, base.usedAt);
    expect(order).not.toContain('b');
    expect(order).not.toContain('c');
    expect(order[0]).toBe('a');
    expect(order).toContain('d');
  });

  it('FR-295 AC-873 ⑦ 左メニューの項目は、背面だけの画面では最後に背面へ回ったものを前面に出す（Q-084 A）', () => {
    const st = windowStates({ ...base, behind: new Set(['c', 'd']) });
    expect(navTarget('S2', st, { c: 'S2', d: 'S2' }, base.usedAt, ['d', 'c'])).toEqual({ key: 'c', state: 'behind' });
    expect(navTarget('S2', st, { c: 'S2', d: 'S2' }, base.usedAt, ['c', 'd'])).toEqual({ key: 'd', state: 'behind' });
    // 開いているものがあれば背面は対象にしない（開いているもの優先）
    expect(navTarget('S1', st, { a: 'S1', c: 'S1' }, base.usedAt, ['c'])?.key).toBe('a');
  });
});

describe('FR-305 AC-865 AC-876 余りを背面へ回す時点（順次の埋めの終了時。Q-089 A）', () => {
  it('FR-305 AC-865 途中で閉じた例: 残り 4・空の区画 2 → 残り 4 が背面へ（選んだものは含まない）', () => {
    expect(decideLeftover(['c', 'd', 'e', 'f'], 2)).toEqual(['c', 'd', 'e', 'f']);
  });
  it('FR-305 AC-865 AC-876 残りが空の区画以下なら背面へ回るものはない（残り 2・空の区画 2）', () => {
    expect(decideLeftover(['e', 'f'], 2)).toEqual([]);
    expect(decideLeftover([], 0)).toEqual([]);
  });
  it('FR-305 AC-865 完了時（空の区画 0）に残りがあれば背面へ', () => {
    expect(decideLeftover(['e'], 0)).toEqual(['e']);
  });
});

describe('FR-296 PARAM-136 の数え方（AC-874）', () => {
  it('FR-296 AC-874 背面は数えず、ピン止め中の表示中は数える。前面に出した後は数える', () => {
    // ピン止め中のものは windowStates 上は表示中として残る（ピン止め中でも背面に回らない＝behind に入らない）
    const st = windowStates({ ...base, behind: new Set(['b', 'c']) });
    expect(shownCount(st)).toBe(2); // a（前面）・d（表示中。ピン止め中でも数える）
    expect(shownCount(windowStates({ ...base, behind: new Set(['c']) }))).toBe(3);
    expect(shownCount(windowStates({ ...base, behind: new Set() }))).toBe(MAX_DEFAULT_VISIBLE);
  });
});
