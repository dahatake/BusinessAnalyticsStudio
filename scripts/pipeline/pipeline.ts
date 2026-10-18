// 生成パイプラインの本体（FR-120）。コマンドごとの工程を順に実行し、工程ごとの時間を記録する。
import path from 'node:path';
import { formatPackError, type PackError } from '../../src/schema';
import { cloneTemplate, type CloneMode } from './clone';
import {
  COMMAND_STAGES, PARAMS, STAGES, isoLocal, workDir as workDirOf, researchCacheDir, type Command, type Inputs, type PipelinePaths, type StageId,
} from './common';
import { generatePack, mockGenerator, readMaterials, readSample, writePack, type PackGenerator } from './generate';
import { IMPROVEMENT_FILE, extractImprovementRequests, recordImprovementRequests, supportedScreens } from './improvements';
import { startStaticServer, type Launched, type Launcher } from './launch';
import {
  assertGitIgnored, checkResearchFreshness, loadResearchCache, reresearchSuggestion, sampleResearcher, saveResearchPart,
  type ResearchAttempt, type ResearchCache, type Researcher,
} from './research';
import { countPersonsInWorkDir, personConsentLine, readConsent } from './consent';
import { validateWithRepair } from './repair';
import { Recorder } from './timing';
import { formatVerifyReport, verifyPack, type SmokeRunner } from './verify';

