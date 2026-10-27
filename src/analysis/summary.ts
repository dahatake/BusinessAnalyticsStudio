// エグゼクティブサマリー（FR-041）。結論・根拠の数値・推奨アクションを 1 文ずつ（PARAM-015: 2〜3 文）。
// 接続していないときは、データから作るテンプレート（モックの AI）。画面・ストアを参照しない純粋なモジュール。
import type { PackData } from '../schema';
import { tr } from '../i18n';
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
      if (!top) return empty(tr('優先順位を付ける課題がありません。'), tr('課題 0 件。'), tr('課題を追加してから評価してください。'));
      const issue = issues.find((i) => i.id === top.id);
      const ev = issue?.evaluation;
      const parts: Part[] = [tr('根拠: 「{title}」は ', { title: top.title })];
      const roi = typeof ev?.roi?.value === 'number' ? ev.roi : undefined;
      const cost = typeof ev?.cost?.value === 'number' ? ev.cost : undefined;
      if (roi) parts.push('ROI ', { text: `${n(roi.value as number)}${roi.unit ?? ''}`, sourceIds: roi.sourceIds }, '、');
      if (cost) parts.push(tr('コスト '), { text: `${n(cost.value as number)}${cost.unit ?? ''}`, sourceIds: cost.sourceIds }, '、');
      parts.push(tr('重み付きスコアは {score}（{total} 件中 {rank} 位）。', { score: top.score.toFixed(1), total: rows.length, rank: top.rank }));
      return {
        conclusion: tr('最優先の課題は「{title}」です。', { title: top.title }),
        evidence: parts,
        action: tr('「{title}」の担当と期限を決め、重みの前提を顧客と確認してください。', { title: top.title }),
      };
    }
    case 'issue-solution': {
      const noSolution = issues.filter((i) => solutionsOfIssue(i.id, solutions).length === 0);
      const first = issues[0];
      return {
        conclusion: first ? tr('課題「{title}」を起点に、解決策を整理できます。', { title: first.title }) : tr('課題がまだ整理されていません。'),
        evidence: [tr('根拠: 課題 {issues} 件に対し解決策 {solutions} 件があり、{rest}。', {
          issues: issues.length,
          solutions: solutions.length,
          rest: noSolution.length > 0 ? tr('解決策のない課題は {n} 件です', { n: noSolution.length }) : tr('解決策のない課題はありません'),
        })],
        action: noSolution.length > 0 ? tr('解決策のない課題（{title}）の打ち手を検討してください。', { title: String(noSolution[0]?.title) }) : tr('優先度の高い課題から議論テーマにしてください。'),
      };
    }
    case 'gantt': {
      const dated = data.plan.tasks.filter((t) => t.start && t.end);
      const starts = dated.map((t) => t.start as string).sort();
      const ends = dated.map((t) => t.end as string).sort();
      const span = dated.length > 0 ? `${starts[0]}〜${ends[ends.length - 1]}` : tr('日付なし');
      return {
        conclusion: tr('工程は {n} 件の機能に分かれ、計画が組まれています。', { n: data.plan.features.length }),
        evidence: [tr('根拠: 工程 {n} 件、期間は {span} です。', { n: data.plan.tasks.length, span })],
        action: tr('依存関係のある工程と担当の偏りから確認してください。'),
      };
    }
    case 'architecture': {
      const v = archVariants(data.architecture);
      const d = diffArchitecture(v.asis, v.tobe);
      const c = (k: string) => d.elements.filter((e) => e.diff === k).length;
      const kinds: Array<[string, number]> = [[tr('追加', undefined, 'status'), c('added')], [tr('削除', undefined, 'status'), c('removed')], [tr('変更', undefined, 'status'), c('changed')]];
      return {
        conclusion: tr('ToBe では、AsIs から要素の追加・削除・変更を伴う構成へ変わります。'),
        evidence: [tr('根拠: AsIs から ToBe で、{diffs}（要素 {n} 件）です。', {
          diffs: kinds.map(([k, count]) => (count === 0 ? tr('{k}なし', { k }) : tr('{k} {n} 件', { k, n: count }))).join(tr('・')),
          n: v.tobe.elements.length,
        })],
        action: tr('追加される要素の製品適合と、削除される要素の移行手順を確認してください。'),
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
        conclusion: top ? tr('最も多くの項目とつながるのは「{label}」です。', { label: top.label }) : tr('ナレッジグラフに項目がありません。'),
        evidence: [tr('根拠: ノード {nodes} 件・エッジ {edges} 件{top}しています。', {
          nodes: g.nodes.length,
          edges: g.edges.length,
          top: top ? tr('、「{label}」は {d} 件と隣接', { label: top.label, d: top.d }) : '',
        })],
        action: tr('孤立したノードがないか、種別フィルターで確認してください。'),
      };
    }
    case 'discussion-tree': {
      const count = ctx.tree?.nodes.length ?? 0;
      return {
        conclusion: count > 0 ? tr('議題「{title}」の議論が系統ツリーに整理されています。', { title: String(ctx.tree?.themeTitle) }) : tr('議論ツリーはまだ生成されていません。'),
        evidence: [tr('根拠: ノード {count} 件、決定事項 {decisions} 件です。', { count, decisions: ctx.tree?.nodes.filter((x) => x.kind === '決定事項').length ?? 0 })],
        action: count > 0 ? tr('決定事項と次のアクションの担当・期限を確認してください。') : tr('議論テーマの記録から「ツリーを生成」してください。'),
      };
    }
    case 'table': {
      const g = buildEntityGraph(data);
      return {
        conclusion: tr('パックには {n} 件の項目があります。', { n: g.nodes.length }),
        evidence: [tr('根拠: 項目 {n} 件、関係 {edges} 件です。', { n: g.nodes.length, edges: g.edges.length })],
        action: tr('他のビューで項目を選び、関連する行に絞り込んで確認してください。'),
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
        conclusion: top ? tr('最優先は「{title}」で、課題 {n} 件を重み付きで比べています。', { title: top.title, n: issues.length }) : tr('課題がまだありません。'),
        evidence: [
          tr('根拠: 課題 {issues} 件、解決策 {solutions} 件、コストの合計は ', { issues: issues.length, solutions: solutions.length }),
          costSources.length > 0 ? { text: `${n(totalCost)}${unit}`, sourceIds: costSources } : `${n(totalCost)}${unit}`,
          tr('です。'),
        ],
        action: top ? tr('「{title}」を起点に、重みの前提と実行計画を確認してください。', { title: top.title }) : tr('課題を追加してください。'),
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
