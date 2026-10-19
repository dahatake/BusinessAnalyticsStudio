// FR-235（グラフ適性の判断基準）・FR-241（顧客パックの任意項目と後方互換）の単体テスト
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EntitiesSchema, MEANINGS, MEANING_LABELS, readMeaning, kpiStageOf, KpiStagesSchema } from '../../src/schema';
import {
  DEFAULT_JUDGMENTS, judgeGraphSuitability, judgeRelations,
} from '../../src/graphmodel';

const loadEntities = (pack: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../examples/${pack}/public/data/entities.json`), 'utf8'));
const src = ['src-1'];
const ent = (id: string, world: 'real' | 'digital', extra: object = {}) => ({ id, createdBy: 'sample', type: 'x', name: id, world, kind: world === 'real' ? 'thing' : 'data', sourceIds: src, ...extra });
const base = (over: object = {}) => ({ entities: [ent('a', 'real'), ent('b', 'digital')], ...over });
const paths = (v: unknown) => {
  const r = EntitiesSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('FR-235 グラフ適性の判断基準', () => {
  // FR-235 AC-545
  it('FR-235 AC-545 因果で経路の問いは「向く」、時間の前後だけはガント・表を推奨して「向かない」、向き・意味なしは理由が返る', () => {
    const ok = judgeGraphSuitability({ meaning: 'causes', directed: true, question: 'path' });
    expect(ok.suitable).toBe(true);
    const time = judgeGraphSuitability({ nature: 'timeOrder' });
    expect(time.suitable).toBe(false);
    expect(time.recommended.some((r) => r === 'gantt' || r === 'table')).toBe(true);
    expect(judgeGraphSuitability({ meaning: 'causes', directed: false }).reason).toContain('向きなし');
    expect(judgeGraphSuitability({}).reason).toContain('意味なし');
    expect(judgeGraphSuitability({ meaning: 'bogus' }).suitable).toBe(false);
    const input = { meaning: 'owns', question: 'hub' } as const;
    expect(judgeGraphSuitability(input)).toEqual(judgeGraphSuitability(input));
  });

  // FR-235 AC-545 既定の判定の対応表（AC-547 の元になる七つの向く組と一つの向かない組）
  it('FR-235 AC-547 既定の判定は七つが「向く」・議題→次のアクションの性質が「向かない」', () => {
    const results = DEFAULT_JUDGMENTS.map((d) => judgeGraphSuitability({ meaning: d.meaning, question: d.question, nature: d.nature }).suitable);
    expect(results).toEqual(DEFAULT_JUDGMENTS.map((d) => d.suitable));
    expect(results.filter(Boolean)).toHaveLength(7);
    const s = judgeRelations([{ from: 'a', to: 'b', meaning: 'causes' }, { from: 'b', to: 'c', nature: 'timeOrder' }, { from: 'c', to: 'd' }]);
    expect([s.suitable, s.unsuitable, s.total]).toEqual([1, 2, 3]);
  });

  // FR-235 AC-546
  it('FR-235 AC-546 九つの意味の種類は名前と「A は B に〜」の読み方を持ち、顧客固有の語がなく、九つ以外は不正', () => {
    expect(MEANINGS).toHaveLength(9);
    for (const m of MEANINGS) {
      expect(MEANING_LABELS[m].name.length).toBeGreaterThan(0);
      expect(readMeaning(m, 'A', 'B')).toMatch(/^A は B.+/);
    }
    expect(readMeaning('influences', 'A', 'B')).toBe('A は B に影響する');
    const bad = { entities: [ent('a', 'real'), ent('b', 'real')], relations: [{ from: 'a', to: 'b', meaning: 'likes' }] };
    expect(paths(bad)).toContain('relations.0.meaning');
  });
});

describe('FR-241 顧客パックの任意項目と後方互換', () => {
  // FR-241 AC-576
  it.each(['mono', 'koto'])('FR-241 AC-576 任意項目のないお手本パック（%s）の entities.json は変更なしで合格する', (pack) => {
    expect(EntitiesSchema.safeParse(loadEntities(pack)).success).toBe(true);
  });

  // FR-241 AC-577
  it('FR-241 AC-577 正しい任意項目は合格する', () => {
    const v = base({
      entities: [ent('a', 'real'), ent('b', 'digital', { layer: 'insights' }), ent('f', 'real', { kind: 'floor' }), ent('r', 'real', { kind: 'room', parentId: 'f' })],
      relations: [{ from: 'a', to: 'b', meaning: 'measures', label: '見張る' }],
      flows: [{ id: 'fl-1', createdBy: 'sample', from: 'a', to: 'b', kind: 'control', label: 'x', sourceIds: src }],
    });
    expect(paths(v)).toEqual([]);
    expect(KpiStagesSchema.safeParse({ boundaries: [10, 20], betterWhen: 'low' }).success).toBe(true);
  });

  // FR-241 AC-577
  it('FR-241 AC-577 不正な任意項目は位置を示す検証エラーになる', () => {
    const flow = (o: object) => ({ id: 'fl-1', createdBy: 'sample', from: 'a', to: 'b', kind: 'data', label: 'x', sourceIds: src, ...o });
    expect(paths(base({ flows: [flow({ kind: 'beam' })] }))).toContain('flows.0.kind');
    expect(paths(base({ flows: [flow({ to: 'zzz' })] }))).toEqual(expect.arrayContaining([]));
    expect(paths({ entities: [ent('a', 'digital'), ent('b', 'digital')], flows: [flow({})] })).toContain('flows.0.to');
    expect(paths(base({ entities: [ent('a', 'real'), ent('b', 'digital', { layer: 'core' })] }))).toContain('entities.1.layer');
    expect(paths(base({ relations: [{ from: 'a', to: 'nope', meaning: 'owns' }] }))).toContain('relations.0.to');
    expect(KpiStagesSchema.safeParse({ boundaries: [20, 10] }).success).toBe(false);
    const r = EntitiesSchema.safeParse(base({ entities: [ent('a', 'real'), ent('b', 'digital')], relations: [{ from: 'a', to: 'b', meaning: 'x' }] }));
    expect(r.success).toBe(false);
  });

  // FR-241 AC-577（KPI の段階を okr の kpi・metrics に持つ）
  it('FR-241 AC-577 KPI の段階の境界から良・注意・要対応を求め、値がなければ undefined', () => {
    const hi = { boundaries: [50, 80] as [number, number] };
    expect([kpiStageOf(90, hi), kpiStageOf(60, hi), kpiStageOf(10, hi), kpiStageOf(undefined, hi)]).toEqual(['good', 'caution', 'action', undefined]);
    const lo = { boundaries: [20, 25] as [number, number], betterWhen: 'low' as const };
    expect([kpiStageOf(18, lo), kpiStageOf(22, lo), kpiStageOf(30, lo)]).toEqual(['good', 'caution', 'action']);
  });

  // FR-241 AC-578
  it('FR-241 AC-578 共通の語彙のソースにお手本パックの固有名を含まない', () => {
    const text = ['src/schema/graph.ts', 'src/graphmodel/suitability.ts', 'src/graphmodel/index.ts']
      .map((f) => fs.readFileSync(path.resolve(__dirname, '../..', f), 'utf8')).join('\n');
    for (const pack of ['mono', 'koto']) {
      const customer = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../examples/${pack}/public/data/customer.json`), 'utf8'));
      expect(text).not.toContain(customer.name);
      expect(text).not.toContain(customer.projectName);
    }
  });
});
