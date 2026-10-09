// ①② 事前調査と調査キャッシュ（FR-120 の research コマンドの土台）。
// 顧客調査・ブランド調査の実体（WorkIQ・Web・LLM）は `Researcher`（接続点）の後ろに置く。
// ここに同梱する `sampleResearcher` は、外部に接続せず「前提を置いたサンプル」を返す。
// FR-121: `chainResearcher` が WorkIQ → Web → 前提を置いたサンプル の順に情報源を切り替え、上限時間（PARAM-003）で打ち切り、
//         使った情報源と試行の結果を記録する。FR-123: 調査キャッシュの有効期限（PARAM-004）の判定。
// NFR-SEC-003: 調査キャッシュはコミットされない場所にだけ書き、所有者だけが読み書きできる権限で作る。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PARAMS, isoLocal, researchCacheDir, type Inputs, type PipelinePaths } from './common';
import { DEFAULT_BRAND_THEME } from './brand-sources';

/** 調査に使った情報源（FR-121）。前提を置いたサンプルは「推定（サンプル）」と記録する */
export type ResearchSource = 'WorkIQ' | 'Web' | '推定（サンプル）';

/** 情報源ごとの試行の結果（FR-121）。used=この情報源で調査した */
export interface ResearchAttempt {
  source: ResearchSource;
  outcome: 'used' | 'unavailable' | 'timeout' | 'error';
  detail?: string;
}

export interface ResearchPart {
  source: ResearchSource;
  /** 調査結果の Markdown（顧客調査: data/customer-research.md、ブランド調査: brand/BRAND-RESEARCH.md の元） */
  markdown: string;
  /** 情報源を切り替えたときの、試行の記録（`chainResearcher` が付ける） */
  attempts?: ResearchAttempt[];
}

/** 呼び出しの付帯情報。上限時間で打ち切るとき、`signal` が中断される（接続点は、できれば処理を止める） */
export interface ResearchContext {
  signal?: AbortSignal;
}

/** 調査の接続点。実際の接続（WorkIQ・Web・Copilot）は、この形で差し替える */
export interface Researcher {
  researchCustomer(input: Inputs, ctx?: ResearchContext): Promise<ResearchPart>;
  researchBrand(input: Inputs, ctx?: ResearchContext): Promise<ResearchPart>;
}

/** 情報源が使えない（接続できない・権限がない・未設定）ことを示す。投げると次の情報源に切り替わる */
export class SourceUnavailableError extends Error {
  constructor(message = '利用できません') {
    super(message);
    this.name = 'SourceUnavailableError';
  }
}

/** 優先順位つきの情報源（WorkIQ → Web）。`researcher` がなければ利用不可として扱う */
export interface ResearchSourceEntry {
  source: Exclude<ResearchSource, '推定（サンプル）'>;
  researcher?: Researcher;
  /** 使えるかどうかの確認（任意。false なら利用不可） */
  available?: () => boolean | Promise<boolean>;
}

export interface ChainOptions {
  /** 事前調査全体の上限（ミリ秒）。既定は PARAM-003（10 分） */
  limitMs?: number;
  /** すべての情報源が使えなかったときの調査。既定は `sampleResearcher` */
  fallback?: Researcher;
  /** 経過時間の時計（テスト用） */
  clock?: () => number;
}

type Method = 'researchCustomer' | 'researchBrand';

async function runChain(method: Method, entries: readonly ResearchSourceEntry[], input: Inputs, opts: ChainOptions): Promise<ResearchPart> {
  const limit = opts.limitMs ?? PARAMS.researchLimitSec * 1000;
  const clock = opts.clock ?? (() => performance.now());
  const start = clock();
  const attempts: ResearchAttempt[] = [];
  for (const [i, e] of entries.entries()) {
    const remaining = limit - (clock() - start);
    if (remaining <= 0) {
      attempts.push({ source: e.source, outcome: 'timeout', detail: '上限時間に達していたため試さなかった' });
      continue;
    }
    const target = e.researcher;
    if (!target) {
      attempts.push({ source: e.source, outcome: 'unavailable', detail: '差し替え部品がありません' });
      continue;
    }
    // 残り時間を、残りの情報源で等分する（先の情報源が応答しなくても、後の情報源を試す時間を残す）
    const budget = remaining / (entries.length - i);
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { ctl.abort(); reject(new TimeoutError()); }, budget);
    });
    try {
      const run = (async () => {
        if (e.available && !(await e.available())) throw new SourceUnavailableError();
        return target[method](input, { signal: ctl.signal });
      })();
      const part = await Promise.race([run, timedOut]);
      attempts.push({ source: e.source, outcome: 'used' });
      return { ...part, source: e.source, attempts };
    } catch (err) {
      if (err instanceof TimeoutError) attempts.push({ source: e.source, outcome: 'timeout', detail: `${Math.round(budget)} ミリ秒で打ち切り` });
      else if (err instanceof SourceUnavailableError) attempts.push({ source: e.source, outcome: 'unavailable', detail: err.message });
      else attempts.push({ source: e.source, outcome: 'error', detail: err instanceof Error ? err.message : String(err) });
    } finally {
      clearTimeout(timer);
    }
  }
  const fb = await (opts.fallback ?? sampleResearcher)[method](input);
  attempts.push({ source: fb.source, outcome: 'used' });
  return { ...fb, attempts };
}

