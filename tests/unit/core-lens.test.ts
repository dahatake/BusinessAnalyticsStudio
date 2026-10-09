// 中核オブジェクトの選定理由・レンズ・用語集の単体テスト。
// FR-018 AC-022 / FR-019 AC-023
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readCoreObject, resolveSelectedId } from '../../src/coreobject/model';
import { splitByGlossary } from '../../src/glossary/model';
import { LENS_KINDS, buildLensItems } from '../../src/lens/model';
import { DATA_SCHEMAS, type PackData } from '../../src/schema';
import { buildEntityGraph } from '../../src/selection/graph';

function loadPack(kind: 'mono' | 'koto'): PackData {
  const dir = path.resolve(__dirname, '../../examples', kind, 'public', 'data');
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(DATA_SCHEMAS)) {
    out[name] = schema.parse(JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8')));
  }
  return out as PackData;
}

describe('FR-018 AC-022 中核オブジェクトの候補・観点・理由', () => {
  for (const kind of ['mono', 'koto'] as const) {
    it(`${kind}: customer.json の候補すべてと比較の観点・選定理由が読める`, () => {
      const pack = loadPack(kind);
      const info = readCoreObject(pack.customer);
      expect(info.candidates.map((c) => c.id)).toEqual(pack.customer.coreObject.candidates.map((c) => c.id));
      expect(info.candidates.length).toBeGreaterThan(1);
      expect(info.criteria.length).toBeGreaterThan(0);
      expect(info.reason).not.toBe('');
      for (const c of info.candidates) {
        expect(c.name).not.toBe('');
        // どの観点にも評価がある（比較の表に空欄が出ない）
        for (const k of info.criteria) expect(c.scores[k.id], `${c.id} の ${k.id}`).toBeTruthy();
      }
      expect(info.defaultId).toBe(pack.customer.coreObject.selectedId);
    });
  }

  it('表示名は name、なければ label。観点・理由がなくても読める', () => {
    const info = readCoreObject({
      name: 'x', projectName: 'y', templateVersion: '0.1.0', locale: 'ja', createdBy: 'sample',
      coreObject: { candidates: [{ id: 'a', label: 'ラベルだけ' }, { id: 'b', label: 'L', name: '名前' }] },
    } as PackData['customer']);
    expect(info.candidates.map((c) => c.name)).toEqual(['ラベルだけ', '名前']);
    expect(info.criteria).toEqual([]);
    expect(info.reason).toBe('');
    expect(readCoreObject(undefined).candidates).toEqual([]);
  });

  it('候補の変更: 利用者の選択を優先し、候補にない・未選択なら顧客パックの指定、なければ先頭', () => {
    const info = readCoreObject(loadPack('mono').customer);
    const [first, second] = info.candidates;
    expect(resolveSelectedId(info, second!.id)).toBe(second!.id);
    expect(resolveSelectedId(info, undefined)).toBe(info.defaultId);
    expect(resolveSelectedId(info, 'no-such-candidate')).toBe(info.defaultId);
    expect(resolveSelectedId({ ...info, defaultId: undefined }, null)).toBe(first!.id);
    expect(resolveSelectedId({ candidates: [], criteria: [], reason: '' }, 'a')).toBeUndefined();
  });
});

describe('FR-019 AC-023 レンズと用語集', () => {
  const pack = loadPack('mono');
  const graph = buildEntityGraph(pack);
  const items = buildLensItems(graph);

  it('ビジネス側と IT 側は同じ ID の項目で対応づく（共通 ID）', () => {
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(LENS_KINDS).toContain(it.kind);
      expect(it.itNote).toContain(it.id); // IT の言葉は ID を出す
      expect(it.businessNote).not.toContain(it.id); // ビジネスの言葉は ID を出さない
    }
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(buildLensItems(null)).toEqual([]);
  });

  it('用語集の語は、文章の中で長い語を優先して見つかる', () => {
    const glossary = pack.customer.glossary ?? [];
    expect(glossary.length).toBeGreaterThan(0);
    const term = glossary[0]!;
    const issueWithTerm = pack.issues.issues.find((i) => i.title.includes(term.term))!;
    expect(issueWithTerm, '用語集の先頭の語を含む課題がお手本パックにない').toBeTruthy();
    const parts = splitByGlossary(issueWithTerm.title, glossary);
    expect(parts.map((p) => p.text).join('')).toBe(issueWithTerm.title);
    expect(parts.find((p) => p.entry)?.entry?.definition).toBe(term.definition);
    // 長い語を優先
    const parts2 = splitByGlossary('計画外停止', [{ term: '計画', definition: 'a' }, { term: '計画外停止', definition: 'b' }]);
    expect(parts2).toEqual([{ text: '計画外停止', entry: { term: '計画外停止', definition: 'b' } }]);
  });

  it('異常系: 用語集が空・文章が空ならそのまま', () => {
    expect(splitByGlossary('設備', [])).toEqual([{ text: '設備' }]);
    expect(splitByGlossary('', [{ term: 'a', definition: 'b' }])).toEqual([{ text: '' }]);
  });
});