export interface PipelineDeps {
  paths: PipelinePaths;
  researcher?: Researcher;
  generator?: PackGenerator;
  launcher?: Launcher;
  /** ⑥ verify のブラウザー検査（接続点）。既定は Playwright（Chromium）。`mockSmoke` はブラウザーを使わない */
  smoke?: SmokeRunner;
  /** ③の方式。既定 link（node_modules と dist をリンクで共有）、copy はフルコピー */
  cloneMode?: CloneMode;
  /** 案件の了承の記録があるか（FR-181）。既定は作業フォルダーの consent.json。なければ実調査・外部への送信をしない */
  consent?: (input: Inputs) => boolean;
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

/** 情報源を切り替えたとき（使えなかった・打ち切った）だけ、理由を 1 行にする */
function attemptNote(attempts: ResearchAttempt[] | undefined): string {
  const labels = { used: '使用', unavailable: '利用不可', timeout: '上限で打ち切り', error: 'エラー' } as const;
  const skipped = (attempts ?? []).filter((a) => a.outcome !== 'used');
  return skipped.length ? `（切り替え: ${skipped.map((a) => `${a.source}=${labels[a.outcome]}`).join('、')}）` : '';
}

function errorList(errors: readonly PackError[]): string {
  return errors.map((e) => `  ${formatPackError(e)}`).join('\n');
}

export async function runPipeline(command: Command, input: Inputs, deps: PipelineDeps): Promise<PipelineResult> {
  const { paths } = deps;
  const log = deps.log ?? (() => {});
  const consented = deps.consent ? deps.consent(input) : readConsent(paths, input) !== undefined;
  // FR-181: 了承の記録がない案件は、外部（LLM・WorkIQ・Web）へ送る調査・生成を使わず、サンプル・モックで進める
  const researcher = (consented ? deps.researcher : undefined) ?? sampleResearcher;
  const generator = (consented ? deps.generator : undefined) ?? mockGenerator;
  const launcher = deps.launcher ?? startStaticServer;
  const now = deps.now ?? (() => new Date());

  const ids = COMMAND_STAGES[command];
  if (!consented && (deps.researcher || deps.generator)) {
    log(`顧客の了承の記録がないため、実調査・外部への送信をしません（案件: ${input.customer} / ${input.projectName}）。サンプル・モックで進めます。`);
  }
  const work = workDirOf(paths, input.customer);
  // FR-219: 種別「人」を含み、了承の記録がある案件は、外部へ送る前に件数と確認日を出力に示してから続行する（対話の確認は出さない）
  const announcePersons = (): void => {
    if (!consented) return;
    const n = countPersonsInWorkDir(work);
    if (n > 0) log(personConsentLine(n, readConsent(paths, input)));
  };
  if (ids.some((id) => id === 'research-customer' || id === 'research-brand')) announcePersons();
  // 調査キャッシュと顧客パックは、コミットされない場所にだけ作る（NFR-SEC-003）。何かを書く前に確かめる
  if (ids.includes('research-customer')) assertGitIgnored(paths.repoRoot, path.join(researchCacheDir(paths, input.customer), 'meta.json'), '調査キャッシュの保存先');
  if (ids.includes('generate')) assertGitIgnored(paths.repoRoot, path.join(work, 'data', 'customer.json'), '顧客パックの作成先');
  const rec = new Recorder(path.join(work, 'logs'), command, now);
  let cache: ResearchCache | undefined;
  let launched: Launched | undefined;
  // 事前調査の実行日時。①②で同じ日時を記録し、再調査のたびに有効期限（FR-123）を数え直す
  const researchedAt = isoLocal(now());

  const handlers: Record<StageId, () => Promise<Record<string, unknown> | void>> = {
    'research-customer': async () => {
      const r = await researcher.researchCustomer(input);
      saveResearchPart(paths, input, 'customer', r, now, researchedAt);
      log(`① 顧客調査: 情報源=${r.source}${attemptNote(r.attempts)}`);
      return { source: r.source, ...(r.attempts ? { attempts: r.attempts } : {}) };
    },
    'research-brand': async () => {
      const r = await researcher.researchBrand(input);
      saveResearchPart(paths, input, 'brand', r, now, researchedAt);
      log(`② ブランド調査: 情報源=${r.source}${attemptNote(r.attempts)}`);
      return { source: r.source, ...(r.attempts ? { attempts: r.attempts } : {}) };
    },
    clone: async () => {
      const r = await cloneTemplate({
        template: paths.template, dest: work, exclude: [paths.workspace], rec, mode: deps.cloneMode ?? 'link',
      });
      log(`③ 雛形を用意しました（方式: ${r.method}、${r.durationSec.toFixed(2)} 秒、上限 ${r.limitSec} 秒）`);
      if (r.fallbackReason) log(`注意: ${r.fallbackReason}`);
      if (!r.withinLimit) {
        log(`警告: 雛形の複製が上限（${r.limitSec} 秒）を超えました。--copy を使っている場合は、既定のリンク方式に戻してください。`);
      }
      return { method: r.method, limitSec: r.limitSec, withinLimit: r.withinLimit, cloneDurationSec: Math.round(r.durationSec * 100) / 100 };
    },
    generate: async () => {
      // 期限切れの調査キャッシュは、再調査を提案する（FR-123）。生成は続ける
      const fresh = checkResearchFreshness(paths, input.customer, now());
      const suggestion = reresearchSuggestion(input.customer, fresh);
      for (const line of suggestion) log(line);
      cache = loadResearchCache(paths, input.customer);
      let usedSample = false;
      if (!cache) {
        // 調査キャッシュがないときは、前提を置いたサンプルで続ける（推定として記録する）
        log(`調査キャッシュがありません（${researchCacheDir(paths, input.customer)}）。前提を置いたサンプルで続けます。`);
        const [c, b] = await Promise.all([sampleResearcher.researchCustomer(input), sampleResearcher.researchBrand(input)]);
        saveResearchPart(paths, input, 'customer', c, now, researchedAt);
        saveResearchPart(paths, input, 'brand', b, now, researchedAt);
        cache = loadResearchCache(paths, input.customer)!;
        usedSample = true;
      }
      const files = await generatePack(generator, input, cache, paths.samplePack);
      const written = writePack(work, files, input);
      log(`④ 顧客パックを生成しました（${written.length} 件）`);
      announcePersons();
      // 顧客パックとしてサポートしない要望は、生成では実装せず、雛形への改善要望として記録する（FR-131）
      const requests = extractImprovementRequests(readMaterials(input.materials), supportedScreens(paths.template));
      let recorded = 0;
      if (requests.length > 0) {
        const file = path.join(paths.workspace, IMPROVEMENT_FILE);
        assertGitIgnored(paths.repoRoot, file, '雛形への改善要望の記録先');
        recorded = recordImprovementRequests(file, input.customer, requests, now()).length;
        log(`雛形への改善要望を ${requests.length} 件見つけました（新たに記録 ${recorded} 件。顧客パックでは実装しません）: ${file}`);
      }
      return {
        files: written.length, usedSampleCache: usedSample, ...(suggestion.length ? { cacheExpired: true } : {}),
        ...(requests.length ? { improvementRequests: requests.length } : {}),
      };
    },
    validate: async () => {
      // エラーがあれば、エラーの箇所だけを再生成して直す（最大 PARAM-006 回。FR-126）。上限に達したら、エラーの一覧を出して止まる
      const c = cache ?? loadResearchCache(paths, input.customer);
      if (!c) throw new PipelineError('スキーマ検証: 調査キャッシュがないため、自己修正の再生成ができません');
      const r = await validateWithRepair({
        workDir: work, generator, input, cache: c, sample: readSample(paths.samplePack), materials: readMaterials(input.materials),
        maxRounds: PARAMS.selfRepairMax, log,
        // 生成した顧客パックは、全エンティティに世界区分と種別を持つ。区分なしはエラーにして、その箇所を再生成する（FR-213 AC-509）
        requireClassified: true,
      });
      if (r.errors.length) {
        throw new PipelineError(
          `顧客パックの検証でエラーが ${r.errors.length} 件残りました（自己修正 ${r.rounds} 回、上限 ${PARAMS.selfRepairMax} 回）:\n${errorList(r.errors)}`,
          r.errors,
        );
      }
      log(`⑤ スキーマ検証: エラー 0 件${r.rounds ? `（自己修正 ${r.rounds} 回、${r.repaired.length} 箇所を再生成）` : ''}`);
      return { repairRounds: r.rounds, repairRequests: r.requests, repaired: r.repaired.map((x) => `${x.file}${x.path ? ` ${x.path}` : ''}`) };
    },
    verify: async () => {
      // 受け入れ判定（9 項目。FR-127）。不合格なら、原因と対処を出して止まる
      const r = await verifyPack({
        workDir: work, customer: input.customer, projectName: input.projectName, requireClassified: true, ...(deps.smoke ? { smoke: deps.smoke } : {}),
      });
      const report = formatVerifyReport(r);
      for (const line of report) log(line);
      if (!r.ok) {
        // 9 項目の結果・原因・対処は、上で画面に出した。止まる理由は不合格の項目だけを挙げる
        throw new PipelineError(`⑥ verify が不合格でした（${r.items.filter((i) => !i.ok).map((i) => i.name).join('、')}）。原因と対処は上の出力を見てください。`);
      }
      return { items: r.items.length, warnings: r.warnings.length, unclassified: r.unclassified, limitSec: r.limitSec };
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
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      if (id === 'research-customer' && ids[i + 1] === 'research-brand') {
        // ①顧客調査と②ブランド調査は並行して行う（FR-121）。片方が失敗しても、もう片方は最後まで行ってから失敗を返す
        const rs = await Promise.allSettled([rec.stage(id, handlers[id]), rec.stage('research-brand', handlers['research-brand'])]);
        const failed = rs.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        rec.stages.sort((a, b) => STAGES.findIndex((s) => s.id === a.id) - STAGES.findIndex((s) => s.id === b.id)); // 記録は工程の順にそろえる
        if (failed) throw failed.reason;
        executed.push(id, 'research-brand');
        i++;
        continue;
      }
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

