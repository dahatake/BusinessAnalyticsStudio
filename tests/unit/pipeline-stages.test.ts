// 生成パイプラインの自己修正・起動・時間計測・雛形への改善要望の単体・結合テスト（FR-126、FR-128、FR-129、FR-131）。
// 雛形は小さな代用のフォルダー（node_modules と dist を持つ）で、⑥ verify のブラウザー検査はモックにする（実際の検査は verify.test.ts）。
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validatePackDir } from '../../scripts/lib/pack-fs';
import { main } from '../../scripts/pipeline/cli';
import { COMMAND_STAGES, PARAMS, defaultPaths, workDir, type Inputs } from '../../scripts/pipeline/common';
import { PACK_FILE_KEYS, mockGenerator, type GenerateRequest, type PackFileKey, type PackGenerator } from '../../scripts/pipeline/generate';
import { IMPROVEMENT_FILE, extractImprovementRequests, supportedScreens } from '../../scripts/pipeline/improvements';
import { getAt, parsePath, setAt } from '../../scripts/pipeline/jsonpath';
import { startStaticServer } from '../../scripts/pipeline/launch';
import { PipelineError, runPipeline } from '../../scripts/pipeline/pipeline';
import { groupTargets } from '../../scripts/pipeline/repair';
import { mockSmoke } from '../../scripts/pipeline/verify';

let tmp: string;
let template: string;
let workspace: string;
const logs: string[] = [];
const log = (l: string): void => { logs.push(l); };
const paths = () => defaultPaths({ workspace, template });
const input = (customer = 'A社', extra: Partial<Inputs> = {}): Inputs => ({ customer, projectName: 'A 計画', intensity: 'Showcase', materials: [], ...extra });
const stubLauncher = async () => ({ url: 'http://127.0.0.1:1/', close: async () => {} });

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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-stages-'));
  template = path.join(tmp, 'template');
  workspace = path.join(tmp, 'ws');
  makeTemplate(template);
  logs.length = 0;
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

/** フォルダー全体（リンクは辿らない）のパス・大きさ・更新時刻。書き込みがあれば変わる */
function snapshot(root: string, rel = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    const st = fs.lstatSync(path.join(root, r));
    out[r] = `${st.size}:${st.mtimeMs}`;
    if (e.isDirectory()) Object.assign(out, snapshot(root, r));
  }
  return out;
}

const readTiming = (customer: string) =>
  JSON.parse(fs.readFileSync(path.join(workDir(paths(), customer), 'logs', 'timing.json'), 'utf8')) as {
    totalMs: number; startedAt: string; finishedAt: string;
    stages: Array<{ id: string; step: string; startedAt: string; finishedAt: string; durationMs: number; ok: boolean; repairRounds?: number; repaired?: string[] }>;
  };

