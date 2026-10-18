// 生成パイプラインが作る顧客パックの世界区分・種別（FR-213 AC-509）の統合テスト。
// 外部の AI・Web を使わない固定の入力（同梱のモックの生成器・サンプルの調査・ブラウザーを使わない verify）で ④〜⑥ を実行する。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unclassifiedErrors, validateGeneratedPackDir, validatePackDir } from '../../scripts/lib/pack-fs';
import { defaultPaths, workDir } from '../../scripts/pipeline/common';
import { mockGenerator, type PackGenerator } from '../../scripts/pipeline/generate';
import { PipelineError, runPipeline } from '../../scripts/pipeline/pipeline';
import { main as verifyMain, mockSmoke, verifyPack } from '../../scripts/pipeline/verify';
import { ENTITY_KINDS, KINDS_BY_WORLD, TWIN_RELATIONS, WORLDS, countUnclassified, listUnclassified, type World } from '../../src/schema';

let tmp: string;
let template: string;
let workspace: string;
const logs: string[] = [];
const log = (l: string): void => { logs.push(l); };
const paths = () => defaultPaths({ workspace, template });
const launcher = async () => ({ url: 'http://127.0.0.1:1/', close: async () => {} });

/** ビルド済みの雛形の代わりになる小さなフォルダー（node_modules と dist を持つ） */
function makeTemplate(root: string): void {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"tpl"}');
  fs.writeFileSync(path.join(root, 'src', 'main.tsx'), 'export {};');
  fs.mkdirSync(path.join(root, 'node_modules', 'pkg-a'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'pkg-a', 'index.js'), 'module.exports = 1;');
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<!doctype html><title>app</title>');
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-world-'));
  template = path.join(tmp, 'template');
  workspace = path.join(tmp, 'ws');
  makeTemplate(template);
  logs.length = 0;
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

type Entity = { id: string; world?: unknown; kind?: unknown; parentId?: string };
type EntitiesJson = { entities: Entity[]; twins?: Array<{ realId: string; digitalId: string; relation: string }> };
const entitiesFile = (wd: string) => path.join(wd, 'public', 'data', 'entities.json');
const readEntities = (wd: string) => JSON.parse(fs.readFileSync(entitiesFile(wd), 'utf8')) as EntitiesJson;
const writeEntities = (wd: string, v: EntitiesJson) => fs.writeFileSync(entitiesFile(wd), JSON.stringify(v, null, 2), 'utf8');

/** お手本パック（モノ）で、ツイン関係から参照されていないエンティティの位置（区分なしにしても、ツインの検査のエラーが重ならない） */
function untwinnedIndex(nth = 0): number {
  const sample = JSON.parse(fs.readFileSync(path.join(defaultPaths({ workspace: tmp, template: tmp }).samplePack, 'public', 'data', 'entities.json'), 'utf8')) as EntitiesJson;
  const used = new Set((sample.twins ?? []).flatMap((t) => [t.realId, t.digitalId]));
  const idx = sample.entities.map((e, i) => (used.has(e.id) ? -1 : i)).filter((i) => i >= 0);
  return idx[nth]!;
}

/** 生成器の出力のうち entities.json の、指定した位置のエンティティから world と kind を外す */
function stripping(base: PackGenerator, indexes: number[], alsoOnRepair: boolean): PackGenerator {
  return {
    async generate(req) {
      const v = await base.generate(req);
      if (req.key !== 'entities') return v;
      if (req.target) {
        if (!alsoOnRepair) return v;
        // 自己修正の再生成でも直さない（区分なしのまま返す）
        const m = /^entities\[(\d+)\]\.(world|kind)$/.exec(req.target.path);
        return m ? undefined : v;
      }
      const out = v as EntitiesJson;
      for (const i of indexes) { delete out.entities[i]!.world; delete out.entities[i]!.kind; }
      return out;
    },
  };
}

