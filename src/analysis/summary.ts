// エグゼクティブサマリー（FR-041）。結論・根拠の数値・推奨アクションを 1 文ずつ（PARAM-015: 2〜3 文）。
// 接続していないときは、データから作るテンプレート（モックの AI）。画面・ストアを参照しない純粋なモジュール。
import type { PackData } from '../schema';
import { buildEntityGraph } from '../selection/graph';
import { archVariants, diffArchitecture } from './architecture';
import { solutionsOfIssue } from './model';
import { buildPriorityRows, type Weights } from './priority';
import type { TreeDoc } from './tree';

export const SUMMARY_SCOPES = ['overview', 'issue-solution', 'priority', 'gantt', 'architecture', 'knowledge-graph', 'discussion-tree', 'table'] as const;
export type SummaryScope = (typeof SUMMARY_SCOPES)[number];

/** 根拠の文の一部。数値は出典の ID を持つと、NumericValue で出典を示せる */
export type Part = string | { text: string; sourceIds: readonly string[] };

export interface SummaryContent {
  conclusion: string;
  /** 根拠の数値を含む文（部分に分けたもの） */
  evidence: Part[];
  action: string;
}

export interface SummaryText { conclusion: string; evidence: string; action: string }

export const partText = (p: Part): string => (typeof p === 'string' ? p : p.text);
export const evidenceText = (parts: readonly Part[]): string => parts.map(partText).join('');
export const contentText = (c: SummaryContent): SummaryText => ({ conclusion: c.conclusion, evidence: evidenceText(c.evidence), action: c.action });

/** 文の数（。！？で数える）。PARAM-015 の確認に使う */
export function sentenceCount(text: string): number {
  return text.split(/[。！？!?]/).map((s) => s.trim()).filter((s) => s !== '').length;
}

export interface SummaryContext {
  weights: Weights;
  tree?: TreeDoc;
}

const n = (v: number): string => v.toLocaleString('ja-JP');

