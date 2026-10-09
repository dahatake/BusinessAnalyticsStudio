// 生成パイプラインのコマンド（Skill `envisioning-dashboard` が呼ぶ）。
// 使い方: npm run pipeline -- <research|build|all> [--customer 顧客名] [--project Project名]
//         [--intensity Executive|Showcase|Entertainment] [--bgm フォルダー] [--material 追加資料]...
// 顧客名を省くと、対話形式で尋ねる。終了コード: 0=成功、1=失敗、2=入力の誤り。
import path from 'node:path';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { COMMANDS, InputError, defaultPaths, type Command, type PipelinePaths } from './common';
import { parseArgs, resolveInputs, type Ask } from './inputs';
import { runPipeline, type PipelineDeps } from './pipeline';
import { mockGenerator, type PackGenerator } from './generate';
import { sampleResearcher, type Researcher } from './research';

export interface CliDeps {
  paths?: Partial<PipelinePaths>;
  ask?: Ask;
  /** 端末での対話形式（引数にない任意の入力変数も質問する） */
  interactive?: boolean;
  log?: (line: string) => void;
  /** 差し替え（テスト用）。指定がなければ --generator / --researcher の指定、なければ同梱のモック */
  generator?: PackGenerator;
  researcher?: Researcher;
}

const USAGE = `使い方: npm run pipeline -- <${COMMANDS.join('|')}> [--customer 顧客名] [--project Project名]
  [--intensity Executive|Showcase|Entertainment] [--bgm BGMフォルダー] [--material 追加資料]...
  [--workspace 作業フォルダーの親] [--template 雛形] [--sample お手本パック]
  [--generator mock|モジュールのパス] [--researcher sample|モジュールのパス] [--no-keep]
  research=①②（事前調査）、build=③〜⑦（複製・生成・検証・起動）、all=①〜⑦。顧客名を省くと対話形式で尋ねる。
  --no-keep: ⑦で起動を確かめたら、サーバーを止めて終了する。`;

async function loadModule<T>(spec: string, exportName: string): Promise<T> {
  const mod = (await import(pathToFileURL(path.resolve(spec)).href)) as Record<string, unknown>;
  const factory = mod[exportName] ?? (mod['default'] as Record<string, unknown> | undefined)?.[exportName];
  if (typeof factory !== 'function') throw new InputError(`${spec} は ${exportName}() を公開していません`);
  return (factory as () => T)();
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
    const researcher = deps.researcher ?? (r && r !== 'sample' ? await loadModule<Researcher>(r, 'createResearcher') : sampleResearcher);

    const pdeps: PipelineDeps = { paths, generator, researcher, log };
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
