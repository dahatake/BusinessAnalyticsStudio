// 顧客パック（お手本パックとその変種）の読み込み。
// 期待値は「入力したパックの内容」と受入基準から決める（実装のコードからは決めない）。
// 項目名は CONTRACT.md §3 の表（テスト側の契約）に従う。
import fs from 'node:fs';
import path from 'node:path';
import { EXAMPLES_DIR, TMP_DIR } from './paths';

export type PackKind = 'mono' | 'koto';

export const PACK_FILES = [
  'customer', 'entities', 'issues', 'products', 'plan', 'architecture', 'mocks', 'show', 'sources',
] as const;
export type PackFile = (typeof PACK_FILES)[number];

export function packRoot(kind: PackKind): string {
  return path.join(EXAMPLES_DIR, kind);
}

export function readJson<T = any>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export class Pack {
  constructor(public readonly root: string) {}

  file(name: PackFile): string {
    return path.join(this.root, 'public', 'data', `${name}.json`);
  }
  json(name: PackFile): any {
    return readJson(this.file(name));
  }
  brand(): any {
    return readJson(path.join(this.root, 'public', 'brand', 'brand-profile.json'));
  }
  /** `{ "<key>": [...] }` または配列そのもの */
  list(name: PackFile, key: string): any[] {
    const j = this.json(name);
    if (Array.isArray(j)) return j;
    const v = j?.[key];
    if (!Array.isArray(v)) throw new Error(`${name}.json に配列 "${key}" がありません（CONTRACT.md §3）`);
    return v;
  }

  get customerName(): string { return this.json('customer').name; }
  get projectName(): string { return this.json('customer').projectName; }
  get templateVersion(): string { return this.json('customer').templateVersion; }
  issues(): any[] { return this.list('issues', 'issues'); }
  solutions(): any[] { return this.list('issues', 'solutions'); }
  products(): any[] { return this.list('products', 'products'); }
  sources(): any[] { return this.list('sources', 'sources'); }
  entities(): any[] { return this.list('entities', 'entities'); }
  chapters(): any[] { return this.list('show', 'chapters'); }
  /** プレゼンテーションモードの議題の順序（chapters[].topics[] の順）。 */
  topics(): Array<{ chapter: any; topic: any }> {
    return this.chapters().flatMap((c: any) => (c.topics ?? []).map((t: any) => ({ chapter: c, topic: t })));
  }
  mocks(): any[] { return this.list('mocks', 'mocks'); }
  features(): any[] { return this.list('plan', 'features'); }
  tasks(): any[] { return this.list('plan', 'tasks'); }
  coreObjectCandidates(): any[] { return this.json('customer').coreObject?.candidates ?? []; }
}

export function examplePack(kind: PackKind = 'mono'): Pack {
  return new Pack(packRoot(kind));
}

function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

let seq = 0;
/**
 * お手本パックの変種（要求定義書 §3.4「お手本パックの変種」、[ASSUMPTION] A-19）を一時フォルダに作る。
 * mutate はパックのルートを受け取り、JSON を書き換える。
 */
export function makeVariant(kind: PackKind, label: string, mutate: (p: VariantEditor) => void): Pack {
  const dst = path.join(TMP_DIR, `${label}-${process.pid}-${Date.now()}-${seq++}`);
  fs.rmSync(dst, { recursive: true, force: true });
  copyDir(packRoot(kind), dst);
  mutate(new VariantEditor(dst));
  return new Pack(dst);
}

export class VariantEditor extends Pack {
  edit(name: PackFile, fn: (json: any) => void): void {
    const j = this.json(name);
    fn(j);
    fs.writeFileSync(this.file(name), JSON.stringify(j, null, 2));
  }
  editBrand(fn: (json: any) => void): void {
    const f = path.join(this.root, 'public', 'brand', 'brand-profile.json');
    const j = readJson(f);
    fn(j);
    fs.writeFileSync(f, JSON.stringify(j, null, 2));
  }
}

/** パック内で classification が internal の項目を数える（AC-178 の期待値）。 */
export function countInternal(pack: Pack): number {
  let n = 0;
  const walk = (v: any) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (v.classification === 'internal') n++;
      Object.values(v).forEach(walk);
    }
  };
  for (const f of PACK_FILES) walk(pack.json(f));
  return n;
}

/** 合成の社内情報（匿名化の確認用。実データではない） */
export const SYNTHETIC_INTERNAL_TOKEN = 'ZX417-社内限定テスト値';
/** [ASSUMPTION] A-08 の置き換え表記 */
export const ANONYMIZED_LABEL = '［社内情報・匿名化］';

/** internal の課題を 1 件含む変種（AC-066・AC-178） */
export function packWithInternal(kind: PackKind = 'mono'): Pack {
  return makeVariant(kind, 'internal', (p) => {
    p.edit('issues', (j) => {
      const list = Array.isArray(j) ? j : j.issues;
      const base = list[0];
      list.push({
        ...base,
        id: 'issue-st-internal-001',
        parentId: base.parentId ?? null,
        title: `社内課題 ${SYNTHETIC_INTERNAL_TOKEN}`,
        hypothesis: `仮説 ${SYNTHETIC_INTERNAL_TOKEN}`,
        origin: 'workiq',
        classification: 'internal',
        createdBy: 'ai',
      });
    });
  });
}
