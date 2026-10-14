// ペルソナ別ストーリーの純粋なモデル（FR-177・FR-179）。React に依存せず、顧客パックと Project のデータだけからシーンの列を作る。
// データにない値は補わない。足りない要素は「データなし」のシーン（理由と補う入口つき）にし、ほかのシーンは作り続ける。
import { buildPriorityRows, type PriorityRow, type Weights } from '../analysis/priority';
import type { Issue, Solution } from '../analysis/model';
import { kpisForSolution, type DemoCustomerLike, type SolutionKpi } from '../usecase/demo';

/** ストーリーで扱う優先度の高い解決策の件数（PARAM-062） */
export const STORY_TOP = 3;
export const STORY_PERSONAS = ['経営層', '事業部門', 'IT', '現場'] as const;
export type StoryPersona = (typeof STORY_PERSONAS)[number];
export type StoryPart = 1 | 2 | 3 | 4;

/** ペルソナごとの切り口（FR-177。理由のシーンの見出し） */
export const PERSONA_ANGLE: Record<StoryPersona, string> = {
  経営層: '投資判断（ROI・コスト・KPI/OKR）',
  事業部門: '課題と業務への効き',
  IT: '既存環境との適合と実現性',
  現場: '日々の作業の変化',
};

export const PART_LABEL: Record<StoryPart, string> = {
  1: '優先度の高い解決策',
  2: '優先度が高い理由',
  3: '影響する KPI/OKR',
  4: '具体的なユースケース',
};

export interface StoryScene {
  id: string;
  part: StoryPart;
  /** 結び付く解決策（なければ undefined） */
  solutionId?: string;
  /** 小さな見出し（場面の位置づけ） */
  kicker: string;
  /** 1 シーン 1 メッセージの見出し */
  heading: string;
  /** 大きく見せる数字（なければ undefined） */
  big?: { value: string; label: string };
  lines: string[];
  /** 手順（ユースケース） */
  steps?: string[];
  noData?: { reason: string; entry: string };
  /** 最後のシーンだけ: 行動につなぐ一言 */
  cta?: string;
}

/** ストーリーが読むユースケース（デモ・実際の Project のどちらでも、解決策との結び付きを solutionId で持つ） */
export interface StoryUseCase {
  id: string;
  name: string;
  persona: string;
  summary?: string;
  steps: ReadonlyArray<{ title: string; description?: string }>;
  effect: string;
  solutionId?: string;
}

export interface StoryInput {
  persona: StoryPersona;
  issues: readonly Issue[];
  solutions: readonly Solution[];
  products?: ReadonlyArray<{ id: string; name: string }>;
  customer?: DemoCustomerLike;
  useCases: readonly StoryUseCase[];
  weights: Weights;
  top?: number;
}

export interface RankedSolution { solution: Solution; row: PriorityRow; rank: number; issueTitle: string }

/** 解決策を、効く課題のうち最も順位の高いものの順位で並べる（同順位は入力順）。上位 top 件 */
export function rankSolutions(issues: readonly Issue[], solutions: readonly Solution[], weights: Weights, top = STORY_TOP): RankedSolution[] {
  const rows = buildPriorityRows(issues, weights);
  const ranked: RankedSolution[] = [];
  for (const sol of solutions) {
    const ids = [sol.issueId, ...(sol.issueIds ?? [])];
    const cand = rows.filter((r) => ids.includes(r.id)).sort((a, b) => a.rank - b.rank)[0];
    if (cand) ranked.push({ solution: sol, row: cand, rank: cand.rank, issueTitle: cand.title });
  }
  return ranked
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.rank - b.r.rank || a.i - b.i)
    .slice(0, Math.max(0, top))
    .map((x) => x.r);
}

const fmtNum = (n: number): string => n.toLocaleString('ja-JP');

function evalOf(row: PriorityRow, issues: readonly Issue[], key: 'roi' | 'cost' | 'feasibility' | 'risk'): { value: number | string; unit?: string } | undefined {
  const issue = issues.find((i) => i.id === row.id);
  const v = issue?.evaluation?.[key];
  return v ? { value: v.value, unit: v.unit } : undefined;
}

function withUnit(v: { value: number | string; unit?: string } | undefined): string | undefined {
  if (!v) return undefined;
  return typeof v.value === 'number' ? `${fmtNum(v.value)} ${v.unit ?? ''}`.trim() : String(v.value);
}