class TimeoutError extends Error {}

/**
 * WorkIQ → Web → 前提を置いたサンプル の順に切り替える調査（FR-121）。
 * 使えない・失敗した・上限で打ち切った情報源は飛ばし、最後は必ずサンプルで成功する。使った情報源と試行の結果は `ResearchPart` に付く。
 * 顧客調査とブランド調査は、それぞれ独立に切り替える。
 */
export function chainResearcher(entries: readonly ResearchSourceEntry[], opts: ChainOptions = {}): Researcher {
  return {
    researchCustomer: (input) => runChain('researchCustomer', entries, input, opts),
    researchBrand: (input) => runChain('researchBrand', entries, input, opts),
  };
}

export const sampleResearcher: Researcher = {
  async researchCustomer(input) {
    return {
      source: '推定（サンプル）',
      markdown: [
        `# 顧客調査: ${input.customer}`,
        '',
        '> 情報源: 推定（サンプル）。外部の情報源に接続せず、前提を置いて作成した。商談の前に実際の情報で置き換える。',
        '',
        '## 前提',
        `- 顧客名: ${input.customer}`,
        `- Project 名: ${input.projectName}`,
        '- 事業・課題・関係者は未確認。お手本の顧客パックの構成を前提にする。',
        '',
      ].join('\n'),
    };
  },
  async researchBrand(input) {
    return {
      source: '推定（サンプル）',
      markdown: [
        `# ブランド調査: ${input.customer}`,
        '',
        '> 情報源: 推定（サンプル）。公式の出典を特定できなかったため、既定のテーマを使う。',
        '',
        '## 既定のブランドプロファイル（確度: 推定）',
        `- 色: ${DEFAULT_BRAND_THEME.themeName}`,
        `- フォント: ${DEFAULT_BRAND_THEME.fonts}`,
        `- トーン: ${DEFAULT_BRAND_THEME.tone}`,
        '',
      ].join('\n'),
    };
  },
};

export interface ResearchMeta {
  customer: string;
  /** 調査をした日時（タイムゾーン付き）。有効期限（FR-123）はここから数える */
  createdAt: string;
  customerSource?: ResearchSource;
  brandSource?: ResearchSource;
  /** 情報源ごとの試行の結果（FR-121）。切り替えがあったときだけ入る */
  customerAttempts?: ResearchAttempt[];
  brandAttempts?: ResearchAttempt[];
}

export interface ResearchCache {
  meta: ResearchMeta;
  customerResearch: string;
  brandResearch: string;
}

const F = { meta: 'meta.json', customer: 'customer-research.md', brand: 'brand-research.md' } as const;

function readMeta(dir: string): Partial<ResearchMeta> {
  const f = path.join(dir, F.meta);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as Partial<ResearchMeta>) : {};
}

/**
 * 調査の 1 部分をキャッシュに保存する（①と②が並行しても、同期の書き込みなので壊れない）。
 * `createdAt` を渡すと、その調査の実行日時として記録する（再調査で有効期限を数え直す）。渡さなければ、最初の日時を保つ。
 * フォルダー・ファイルは所有者だけが読み書きできる権限で作る（NFR-SEC-003。Windows では継承された ACL に従う）。
 */
