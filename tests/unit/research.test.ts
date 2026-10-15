// 事前調査と調査キャッシュ（FR-121〜FR-123）、調査キャッシュと顧客パックの保護（NFR-SEC-003）の単体・結合テスト
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../../scripts/lib/pack-fs';
import {
  BRAND_SOURCE_PRIORITY, DEFAULT_BRAND_THEME, defaultBrandProfile, selectBrandSource, type BrandSourceCandidate,
} from '../../scripts/pipeline/brand-sources';
import { main as cliMain, type CliDeps } from '../../scripts/pipeline/cli';
import { PARAMS, defaultPaths, researchCacheDir, workDir, type Inputs } from '../../scripts/pipeline/common';
import { mockGenerator } from '../../scripts/pipeline/generate';
import { runPipeline as runPipelineImpl, type PipelineDeps } from '../../scripts/pipeline/pipeline';
import { mockSmoke } from '../../scripts/pipeline/verify';
import {
  SourceUnavailableError, assertGitIgnored, chainResearcher, checkResearchFreshness, reresearchSuggestion,
  saveResearchPart, sampleResearcher, type ResearchMeta, type ResearchPart, type Researcher,
} from '../../scripts/pipeline/research';
import { BrandProfileSchema } from '../../src/schema';

// この試験の雛形は小さな代用のフォルダー（実際のアプリがない）ので、⑥ verify のブラウザー検査は差し替え部品（モック）にする
const main = (argv: readonly string[], deps: CliDeps = {}) => cliMain(argv, { smoke: mockSmoke, ...deps });
const runPipeline = (cmd: Parameters<typeof runPipelineImpl>[0], input: Parameters<typeof runPipelineImpl>[1], deps: PipelineDeps) =>
  runPipelineImpl(cmd, input, { smoke: mockSmoke, ...deps });

let tmp: string;
let workspace: string;
let template: string;
const logs: string[] = [];
const log = (l: string): void => { logs.push(l); };
const input = (customer = 'A社'): Inputs => ({ customer, projectName: 'A', intensity: 'Showcase', materials: [] });
const paths = () => defaultPaths({ workspace, template });
const readMeta = (customer = 'A社') =>
  JSON.parse(fs.readFileSync(path.join(researchCacheDir(paths(), customer), 'meta.json'), 'utf8')) as ResearchMeta;
const part = (source: 'WorkIQ' | 'Web', text: string): ResearchPart => ({ source, markdown: `# ${text}\n` });
const DAY = 86_400_000;

function makeTemplate(root: string): void {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public', 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"tpl"}');
  fs.writeFileSync(path.join(root, 'src', 'main.tsx'), 'export {};');
  fs.mkdirSync(path.join(root, 'node_modules', 'pkg-a'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'pkg-a', 'index.js'), 'module.exports = 1;');
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<!doctype html><title>app</title>');
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-research-'));
  workspace = path.join(tmp, 'ws');
  template = path.join(tmp, 'template');
  makeTemplate(template);
  logs.length = 0;
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

/** 応答しない接続点（中断の信号が来たら、そこで止まる） */
const hanging: Researcher = {
  researchCustomer: (_i, ctx) => new Promise((_, rej) => ctx?.signal?.addEventListener('abort', () => rej(new Error('中断')))),
  researchBrand: (_i, ctx) => new Promise((_, rej) => ctx?.signal?.addEventListener('abort', () => rej(new Error('中断')))),
};
const ok = (source: 'WorkIQ' | 'Web'): Researcher => ({
  researchCustomer: async () => part(source, `${source} の顧客調査`),
  researchBrand: async () => part(source, `${source} のブランド調査`),
});

