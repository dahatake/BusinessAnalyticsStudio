import { describe, expect, it } from 'vitest';
import { newFadeState, sampleGhosts, syncFade } from '../../src/ink/fade';
import { makeShape, makeStroke } from '../../src/ink/model';

const stroke = makeStroke('pen', '#000', 2, [{ x: 0, y: 0, p: 0.5 }, { x: 50, y: 50, p: 0.5 }]);
const shape = makeShape('rect', 0, 0, 40, 30, '#000', 2);

describe('FR-070 AC-086 ホワイトボードの削除・undo の出入り（ink/fade）', () => {
  it('消えたストローク・項目は薄れながら残り、2000ms 以内に消えて残らない', () => {
    const st = newFadeState('b1', { strokes: [stroke], items: [shape] });
    syncFade(st, { strokes: [], items: [] }, 1000, 500);
    const mid = sampleGhosts(st, 1250, 500);
    expect(mid).toHaveLength(1);
    expect(mid[0]!.life).toBeGreaterThan(0);
    expect(mid[0]!.life).toBeLessThan(1);
    expect(mid[0]!.strokes).toHaveLength(1);
    expect(mid[0]!.items).toHaveLength(1);
    expect(sampleGhosts(st, 1500, 500)).toHaveLength(0);
    expect(st.ghosts.size).toBe(0);
  });

  it('動き停止・reduce（durationMs=0）では遷移なしに最終状態（ゴーストなし）', () => {
    const st = newFadeState('b1', { strokes: [stroke], items: [] });
    syncFade(st, { strokes: [], items: [] }, 1000, 0);
    expect(sampleGhosts(st, 1000, 0)).toHaveLength(0);
  });

  it('消え始めに同じ ID が戻ったら（redo）ゴーストを外す。変化がなければ何も作らない', () => {
    const st = newFadeState('b1', { strokes: [stroke], items: [] });
    syncFade(st, { strokes: [stroke], items: [] }, 100, 500);
    expect(st.ghosts.size).toBe(0);
    syncFade(st, { strokes: [], items: [] }, 200, 500);
    expect(st.ghosts.size).toBe(1);
    syncFade(st, { strokes: [stroke], items: [] }, 300, 500);
    expect(st.ghosts.size).toBe(0);
  });
});
