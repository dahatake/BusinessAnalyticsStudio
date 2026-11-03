// 生成パイプラインのコマンド（Skill `envisioning-dashboard` が呼ぶ）。
// 使い方: npm run pipeline -- <research|build|all> [--customer 顧客名] [--project Project名]
//         [--intensity Executive|Showcase|Entertainment] [--bgm フォルダー] [--material 追加資料]...
// 顧客名を省くと、対話形式で尋ねる。終了コード: 0=成功、1=失敗、2=入力の誤り。
import path from 'node:path';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { COMMANDS, InputError, defaultPaths, type Command, type Inputs, type PipelinePaths } from './common';
import { parseArgs, resolveInputs, type Ask } from './inputs';
import { runPipeline, type PipelineDeps } from './pipeline';
import { mockGenerator, type PackGenerator } from './generate';
import { chainResearcher, type ResearchSourceEntry, type Researcher } from './research';
import { mockSmoke, type SmokeRunner } from './verify';

export interface CliDeps {
  paths?: Partial<PipelinePaths>;
  ask?: Ask;
  /** 端末での対話形式（引数にない任意の入力変数も質問する） */
  interactive?: boolean;
  log?: (line: string) => void;
  /** 差し替え（テスト用）。指定がなければ --generator / --researcher の指定、なければ同梱のモック */
  generator?: PackGenerator;
  researcher?: Researcher;
  /** 種別「人」を含む案件の確認の差し替え（テスト用）。指定がなければ ask（対話）で y/N を尋ね、既定は中止（FR-219 AC-512） */
  confirmPerson?: PipelineDeps['confirmPerson'];
  /** ⑥ verify のブラウザー検査の差し替え（テスト用）。指定がなければ --smoke の指定、なければ Playwright */
  smoke?: SmokeRunner;
}

const USAGE = `使い方: npm run pipeline -- <${COMMANDS.join('|')}> [--customer 顧客名] [--project Project名]
  [--intensity Executive|Showcase|Entertainment] [--bgm BGMフォルダー] [--material 追加資料]...
  [--workspace 作業フォルダーの親] [--template 雛形] [--sample お手本パック]
  [--generator mock|モジュールのパス] [--researcher sample|モジュールのパス] [--smoke playwright|mock] [--copy] [--no-keep] [--live]
  research=①②（事前調査）、build=③〜⑦（複製・生成・検証・起動）、all=①〜⑦。顧客名を省くと対話形式で尋ねる。
  --live: 外部（LLM・WorkIQ・Web）へ送る実調査・生成をする。付けないときは外部へ送信せず、前提を置いたサンプル・モックで進む。
          種別「人」を含む案件では、送る前に件数を示して y/N を尋ねる（既定は中止）。
  --smoke: ⑥ verify のブラウザー検査。既定は playwright（Chromium）、mock はブラウザーを使わずに合格とする。
  --copy: ③で node_modules と dist をフルコピーする（既定は読み取り専用のリンクで共有）。
  --no-keep: ⑦で起動を確かめたら、サーバーを止めて終了する。`;

async function loadModule<T>(spec: string, exportName: string): Promise<T> {
  const mod = (await import(pathToFileURL(path.resolve(spec)).href)) as Record<string, unknown>;
  const factory = mod[exportName] ?? (mod['default'] as Record<string, unknown> | undefined)?.[exportName];
  if (typeof factory !== 'function') throw new InputError(`${spec} は ${exportName}() を公開していません`);
  return (factory as () => T)();
}

/** 既定の調査。WorkIQ・Web の差し替え部品がないので「利用不可」として切り替え、前提を置いたサンプルで成功する（FR-121） */
function defaultResearcher(): Researcher {
  return chainResearcher([{ source: 'WorkIQ' }, { source: 'Web' }]);
}

/**
 * `--researcher` のモジュールを読む。`createResearchSources()`（優先順位つきの情報源: WorkIQ → Web）があれば、
 * 上限時間（PARAM-003）で切り替える調査にする。なければ `createResearcher()`（1 つの調査）をそのまま使う。
 */