describe('FR-126 エラー箇所だけの自己修正', () => {
  /** issues.json の issues[0].title だけを不正（数値）にして返す生成器。`mode` で、再生成の依頼に直すか、直さないかを選ぶ */
  function corrupting(mode: 'fixes-on-second' | 'never-fixes'): { generator: PackGenerator; requests: GenerateRequest[] } {
    const requests: GenerateRequest[] = [];
    const generator: PackGenerator = {
      async generate(req) {
        requests.push(req);
        const v = await mockGenerator.generate(req);
        if (req.key !== 'issues') return v;
        if (!req.target) return setAt(v, parsePath('issues[0].title'), 123);
        return mode === 'never-fixes' ? 123 : v;
      },
    };
    return { generator, requests };
  }

  // FR-126 AC-153
  it('FR-126 AC-153 1 項目だけを不正に返す生成器では、再生成の依頼がその項目だけを対象にし、2 回目で正しい値が返ればエラー 0 件で次の段階へ進む', async () => {
    const { generator, requests } = corrupting('fixes-on-second');
    const r = await runPipeline('build', input(), { paths: paths(), consent: () => true, generator, launcher: stubLauncher, smoke: mockSmoke, log });
    expect(r.stages).toEqual(COMMAND_STAGES.build); // ⑥ verify・⑦ 起動まで進んだ
    // 最初の生成はファイルごとに 1 回（全体の再生成は 1 回だけ）。再生成の依頼は 1 件で、issues.json の issues[0].title だけ
    const whole = requests.filter((q) => !q.target);
    expect(whole.map((q) => q.key).sort()).toEqual([...PACK_FILE_KEYS].sort());
    const repairs = requests.filter((q) => q.target);
    expect(repairs).toHaveLength(1);
    expect(repairs[0]!.key).toBe('issues');
    expect(repairs[0]!.target!.path).toBe('issues[0].title');
    expect(repairs[0]!.target!.errors.join('\n')).toContain('issues[0].title');
    expect(repairs[0]!.target!.current).toBe(123);
    // 直ったのはその項目だけ。ほかの項目はそのまま
    const issues = JSON.parse(fs.readFileSync(path.join(workDir(paths(), 'A社'), 'public', 'data', 'issues.json'), 'utf8')) as { issues: Array<{ id: string; title: string }> };
    expect(issues.issues[0]!.title).toBe('設備の計画外停止が多い');
    expect(validatePackDir(workDir(paths(), 'A社')).errors).toEqual([]);
    const st = readTiming('A社').stages.find((s) => s.id === 'validate')!;
    expect(st.repairRounds).toBe(1);
    expect(st.repaired).toEqual(['public/data/issues.json issues[0].title']);
    expect(logs.join('\n')).toContain('エラーの箇所 1 件だけを再生成');
  });

  // FR-126 AC-153
  it('FR-126 AC-153 常に不正を返す生成器では PARAM-006 の回数で止まり、エラーの一覧が出力される', async () => {
    expect(PARAMS.selfRepairMax).toBe(3); // PARAM-006
    const { generator, requests } = corrupting('never-fixes');
    const err = await runPipeline('build', input('B社'), { paths: paths(), consent: () => true, generator, launcher: stubLauncher, smoke: mockSmoke, log }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PipelineError);
    const pe = err as PipelineError;
    expect(pe.errors).toHaveLength(1);
    expect(pe.message).toContain('issues.json');
    expect(pe.message).toContain('issues[0].title');
    expect(pe.message).toContain('自己修正 3 回');
    expect(requests.filter((q) => q.target)).toHaveLength(PARAMS.selfRepairMax); // 3 回で止まる（全体の再生成はしない）
    expect(requests.filter((q) => !q.target)).toHaveLength(PACK_FILE_KEYS.length);
    // 終了コードは失敗（CLI）で、エラーの一覧が画面に出る
    const code = await main(['build', '--customer', 'C社', '--no-keep', '--workspace', workspace, '--template', template], { consent: () => true, log, generator: corrupting('never-fixes').generator, smoke: mockSmoke });
    expect(code).toBe(1);
    expect(logs.join('\n')).toContain('issues[0].title');
  });

  it('FR-126 AC-153 エラーが複数の箇所にあれば、箇所ごとに 1 回ずつだけ再生成を依頼する（内側の箇所は外側にまとめる）', () => {
    const e = (file: string, p: string, msg = 'm') => ({ code: 'schema' as const, file, path: p, message: msg });
    const targets = groupTargets([
      e('public/data/issues.json', 'issues[0].title'), e('public/data/issues.json', 'issues[0].title', '別のエラー'),
      e('public/data/issues.json', 'issues[3]'), e('public/data/issues.json', 'issues[3].cause'),
      e('public/data/plan.json', ''), e('assets/brand/', ''),
    ]);
    expect(targets.map((t) => `${t.file} ${t.path}`).sort()).toEqual([
      'public/data/issues.json issues[0].title', 'public/data/issues.json issues[3]', 'public/data/plan.json ',
    ]);
    expect(targets.find((t) => t.path === 'issues[0].title')!.errors).toHaveLength(2);
  });

  it('FR-126 AC-153 位置の読み書き（パスの解釈）は元の値を変えず、置けない位置は undefined', () => {
    const root = { a: [{ b: 1 }, { b: 2 }] };
    expect(parsePath('a[1].b')).toEqual(['a', 1, 'b']);
    expect(getAt(root, parsePath('a[1].b'))).toBe(2);
    const next = setAt(root, parsePath('a[0].b'), 9) as typeof root;
    expect(next.a[0]!.b).toBe(9);
    expect(root.a[0]!.b).toBe(1);
    expect(setAt(root, parsePath('x.y'), 1)).toBeUndefined();
  });
});

