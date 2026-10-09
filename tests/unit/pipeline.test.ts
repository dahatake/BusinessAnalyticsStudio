// 生成パイプライン（Skill のコマンド・雛形の複製・顧客パックの生成・入力変数）の統合テスト
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPO_ROOT, validatePackDir } from '../../scripts/lib/pack-fs';
import { cloneTemplate, TemplateNotBuiltError } from '../../scripts/pipeline/clone';
import { main } from '../../scripts/pipeline/cli';
import { COMMAND_STAGES, defaultPaths, researchCacheDir, workDir } from '../../scripts/pipeline/common';
import { PACK_FILE_KEYS, mockGenerator, packFilePath, type PackGenerator } from '../../scripts/pipeline/generate';
import { parseArgs, resolveInputs } from '../../scripts/pipeline/inputs';
import { runPipeline } from '../../scripts/pipeline/pipeline';
import { startStaticServer } from '../../scripts/pipeline/launch';
import { InputError } from '../../scripts/pipeline/common';

let tmp: string;
let template: string;
let workspace: string;

/** ビルド済みの雛形の代わりになる小さなフォルダー（node_modules と dist を持つ） */
function makeTemplate(root: string, built = true): void {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public', 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"tpl"}');
  fs.writeFileSync(path.join(root, 'src', 'main.tsx'), 'export {};');
  fs.writeFileSync(path.join(root, 'public', 'data', 'README.txt'), 'x');
  if (built) {
    fs.mkdirSync(path.join(root, 'node_modules', 'pkg-a'), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules', 'pkg-a', 'index.js'), 'module.exports = 1;');
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<!doctype html><title>app</title>');
  }
}

const paths = () => defaultPaths({ workspace, template });
const logs: string[] = [];
const log = (l: string): void => { logs.push(l); };

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-pipeline-'));
  template = path.join(tmp, 'template');
  workspace = path.join(tmp, 'ws');
  makeTemplate(template);
  logs.length = 0;
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const readTiming = (customer: string) =>
  JSON.parse(fs.readFileSync(path.join(workDir(paths(), customer), 'logs', 'timing.json'), 'utf8')) as {
    totalMs: number; stages: Array<{ id: string; startedAt: string; finishedAt: string; durationMs: number; step: string }>;
  };