async function loadResearcher(spec: string): Promise<Researcher> {
  const mod = (await import(pathToFileURL(path.resolve(spec)).href)) as Record<string, unknown>;
  const pick = (name: string): unknown => mod[name] ?? (mod['default'] as Record<string, unknown> | undefined)?.[name];
  const sources = pick('createResearchSources');
  if (typeof sources === 'function') return chainResearcher(await (sources as () => Promise<ResearchSourceEntry[]> | ResearchSourceEntry[])());
  return loadModule<Researcher>(spec, 'createResearcher');
}

function terminalAsk(): { ask: Ask; close(): void } {
  let rl: readline.Interface | undefined;
  return {
    ask: (q, def) => {
      rl ??= readline.createInterface({ input: process.stdin, output: process.stdout });
      const r = rl;
      const closed = new Promise<string>((_, reject) => r.once('close', () => reject(new InputError('入力が終了したため、質問に答えられませんでした'))));
      return Promise.race([r.question(def ? `${q} [${def}]: ` : `${q}: `), closed]);
    },
    close: () => rl?.close(),
  };
}

/** コマンドを実行して終了コードを返す */
export async function main(argv: readonly string[], deps: CliDeps = {}): Promise<number> {
  const log = deps.log ?? ((l: string) => console.log(l));
  let term: ReturnType<typeof terminalAsk> | undefined;
  try {
    const args = parseArgs(argv);
    const command = args.positional[0] as Command | undefined;
    if (!command || !COMMANDS.includes(command)) {
      log(USAGE);
      return 2;
    }
    let ask = deps.ask;
    if (!ask) { term = terminalAsk(); ask = term.ask; }
    const input = await resolveInputs(args, { ask, interactive: deps.interactive ?? (process.stdin.isTTY === true) });
    // 種別「人」の確認（AC-512）。差し替えがなければ、質問できる経路（渡された ask か端末）で y/N を尋ねる。答えられなければ中止
    const canAsk = deps.ask !== undefined || process.stdin.isTTY === true;
    const confirmPerson: PipelineDeps['confirmPerson'] = deps.confirmPerson ?? (canAsk ? async (info) => {
      const t = deps.ask ? undefined : terminalAsk();
      try {
        const a = await (deps.ask ?? t!.ask)(info.question, 'N');
        return /^\s*y(es)?\s*$/i.test(a);
      } catch {
        return false;
      } finally {
        t?.close();
      }
    } : undefined);
    term?.close();
    term = undefined;

    const paths = defaultPaths({
      ...(args.options['workspace']?.[0] ? { workspace: path.resolve(args.options['workspace'][0]) } : {}),
      ...(args.options['template']?.[0] ? { template: path.resolve(args.options['template'][0]) } : {}),
      ...(args.options['sample']?.[0] ? { samplePack: path.resolve(args.options['sample'][0]) } : {}),
      ...deps.paths,
    });
    const g = args.options['generator']?.[0];
    const r = args.options['researcher']?.[0];
    const generator = deps.generator ?? (g && g !== 'mock' ? await loadModule<PackGenerator>(g, 'createGenerator') : mockGenerator);
    const researcher = deps.researcher ?? (r && r !== 'sample' ? await loadResearcher(r) : defaultResearcher());
    const sm = args.options['smoke']?.[0];
    if (sm !== undefined && sm !== 'mock' && sm !== 'playwright') throw new InputError(`--smoke は mock か playwright を指定してください: ${sm}`);
    const smoke = deps.smoke ?? (sm === 'mock' ? mockSmoke : undefined);

    const pdeps: PipelineDeps = {
      paths, generator, researcher, log, cloneMode: args.flags.has('copy') ? 'copy' : 'link',
      live: args.flags.has('live'),
      ...(confirmPerson ? { confirmPerson } : {}),
      ...(smoke ? { smoke } : {}),
    };
    const result = await runPipeline(command, input, pdeps);
    if (result.launched) {
      if (args.flags.has('no-keep')) await result.launched.close();
      else log('停止するには Ctrl+C を押してください。');
    }
    return 0;
  } catch (e) {
    term?.close();
    if (e instanceof InputError) { log(`入力の誤り: ${e.message}`); return 2; }
    log(`失敗: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => {
    if (code !== 0 || process.argv.includes('--no-keep') || !['build', 'all'].includes(process.argv[2] ?? '')) process.exit(code);
  });
}
