// お手本パック（モノ・コト）の世界区分・種別（FR-213 AC-490）と、ツイン関係のエンティティ関係グラフからの取り出し（FR-214 AC-492）の結合テスト
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DIGITAL_KINDS, DATA_SCHEMAS, type EntityKind, type PackData,
} from '../../src/schema';
import { buildEntityGraph } from '../../src/selection/graph';
import { REPO_ROOT, readPackFiles, validatePackDir } from '../../scripts/lib/pack-fs';
import { mockSmoke, verifyPack } from '../../scripts/pipeline/verify';

const packDir = (k: 'mono' | 'koto') => path.join(REPO_ROOT, 'examples', k);
const readEntities = (k: 'mono' | 'koto'): any => JSON.parse(fs.readFileSync(path.join(packDir(k), 'public', 'data', 'entities.json'), 'utf8')); // eslint-disable-line @typescript-eslint/no-explicit-any

function loadPack(kind: 'mono' | 'koto'): PackData {
  const files = readPackFiles(packDir(kind)) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(DATA_SCHEMAS)) out[name] = schema.parse(files[name]);
  return out as unknown as PackData;
}

/** AC-490: パックごとに 1 件以上あるべき現実世界の種別 */
const REAL_EXPECTED: Record<'mono' | 'koto', EntityKind[]> = {
  mono: ['site', 'equipment', 'thing', 'operation', 'organization'],
  koto: ['site', 'operation', 'event', 'organization'],
};
/** AC-492: ツイン関係を 1 件以上持つべき現実世界の種別 */
const TWIN_EXPECTED: Record<'mono' | 'koto', EntityKind[]> = {
  mono: ['equipment', 'thing', 'site'],
  koto: ['site', 'operation', 'event'],
};

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-world-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

describe('FR-213 お手本パックの世界区分・種別', () => {
  for (const k of ['mono', 'koto'] as const) {
    // FR-213 AC-490
    it(`FR-213 AC-490 ${k}: 検証エラー 0 件で、全エンティティが世界区分と種別を持ち、扱う種別とデジタル世界の 5 種別がそれぞれ 1 件以上ある`, async () => {
      expect(validatePackDir(packDir(k)).errors).toEqual([]);
      const ents: any[] = readEntities(k).entities; // eslint-disable-line @typescript-eslint/no-explicit-any
      const missing = ents.filter((e) => !e.world || !e.kind).map((e) => e.id);
      expect(missing, '世界区分・種別のないエンティティ').toEqual([]);
      const count = (world: string, kind: string) => ents.filter((e) => e.world === world && e.kind === kind).length;
      for (const kind of REAL_EXPECTED[k]) expect(count('real', kind), `現実世界の ${kind}`).toBeGreaterThanOrEqual(1);
      for (const kind of DIGITAL_KINDS) expect(count('digital', kind), `デジタル世界の ${kind}`).toBeGreaterThanOrEqual(1);

      // verify:pack でも合格し、区分なしの警告は出ない
      const wd = path.join(tmp, k);
      copyDir(packDir(k), wd);
      fs.mkdirSync(path.join(wd, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(wd, 'dist', 'index.html'), '<!doctype html><title>stub</title>');
      const r = await verifyPack({ workDir: wd, smoke: mockSmoke });
      expect(r.items.filter((i) => !i.ok).map((i) => `${i.name}: ${i.detail}`)).toEqual([]);
      expect(r.warnings.filter((w) => /世界区分/.test(w))).toEqual([]);
    });
  }

  // FR-213 AC-490
  it('FR-213 AC-490 世界区分のない顧客パックは verify:pack が通り、区分なしの件数が警告として示される', async () => {
    const wd = path.join(tmp, 'plain');
    copyDir(packDir('mono'), wd);
    const f = path.join(wd, 'public', 'data', 'entities.json');
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    delete j.twins;
    for (const e of j.entities) { delete e.world; delete e.kind; }
    fs.writeFileSync(f, JSON.stringify(j, null, 2));
    fs.mkdirSync(path.join(wd, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(wd, 'dist', 'index.html'), '<!doctype html><title>stub</title>');
    const r = await verifyPack({ workDir: wd, smoke: mockSmoke });
    expect(r.items.find((i) => i.id === 'schema')!.ok).toBe(true);
    expect(r.ok).toBe(true);
    const w = r.warnings.find((x) => /世界区分/.test(x));
    expect(w, JSON.stringify(r.warnings)).toBeTruthy();
    expect(w).toContain(`${j.entities.length} 件`);
    expect(w).toContain('区分なし');
  });
});

describe('FR-214 お手本パックのツイン関係とエンティティ関係グラフ', () => {
  for (const k of ['mono', 'koto'] as const) {
    // FR-214 AC-492
    it(`FR-214 AC-492 ${k}: 扱う現実世界の種別ごとに 1 件以上のツイン関係があり、グラフから両方向のツインの一覧が関係の種類つきで取り出せる`, () => {
      const data = loadPack(k);
      const g = buildEntityGraph(data);
      const ents = data.entities.entities;
      const twins = data.entities.twins ?? [];
      for (const kind of TWIN_EXPECTED[k]) {
        const withTwin = ents.filter((e) => e.world === 'real' && e.kind === kind && g.twinsOf(e.id).length > 0);
        expect(withTwin.length, `ツイン関係を持つ現実世界の ${kind}`).toBeGreaterThanOrEqual(1);
      }
      // パックのツイン関係はすべて、現実世界の側からも、デジタル世界の側からも、関係の種類つきで取り出せる
      expect(twins.length).toBeGreaterThan(0);
      for (const t of twins) {
        const fromReal = g.twinsOf(t.realId).find((x) => x.id === t.digitalId && x.relation === t.relation);
        expect(fromReal, `${t.realId} → ${t.digitalId}`).toBeTruthy();
        expect(fromReal!.world).toBe('digital');
        expect(fromReal!.relationLabel).toMatch(/^(表す|計測する|記録する|表示する)$/);
        const fromDigital = g.twinsOf(t.digitalId).find((x) => x.id === t.realId && x.relation === t.relation);
        expect(fromDigital, `${t.digitalId} → ${t.realId}`).toBeTruthy();
        expect(fromDigital!.world).toBe('real');
        // ツイン関係はグラフの関係（辺）で、選択の連動（related）に使える
        expect(g.edges.some((e) => e.kind === 'twin' && e.from === t.realId && e.to === t.digitalId && e.label === t.relation)).toBe(true);
        expect(g.related(t.realId).has(t.digitalId)).toBe(true);
      }
      // 節に世界区分と種別が載る
      for (const e of ents) {
        expect(g.node(e.id)?.world).toBe(e.world);
        expect(g.node(e.id)?.entityKind).toBe(e.kind);
      }
      // ツイン関係のない項目は空の一覧
      const lonely = ents.find((e) => g.twinsOf(e.id).length === 0);
      if (lonely) expect(g.twinsOf(lonely.id)).toEqual([]);
    });
  }
});
