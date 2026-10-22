// 「現状の説明」の入力の組み立て・AI の出力の検証・AI が使えないときの決定的な代替説明（FR-274・FR-277）。純粋な関数だけ（データを書き換えない）。
import type { PackData } from '../schema';
import { estimateTokens } from './usage';

export interface ExplainIssue { id: string; title: string }
export interface ExplainSolution { id: string; title: string; issueIds: string[] }
export interface ExplainKr { id: string; name: string; objective: string; kpi: string; unit: string; baseline: number; current: number; target: number; solutionIds: string[] }
export interface ExplainSnapshot {
  screenKey: string;
  screenLabel: string;
  issues: ExplainIssue[];
  solutions: ExplainSolution[];
  krs: ExplainKr[];
}

/** 画面に表示している情報（課題・解決策・KPI/OKR の名前・ID・つながり）だけを取り出す。企業・顧客パックのほかの部分は含めない。個人名・連絡先も含めない */
export function buildSnapshot(data: PackData, screenKey: string, screenLabel: string): ExplainSnapshot {
  const issues = (data.issues?.issues ?? []).map((i) => ({ id: i.id, title: i.title }));
  const solutions = (data.issues?.solutions ?? []).map((s) => ({
    id: s.id, title: s.title, issueIds: [...new Set([s.issueId, ...(s.issueIds ?? [])])],
  }));
  const krs: ExplainKr[] = [];
  let n = 0;
  for (const o of data.customer.okr?.objectives ?? []) {
    for (const kr of o.keyResults) {
      n += 1;
      krs.push({
        id: kr.id ?? `KR-${n}`, name: kr.name, objective: o.objective, kpi: kr.kpi.name, unit: kr.kpi.unit,
        baseline: kr.kpi.baseline, current: kr.kpi.current, target: kr.kpi.target, solutionIds: [...(kr.solutionIds ?? [])],
      });
    }
  }
  return { screenKey, screenLabel, issues, solutions, krs };
}

export function buildPrompt(s: ExplainSnapshot): string {
  const lines: string[] = [
    '次の「表示中の情報」だけを根拠に、ビジネス課題 → 解決策 → KPI/OKR への寄与の見込み を説明する JSON を 1 つだけ返してください。',
    '規則: 表示にない項目・数値は書かない。推定は estimate: true とする。各項目の id は下の一覧の id だけを使う。寄与の size は 大・中・小 のいずれか。range は根拠がある場合だけ。basis に根拠の項目の名前または id を引用する。',
    '形式: {"issues":[{"id":"","summary":""}],"solutions":[{"id":"","issueIds":[""],"contributions":[{"krId":"","size":"大","range":"","basis":"","estimate":false}]}]}',
    `画面: ${s.screenLabel}`,
    '課題:',
    ...s.issues.map((i) => `- ${i.id} ${i.title}`),
    '解決策:',
    ...s.solutions.map((x) => `- ${x.id} ${x.title}（課題: ${x.issueIds.join(',')}）`),
    'KPI/OKR:',
    ...s.krs.map((k) => `- ${k.id} ${k.name}（目標: ${k.objective} / KPI: ${k.kpi} ${k.unit} 基準 ${k.baseline} 現在 ${k.current} 目標 ${k.target} / 解決策: ${k.solutionIds.join(',')}）`),
  ];
  return lines.join('\n');
}

/** 入力が上限（トークン）以下になるまで、表示中の情報を切り詰める。KPI/OKR → 解決策 → 課題の順に、後ろの項目から落とす（課題を最後まで残す） */
export function fitToTokens(s: ExplainSnapshot, maxTokens: number): { snapshot: ExplainSnapshot; truncated: boolean; tokens: number } {
  let cur: ExplainSnapshot = { ...s, issues: [...s.issues], solutions: [...s.solutions], krs: [...s.krs] };
  let truncated = false;
  let tokens = estimateTokens(buildPrompt(cur));
  while (tokens > maxTokens) {
    // 一番件数の多い一覧の末尾から落とす（同数なら KPI/OKR → 解決策 → 課題）
    const order: Array<'krs' | 'solutions' | 'issues'> = ['krs', 'solutions', 'issues'];
    const target = order.reduce((a, b) => (cur[b].length > cur[a].length ? b : a));
    if (cur[target].length === 0) break;
    cur = { ...cur, [target]: cur[target].slice(0, -1) };
    truncated = true;
    tokens = estimateTokens(buildPrompt(cur));
  }
  return { snapshot: cur, truncated, tokens };
}