describe('FR-128 起動', () => {
  async function tryConnect(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const s = net.connect({ host, port, timeout: 1500 });
      s.once('connect', () => { s.destroy(); resolve(true); });
      s.once('error', () => resolve(false));
      s.once('timeout', () => { s.destroy(); resolve(false); });
    });
  }

  // FR-128 AC-156
  it('FR-128 AC-156 起動の段階で http://127.0.0.1:<ポート>/ が表示され、その URL で顧客パックが返り、127.0.0.1 だけで待ち受ける', async () => {
    const r = await runPipeline('build', input('起動社'), { paths: paths(), smoke: mockSmoke, log }); // 既定の起動（静的サーバー）
    try {
      const url = r.launched!.url;
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:(\d+)\/$/);
      expect(logs.join('\n')).toContain(`起動しました: ${url}`);
      const customer = (await (await fetch(`${url}data/customer.json`)).json()) as { name: string; projectName: string };
      expect(customer.name).toBe('起動社'); // 顧客パックのタイトル（顧客名と Project 名）
      expect(customer.projectName).toBe('A 計画');
      expect(await (await fetch(url)).text()).toContain('<title>app</title>');
      // 待ち受けは 127.0.0.1 だけ: この PC のほかのアドレスからは接続できない
      const port = Number(new URL(url).port);
      expect(await tryConnect('127.0.0.1', port)).toBe(true);
      const others = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a!.address);
      for (const addr of others) expect(await tryConnect(addr, port), `${addr}:${port} から接続できてしまった`).toBe(false);
    } finally { await r.launched?.close(); }
  });

  // FR-128 AC-156
  it('FR-128 AC-156 ポートが使用中のときは、別のポートで起動してその URL を表示する', async () => {
    const wd = path.join(tmp, 'wd');
    fs.mkdirSync(path.join(wd, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(wd, 'dist', 'index.html'), '<title>x</title>');
    const first = await startStaticServer(wd);
    const second = await startStaticServer(wd); // 1 つ目が使っているポートは使えない
    try {
      expect(second.url).not.toBe(first.url);
      expect(second.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
      expect(await (await fetch(second.url)).text()).toContain('<title>x</title>');
      // 好みのポート（4173）を別のプロセスが使っている状況でも、起動できる
      const blocker = net.createServer();
      const held = await new Promise<boolean>((res) => { blocker.once('error', () => res(false)); blocker.listen(4173, '127.0.0.1', () => res(true)); });
      try {
        const third = await startStaticServer(wd);
        try {
          expect(third.url).not.toBe('http://127.0.0.1:4173/');
          expect((await fetch(third.url)).status).toBe(200);
        } finally { await third.close(); }
      } finally { if (held) await new Promise<void>((res) => blocker.close(() => res())); }
    } finally { await first.close(); await second.close(); }
  });
});

describe('FR-129 工程ごとの時間計測', () => {
  // FR-129 AC-157
  it('FR-129 AC-157 build（モックの生成器）で、③〜⑦の各工程の開始・終了時刻（タイムゾーン付き）と所要時間が記録され、合計が和と一致し、画面に表示される', async () => {
    const code = await main(['build', '--customer', '計測社', '--no-keep', '--workspace', workspace, '--template', template], { log, smoke: mockSmoke });
    expect(code, logs.join('\n')).toBe(0);
    const t = readTiming('計測社');
    expect(t.stages.map((s) => s.step)).toEqual(['③', '④', '⑤', '⑥', '⑦']);
    expect(t.stages.map((s) => s.id)).toEqual(COMMAND_STAGES.build);
    const tz = /T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/;
    for (const s of t.stages) {
      expect(s.startedAt, s.id).toMatch(tz);
      expect(s.finishedAt, s.id).toMatch(tz);
      expect(Date.parse(s.finishedAt), s.id).toBeGreaterThanOrEqual(Date.parse(s.startedAt));
      expect(s.durationMs, s.id).toBeGreaterThanOrEqual(0);
      expect(s.ok).toBe(true);
    }
    const sum = t.stages.reduce((a, s) => a + s.durationMs, 0);
    expect(Math.abs(t.totalMs - sum)).toBeLessThan(0.2); // 合計は各工程の所要時間の和
    // 画面に、工程ごとの所要時間と合計が出る
    const out = logs.join('\n');
    for (const s of t.stages) expect(out).toContain(`${s.step} `);
    expect(out).toContain(`合計: ${(t.totalMs / 1000).toFixed(2)} 秒`);
  });

  // FR-129 AC-157
  it('FR-129 AC-157 工程が失敗しても、そこまでの時間と失敗の印を timing.json に残し、合計を表示する', async () => {
    const generator: PackGenerator = { generate: async (req: GenerateRequest) => (req.key === 'issues' ? 7 : mockGenerator.generate(req)) };
    const code = await main(['build', '--customer', '失敗社', '--no-keep', '--workspace', workspace, '--template', template], { consent: () => true, log, generator, smoke: mockSmoke });
    expect(code).toBe(1);
    const t = readTiming('失敗社');
    expect(t.stages.at(-1)).toMatchObject({ id: 'validate', ok: false });
    expect(logs.join('\n')).toMatch(/合計: \d+\.\d{2} 秒/);
  });
});