const score = (n: number): string => `${n} / 5`;

function noDataScene(part: StoryPart, id: string, solutionId: string | undefined, heading: string, reason: string, entry: string): StoryScene {
  return { id, part, solutionId, kicker: PART_LABEL[part], heading, lines: [], noData: { reason, entry } };
}

/** ペルソナごとの「大きな数字」。値がなければ順位にする（補わない） */
function bigNumber(persona: StoryPersona, rs: RankedSolution, issues: readonly Issue[]): { value: string; label: string } {
  const roi = withUnit(evalOf(rs.row, issues, 'roi'));
  if (persona === '経営層' && roi) return { value: roi, label: 'ROI' };
  if (persona === '事業部門') return { value: score(rs.row.values.impact.value), label: 'インパクト' };
  if (persona === 'IT') return { value: score(rs.row.values.feasibility.value), label: '実現性' };
  return { value: `第 ${rs.rank} 位`, label: '優先順位' };
}

function reasonLines(persona: StoryPersona, rs: RankedSolution, input: StoryInput, kpis: SolutionKpi[], related: StoryUseCase[]): string[] {
  const { issues } = input;
  const v = rs.row.values;
  const lines: string[] = [];
  const effects = (rs.solution.effects ?? []).map((e) => e.title);
  switch (persona) {
    case '経営層': {
      const roi = withUnit(evalOf(rs.row, issues, 'roi'));
      const cost = withUnit(evalOf(rs.row, issues, 'cost'));
      if (roi) lines.push(`ROI：${roi}`);
      if (cost) lines.push(`コスト：${cost}`);
      lines.push(`インパクト：${score(v.impact.value)}`);
      lines.push(`実現性：${score(v.feasibility.value)}`);
      if (kpis.length > 0) lines.push(`影響する KPI/OKR：${[...new Set(kpis.map((k) => k.kpi))].join('、')}`);
      break;
    }
    case '事業部門':
      lines.push(`解く課題：${rs.issueTitle}`);
      lines.push(`インパクト：${score(v.impact.value)}`);
      if (effects.length > 0) lines.push(`業務への効き：${effects.join('、')}`);
      lines.push(`優先順位：${rs.rank} 位`);
      break;
    case 'IT': {
      const feas = evalOf(rs.row, issues, 'feasibility');
      lines.push(`実現性：${score(v.feasibility.value)}${typeof feas?.value === 'string' ? `（${feas.value}）` : ''}`);
      for (const f of rs.solution.productFits ?? []) {
        const name = input.products?.find((p) => p.id === f.productId)?.name ?? f.productId;
        lines.push(`既存環境との適合 — ${name}：${f.reason}`);
      }
      const risk = withUnit(evalOf(rs.row, issues, 'risk'));
      if (risk) lines.push(`リスク：${risk}`);
      break;
    }
    case '現場': {
      for (const u of related) lines.push(`日々の作業の変化：${u.effect}`);
      if (related.length === 0 && effects.length > 0) lines.push(`日々の作業の変化：${effects.join('、')}`);
      lines.push(`優先順位：${rs.rank} 位`);
      break;
    }
  }
  return lines;
}