// ---- AI の出力の検証（AC-700）----
interface AiContribution { krId: string; size: string; range?: string; basis: string; estimate?: boolean }
interface AiOutput {
  issues: Array<{ id: string; summary: string }>;
  solutions: Array<{ id: string; issueIds: string[]; contributions: AiContribution[] }>;
}
export type ParsedExplanation = { ok: true; text: string } | { ok: false; why: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function parseAiExplanation(answer: string, s: ExplainSnapshot): ParsedExplanation {
  const raw = answer.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return { ok: false, why: '構成を読み取れませんでした' }; }
  if (!isObj(j) || !Array.isArray(j.issues) || !Array.isArray(j.solutions)) return { ok: false, why: '「課題 → 解決策 → 寄与」の構成がありません' };
  const issueIds = new Set(s.issues.map((i) => i.id));
  const solIds = new Set(s.solutions.map((x) => x.id));
  const krMap = new Map(s.krs.map((k) => [k.id, k]));
  const names = [...s.issues.map((i) => [i.id, i.title]), ...s.solutions.map((x) => [x.id, x.title]), ...s.krs.map((k) => [k.id, k.name, k.kpi])].flat();
  const out: AiOutput = { issues: [], solutions: [] };
  for (const i of j.issues) {
    if (!isObj(i) || typeof i.id !== 'string' || typeof i.summary !== 'string') return { ok: false, why: '課題の形式が不正です' };
    if (!issueIds.has(i.id)) return { ok: false, why: `表示にない課題 ${i.id} を参照しています` };
    out.issues.push({ id: i.id, summary: i.summary });
  }
  for (const x of j.solutions) {
    if (!isObj(x) || typeof x.id !== 'string' || !Array.isArray(x.issueIds) || !Array.isArray(x.contributions)) return { ok: false, why: '解決策の形式が不正です' };
    if (!solIds.has(x.id)) return { ok: false, why: `表示にない解決策 ${x.id} を参照しています` };
    if (x.issueIds.length === 0 || x.issueIds.some((id) => typeof id !== 'string' || !issueIds.has(id))) return { ok: false, why: `解決策 ${x.id} が表示にない課題を参照しています` };
    const cs: AiContribution[] = [];
    for (const c of x.contributions) {
      if (!isObj(c) || typeof c.krId !== 'string' || typeof c.size !== 'string' || typeof c.basis !== 'string') return { ok: false, why: '寄与の形式が不正です' };
      if (!krMap.has(c.krId)) return { ok: false, why: `表示にない KPI/OKR ${c.krId} を参照しています` };
      if (!names.some((n) => (c.basis as string).includes(n))) return { ok: false, why: '寄与に根拠となる項目の名前または ID の引用がありません' };
      cs.push({ krId: c.krId, size: c.size, range: typeof c.range === 'string' ? c.range : undefined, basis: c.basis, estimate: c.estimate === true });
    }
    out.solutions.push({ id: x.id, issueIds: x.issueIds as string[], contributions: cs });
  }
  if (out.solutions.length === 0) return { ok: false, why: '解決策がありません' };
  const title = (id: string): string => s.issues.find((i) => i.id === id)?.title ?? id;
  const lines: string[] = ['【課題】', ...out.issues.map((i) => `・${i.id} ${title(i.id)}: ${i.summary}`), '【解決策と KPI/OKR への寄与の見込み】'];
  for (const x of out.solutions) {
    const sol = s.solutions.find((y) => y.id === x.id);
    lines.push(`・${x.id} ${sol?.title ?? ''}（対応する課題: ${x.issueIds.map((id) => `${id} ${title(id)}`).join('、')}）`);
    for (const c of x.contributions) {
      const kr = krMap.get(c.krId);
      lines.push(`　→ ${c.krId} ${kr?.name ?? ''}: 寄与 ${c.size}${c.range ? `（目安 ${c.range}）` : ''}${c.estimate ? '［推定］' : ''} 根拠: ${c.basis}`);
    }
  }
  return { ok: true, text: lines.join('\n') };
}

// ---- 使えない理由と決定的な代替説明（FR-277。AC-713・714）----
export type UnavailableReason =
  | 'not-configured' | 'disabled' | 'consent' | 'daily-limit' | 'budget' | 'error' | 'timeout' | 'relay' | 'person-unconfirmed' | 'invalid';

export const REASON_TEXT: Record<UnavailableReason, string> = {
  'not-configured': 'Foundry の接続情報（エンドポイント・デプロイ名・API キー）が未設定です',
  disabled: 'Foundry の実接続が有効になっていません（設定画面で有効にできます）',
  consent: '顧客の了承の記録がないため、外部へ送信できません',
  'daily-limit': '1 日の生成の回数の上限に達しました',
  budget: '今月の概算費用が予算の停止の割合に達したため、呼び出しを停止しています',
  error: 'Foundry の呼び出しに失敗しました',
  timeout: 'Foundry の応答がタイムアウトしました',
  relay: '中継プロセスに届きません（`npm run relay` で起動しているか確認してください）',
  'person-unconfirmed': '種別「人」を含む顧客パックは、送信前の確認が必要です',
  invalid: 'AI の出力が表示中の項目と一致しなかったため採用しませんでした',
};

/** AI を使わず、同じ入力から同じ文を作る（外部への呼び出しなし。表示にない情報は補わない） */
export function buildFallback(s: ExplainSnapshot): string {
  const title = (id: string): string => s.issues.find((i) => i.id === id)?.title ?? id;
  const lines: string[] = [
    `画面「${s.screenLabel}」に表示している情報から作った説明です（AI 生成ではない）。`,
    '【課題】',
    ...(s.issues.length ? s.issues.map((i) => `・${i.id} ${i.title}`) : ['・表示中の課題はありません']),
    '【解決策】',
    ...(s.solutions.length
      ? s.solutions.map((x) => `・${x.id} ${x.title}（対応する課題: ${x.issueIds.map((id) => `${id} ${title(id)}`).join('、') || 'なし'}）`)
      : ['・表示中の解決策はありません']),
    '【KPI/OKR への寄与】',
  ];
  if (s.krs.length === 0) lines.push('・表示中の KPI/OKR はありません');
  for (const k of s.krs) {
    const sols = k.solutionIds.map((id) => s.solutions.find((x) => x.id === id)).filter((x): x is ExplainSolution => !!x);
    lines.push(`・${k.id} ${k.name}（目標: ${k.objective} / KPI: ${k.kpi}、基準 ${k.baseline} → 現在 ${k.current} → 目標 ${k.target} ${k.unit}）`);
    lines.push(sols.length
      ? `　寄与する解決策: ${sols.map((x) => `${x.id} ${x.title}`).join('、')}`
      : '　寄与する解決策: 表示中の情報にはつながりがありません');
  }
  lines.push('寄与の大きさ・範囲は、表示にない数値を補わないため示していません。');
  return lines.join('\n');
}
