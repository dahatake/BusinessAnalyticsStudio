// ④ 顧客パックの生成（FR-125）: 調査キャッシュ・スキーマ・お手本データを入力として、顧客パックの JSON（FR-119）を作る。
// 生成の実体（LLM）は `PackGenerator`（接続点）の後ろに置く。ファイル単位で並列に生成する。
// 同梱の `mockGenerator` は、LLM を呼ばずにお手本パックから作る（検証・オフライン用）。
import fs from 'node:fs';
import path from 'node:path';
import { BRAND_PROFILE_PATH, DATA_FILE_NAMES, dataFilePath, type DataFileName } from '../../src/schema';
import { readPackFiles } from '../lib/pack-fs';
import type { Inputs } from './common';
import type { ResearchCache } from './research';

/** 生成するファイル（FR-119）。JSON は値、Markdown は文字列を返す */
export type PackFileKey = DataFileName | 'brandProfile' | 'customerResearch' | 'brandResearch';
export const PACK_FILE_KEYS: readonly PackFileKey[] = [...DATA_FILE_NAMES, 'brandProfile', 'customerResearch', 'brandResearch'];

/** パック内の相対パス */
export function packFilePath(key: PackFileKey): string {
  if (key === 'brandProfile') return BRAND_PROFILE_PATH;
  if (key === 'customerResearch') return 'data/customer-research.md';
  if (key === 'brandResearch') return 'brand/BRAND-RESEARCH.md';
  return dataFilePath(key);
}

export interface Material { name: string; text: string }

export interface GenerateRequest {
  key: PackFileKey;
  input: Inputs;
  cache: ResearchCache;
  /** お手本パックの同じファイルの中身（JSON は値、Markdown は文字列） */
  sample: unknown;
  /** 追加資料（商談メモなど）の本文 */
  materials: Material[];
}

/** 生成の接続点。実際の LLM は、この形で差し替える（`--generator <モジュールのパス>`） */
export interface PackGenerator {
  generate(req: GenerateRequest): Promise<unknown>;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const mockGenerator: PackGenerator = {
  async generate({ key, input, cache, sample }) {
    switch (key) {
      case 'customerResearch': return cache.customerResearch;
      case 'brandResearch': return cache.brandResearch;
      case 'customer': {
        const c = clone(sample) as Record<string, unknown>;
        return { ...c, name: input.customer, projectName: input.projectName, createdBy: 'sample', defaultIntensity: input.intensity };
      }
      case 'brandProfile': {
        const b = clone(sample) as Record<string, any>;
        // ロゴのファイルは顧客ごとに別のため、お手本のパスは引き継がない（利用条件が不明なのでプレースホルダー表示）
        const { path: _p, ...logo } = (b.logo ?? {}) as Record<string, unknown>;
        return { ...b, name: input.customer, logo: { ...logo, status: 'unknown' } };
      }
      default: return clone(sample);
    }
  },
};

/** お手本パックの中身を、生成の入力にする形で読む */
export function readSample(samplePack: string): Record<PackFileKey, unknown> {
  const f = readPackFiles(samplePack);
  const md = (rel: string): string => {
    const p = path.join(samplePack, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  };
  const out = { ...f, customerResearch: md('data/customer-research.md'), brandResearch: md('brand/BRAND-RESEARCH.md') };
  return out as unknown as Record<PackFileKey, unknown>;
}

function readMaterials(files: readonly string[]): Material[] {
  return files.map((f) => ({ name: path.basename(f), text: fs.readFileSync(f, 'utf8') }));
}

/** 全ファイルを並列に生成する（ファイル単位の並列。FR-125） */
export async function generatePack(
  generator: PackGenerator, input: Inputs, cache: ResearchCache, samplePack: string,
): Promise<Map<PackFileKey, unknown>> {
  const sample = readSample(samplePack);
  const materials = readMaterials(input.materials);
  const results = await Promise.all(PACK_FILE_KEYS.map(async (key) => {
    const value = await generator.generate({ key, input, cache, sample: sample[key], materials });
    return [key, value] as const;
  }));
  return new Map(results);
}

function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

/** 生成した顧客パックを作業フォルダーに書く。BGM と追加資料は、指定があれば複製する */
export function writePack(workDir: string, files: Map<PackFileKey, unknown>, input: Inputs): string[] {
  const written: string[] = [];
  for (const [key, value] of files) {
    const rel = packFilePath(key);
    const abs = path.join(workDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', 'utf8');
    written.push(rel);
  }
  // assets/brand/ は必須のフォルダー（FR-119）。ロゴの利用条件が確認できるまで、置き場所だけを用意する
  const brandDir = path.join(workDir, 'assets', 'brand');
  fs.mkdirSync(brandDir, { recursive: true });
  if (fs.readdirSync(brandDir).length === 0) {
    fs.writeFileSync(path.join(brandDir, 'README.txt'), 'ロゴ・ブランドの画像は、利用条件を確認してからこのフォルダーに置く。\n', 'utf8');
    written.push('assets/brand/README.txt');
  }
  if (input.bgmDir) {
    copyDir(input.bgmDir, path.join(workDir, 'assets', 'audio'));
    written.push('assets/audio/');
  }
  for (const m of input.materials) {
    const dst = path.join(workDir, 'data', 'materials', path.basename(m));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(m, dst);
    written.push(`data/materials/${path.basename(m)}`);
  }
  return written;
}