describe('FR-131 雛形への改善要望の記録', () => {
  const memo = (text: string): string => {
    const f = path.join(tmp, 'memo.md');
    fs.writeFileSync(f, text, 'utf8');
    return f;
  };

  // FR-131 AC-159
  it('FR-131 AC-159 スキーマにない画面種別を求める追加資料で build すると、改善要望の記録に追記され、顧客パックは検証に合格し、雛形は変わらない', async () => {
    const material = memo('# 商談メモ\n- 画面種別: 地図ビュー\n- 画面種別: ガントチャート\n- 雛形への要望: 印刷用のレイアウト\n議論の内容…\n');
    const before = snapshot(template);
    const r = await runPipeline('build', input('改善社', { materials: [material] }), { paths: paths(), launcher: stubLauncher, smoke: mockSmoke, log });
    const record = fs.readFileSync(path.join(workspace, IMPROVEMENT_FILE), 'utf8');
    expect(record).toContain('新しい画面種別: 地図ビュー');
    expect(record).toContain('印刷用のレイアウト');
    expect(record).toContain('顧客: 改善社');
    expect(record).toContain('memo.md');
    expect(record).not.toContain('ガントチャート'); // 雛形にある画面は、要望にしない
    expect(validatePackDir(r.workDir).errors).toEqual([]); // 顧客パックは検証に合格する
    // 要望は顧客パックでは実装されない（顧客パックの JSON に画面種別は現れない）
    const packText = fs.readFileSync(path.join(r.workDir, 'public', 'data', 'customer.json'), 'utf8');
    expect(packText).not.toContain('地図ビュー');
    expect(snapshot(template)).toEqual(before); // 雛形のコードは変わらない
    expect(readTiming('改善社').stages.find((s) => s.id === 'generate')).toMatchObject({ improvementRequests: 2 }); // 地図ビューと印刷用のレイアウト（ガントチャートは雛形にある）
    // 同じ追加資料で作り直しても、同じ要望を重ねて追記しない
    await runPipeline('build', input('改善社', { materials: [material] }), { paths: paths(), launcher: stubLauncher, smoke: mockSmoke, log });
    expect(fs.readFileSync(path.join(workspace, IMPROVEMENT_FILE), 'utf8').match(/地図ビュー/g)).toHaveLength(1);
  });

  // FR-131 AC-159
  it('FR-131 AC-159 要望のない追加資料・追加資料なしでは、記録ファイルを作らない', async () => {
    await runPipeline('build', input('通常社', { materials: [memo('# 商談メモ\n- 画面種別: 課題-解決策分析\n')] }), { paths: paths(), launcher: stubLauncher, smoke: mockSmoke, log });
    await runPipeline('build', input('なし社'), { paths: paths(), launcher: stubLauncher, smoke: mockSmoke, log });
    expect(fs.existsSync(path.join(workspace, IMPROVEMENT_FILE))).toBe(false);
  });

  it('FR-131 AC-159 雛形の画面の一覧（registry.ts）にある画面種別は要望にならず、並べて書いた画面種別は 1 件ずつ判定する', () => {
    const reg = path.join(template, 'src', 'screens');
    fs.mkdirSync(reg, { recursive: true });
    fs.writeFileSync(path.join(reg, 'registry.ts'), "export const SCREENS = [\n  { key: 'table', label: '一覧表', icon: X },\n  { key: 'view3d', label: '3D ビュー', icon: Y },\n];\n");
    const supported = supportedScreens(template);
    const reqs = extractImprovementRequests(
      [{ name: 'a.md', text: '* 画面種別: 一覧表、3D ビュー、カンバン\n1. 新しい画面種別：タイムライン画面\n画面種別なし\n' }], supported,
    );
    expect(reqs.map((r) => r.text)).toEqual(['カンバン', 'タイムライン画面']);
    expect(reqs.every((r) => r.kind === 'screen-type' && r.source === 'a.md')).toBe(true);
  });
});
