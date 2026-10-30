import { describe, expect, it } from 'vitest';
import { PRESENCE_MAX_MS, lifeOpacity, lifeScale, presenceDuration, presenceSignature, retargetPresence, samplePresence } from '../../src/motion/presence';

const targets = (o: Record<string, number[]>) => new Map(Object.entries(o));

describe('FR-070 AC-086 / FR-045 AC-056 / FR-134 AC-197 出入り・遷移の核（presence）', () => {
  it('追加は life 0→1 で現れ、同じ ID の更新は位置を補間し、削除は life 1→0 で残ってから消える', () => {
    const first = retargetPresence(null, targets({ a: [0, 0], b: [10, 10] }), 0, 0);
    const m = retargetPresence(first, targets({ b: [20, 10], c: [5, 5] }), 1000, 400);
    const mid = samplePresence(m, 1200);
    expect(mid.done).toBe(false);
    expect(mid.frames.get('c')!.life).toBeGreaterThan(0);
    expect(mid.frames.get('c')!.life).toBeLessThan(1);
    expect(mid.frames.get('b')!.vec[0]).toBeGreaterThan(10);
    expect(mid.frames.get('b')!.vec[0]).toBeLessThan(20);
    expect(mid.frames.get('a')).toMatchObject({ exiting: true });
    expect(mid.frames.get('a')!.life).toBeLessThan(1);
    const end = samplePresence(m, 1400);
    expect(end.done).toBe(true);
    expect(end.frames.has('a')).toBe(false); // 削除済みを残さない
    expect(end.frames.get('b')!.vec).toEqual([20, 10]);
    expect(end.frames.get('c')).toMatchObject({ life: 1, exiting: false });
  });

  it('遷移の途中の連続更新は、いまの描画値から最後の目標へ収束する（同一性を保つ）', () => {
    let m = retargetPresence(null, targets({ a: [0] }), 0, 0);
    m = retargetPresence(m, targets({ a: [100] }), 100, 400);
    const before = samplePresence(m, 200).frames.get('a')!.vec[0]!;
    m = retargetPresence(m, targets({ a: [50] }), 200, 400);
    expect(samplePresence(m, 200).frames.get('a')!.vec[0]).toBeCloseTo(before, 6);
    expect(samplePresence(m, 600)).toMatchObject({ done: true });
    expect(samplePresence(m, 600).frames.get('a')!.vec).toEqual([50]);
  });

  it('途中で消えた項目が戻る（undo）と、同じ ID のまま life から現れ直す', () => {
    let m = retargetPresence(null, targets({ a: [1] }), 0, 0);
    m = retargetPresence(m, targets({}), 100, 400);
    m = retargetPresence(m, targets({ a: [1] }), 200, 400);
    const f = samplePresence(m, 200).frames.get('a')!;
    expect(f.exiting).toBe(false);
    expect(f.life).toBeLessThan(1);
    expect(samplePresence(m, 700).frames.get('a')).toMatchObject({ life: 1, vec: [1] });
  });

  it('動きなし（所要 0）は遷移なしで最終状態、所要時間は PARAM-133（2000ms）を超えない', () => {
    const m = retargetPresence(retargetPresence(null, targets({ a: [0], b: [1] }), 0, 0), targets({ b: [9], c: [3] }), 10, 0);
    const s = samplePresence(m, 10);
    expect(s.done).toBe(true);
    expect([...s.frames.keys()].sort()).toEqual(['b', 'c']);
    expect(presenceDuration(500, 1, false)).toBe(0);
    expect(presenceDuration(5000, 3, true)).toBe(PRESENCE_MAX_MS);
  });

  it('署名は内容が同じなら同じ、値・ID が変われば変わる。life の係数は 0〜1 に収まる', () => {
    expect(presenceSignature(targets({ a: [1, 2] }))).toBe(presenceSignature(targets({ a: [1, 2] })));
    expect(presenceSignature(targets({ a: [1, 2] }))).not.toBe(presenceSignature(targets({ a: [1, 3] })));
    expect(lifeOpacity(-1)).toBe(0);
    expect(lifeOpacity(2)).toBe(1);
    expect(lifeScale(0)).toBeCloseTo(0.6);
    expect(lifeScale(1)).toBe(1);
  });
});
