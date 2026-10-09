// 雛形の静的検査（統合テスト）: 顧客固有情報の分離、スキーマの同梱、型の厳格さと部品・スキーマの分離
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_FILE_NAMES } from '../../src/schema';
import { buildJsonSchemas } from '../../scripts/gen-schema';
import { REPO_ROOT, validatePackDir } from '../../scripts/lib/pack-fs';

function listFiles(dir: string, filter: (f: string) => boolean = () => true): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p, filter) : filter(p) ? [p] : [];
  });
}

describe('FR-100 顧客固有情報のコードからの分離', () => {
  // FR-100 AC-122
  it('FR-100 AC-122 ソースコードとビルド成果物に、お手本パックの顧客名・Project 名・ブランド色が含まれない', () => {
    const needles: string[] = [];
    for (const kind of fs.readdirSync(path.join(REPO_ROOT, 'examples'))) {
      const dataDir = path.join(REPO_ROOT, 'examples', kind, 'public');
      const customer = JSON.parse(fs.readFileSync(path.join(dataDir, 'data', 'customer.json'), 'utf8'));
      const brand = JSON.parse(fs.readFileSync(path.join(dataDir, 'brand', 'brand-profile.json'), 'utf8'));
      needles.push(customer.name, customer.projectName, brand.name, brand.primaryColor);
    }
    expect(needles.length).toBeGreaterThanOrEqual(8);
    const targets = [
      ...listFiles(path.join(REPO_ROOT, 'src')),
      ...listFiles(path.join(REPO_ROOT, 'public')),
      ...listFiles(path.join(REPO_ROOT, 'dist')),
      path.join(REPO_ROOT, 'index.html'),
    ];
    const hits: string[] = [];
    for (const f of targets) {
      if (/\.(png|jpe?g|woff2?|ttf|ico|webp)$/i.test(f)) continue;
      const text = fs.readFileSync(f, 'utf8').toLowerCase();
      for (const n of needles) if (text.includes(n.toLowerCase())) hits.push(`${path.relative(REPO_ROOT, f)}: ${n}`);
    }
    expect(hits).toEqual([]);
  });

  // FR-100 AC-122（データから読む構造であること）
  it('FR-100 AC-122 起動時に /data/*.json と /brand/brand-profile.json から読む', () => {
    const loader = fs.readFileSync(path.join(REPO_ROOT, 'src', 'data', 'loader.ts'), 'utf8');
    expect(loader).toContain('/data/${name}.json');
    expect(loader).toContain('/brand/brand-profile.json');
  });
});

describe('FR-118 スキーマとお手本データの同梱', () => {
  // FR-118 AC-144
  it('FR-118 AC-144 FR-119 の各 JSON ファイルに対応するスキーマが schema/ にあり、最新である', () => {
    const generated = buildJsonSchemas();
    for (const name of [...DATA_FILE_NAMES, 'brand-profile']) {
      const f = path.join(REPO_ROOT, 'schema', `${name}.json`);
      expect(fs.existsSync(f), `schema/${name}.json がない`).toBe(true);
      expect(fs.readFileSync(f, 'utf8').replaceAll('\r\n', '\n'), `schema/${name}.json が古い（npm run gen:schema）`).toBe(generated[`${name}.json`]);
    }
  });

  // FR-118 AC-144
  it('FR-118 AC-144 examples/ のお手本データがすべてのスキーマで合格する', () => {
    const kinds = fs.readdirSync(path.join(REPO_ROOT, 'examples'));
    expect(kinds).toEqual(expect.arrayContaining(['mono', 'koto']));
    for (const k of kinds) expect(validatePackDir(path.join(REPO_ROOT, 'examples', k)).errors, k).toEqual([]);
  });
});

describe('NFR-MAINT-001 型の厳格さと部品とスキーマの分離', () => {
  // NFR-MAINT-001 AC-182
  it('NFR-MAINT-001 AC-182 strict の設定で型検査のエラーが 0 件', () => {
    const tsconfig = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tsconfig.json'), 'utf8'));
    expect(tsconfig.compilerOptions.strict).toBe(true);
    const tsc = path.join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
    expect(() => execFileSync(process.execPath, [tsc, '--noEmit', '-p', 'tsconfig.json'], { cwd: REPO_ROOT, stdio: 'pipe' })).not.toThrow();
  }, 120_000);

  // NFR-MAINT-001 AC-182
  it('NFR-MAINT-001 AC-182 スキーマのモジュールが画面の部品のモジュールを参照していない', () => {
    const forbidden = /from\s+['"][^'"]*\/(components|app|screens|theme|store|data)(\/|['"])|from\s+['"](react|react-dom|@fluentui[^'"]*)['"]/;
    for (const f of listFiles(path.join(REPO_ROOT, 'src', 'schema'), (p) => /\.tsx?$/.test(p))) {
      const bad = fs.readFileSync(f, 'utf8').split('\n').filter((l) => forbidden.test(l));
      expect(bad, path.relative(REPO_ROOT, f)).toEqual([]);
    }
  });
});