describe('FR-121 事前調査と調査キャッシュ', () => {
  // FR-121 AC-147
  it('FR-121 AC-147 WorkIQ と Web の差し替え部品を利用不可にして research を実行すると、サンプルで調査キャッシュが作られ「推定（サンプル）」と記録され、成功で終了する', async () => {
    const researcher = chainResearcher([{ source: 'WorkIQ' }, { source: 'Web', researcher: ok('Web'), available: () => false }]);
    const r = await runPipeline('research', input(), { paths: paths(), consent: () => true, researcher, log });
    expect(r.stages).toEqual(['research-customer', 'research-brand']);
    const dir = researchCacheDir(paths(), 'A社');
    expect(fs.existsSync(path.join(dir, 'customer-research.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'brand-research.md'))).toBe(true);
    const meta = readMeta();
    expect(meta.customerSource).toBe('推定（サンプル）');
    expect(meta.brandSource).toBe('推定（サンプル）');
    expect(meta.customerAttempts?.map((a) => [a.source, a.outcome])).toEqual([['WorkIQ', 'unavailable'], ['Web', 'unavailable'], ['推定（サンプル）', 'used']]);
    expect(logs.join('\n')).toContain('情報源=推定（サンプル）');
  });

  it('FR-121 AC-147 コマンドから research を実行すると（既定は WorkIQ・Web とも利用不可）、サンプルの調査キャッシュを作って終了コード 0', async () => {
    const code = await main(['research', '--customer', 'B社', '--workspace', workspace, '--template', template], { consent: () => true, log, ask: async () => '' });
    expect(code, logs.join('\n')).toBe(0);
    expect(readMeta('B社').customerSource).toBe('推定（サンプル）');
  });

  // FR-121 AC-147（上限時間を超えて応答しない）
  it('FR-121 AC-147 差し替え部品が上限時間を超えて応答しないときは、上限で打ち切って次の情報源（Web）に切り替える', async () => {
    const researcher = chainResearcher([{ source: 'WorkIQ', researcher: hanging }, { source: 'Web', researcher: ok('Web') }], { limitMs: 300 });
    const t0 = Date.now();
    await runPipeline('research', input(), { paths: paths(), consent: () => true, researcher, log });
    expect(Date.now() - t0).toBeLessThan(2000);
    const meta = readMeta();
    expect(meta.customerSource).toBe('Web');
    expect(meta.brandSource).toBe('Web');
    expect(meta.customerAttempts?.map((a) => [a.source, a.outcome])).toEqual([['WorkIQ', 'timeout'], ['Web', 'used']]);
  });

  it('FR-121 AC-147 すべての情報源が応答しなくても、上限の時間内にサンプルで成功する', async () => {
    const researcher = chainResearcher([{ source: 'WorkIQ', researcher: hanging }, { source: 'Web', researcher: hanging }], { limitMs: 300 });
    const t0 = Date.now();
    await runPipeline('research', input(), { paths: paths(), consent: () => true, researcher, log });
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(readMeta().customerSource).toBe('推定（サンプル）');
    expect(readMeta().customerAttempts?.map((a) => a.outcome)).toEqual(['timeout', 'timeout', 'used']);
  });

  it('FR-121 情報源は WorkIQ → Web → サンプルの順。WorkIQ が使えれば WorkIQ を使い、失敗（例外）したら Web に切り替える', async () => {
    const a = await chainResearcher([{ source: 'WorkIQ', researcher: ok('WorkIQ') }, { source: 'Web', researcher: ok('Web') }]).researchCustomer(input());
    expect(a.source).toBe('WorkIQ');
    const failing: Researcher = {
      researchCustomer: async () => { throw new SourceUnavailableError('ログインしていません'); },
      researchBrand: async () => { throw new Error('接続エラー'); },
    };
    const chain = chainResearcher([{ source: 'WorkIQ', researcher: failing }, { source: 'Web', researcher: ok('Web') }]);
    const c = await chain.researchCustomer(input());
    expect(c.source).toBe('Web');
    expect(c.attempts?.[0]).toMatchObject({ source: 'WorkIQ', outcome: 'unavailable', detail: 'ログインしていません' });
    const b = await chain.researchBrand(input());
    expect(b.attempts?.[0]).toMatchObject({ source: 'WorkIQ', outcome: 'error', detail: '接続エラー' });
  });

  it('FR-121 顧客調査とブランド調査は並行して行い、調査キャッシュに保存する', async () => {
    let running = 0;
    let peak = 0;
    const slow = (source: 'WorkIQ'): Researcher['researchCustomer'] => async () => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 80));
      running--;
      return part(source, source);
    };
    const researcher = chainResearcher([{ source: 'WorkIQ', researcher: { researchCustomer: slow('WorkIQ'), researchBrand: slow('WorkIQ') } }]);
    const r = await runPipeline('research', input(), { paths: paths(), consent: () => true, researcher, log });
    expect(peak).toBe(2);
    expect(r.stages).toEqual(['research-customer', 'research-brand']);
    const timing = JSON.parse(fs.readFileSync(path.join(workDir(paths(), 'A社'), 'logs', 'timing.json'), 'utf8')) as { stages: Array<{ id: string }> };
    expect(timing.stages.map((s) => s.id)).toEqual(['research-customer', 'research-brand']);
  });

  it('FR-121 片方の調査が失敗しても、もう片方は最後まで行って保存し、失敗を返す', async () => {
    const researcher: Researcher = {
      researchCustomer: async () => { throw new Error('顧客調査の失敗'); },
      researchBrand: async () => ({ source: 'Web', markdown: '# ブランド\n' }),
    };
    await expect(runPipeline('research', input(), { paths: paths(), consent: () => true, researcher, log })).rejects.toThrow('顧客調査の失敗');
    expect(fs.existsSync(path.join(researchCacheDir(paths(), 'A社'), 'brand-research.md'))).toBe(true);
  });

  it('FR-121 上限の既定は PARAM-003（10 分）', () => {
    expect(PARAMS.researchLimitSec).toBe(600);
  });
});

