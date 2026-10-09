// 生成パイプラインの本体（FR-120）。コマンドごとの工程を順に実行し、工程ごとの時間を記録する。
import fs from 'node:fs';
import path from 'node:path';
import { formatPackError, type PackError } from '../../src/schema';
import { validatePackDir } from '../lib/pack-fs';
import { cloneTemplate } from './clone';
import {
  COMMAND_STAGES, workDir as workDirOf, researchCacheDir, type Command, type Inputs, type PipelinePaths, type StageId,
} from './common';
import { generatePack, mockGenerator, writePack, type PackGenerator } from './generate';
import { startStaticServer, type Launched, type Launcher } from './launch';
import {
  loadResearchCache, sampleResearcher, saveResearchPart, type ResearchCache, type Researcher,
} from './research';
import { Recorder } from './timing';

export interface PipelineDeps {
  paths: PipelinePaths;
  researcher?: Researcher;
  generator?: PackGenerator;
  launcher?: Launcher;
  log?: (line: string) => void;
  now?: () => Date;
}

export interface PipelineResult {
  command: Command;
  /** 実行した工程（順） */
  stages: StageId[];
  workDir: string;
  timingFile: string;
  /** ⑦で起動したサーバー。呼び出し側が `close()` する */
  launched?: Launched;
}

export class PipelineError extends Error {
  constructor(message: string, public readonly errors: PackError[] = []) {
    super(message);
    this.name = 'PipelineError';
  }
}

function validateOrThrow(dir: string): void {
  const r = validatePackDir(dir);
  if (r.errors.length) {
    throw new PipelineError(
      `顧客パックの検証でエラーが ${r.errors.length} 件ありました:\n${r.errors.map((e) => `  ${formatPackError(e)}`).join('\n')}`,
      r.errors,
    );
  }
}

export async function runPipeline(command: Command, input: Inputs, deps: PipelineDeps): Promise<PipelineResult> {
  const { paths } = deps;
  const log = deps.log ?? (() => {});
  const researcher = deps.researcher ?? sampleResearcher;
  const generator = deps.generator ?? mockGenerator;
  const launcher = deps.launcher ?? startStaticServer;
  const now = deps.now ?? (() => new Date());

  const work = workDirOf(paths, input.customer);
  const rec = new Recorder(path.join(work, 'logs'), command, now);
  const ids = COMMAND_STAGES[command];
  let cache: ResearchCache | undefined;
  let launched: Launched | undefined;

  const handlers: Record<StageId, () => Promise<Record<string, unknown> | void>> = {
    'research-customer': async () => {
      const r = await researcher.researchCustomer(input);
      saveResearchPart(paths, input, 'customer', r, now);
      log(`① 顧客調査: 情報源=${r.source}`);
      return { source: r.source };
    },
    'research-brand': async () => {
      const r = await researcher.researchBrand(input);
      saveResearchPart(paths, input, 'brand', r, now);
      log(`② ブランド調査: 情報源=${r.source}`);
      return { source: r.source };
    },
    clone: async () => {
      const r = await cloneTemplate({
        template: paths.template, dest: work, exclude: [paths.workspace], rec,
      });
      log(`③ 雛形を複製しました（${r.durationSec.toFixed(2)} 秒、上限 ${r.limitSec} 秒）`);
      if (!r.withinLimit) {
        log(`警告: 雛形の複製が上限（${r.limitSec} 秒）を超えました。ウイルス対策ソフトの除外設定や、雛形の node_modules の削減（不要な devDependencies の除外）を検討してください。`);
      }
      return { limitSec: r.limitSec, withinLimit: r.withinLimit, cloneDurationSec: Math.round(r.durationSec * 100) / 100 };
    },
    generate: async () => {
      cache = loadResearchCache(paths, input.customer);
      let usedSample = false;
      if (!cache) {
        // 調査キャッシュがないときは、前提を置いたサンプルで続ける（推定として記録する）
        log(`調査キャッシュがありません（${researchCacheDir(paths, input.customer)}）。前提を置いたサンプルで続けます。`);
        const [c, b] = await Promise.all([sampleResearcher.researchCustomer(input), sampleResearcher.researchBrand(input)]);
        saveResearchPart(paths, input, 'customer', c, now);
        saveResearchPart(paths, input, 'brand', b, now);
        cache = loadResearchCache(paths, input.customer)!;
        usedSample = true;
      }
      const files = await generatePack(generator, input, cache, paths.samplePack);
      const written = writePack(work, files, input);
      log(`④ 顧客パックを生成しました（${written.length} 件）`);
      return { files: written.length, usedSampleCache: usedSample };
    },
    validate: async () => {
      validateOrThrow(work);
      log('⑤ スキーマ検証: エラー 0 件');
    },
    verify: async () => {
      // 受け入れ判定の入口。パックの検証と、起動に必要な成果物・入力の反映を確かめる
      validateOrThrow(work);
      if (!fs.existsSync(path.join(work, 'dist', 'index.html'))) throw new PipelineError('verify: dist/index.html がありません');
      const customer = JSON.parse(fs.readFileSync(path.join(work, 'public', 'data', 'customer.json'), 'utf8')) as { name?: string; projectName?: string };
      if (customer.name !== input.customer || customer.projectName !== input.projectName) {
        throw new PipelineError('verify: customer.json の顧客名・Project 名が入力と一致しません');
      }
      log('⑥ verify: 合格');
    },
    launch: async () => {
      rec.recordCommand(`serve ${path.join(work, 'dist')} (127.0.0.1)`);
      launched = await launcher(work);
      log(`⑦ 起動しました: ${launched.url}`);
      return { url: launched.url };
    },
  };

  const executed: StageId[] = [];
  try {
    for (const id of ids) {
      await rec.stage(id, handlers[id]);
      executed.push(id);
    }
  } catch (e) {
    await launched?.close();
    throw e;
  } finally {
    rec.write();
    for (const line of rec.summary()) log(line);
  }
  return { command, stages: executed, workDir: work, timingFile: path.join(work, 'logs', 'timing.json'), ...(launched ? { launched } : {}) };
}
