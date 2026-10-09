// 顧客パックの検証の単体テスト
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatPackError, validatePack, validateLayout, type PackFiles } from '../../src/schema';
import { REPO_ROOT, readPackFiles, validatePackDir } from '../../scripts/lib/pack-fs';

const mono = path.join(REPO_ROOT, 'examples', 'mono');
const koto = path.join(REPO_ROOT, 'examples', 'koto');
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

describe('FR-114 一意の ID と ID による参照', () => {
  // FR-114 AC-140
  it('FR-114 AC-140 お手本パックはエラー 0 件', () => {
    for (const root of [mono, koto]) expect(validatePackDir(root).errors).toEqual([]);
  });

  // FR-114 AC-140
  it('FR-114 AC-140 存在しない ID を参照する課題はエラーになり、ファイル名・位置・ID を含む', () => {
    const files: PackFiles = clone(readPackFiles(mono));
    (files.issues as any).issues[1].parentId = 'issue-no-such';
    const { errors } = validatePack(files);
    expect(errors).toHaveLength(1);
    const e = errors[0]!;
    expect(e.code).toBe('dangling-reference');
    expect(e.file).toBe('public/data/issues.json');
    expect(e.path).toBe('issues[1].parentId');
    expect(e.id).toBe('issue-mono-002');
    expect(formatPackError(e)).toContain('issue-no-such');
    expect(formatPackError(e)).toContain('public/data/issues.json');
  });

  // FR-114 AC-140
  it('FR-114 AC-140 同じ ID を持つ 2 つのエンティティはエラーになる', () => {
    const files: PackFiles = clone(readPackFiles(mono));
    (files.products as any).products[1].id = 'prod-mono-001';
    const { errors } = validatePack(files);
    const dup = errors.filter((e) => e.code === 'duplicate-id');
    expect(dup).toHaveLength(1);
    expect(dup[0]!.id).toBe('prod-mono-001');
    expect(dup[0]!.file).toBe('public/data/products.json');
    expect(dup[0]!.path).toBe('products[1]');
  });

  // FR-114 AC-140（ファイルをまたぐ重複）
  it('FR-114 AC-140 別のファイルのエンティティと ID が重複してもエラーになる', () => {
    const files: PackFiles = clone(readPackFiles(mono));
    (files.mocks as any).mocks[0].id = 'issue-mono-001';
    const { errors } = validatePack(files);
    expect(errors.some((e) => e.code === 'duplicate-id' && e.file === 'public/data/mocks.json')).toBe(true);
  });
});

describe('FR-115 FR-116 FR-117 出典・作成者・機密区分', () => {
  // FR-115 AC-141（検証の本体は後続の項目で拡張する。ここでは件数の報告まで）
  it('FR-115 AC-141 sourceIds のない数値の項目はエラーになり件数が報告される。お手本は 0 件', () => {
    expect(validatePackDir(mono).unsourcedNumbers).toBe(0);
    const files: PackFiles = clone(readPackFiles(mono));
    delete (files.entities as any).entities[0].metrics[0].sourceIds;
    const r = validatePack(files);
    expect(r.unsourcedNumbers).toBe(1);
    expect(r.errors.some((e) => e.code === 'missing-source')).toBe(true);
  });

  // FR-116 AC-142
  it('FR-116 AC-142 作成者の種別がない値、3 種類以外の値はエラーになる', () => {
    const a: PackFiles = clone(readPackFiles(mono));
    delete (a.issues as any).issues[0].createdBy;
    expect(validatePack(a).errors.some((e) => e.code === 'schema' && e.path === 'issues[0].createdBy')).toBe(true);
    const b: PackFiles = clone(readPackFiles(mono));
    (b.issues as any).issues[0].createdBy = 'robot';
    expect(validatePack(b).errors.some((e) => e.code === 'schema' && e.path === 'issues[0].createdBy')).toBe(true);
  });

  // FR-117 AC-143
  it('FR-117 AC-143 WorkIQ 由来で機密区分のない出典はエラーになる', () => {
    const files: PackFiles = clone(readPackFiles(mono));
    (files.sources as any).sources.push({
      id: 'src-mono-wiq', createdBy: 'ai', kind: 'workiq', title: 'x', retrievedAt: '2026-10-01', confidence: '中',
    });
    expect(validatePack(files).errors.some((e) => e.path === 'sources[3].classification')).toBe(true);
    (files.sources as any).sources[3].classification = 'internal';
    expect(validatePack(files).errors).toEqual([]);
  });
});

describe('FR-119 顧客パックのファイル構成', () => {
  // FR-119 AC-145
  it('FR-119 AC-145 必須のファイルが欠けたパックは、欠けたファイル名を挙げてエラーになる', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-pack-'));
    try {
      copyDir(mono, tmp);
      fs.rmSync(path.join(tmp, 'public', 'data', 'plan.json'));
      fs.rmSync(path.join(tmp, 'brand', 'BRAND-RESEARCH.md'));
      const errors = validatePackDir(tmp).errors;
      const missing = errors.filter((e) => e.code === 'missing-file').map((e) => e.file).sort();
      expect(missing).toEqual(['brand/BRAND-RESEARCH.md', 'public/data/plan.json']);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // FR-119 AC-145
  it('FR-119 AC-145 任意の assets/audio/ がなくてもエラーにならない', () => {
    expect(fs.existsSync(path.join(mono, 'assets', 'audio'))).toBe(false);
    expect(validatePackDir(mono).errors).toEqual([]);
    expect(validateLayout(['assets/audio/a.mp3'])).not.toEqual([]); // 他が欠けるので別のエラーにはなるが、audio は要求しない
    expect(validateLayout([]).some((e) => e.file.includes('audio'))).toBe(false);
  });
});