describe('FR-122 ブランド調査の出典の優先順位と既定テーマ', () => {
  const c = (kind: BrandSourceCandidate['kind'], url = `https://example.test/${kind}`): BrandSourceCandidate => ({ kind, url });

  // FR-122 AC-149
  it('FR-122 AC-149 4 種類の公式の出典と非公式サイトを入れると、最も優先順位の高い公式の出典（ブランドガイドライン）が選ばれる', () => {
    const all = [c('unofficial'), c('ir'), c('official-site'), c('presskit'), c('guideline')];
    expect(selectBrandSource(all)?.kind).toBe('guideline');
  });

  it('FR-122 AC-149 優先順位は ガイドライン → プレスキット → 公式サイト → IR 資料。上位がなければ次を選ぶ', () => {
    expect([...BRAND_SOURCE_PRIORITY]).toEqual(['guideline', 'presskit', 'official-site', 'ir']);
    expect(selectBrandSource([c('ir'), c('official-site'), c('presskit'), c('unofficial')])?.kind).toBe('presskit');
    expect(selectBrandSource([c('ir'), c('official-site'), c('unofficial')])?.kind).toBe('official-site');
    expect(selectBrandSource([c('unofficial'), c('ir')])?.kind).toBe('ir');
  });

  it('FR-122 AC-149 非公式サイトだけのときは何も選ばない（非公式サイトは使わない）。同じ種類は先に渡した候補、入力は変更しない', () => {
    expect(selectBrandSource([c('unofficial'), c('unofficial', 'https://example.test/u2')])).toBeUndefined();
    const list = [c('official-site', 'https://a.test'), c('official-site', 'https://b.test')];
    const copy = structuredClone(list);
    expect(selectBrandSource(list)?.url).toBe('https://a.test');
    expect(list).toEqual(copy);
  });

  it('FR-122 AC-149 候補が 0 件のときは、ニュートラルテーマ・既定のフォント・「先進的」トーンのブランドプロファイルが確度「推定」で返る', () => {
    expect(selectBrandSource([])).toBeUndefined();
    const p = defaultBrandProfile('A社', '2026-10-09');
    expect(BrandProfileSchema.safeParse(p).success).toBe(true);
    expect(p.colors.primary).toBe(DEFAULT_BRAND_THEME.primary);
    expect(p.fonts.primary).toBe('Segoe UI Variable');
    expect(DEFAULT_BRAND_THEME.fonts).toBe('Segoe UI Variable / Noto Sans JP');
    expect(p.tone.value).toBe('先進的');
    for (const k of ['colors', 'fonts', 'tone', 'logo'] as const) expect(p[k].confidence).toBe('推定');
    expect(p.logo.status).toBe('unknown');
  });

  it('FR-122 出典が特定できないときのブランド調査（サンプル）に、既定テーマの内容が書かれる', async () => {
    const r = await sampleResearcher.researchBrand(input());
    expect(r.markdown).toContain('Microsoft 標準のニュートラルテーマ');
    expect(r.markdown).toContain('Segoe UI Variable / Noto Sans JP');
    expect(r.markdown).toContain('先進的');
  });
});

