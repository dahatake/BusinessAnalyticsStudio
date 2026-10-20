// FR-240 AC-571〜AC-575（空間ビューのモデル: 階層、KPI の段階、集約しない、等角投影）
import { describe, expect, it } from 'vitest';
import { SPATIAL_ELEMENT_DEPTH, buildSpatialModel, buildingSite, detailTarget, isoProject, itemsAtDepth, kpiCell } from '../../src/spatial';

const stages = { boundaries: [50, 80] as [number, number] };
const entities = [
  { id: 's1', name: '本社', type: 'site' },
  { id: 'f1', name: '1 階', type: 'site', kind: 'floor', parentId: 's1' },
  { id: 'f2', name: '2 階', type: 'site', kind: 'floor', parentId: 's1' },
  { id: 'r1', name: '会議室 A', type: 'site', kind: 'room', parentId: 'f1' },
  { id: 'r2', name: '会議室 B', type: 'site', kind: 'room', parentId: 'f1' },
  { id: 'r3', name: '執務室', type: 'site', kind: 'room', parentId: 'f2' },
  { id: 'e1', name: '空調', type: 'x', kind: 'equipment', parentId: 'r1' },
  { id: 'm1', name: '利用率センサー', type: 'x', kind: 'metric', world: 'digital', metrics: [{ label: '利用率', unit: '%', value: 90, stages }] },
  { id: 'm2', name: '利用率センサー 2', type: 'x', kind: 'metric', metrics: [{ label: '利用率', unit: '%', value: 60, stages }] },
  { id: 'm3', name: '利用率センサー 3', type: 'x', kind: 'metric', metrics: [{ label: '利用率', unit: '%', value: 10, stages }] },
];
const twins = [
  { realId: 'r1', digitalId: 'm1', relation: 'measures' },
  { realId: 'r2', digitalId: 'm2', relation: 'measures' },
  { realId: 'r3', digitalId: 'm3', relation: 'measures' },
  { realId: 'f1', digitalId: 'm1', relation: 'represents' },
];
const m = buildSpatialModel(entities, twins);

describe('FR-240 AC-571 空間階層', () => {
  it('階層は 5 段（D=3）で、各段の項目の種別が 拠点・フロア・部屋/設備 になる', () => {
    expect(SPATIAL_ELEMENT_DEPTH).toBe(3);
    expect(itemsAtDepth(m, 1, []).map((n) => n.kind)).toEqual(['site']);
    expect(itemsAtDepth(m, 2, []).map((n) => n.kind)).toEqual(['floor', 'floor']);
    expect(new Set(itemsAtDepth(m, 3, []).map((n) => n.kind))).toEqual(new Set(['room', 'equipment']));
    expect(itemsAtDepth(m, 4, [])).toEqual([]);
  });
  it('上位の項目を選ぶと、その配下だけに絞る', () => {
    expect(itemsAtDepth(m, 3, ['f2']).map((n) => n.id)).toEqual(['r3']);
    expect(buildingSite(m, ['r3'])).toBe('s1');
    expect(detailTarget(m, ['r2'])?.id).toBe('r2');
    expect(detailTarget(m, [])?.kind).toBe('room');
  });
});

describe('FR-240 AC-573 KPI の値と段階（色に加えて形・文字）', () => {
  it('段階の境界で良・注意・要対応を決め、形と文字を付ける', () => {
    expect(kpiCell(m, 'r1', '利用率')).toMatchObject({ state: 'value', stage: 'good', glyph: '●', stageLabel: '良' });
    expect(kpiCell(m, 'r2', '利用率')).toMatchObject({ stage: 'caution', glyph: '▲' });
    expect(kpiCell(m, 'r3', '利用率')).toMatchObject({ stage: 'action', glyph: '■' });
    expect(kpiCell(m, 'r1', '利用率').text).toContain('90 %');
  });
});

describe('FR-240 AC-574 値がなければデータなし。下位から集計しない', () => {
  it('部屋は「データなし」、フロア・拠点は計測する関係がなければ「集計なし」（represents は値を与えない）', () => {
    expect(kpiCell(m, 'e1', '利用率').text).toBe('データなし');
    expect(kpiCell(m, 'f1', '利用率')).toMatchObject({ state: 'none' });
    expect(kpiCell(m, 'f1', '利用率').text).toContain('集計なし');
    expect(kpiCell(m, 's1', '利用率').text).toContain('データなし');
    expect(kpiCell(m, 'r1', undefined).state).toBe('none');
  });
});

describe('FR-240 AC-572 等角投影', () => {
  it('x と y の軸が同じ角度（30°）で、高さは画面の上へ', () => {
    const a = isoProject(1, 0, 0); const b = isoProject(0, 1, 0);
    expect(a.sx).toBeCloseTo(-b.sx); expect(a.sy).toBeCloseTo(b.sy);
    expect(Math.abs(a.sy / a.sx)).toBeCloseTo(Math.tan(Math.PI / 6));
    expect(isoProject(0, 0, 10).sy).toBe(-10);
  });
});