/** ストーリーのシーンの列を作る。①解決策 → ②理由 → ③KPI/OKR → ④ユースケースの順。最後のシーンに行動の一言を付ける */
export function buildStory(input: StoryInput): StoryScene[] {
  const { persona, issues, solutions, customer, weights } = input;
  const top = rankSolutions(issues, solutions, weights, input.top ?? STORY_TOP);
  const scenes: StoryScene[] = [];
  const angle = PERSONA_ANGLE[persona];

  if (top.length === 0) {
    for (const p of [1, 2, 3, 4] as const) {
      scenes.push(noDataScene(p, `nodata-${p}`, undefined, PART_LABEL[p],
        '優先順位を付けられる解決策がありません。', '「課題-解決策分析」で解決策を登録してください。'));
    }
    return withCta(scenes, undefined);
  }

  const forPersona = (solutionId: string) => input.useCases.filter((u) => u.solutionId === solutionId && u.persona === persona);

  // ① 優先度の高い解決策
  for (const rs of top) {
    scenes.push({
      id: `p1-${rs.solution.id}`, part: 1, solutionId: rs.solution.id,
      kicker: `${PART_LABEL[1]} ・ 第 ${rs.rank} 位`,
      heading: rs.solution.title,
      big: bigNumber(persona, rs, issues),
      lines: [`解く課題：${rs.issueTitle}`],
    });
  }
  // ② 理由（ペルソナごとの切り口）
  for (const rs of top) {
    const kpis = kpisForSolution(customer, rs.solution.id);
    scenes.push({
      id: `p2-${rs.solution.id}`, part: 2, solutionId: rs.solution.id,
      kicker: `${PART_LABEL[2]} ・ ${angle}`,
      heading: `${rs.solution.title}：なぜ第 ${rs.rank} 位か`,
      lines: reasonLines(persona, rs, input, kpis, forPersona(rs.solution.id)),
    });
  }
  // ③ KPI/OKR
  for (const rs of top) {
    const kpis = kpisForSolution(customer, rs.solution.id);
    if (kpis.length === 0) {
      scenes.push(noDataScene(3, `p3-${rs.solution.id}`, rs.solution.id, `${rs.solution.title}：影響する KPI/OKR`,
        'この解決策に結び付く KPI/OKR が登録されていません。', '「KPI 測定」のステップで KPI/OKR を登録し、解決策に結び付けてください。'));
      continue;
    }
    const first = kpis[0]!;
    scenes.push({
      id: `p3-${rs.solution.id}`, part: 3, solutionId: rs.solution.id,
      kicker: PART_LABEL[3],
      heading: `${rs.solution.title}：動かす KPI/OKR`,
      big: { value: `${fmtNum(first.current)} → ${fmtNum(first.target)} ${first.unit}`.trim(), label: `${first.kpi}（現在 → 目標）` },
      lines: kpis.map((k) => `${k.objective} ／ ${k.keyResult}（KPI：${k.kpi}）`),
    });
  }
  // ④ ユースケース（このペルソナの、上位の解決策に結び付くもの）
  let ucCount = 0;
  for (const rs of top) {
    for (const u of forPersona(rs.solution.id)) {
      ucCount++;
      scenes.push({
        id: `p4-${u.id}`, part: 4, solutionId: rs.solution.id,
        kicker: `${PART_LABEL[4]} ・ ${rs.solution.title}`,
        heading: u.name,
        lines: [...(u.summary ? [u.summary] : []), `期待する効果：${u.effect}`],
        steps: u.steps.map((s, i) => `${i + 1}. ${s.title}${s.description ? `：${s.description}` : ''}`),
      });
    }
  }
  if (ucCount === 0) {
    scenes.push(noDataScene(4, 'p4-none', undefined, `${persona}向けのユースケース`,
      `${persona}向けで、上位の解決策に結び付くユースケースがありません。`, '「ユースケース作成」のステップでユースケースを登録してください。'));
  }
  return withCta(scenes, top[0]);
}

function withCta(scenes: StoryScene[], first: RankedSolution | undefined): StoryScene[] {
  if (scenes.length === 0) return scenes;
  const last = scenes[scenes.length - 1]!;
  last.cta = first ? `まず、「${first.solution.title}」から始めましょう。` : 'まず、データを整えるところから始めましょう。';
  return scenes;
}

/** 位置の表示「n / 全体」 */
export const positionText = (index: number, total: number): string => `${index + 1} / ${total}`;

/** 範囲に収めて動かす */
export const stepScene = (index: number, delta: number, total: number): number => (total <= 0 ? 0 : Math.min(total - 1, Math.max(0, index + delta)));

/** キー → 操作（FR-178 AC-360）。修飾キーつきは奪わない */
export type StoryKeyAction = 'next' | 'prev' | 'first' | 'toggle-play' | 'toggle-fullscreen' | 'exit';
export function storyKeyAction(e: { key: string; shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }): StoryKeyAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  switch (e.key) {
    case 'ArrowRight': return e.shiftKey ? null : 'next';
    case 'ArrowLeft': return e.shiftKey ? null : 'prev';
    case 'Home': return 'first';
    case ' ': case 'Spacebar': return 'toggle-play';
    case 'f': case 'F': return 'toggle-fullscreen';
    case 'Escape': return 'exit';
    default: return null;
  }
}
