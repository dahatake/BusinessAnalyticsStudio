// ①② 事前調査と調査キャッシュ（FR-120 の research コマンドの土台）。
// 顧客調査・ブランド調査の実体（WorkIQ・Web・LLM）は `Researcher`（接続点）の後ろに置く。
// ここに同梱する `sampleResearcher` は、外部に接続せず「前提を置いたサンプル」を返す。
// 情報源の切り替え・時間の上限・期限（FR-121〜FR-123）は後続の項目が、この接続点の上に足す。
import fs from 'node:fs';
import path from 'node:path';
import { isoLocal, researchCacheDir, type Inputs, type PipelinePaths } from './common';

/** 調査に使った情報源（FR-121）。前提を置いたサンプルは「推定（サンプル）」と記録する */
export type ResearchSource = 'WorkIQ' | 'Web' | '推定（サンプル）';

export interface ResearchPart {
  source: ResearchSource;
  /** 調査結果の Markdown（顧客調査: data/customer-research.md、ブランド調査: brand/BRAND-RESEARCH.md の元） */
  markdown: string;
}

/** 調査の接続点。実際の接続（WorkIQ・Web・Copilot）は、この形で差し替える */
export interface Researcher {
  researchCustomer(input: Inputs): Promise<ResearchPart>;
  researchBrand(input: Inputs): Promise<ResearchPart>;
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
        '- 色: Microsoft 標準のニュートラルテーマ',
        '- フォント: Segoe UI Variable / Noto Sans JP',
        '- トーン: 先進的',
        '',
      ].join('\n'),
    };
  },
};

export interface ResearchMeta {
  customer: string;
  createdAt: string;
  customerSource?: ResearchSource;
  brandSource?: ResearchSource;
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

/** 調査の 1 部分をキャッシュに保存する（①と②が並行しても、同期の書き込みなので壊れない） */
export function saveResearchPart(
  paths: PipelinePaths, input: Inputs, part: 'customer' | 'brand', result: ResearchPart, now: () => Date = () => new Date(),
): string {
  const dir = researchCacheDir(paths, input.customer);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, part === 'customer' ? F.customer : F.brand), result.markdown, 'utf8');
  const meta = readMeta(dir);
  const next: ResearchMeta = {
    customer: input.customer,
    createdAt: meta.createdAt ?? isoLocal(now()),
    ...(meta.customerSource ? { customerSource: meta.customerSource } : {}),
    ...(meta.brandSource ? { brandSource: meta.brandSource } : {}),
    ...(part === 'customer' ? { customerSource: result.source } : { brandSource: result.source }),
  };
  fs.writeFileSync(path.join(dir, F.meta), JSON.stringify(next, null, 2) + '\n', 'utf8');
  return dir;
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