describe('FR-120 Skill のコマンド', () => {
  // FR-120 AC-146: Skill の定義にある 3 つのコマンドが呼ぶスクリプトを、モックの生成器で実行する
  const skill = fs.readFileSync(path.join(REPO_ROOT, '.github', 'skills', 'envisioning-dashboard', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

  /** `### <コマンド>` の節にあるコードブロックの `npm run <script> -- <コマンド> ...` の行 */
  function skillInvocation(cmd: string): { script: string; args: string[] } | undefined {
    const sec = skill.split(/^### /m).find((s) => s.startsWith(`${cmd}\n`));
    const m = sec?.match(/npm run (\S+) -- (.+)/);
    return m ? { script: m[1]!, args: m[2]!.match(/"[^"]*"|\S+/g)!.map((a) => a.replace(/^"|"$/g, '')) } : undefined;
  }

  it('FR-120 AC-146 Skill の定義に research・build・all の 3 つのコマンドがあり、npm script から呼べる', () => {
    expect(skill).toMatch(/^name: envisioning-dashboard$/m);
    for (const cmd of ['research', 'build', 'all']) {
      const inv = skillInvocation(cmd);
      expect(inv, `${cmd} の呼び出し`).toBeDefined();
      expect(inv!.args[0]).toBe(cmd);
      expect(pkg.scripts[inv!.script]).toMatch(/scripts\/pipeline\/cli\.ts/);
    }
  });

  it.each([
    ['research', ['research-customer', 'research-brand']],
    ['build', ['clone', 'generate', 'validate', 'verify', 'launch']],
    ['all', ['research-customer', 'research-brand', 'clone', 'generate', 'validate', 'verify', 'launch']],
  ] as const)('FR-120 AC-146 %s をモックの生成器で実行すると、定義どおりの工程を順に実行して成功で終了する', async (cmd, expected) => {
    expect(COMMAND_STAGES[cmd]).toEqual(expected);
    const inv = skillInvocation(cmd)!;
    const code = await main([...inv.args.slice(0, 1), '--customer', 'テスト商事', '--no-keep',
      '--workspace', workspace, '--template', template], { log, ask: async () => { throw new Error('質問してはいけない'); } });
    expect(code, logs.join('\n')).toBe(0);
    expect(readTiming('テスト商事').stages.map((s) => s.id)).toEqual(expected);
  });

  it('FR-120 AC-146 build は調査キャッシュがなくても前提を置いたサンプルで続け、推定として記録する', async () => {
    const r = await runPipeline('build', { customer: 'A社', projectName: 'A', intensity: 'Showcase', materials: [] },
      { paths: paths(), generator: mockGenerator, launcher: async () => ({ url: 'http://127.0.0.1:1/', close: async () => {} }), log });
    expect(r.stages).toEqual(COMMAND_STAGES.build);
    const meta = JSON.parse(fs.readFileSync(path.join(researchCacheDir(paths(), 'A社'), 'meta.json'), 'utf8')) as { customerSource: string };
    expect(meta.customerSource).toBe('推定（サンプル）');
  });

  it('FR-120 AC-146 検証に失敗する生成器では build が失敗の終了コードで終わる', async () => {
    const bad: PackGenerator = {
      async generate(req) {
        const v = await mockGenerator.generate(req);
        if (req.key === 'issues') return { issues: 'x', solutions: [] };
        return v;
      },
    };
    const code = await main(['build', '--customer', 'B社', '--no-keep', '--workspace', workspace, '--template', template], { log, generator: bad });
    expect(code).toBe(1);
    expect(logs.join('\n')).toContain('issues.json');
  });
});

describe('FR-124 雛形の複製', () => {
  // FR-124 AC-151
  it('FR-124 AC-151 複製の段階で node_modules と dist がそろい、複製が上限以内で、npm install とビルドを実行しない', async () => {
    const code = await main(['build', '--customer', 'C社', '--no-keep', '--workspace', workspace, '--template', template], { log });
    expect(code, logs.join('\n')).toBe(0);
    const wd = workDir(paths(), 'C社');
    expect(fs.existsSync(path.join(wd, 'node_modules', 'pkg-a', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(wd, 'dist', 'index.html'))).toBe(true);
    const clone = readTiming('C社').stages.find((s) => s.id === 'clone')! as unknown as { durationMs: number; limitSec: number; withinLimit: boolean };
    expect(clone.limitSec).toBe(30); // PARAM-005
    expect(clone.durationMs / 1000).toBeLessThanOrEqual(30);
    expect(clone.withinLimit).toBe(true);
    const commands = fs.readFileSync(path.join(wd, 'logs', 'commands.json'), 'utf8');
    expect(commands).toContain('copy');
    expect(commands).not.toMatch(/npm (install|i\b|ci|run build)|vite build|tsc/);
  });

  it('FR-124 AC-151 ビルド済みでない雛形は、不足を示して止まる（自分では npm install もビルドもしない）', async () => {
    const raw = path.join(tmp, 'raw');
    makeTemplate(raw, false);
    await expect(cloneTemplate({ template: raw, dest: path.join(tmp, 'out') })).rejects.toBeInstanceOf(TemplateNotBuiltError);
    expect(fs.existsSync(path.join(tmp, 'out', 'node_modules'))).toBe(false);
  });

  it('FR-124 AC-151 作業フォルダーが雛形の中にあっても、自分自身を複製しない', async () => {
    const inner = path.join(template, 'ws2');
    fs.mkdirSync(inner, { recursive: true });
    fs.writeFileSync(path.join(inner, 'keep.txt'), 'x');
    await cloneTemplate({ template, dest: path.join(inner, 'cust'), exclude: [inner] });
    expect(fs.existsSync(path.join(inner, 'cust', 'ws2'))).toBe(false);
    expect(fs.existsSync(path.join(inner, 'cust', 'dist', 'index.html'))).toBe(true);
  });
});

describe('FR-125 顧客パックの生成', () => {
  // FR-125 AC-152
  it('FR-125 AC-152 モックの生成器で顧客パックを生成すると、FR-119 の全ファイルができ、検証のエラーが 0 件で、顧客名と Project 名が入力どおり', async () => {
    const calls: string[] = [];
    const spy: PackGenerator = { generate: async (req) => { calls.push(req.key); return mockGenerator.generate(req); } };
    await runPipeline('build', { customer: 'ミライ商事', projectName: 'ミライ 改革', intensity: 'Executive', materials: [] },
      { paths: paths(), generator: spy, launcher: async () => ({ url: 'http://127.0.0.1:1/', close: async () => {} }), log });
    const wd = workDir(paths(), 'ミライ商事');
    expect(calls.sort()).toEqual([...PACK_FILE_KEYS].sort()); // ファイル単位で 1 回ずつ生成する
    for (const key of PACK_FILE_KEYS) expect(fs.existsSync(path.join(wd, packFilePath(key))), key).toBe(true);
    expect(fs.readdirSync(path.join(wd, 'assets', 'brand')).length).toBeGreaterThan(0);
    expect(validatePackDir(wd).errors).toEqual([]);
    const customer = JSON.parse(fs.readFileSync(path.join(wd, 'public', 'data', 'customer.json'), 'utf8')) as Record<string, unknown>;
    expect(customer['name']).toBe('ミライ商事');
    expect(customer['projectName']).toBe('ミライ 改革');
    expect(customer['defaultIntensity']).toBe('Executive');
    const brand = JSON.parse(fs.readFileSync(path.join(wd, 'public', 'brand', 'brand-profile.json'), 'utf8')) as { name: string };
    expect(brand.name).toBe('ミライ商事');
  });

  it('FR-125 AC-152 調査キャッシュの内容が顧客調査・ブランド調査の Markdown に入り、BGM と追加資料は指定したときだけ複製する', async () => {
    const bgm = path.join(tmp, 'bgm'); fs.mkdirSync(bgm); fs.writeFileSync(path.join(bgm, 'a.mp3'), 'x');
    const memo = path.join(tmp, 'memo.md'); fs.writeFileSync(memo, '# 商談メモ');
    const code = await main(['all', '--customer', 'D社', '--bgm', bgm, '--material', memo, '--no-keep', '--workspace', workspace, '--template', template], { log });
    expect(code, logs.join('\n')).toBe(0);
    const wd = workDir(paths(), 'D社');
    expect(fs.readFileSync(path.join(wd, 'data', 'customer-research.md'), 'utf8')).toContain('顧客調査: D社');
    expect(fs.readFileSync(path.join(wd, 'brand', 'BRAND-RESEARCH.md'), 'utf8')).toContain('ブランド調査: D社');
    expect(fs.existsSync(path.join(wd, 'assets', 'audio', 'a.mp3'))).toBe(true);
    expect(fs.existsSync(path.join(wd, 'data', 'materials', 'memo.md'))).toBe(true);
    expect(validatePackDir(wd).errors).toEqual([]); // 任意の assets/audio/ があってもエラーにならない
  });
});

describe('FR-130 入力変数の指定', () => {
  const full = ['--customer', '甲社', '--project', '甲 PJ', '--intensity', 'entertainment'];

  // FR-130 AC-158
  it('FR-130 AC-158 すべての入力変数を引数で渡すと、質問せずに実行される', async () => {
    const bgm = path.join(tmp, 'bgm'); fs.mkdirSync(bgm);
    const memo = path.join(tmp, 'memo.md'); fs.writeFileSync(memo, 'm');
    const asked: string[] = [];
    const input = await resolveInputs(parseArgs([...full, '--bgm', bgm, '--material', memo]), {
      interactive: true, ask: async (q) => { asked.push(q); return ''; },
    });
    expect(asked).toEqual([]);
    expect(input).toEqual({ customer: '甲社', projectName: '甲 PJ', intensity: 'Entertainment', bgmDir: bgm, materials: [memo] });
  });

  // FR-130 AC-158
  it('FR-130 AC-158 顧客名を省くと、対話形式で顧客名を尋ね、答えを使う', async () => {
    const asked: string[] = [];
    const input = await resolveInputs(parseArgs(['--project', 'P']), {
      ask: async (q) => { asked.push(q); return ' 乙社 '; },
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('顧客名');
    expect(input.customer).toBe('乙社');
    expect(input.projectName).toBe('P');
    expect(input.intensity).toBe('Showcase');
  });

  it('FR-130 AC-158 顧客名の質問に答えがない（または質問の手段がない）ときは、入力の誤りとして止まる', async () => {
    await expect(resolveInputs(parseArgs([]), { ask: async () => '  ' })).rejects.toBeInstanceOf(InputError);
    await expect(resolveInputs(parseArgs([]))).rejects.toThrow(/--customer/);
  });

  it('FR-130 AC-158 対話形式では、引数にない任意の入力変数も尋ねる', async () => {
    const answers: Record<string, string> = { 'Project 名': '丙 PJ' };
    const asked: string[] = [];
    const input = await resolveInputs(parseArgs(['--customer', '丙社']), {
      interactive: true, ask: async (q) => { asked.push(q); return answers[q] ?? ''; },
    });
    expect(asked.length).toBeGreaterThanOrEqual(4);
    expect(input.projectName).toBe('丙 PJ');
    expect(input.intensity).toBe('Showcase');
  });

  // FR-130 AC-158
  it('FR-130 AC-158 演出強度に 3 段階以外の値を渡すと、有効な値を示して止まる', async () => {
    await expect(resolveInputs(parseArgs(['--customer', 'x', '--intensity', 'Loud']))).rejects.toThrow(/Executive.*Showcase.*Entertainment/);
    const code = await main(['build', '--customer', 'x', '--intensity=Loud', '--workspace', workspace, '--template', template], { log });
    expect(code).toBe(2);
    expect(logs.join('\n')).toMatch(/Executive \/ Showcase \/ Entertainment/);
    expect(fs.existsSync(workspace)).toBe(false); // 何も実行していない
  });

  it('FR-130 AC-158 存在しない BGM フォルダー・追加資料は、入力の誤りとして止まる', async () => {
    await expect(resolveInputs(parseArgs(['--customer', 'x', '--bgm', path.join(tmp, 'none')]))).rejects.toThrow(/BGM/);
    await expect(resolveInputs(parseArgs(['--customer', 'x', '--material', path.join(tmp, 'none.md')]))).rejects.toThrow(/追加資料/);
  });
});

describe('FR-120 起動（127.0.0.1）', () => {
  it('FR-120 AC-146 起動した URL は 127.0.0.1 で、dist と顧客パックを返す', async () => {
    let url = '';
    const code = await main(['build', '--customer', 'E社', '--no-keep', '--workspace', workspace, '--template', template], { log });
    expect(code).toBe(0);
    const wd = workDir(paths(), 'E社');
    const s = await startStaticServer(wd);
    try {
      url = s.url;
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
      expect(await (await fetch(url)).text()).toContain('<title>app</title>');
      const c = (await (await fetch(`${url}data/customer.json`)).json()) as { name: string };
      expect(c.name).toBe('E社');
      expect((await fetch(`${url}data/..%2f..%2fpackage.json`)).status).toBe(404);
    } finally { await s.close(); }
  });
});
