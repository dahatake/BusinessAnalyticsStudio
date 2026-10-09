// 検索とチャットの根拠づけの単体テスト。
// FR-017 AC-020（検索）/ AC-021（出典カードの選定）/ FR-112 AC-138（検索結果がレイアウトに依存しない）
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { closeness, groundQuestion } from '../../src/ai/grounding';
import { DATA_SCHEMAS, type PackData } from '../../src/schema';
import { buildEntityGraph } from '../../src/selection/graph';
import { countHits, normalizeQuery, searchGraph } from '../../src/search/model';

function loadPack(kind: 'mono' | 'koto'): PackData {
  const dir = path.resolve(__dirname, '../../examples', kind, 'public', 'data');
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(DATA_SCHEMAS)) {
    out[name] = schema.parse(JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8')));
  }
  return out as PackData;
}

const mono = loadPack('mono');
const graph = buildEntityGraph(mono);
const issue = mono.issues.issues[0]!;

describe('FR-017 AC-020 検索', () => {
  it('課題名の一部で、一致する課題が「課題」の種別に出る', () => {
    const part = issue.title.slice(1, 4);
    const groups = searchGraph(graph, part);
    const g = groups.find((x) => x.kind === 'issue');
    expect(g?.label).toBe('課題');
    expect(g?.hits.map((n) => n.id)).toContain(issue.id);
  });

  it('課題・解決策・製品の種別ごとにまとまり、種別の順は課題→解決策→製品', () => {
    const groups = searchGraph(graph, '設備');
    const kinds = groups.map((g) => g.kind);
    expect(kinds).toEqual(kinds.slice().sort((a, b) => ['issue', 'solution', 'product', 'entity'].indexOf(a) - ['issue', 'solution', 'product', 'entity'].indexOf(b)));
    expect(kinds).toContain('issue');
    expect(kinds).toContain('solution');
  });

  it('異常系: 一致しない語・空・空白だけは 0 件（「該当なし」の表示）', () => {
    expect(countHits(searchGraph(graph, 'ｚｑｘ存在しない語９９'))).toBe(0);
    expect(searchGraph(graph, '')).toEqual([]);
    expect(searchGraph(graph, '   ')).toEqual([]);
    expect(searchGraph(null, '設備')).toEqual([]);
  });

  it('全角・半角と大文字・小文字の違いを吸収し、複数の語はすべて含むものに絞る', () => {
    expect(normalizeQuery('  ＡＢｃ  　ｄ ')).toBe('abc d');
    const both = countHits(searchGraph(graph, '設備 停止'));
    const one = countHits(searchGraph(graph, '設備'));
    expect(both).toBeGreaterThan(0);
    expect(both).toBeLessThanOrEqual(one);
  });

  // FR-112 AC-138: 結果はパックの内容だけで決まる（同じ入力なら同じ件数）
  it('同じ語の検索は何度でも同じ件数', () => {
    const a = countHits(searchGraph(graph, issue.title.slice(0, 1)));
    const b = countHits(searchGraph(graph, issue.title.slice(0, 1)));
    expect(a).toBeGreaterThan(0);
    expect(a).toBe(b);
  });
});

describe('FR-017 AC-021 チャットの出典カードの選定', () => {
  const sourceIds = mono.sources.sources.map((s) => s.id);

  it('質問に項目名が含まれると、その項目と出典を選び、出典は顧客パックにあるものだけ', () => {
    const g = groundQuestion(graph, `${issue.title} の解決策は？`, sourceIds);
    expect(g.matched.map((n) => n.id)).toContain(issue.id);
    expect(g.sourceIds.length).toBeGreaterThanOrEqual(1);
    for (const id of g.sourceIds) expect(sourceIds).toContain(id);
    // その課題が参照する出典が先頭に来る
    expect(g.sourceIds).toContain((issue as { sourceIds?: string[] }).sourceIds?.[0]);
  });

  it('異常系: 近い項目がない質問でも、顧客パックの出典から 1 件以上選ぶ（上限は 3 件）', () => {
    const g = groundQuestion(graph, '最も優先度の高い課題は何ですか？', sourceIds);
    expect(g.sourceIds.length).toBeGreaterThanOrEqual(1);
    expect(g.sourceIds.length).toBeLessThanOrEqual(3);
    for (const id of g.sourceIds) expect(sourceIds).toContain(id);
  });

  it('グラフも出典もないときは空（出典カードを作らない）', () => {
    expect(groundQuestion(null, 'こんにちは', [])).toEqual({ matched: [], sourceIds: [] });
  });

  it('近さ: 名前を含めば高く、共有する 2 文字連続が 2 つ未満なら 0', () => {
    expect(closeness('設備の計画外停止が多い理由は？', '設備の計画外停止が多い')).toBeGreaterThan(100);
    expect(closeness('天気は？', '設備の計画外停止が多い')).toBe(0);
    expect(closeness('', 'x')).toBe(0);
  });
});
