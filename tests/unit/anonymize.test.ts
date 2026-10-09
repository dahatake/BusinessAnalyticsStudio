// FR-117 WorkIQ 由来情報の機密区分: internal の匿名化（A-08）
import { describe, expect, it } from 'vitest';
import { ANONYMIZED_LABEL, anonymizeInternal, validatePack } from '../../src/schema';
import { readPackFiles, REPO_ROOT } from '../../scripts/lib/pack-fs';
import path from 'node:path';

describe('FR-117 匿名化', () => {
  // FR-117 AC-143
  it('FR-117 AC-143 internal の項目の値は A-08 の表記に置き換わり、shareable の項目は変わらない', () => {
    const internal = { id: 'src-1', createdBy: 'ai', kind: 'workiq', title: '社内会議の議事録', url: 'https://intra/x', classification: 'internal', sourceIds: ['src-0'] };
    const shareable = { id: 'src-2', createdBy: 'ai', kind: 'workiq', title: '公開資料', classification: 'shareable' };
    const out = anonymizeInternal({ sources: [internal, shareable] });
    expect(out.sources[0]).toEqual({
      id: 'src-1', createdBy: 'ai', kind: 'workiq', title: ANONYMIZED_LABEL, url: ANONYMIZED_LABEL, classification: 'internal', sourceIds: ['src-0'],
    });
    expect(out.sources[1]).toEqual(shareable);
    expect(ANONYMIZED_LABEL).toBe('［社内情報・匿名化］');
  });

  // FR-117 AC-143
  it('FR-117 AC-143 入れ子の値・数値・配列も置き換え、ID の参照は残し、入力は変更しない', () => {
    const issue = {
      id: 'issue-1', createdBy: 'ai', classification: 'internal', title: '極秘の課題', parentId: 'issue-0',
      evaluation: { cost: { value: 1200, sourceIds: ['s1'] } }, personas: ['部長', '担当'],
    };
    const copy = JSON.parse(JSON.stringify(issue));
    const out = anonymizeInternal(issue);
    expect(issue).toEqual(copy);
    expect(out.title).toBe(ANONYMIZED_LABEL);
    expect(out.parentId).toBe('issue-0');
    expect(out.evaluation.cost.value).toBe(ANONYMIZED_LABEL);
    expect(out.evaluation.cost.sourceIds).toEqual(['s1']);
    expect(out.personas).toEqual([ANONYMIZED_LABEL, ANONYMIZED_LABEL]);
  });

  // FR-117 AC-143
  it('FR-117 AC-143 機密区分のない項目と、internal を含まないパックは変わらない', () => {
    const files = readPackFiles(path.join(REPO_ROOT, 'examples', 'mono'));
    expect(anonymizeInternal(files)).toEqual(files);
    expect(validatePack(anonymizeInternal(files)).errors).toEqual([]);
  });

  // FR-117 AC-143
  it('FR-117 AC-143 WorkIQ 由来で機密区分のない出典はスキーマ検証でエラーになり、区分があれば通る', () => {
    const files = JSON.parse(JSON.stringify(readPackFiles(path.join(REPO_ROOT, 'examples', 'mono'))));
    const src: Record<string, string> = { id: 'src-w', createdBy: 'ai', kind: 'workiq', title: 'x', retrievedAt: '2026-10-01', confidence: '中' };
    files.sources.sources.push(src);
    expect(validatePack(files).errors.length).toBeGreaterThan(0);
    src.classification = 'internal';
    expect(validatePack(files).errors).toEqual([]);
  });
});