export function buildSummary(scope: SummaryScope, data: PackData, ctx: SummaryContext): SummaryContent {
  const issues = data.issues.issues;
  const solutions = data.issues.solutions;
  switch (scope) {
    case 'priority': {
      const rows = buildPriorityRows(issues, ctx.weights);
      const top = rows[0];
      if (!top) return empty('優先順位を付ける課題がありません。', '課題 0 件。', '課題を追加してから評価してください。');
      const issue = issues.find((i) => i.id === top.id);
      const ev = issue?.evaluation;
      const parts: Part[] = [`根拠: 「${top.title}」は `];
      const roi = typeof ev?.roi?.value === 'number' ? ev.roi : undefined;
      const cost = typeof ev?.cost?.value === 'number' ? ev.cost : undefined;
      if (roi) parts.push('ROI ', { text: `${n(roi.value as number)}${roi.unit ?? ''}`, sourceIds: roi.sourceIds }, '、');
      if (cost) parts.push('コスト ', { text: `${n(cost.value as number)}${cost.unit ?? ''}`, sourceIds: cost.sourceIds }, '、');
      parts.push(`重み付きスコアは ${top.score.toFixed(1)}（${rows.length} 件中 ${top.rank} 位）。`);
      return {
        conclusion: `最優先の課題は「${top.title}」です。`,
        evidence: parts,
        action: `「${top.title}」の担当と期限を決め、重みの前提を顧客と確認してください。`,
      };
    }
    case 'issue-solution': {
      const noSolution = issues.filter((i) => solutionsOfIssue(i.id, solutions).length === 0);
      const first = issues[0];
      return {
        conclusion: first ? `課題「${first.title}」を起点に、解決策を整理できます。` : '課題がまだ整理されていません。',
        evidence: [`根拠: 課題 ${issues.length} 件に対し解決策 ${solutions.length} 件があり、解決策のない課題は ${noSolution.length} 件です。`],
        action: noSolution.length > 0 ? `解決策のない課題（${noSolution[0]?.title}）の打ち手を検討してください。` : '優先度の高い課題から議論テーマにしてください。',
      };
    }
    case 'gantt': {
      const dated = data.plan.tasks.filter((t) => t.start && t.end);
      const starts = dated.map((t) => t.start as string).sort();
      const ends = dated.map((t) => t.end as string).sort();
      const span = dated.length > 0 ? `${starts[0]}〜${ends[ends.length - 1]}` : '日付なし';
      return {
        conclusion: `工程は ${data.plan.features.length} 件の機能に分かれ、計画が組まれています。`,
        evidence: [`根拠: 工程 ${data.plan.tasks.length} 件、期間は ${span} です。`],
        action: '依存関係のある工程と担当の偏りから確認してください。',
      };
    }
    case 'architecture': {
      const v = archVariants(data.architecture);
      const d = diffArchitecture(v.asis, v.tobe);
      const c = (k: string) => d.elements.filter((e) => e.diff === k).length;
      return {
        conclusion: 'ToBe では、AsIs から要素の追加・削除・変更を伴う構成へ変わります。',
        evidence: [`根拠: AsIs から ToBe で、追加 ${c('added')} 件・削除 ${c('removed')} 件・変更 ${c('changed')} 件（要素 ${v.tobe.elements.length} 件）です。`],
        action: '追加される要素の製品適合と、削除される要素の移行手順を確認してください。',
      };
    }
    case 'knowledge-graph': {
      const g = buildEntityGraph(data);
      let top: { id: string; label: string; d: number } | undefined;
      for (const node of g.nodes) {
        const d = g.neighbors(node.id).size;
        if (!top || d > top.d) top = { id: node.id, label: node.label, d };
      }
      return {
        conclusion: top ? `最も多くの項目とつながるのは「${top.label}」です。` : 'ナレッジグラフに項目がありません。',
        evidence: [`根拠: ノード ${g.nodes.length} 件・エッジ ${g.edges.length} 件${top ? `、「${top.label}」は ${top.d} 件と隣接` : ''}しています。`],
        action: '孤立したノードがないか、種別フィルターで確認してください。',
      };
    }
    case 'discussion-tree': {
      const count = ctx.tree?.nodes.length ?? 0;
      return {
        conclusion: count > 0 ? `議題「${ctx.tree?.themeTitle}」の議論が系統ツリーに整理されています。` : '議論ツリーはまだ生成されていません。',
        evidence: [`根拠: ノード ${count} 件、決定事項 ${ctx.tree?.nodes.filter((x) => x.kind === '決定事項').length ?? 0} 件です。`],
        action: count > 0 ? '決定事項と次のアクションの担当・期限を確認してください。' : '議論テーマの記録から「ツリーを生成」してください。',
      };
    }
    case 'table': {
      const g = buildEntityGraph(data);
      return {
        conclusion: `パックには ${g.nodes.length} 件の項目があります。`,
        evidence: [`根拠: 項目 ${g.nodes.length} 件、関係 ${g.edges.length} 件です。`],
        action: '他のビューで項目を選び、関連する行に絞り込んで確認してください。',
      };
    }
    case 'overview':
    default: {
      const rows = buildPriorityRows(issues, ctx.weights);
      const top = rows[0];
      const costs = issues.map((i) => i.evaluation?.cost).filter((c) => typeof c?.value === 'number');
      const totalCost = costs.reduce((a, c) => a + (c?.value as number), 0);
      const unit = costs.find((c) => c?.unit)?.unit ?? '';
      const costSources = [...new Set(costs.flatMap((c) => c?.sourceIds ?? []))];
      return {
        conclusion: top ? `最優先は「${top.title}」で、課題 ${issues.length} 件を重み付きで比べています。` : '課題がまだありません。',
        evidence: [
          `根拠: 課題 ${issues.length} 件、解決策 ${solutions.length} 件、コストの合計は `,
          costSources.length > 0 ? { text: `${n(totalCost)}${unit}`, sourceIds: costSources } : `${n(totalCost)}${unit}`,
          'です。',
        ],
        action: top ? `「${top.title}」を起点に、重みの前提と実行計画を確認してください。` : '課題を追加してください。',
      };
    }
  }
}

function empty(conclusion: string, evidence: string, action: string): SummaryContent {
  return { conclusion, evidence: [evidence], action };
}

/** 生成内容の指紋。データが変わると変わる（固定していない編集版は、指紋が変わると AI 版に戻る） */
export function fingerprint(c: SummaryContent): string {
  const t = contentText(c);
  return `${t.conclusion}|${t.evidence}|${t.action}`;
}