export function saveResearchPart(
  paths: PipelinePaths, input: Inputs, part: 'customer' | 'brand', result: ResearchPart,
  now: () => Date = () => new Date(), createdAt?: string,
): string {
  const dir = researchCacheDir(paths, input.customer);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, part === 'customer' ? F.customer : F.brand), result.markdown, { encoding: 'utf8', mode: 0o600 });
  const meta = readMeta(dir);
  const next: ResearchMeta = {
    customer: input.customer,
    createdAt: createdAt ?? meta.createdAt ?? isoLocal(now()),
    ...(meta.customerSource ? { customerSource: meta.customerSource } : {}),
    ...(meta.brandSource ? { brandSource: meta.brandSource } : {}),
    ...(meta.customerAttempts ? { customerAttempts: meta.customerAttempts } : {}),
    ...(meta.brandAttempts ? { brandAttempts: meta.brandAttempts } : {}),
    ...(part === 'customer' ? { customerSource: result.source } : { brandSource: result.source }),
  };
  if (part === 'customer') { delete next.customerAttempts; if (result.attempts) next.customerAttempts = result.attempts; }
  else { delete next.brandAttempts; if (result.attempts) next.brandAttempts = result.attempts; }
  fs.writeFileSync(path.join(dir, F.meta), JSON.stringify(next, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  return dir;
}

/** 調査キャッシュの鮮度（FR-123） */
export type ResearchFreshness =
  | { status: 'missing' }
  | { status: 'valid' | 'expired'; createdAt: string; ageDays: number; validityDays: number };

/**
 * 調査キャッシュが期限内かを判定する。作成日時から `validityDays`（既定 PARAM-004: 30 日）より長く経っていれば期限切れ。
 * ちょうど `validityDays` 経った時点は期限内。作成日時を読めないときは、期限切れとして扱う。
 */
export function checkResearchFreshness(
  paths: PipelinePaths, customer: string, now: Date = new Date(), validityDays: number = PARAMS.cacheValidityDays,
): ResearchFreshness {
  const dir = researchCacheDir(paths, customer);
  if (!fs.existsSync(path.join(dir, F.meta))) return { status: 'missing' };
  const createdAt = readMeta(dir).createdAt ?? '';
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return { status: 'expired', createdAt, ageDays: Number.POSITIVE_INFINITY, validityDays };
  const ageDays = (now.getTime() - t) / 86_400_000;
  return { status: ageDays > validityDays ? 'expired' : 'valid', createdAt, ageDays: Math.floor(ageDays), validityDays };
}

/** 期限切れのときの、再調査の提案（期限内・キャッシュなしなら空） */
export function reresearchSuggestion(customer: string, f: ResearchFreshness): string[] {
  if (f.status !== 'expired') return [];
  const age = Number.isFinite(f.ageDays) ? `${f.ageDays} 日前` : '日時が不明';
  return [
    `調査キャッシュが期限切れです（作成: ${f.createdAt || '不明'}（${age}）、有効期限: ${f.validityDays} 日）。`,
    `再調査をおすすめします: npm run pipeline -- research --customer "${customer}"`,
  ];
}

/**
 * 書き込み先がリポジトリの中にあるときは、git の管理外（.gitignore の対象）であることを確かめる（NFR-SEC-003）。
 * 対象でなければ、顧客の情報をコミットしてしまうおそれがあるので止める。リポジトリの外、または git が使えないときは確かめない。
 */
export function assertGitIgnored(repoRoot: string, target: string, what: string): void {
  const rel = path.relative(repoRoot, target);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return;
  try {
    execFileSync('git', ['check-ignore', '-q', '--', target], { cwd: repoRoot, stdio: 'ignore' });
  } catch (e) {
    if ((e as { status?: number }).status === 1) {
      throw new Error(`${what}（${rel}）が .gitignore の対象ではありません。顧客の情報をコミットしないよう、作業フォルダーを .gitignore の対象の場所（既定: work/）にしてください。`);
    }
  }
}


/** 調査キャッシュを読む。そろっていなければ undefined */
export function loadResearchCache(paths: PipelinePaths, customer: string): ResearchCache | undefined {
  const dir = researchCacheDir(paths, customer);
  const files = [F.meta, F.customer, F.brand].map((n) => path.join(dir, n));
  if (!files.every((f) => fs.existsSync(f))) return undefined;
  const meta = readMeta(dir) as ResearchMeta;
  return {
    meta,
    customerResearch: fs.readFileSync(files[1]!, 'utf8'),
    brandResearch: fs.readFileSync(files[2]!, 'utf8'),
  };
}