describe('FR-123 調査キャッシュの有効期限', () => {
  const at = (iso: string) => () => new Date(iso);
  const stubLauncher = async () => ({ url: 'http://127.0.0.1:1/', close: async () => {} });
  const build = (now: Date) => runPipeline('build', input(), { paths: paths(), generator: mockGenerator, launcher: stubLauncher, log, now: () => now });

  async function makeCache(createdIso: string): Promise<void> {
    await runPipeline('research', input(), { paths: paths(), researcher: sampleResearcher, log, now: at(createdIso) });
    logs.length = 0;
  }

  // FR-123 AC-150
  it('FR-123 AC-150 作成日時が 30 日（PARAM-004）より前の調査キャッシュで build を実行すると、期限切れと再調査の提案が表示される', async () => {
    expect(PARAMS.cacheValidityDays).toBe(30);
    await makeCache('2026-08-01T10:00:00+09:00');
    expect(readMeta().createdAt).toContain('2026-08-01');
    await build(new Date('2026-09-02T10:00:00+09:00')); // 32 日後
    const out = logs.join('\n');
    expect(out).toContain('期限切れ');
    expect(out).toContain('再調査');
    expect(out).toContain('npm run pipeline -- research --customer "A社"');
    const timing = JSON.parse(fs.readFileSync(path.join(workDir(paths(), 'A社'), 'logs', 'timing.json'), 'utf8')) as { stages: Array<{ id: string; cacheExpired?: boolean }> };
    expect(timing.stages.find((s) => s.id === 'generate')?.cacheExpired).toBe(true);
  });

  it('FR-123 AC-150 期限内のキャッシュ（ちょうど 30 日を含む）では、期限切れも再調査の提案も表示されない', async () => {
    await makeCache('2026-08-01T10:00:00+09:00');
    await build(new Date('2026-08-31T10:00:00+09:00')); // ちょうど 30 日後
    expect(logs.join('\n')).not.toMatch(/期限切れ|再調査/);
  });

  it('FR-123 AC-150 キャッシュがないとき、日時が読めないときの判定。再調査すると作成日時が更新される', async () => {
    const now = new Date('2026-10-09T00:00:00+09:00');
    expect(checkResearchFreshness(paths(), 'なし社', now)).toEqual({ status: 'missing' });
    expect(reresearchSuggestion('なし社', { status: 'missing' })).toEqual([]);
    await makeCache('2026-01-01T00:00:00+09:00');
    expect(checkResearchFreshness(paths(), 'A社', now).status).toBe('expired');
    const metaFile = path.join(researchCacheDir(paths(), 'A社'), 'meta.json');
    fs.writeFileSync(metaFile, JSON.stringify({ customer: 'A社', createdAt: '不明' }));
    const broken = checkResearchFreshness(paths(), 'A社', now);
    expect(broken.status).toBe('expired');
    expect(reresearchSuggestion('A社', broken).join('\n')).toContain('日時が不明');
    await runPipeline('research', input(), { paths: paths(), researcher: sampleResearcher, log, now: () => now });
    expect(checkResearchFreshness(paths(), 'A社', new Date(now.getTime() + 29 * DAY)).status).toBe('valid');
  });

  it('FR-123 saveResearchPart は、作成日時を渡さなければ最初の日時を保つ', async () => {
    saveResearchPart(paths(), input(), 'customer', part('Web', 'x'), at('2026-01-01T00:00:00+09:00'));
    saveResearchPart(paths(), input(), 'brand', part('Web', 'y'), at('2026-06-01T00:00:00+09:00'));
    expect(readMeta().createdAt).toContain('2026-01-01');
  });
});

describe('NFR-SEC-003 調査キャッシュと顧客パックの保護', () => {
  const git = (...args: string[]): boolean => {
    try { execFileSync('git', ['check-ignore', '-q', '--', ...args], { cwd: REPO_ROOT, stdio: 'ignore' }); return true; } catch { return false; }
  };

  // NFR-SEC-003 AC-177
  it('NFR-SEC-003 AC-177 既定の調査キャッシュ（research-cache/<顧客名>/）と顧客パックの置き場所は .gitignore の対象（git check-ignore）', () => {
    const p = defaultPaths();
    expect(git(path.join(researchCacheDir(p, '顧客'), 'meta.json'))).toBe(true);
    expect(git(path.join(researchCacheDir(p, '顧客'), 'customer-research.md'))).toBe(true);
    expect(git(path.join(workDir(p, '顧客'), 'data', 'customer.json'))).toBe(true);
  });

  it('NFR-SEC-003 AC-177 お手本パック（examples/）は対象外。.gitignore の対象でない場所に調査キャッシュを作ろうとすると止まる', () => {
    expect(git(path.join(REPO_ROOT, 'examples', 'mono', 'public', 'data', 'customer.json'))).toBe(false);
    expect(() => assertGitIgnored(REPO_ROOT, path.join(REPO_ROOT, 'src', 'research-cache', 'A', 'meta.json'), '調査キャッシュの保存先')).toThrow('.gitignore');
    expect(() => assertGitIgnored(REPO_ROOT, path.join(defaultPaths().workspace, 'research-cache', 'A', 'meta.json'), '調査キャッシュの保存先')).not.toThrow();
    // リポジトリの外は確かめない
    expect(() => assertGitIgnored(REPO_ROOT, path.join(tmp, 'ws', 'research-cache', 'A', 'meta.json'), '調査キャッシュの保存先')).not.toThrow();
  });

  it('NFR-SEC-003 AC-177 リポジトリの中の .gitignore の対象でない作業フォルダーでは、research も build も何も作らずに止まる', async () => {
    const inRepo = defaultPaths({ workspace: path.join(REPO_ROOT, 'tmp-not-ignored-workspace'), template });
    await expect(runPipeline('research', input(), { paths: inRepo, log })).rejects.toThrow('.gitignore');
    expect(fs.existsSync(inRepo.workspace)).toBe(false);
  });

  it.runIf(process.platform !== 'win32')('NFR-SEC-003 調査キャッシュは所有者だけが読み書きできる権限で作る', async () => {
    await runPipeline('research', input(), { paths: paths(), log });
    const dir = researchCacheDir(paths(), 'A社');
    expect(fs.statSync(dir).mode & 0o077).toBe(0);
    expect(fs.statSync(path.join(dir, 'meta.json')).mode & 0o077).toBe(0);
  });
});