describe('FR-213 AC-509 生成パイプラインが作る顧客パックの世界区分・種別', () => {
  // FR-213 AC-509
  it('FR-213 AC-509 固定の入力で build を実行すると、出力の全エンティティが §3.7 の許容値の世界区分と種別を持ち、verify:pack の区分なしが 0 件', async () => {
    const input = { customer: 'ツイン商事', projectName: 'ツイン 改革', intensity: 'Showcase' as const, materials: [] };
    const r = await runPipeline('build', input, { paths: paths(), consent: () => true, generator: mockGenerator, smoke: mockSmoke, launcher, log });
    const wd = workDir(paths(), input.customer);
    expect(r.workDir).toBe(wd);

    const { entities, twins } = readEntities(wd);
    expect(entities.length).toBeGreaterThan(0);
    for (const e of entities) {
      expect(WORLDS as readonly unknown[], `${e.id} の world`).toContain(e.world);
      expect(ENTITY_KINDS as readonly unknown[], `${e.id} の kind`).toContain(e.kind);
      expect(KINDS_BY_WORLD[e.world as World] as readonly unknown[], `${e.id} の world と kind の組み合わせ`).toContain(e.kind);
    }
    // 現実世界とデジタル世界の両方があり、ツイン関係は §3.7 の relation の値だけを使う
    expect(new Set(entities.map((e) => e.world))).toEqual(new Set(WORLDS));
    for (const t of twins ?? []) expect(TWIN_RELATIONS as readonly string[]).toContain(t.relation);

    expect(countUnclassified(readEntities(wd))).toBe(0);
    expect(listUnclassified(readEntities(wd))).toEqual([]);
    expect(validateGeneratedPackDir(wd).errors).toEqual([]);

    const v = await verifyPack({ workDir: wd, customer: input.customer, projectName: input.projectName, smoke: mockSmoke, requireClassified: true });
    expect(v.ok, JSON.stringify(v.items.filter((i) => !i.ok))).toBe(true);
    expect(v.unclassified).toBe(0);
    expect(v.warnings.join('\n')).not.toContain('区分なし');
    // ⑥verify の結果（timing.json）にも、区分なしの件数 0 を記録する
    const timing = JSON.parse(fs.readFileSync(r.timingFile, 'utf8')) as { stages: Array<{ id: string; unclassified?: number }> };
    expect(timing.stages.find((s) => s.id === 'verify')?.unclassified).toBe(0);
  });

  it('FR-213 AC-509 世界区分・種別のないエンティティを出力する生成は、⑤スキーマ検証で項目の位置を示して不合格になる', async () => {
    const input = { customer: '区分なし商事', projectName: 'X', intensity: 'Showcase' as const, materials: [] };
    const err = await runPipeline('build', input, {
      paths: paths(), consent: () => true, generator: stripping(mockGenerator, [0, 2], true), smoke: mockSmoke, launcher, log,
    }).then(() => undefined, (e: unknown) => e);
    expect(err).toBeInstanceOf(PipelineError);
    const pe = err as PipelineError;
    const at = pe.errors.map((e) => `${e.file} ${e.path}`);
    for (const p of ['entities[0].world', 'entities[0].kind', 'entities[2].world', 'entities[2].kind']) {
      expect(at).toContain(`public/data/entities.json ${p}`);
    }
    expect(pe.message).toContain('entities[0].world');
    // ⑥ verify には進まない
    expect(logs.join('\n')).not.toContain('verify（顧客パックの受け入れ判定）');
  });

  it('FR-213 AC-509 区分なしの箇所は自己修正（FR-126）でその位置だけを再生成し、直れば区分なし 0 件で合格する', async () => {
    const input = { customer: '修正商事', projectName: 'Y', intensity: 'Showcase' as const, materials: [] };
    const asked: string[] = [];
    const k = untwinnedIndex();
    const base = stripping(mockGenerator, [k], false);
    const spy: PackGenerator = { generate: async (req) => { if (req.target) asked.push(`${req.key} ${req.target.path}`); return base.generate(req); } };
    await runPipeline('build', input, { paths: paths(), consent: () => true, generator: spy, smoke: mockSmoke, launcher, log });
    expect(asked.sort()).toEqual([`entities entities[${k}].kind`, `entities entities[${k}].world`]);
    const wd = workDir(paths(), input.customer);
    expect(countUnclassified(readEntities(wd))).toBe(0);
    expect(validateGeneratedPackDir(wd).errors).toEqual([]);
  });

  it('FR-213 AC-509 verify:pack は、生成した顧客パック（--generated）の区分なしを項目 1 の位置つきの不合格にし、手作りの顧客パックでは警告のまま（AC-490）', async () => {
    const input = { customer: '検証商事', projectName: 'Z', intensity: 'Showcase' as const, materials: [] };
    await runPipeline('build', input, { paths: paths(), consent: () => true, generator: mockGenerator, smoke: mockSmoke, launcher, log });
    const wd = workDir(paths(), input.customer);
    const k = untwinnedIndex(1);
    const json = readEntities(wd);
    delete json.entities[k]!.world;
    delete json.entities[k]!.kind;
    writeEntities(wd, json);

    // 手作りの顧客パックとしての判定（既定）: 合否は変わらず、区分なしの件数を警告にする（AC-490 を変えない）
    expect(validatePackDir(wd).errors).toEqual([]);
    const loose = await verifyPack({ workDir: wd, smoke: mockSmoke });
    expect(loose.ok).toBe(true);
    expect(loose.unclassified).toBe(1);
    expect(loose.warnings.join('\n')).toContain('区分なし');

    // 生成した顧客パックとしての判定: 項目 1 が不合格になり、位置を示す
    expect(unclassifiedErrors(wd).map((e) => e.path)).toEqual([`entities[${k}].world`, `entities[${k}].kind`]);
    const strict = await verifyPack({ workDir: wd, smoke: mockSmoke, requireClassified: true });
    expect(strict.ok).toBe(false);
    const schema = strict.items.find((i) => i.id === 'schema')!;
    expect(schema.ok).toBe(false);
    expect(schema.detail).toContain('public/data/entities.json');
    expect(schema.detail).toContain(`entities[${k}].world`);

    // コマンド（npm run verify:pack -- <作業フォルダー> --generated）でも不合格の終了コードになる。フラグの位置は問わない
    const out: string[] = [];
    expect(await verifyMain(['--generated', wd, '--smoke', 'mock'], (l) => out.push(l))).toBe(1);
    expect(out.join('\n')).toContain(`entities[${k}].world`);
    expect(await verifyMain([wd, '--smoke', 'mock'], () => {})).toBe(0);
  });

  it('FR-213 AC-509 listUnclassified は world・kind のないエンティティだけを、項目の位置と ID つきで返す', () => {
    const v = { entities: [{ id: 'a', world: 'real', kind: 'site' }, { id: 'b', world: 'digital' }, { id: 'c' }] };
    expect(listUnclassified(v).map((u) => [u.path.join('.'), u.id])).toEqual([
      ['entities.1.kind', 'b'], ['entities.2.world', 'c'], ['entities.2.kind', 'c'],
    ]);
    expect(listUnclassified({})).toEqual([]);
    expect(listUnclassified(undefined)).toEqual([]);
  });
});
