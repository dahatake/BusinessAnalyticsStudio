import { beforeEach, describe, expect, it } from 'vitest';
import { METHODS, SCORE, compute, defaultParams, filterItems, getMethod, parseField } from '../../src/methods/model';
import { analysisResult, resetAnalyses, useAnalyses } from '../../src/store/analyses';

const st = () => useAnalyses.getState();
const an = () => {
  const a = st().byProject['p1'];
  if (!a) throw new Error('分析がない');
  return a;
};
const fid = (m: 'swot' | '3c' | 'bsc', i: number) => {
  const f = getMethod(m).factors[i];
  if (!f) throw new Error('項目がない');
  return f.id;
};

describe('FR-133 分析手法の選択と開始', () => {
  beforeEach(resetAnalyses);

  // FR-133 AC-195
  it('FR-133 AC-195 一覧に 5 手法があり、開始すると入力欄（項目ごとの値と重み）を持つ分析ができる', () => {
    expect(METHODS.map((m) => m.name)).toEqual(['SWOT 分析', 'ファイブフォース分析', 'バリューチェーン分析', '3C 分析', 'バランスト・スコアカード']);
    for (const m of METHODS) {
      st().start('p1', m.id);
      expect(Object.keys(an().params)).toHaveLength(m.factors.length);
      expect(an().status).toBe('編集中');
    }
  });

  // FR-133 AC-196（開始元の作業を保持し、戻る先になる）
  it('FR-133 AC-196 開始元の作業が保持される', () => {
    st().start('p1', 'swot', 'KPI 測定');
    expect(an().from).toBe('KPI 測定');
  });
});

describe('FR-134 パラメーターの編集と結果の更新', () => {
  beforeEach(resetAnalyses);

  // FR-134 AC-197
  it('FR-134 AC-197 値を変えると結果（値×重み・分類合計）に反映される', () => {
    st().start('p1', 'swot');
    const id = fid('swot', 0);
    expect(st().setParam('p1', id, 'score', '7').ok).toBe(true);
    expect(st().setParam('p1', id, 'weight', '2').ok).toBe(true);
    const r = analysisResult(an());
    expect(r.items[0]?.value).toBe(14);
    expect(r.totals[0]?.total).toBe(14 + SCORE.def);
  });

  // FR-134 AC-198
  it('FR-134 AC-198 範囲外・型違いは原因と直し方つきで拒否され、ほかの値と結果は変わらない', () => {
    st().start('p1', 'swot');
    const f0 = fid('swot', 0);
    st().setParam('p1', fid('swot', 1), 'score', '8');
    const before = analysisResult(an());
    for (const raw of ['-99999999', '11', 'abc', '', '1e3']) {
      const r = st().setParam('p1', f0, 'score', raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/0〜10|数値/);
    }
    expect(st().setParam('p1', f0, 'weight', '2.5').ok).toBe(false);
    expect(analysisResult(an())).toEqual(before);
    expect(parseField('weight', '6').ok).toBe(false);
  });

  // FR-134 AC-199
  it('FR-134 AC-199 既定値に戻すと全パラメーターが既定値になる', () => {
    st().start('p1', '3c');
    for (const f of getMethod('3c').factors) { st().setParam('p1', f.id, 'score', '1'); st().setParam('p1', f.id, 'weight', '3'); }
    st().resetParams('p1');
    expect(an().params).toEqual(defaultParams(getMethod('3c')));
  });
});

describe('FR-135 ビュアーの切替と結果の確認', () => {
  beforeEach(resetAnalyses);

  // FR-135 AC-200 / NFR-A11Y-005 AC-216（どのビュアーでも同じ値＝表で確認できる値）
  it('FR-135 AC-200 ビュアーを切り替えても選択・絞り込み・結果の値は保たれる', () => {
    st().start('p1', 'swot');
    const id = fid('swot', 2);
    st().select('p1', id); st().setFilter('p1', 'a');
    const before = analysisResult(an());
    for (const v of ['matrix', 'chart', 'table'] as const) {
      st().setViewer('p1', v);
      expect(an().selectedId).toBe(id);
      expect(an().filter).toBe('a');
      expect(analysisResult(an())).toEqual(before);
    }
  });

  // FR-135 AC-200（0 件）
  it('FR-135 AC-200 絞り込みは項目名・分類・ID の部分一致で、0 件もある', () => {
    const items = compute(getMethod('swot'), defaultParams(getMethod('swot'))).items;
    expect(filterItems(items, '')).toHaveLength(items.length);
    expect(filterItems(items, '強み').length).toBe(2);
    expect(filterItems(items, 'zzzz')).toHaveLength(0);
  });

  // FR-135 AC-201
  it('FR-135 AC-201 結果を表示した分析は「結果確認済み」になり、編集で「編集中」に戻る', () => {
    st().start('p1', 'bsc');
    st().confirm('p1');
    expect(an().status).toBe('結果確認済み');
    st().setParam('p1', fid('bsc', 0), 'score', '9');
    expect(an().status).toBe('編集中');
  });
});
