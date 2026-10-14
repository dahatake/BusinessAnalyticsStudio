// KPI と OKR の定義・達成度・検証（FR-153・FR-154）。純粋な関数だけで書く（画面・ストアを参照しない）。
// 達成度 =（現在値 − 基準値）÷（目標値 − 基準値）。目標値と基準値が同じなら「算出できない」。

export interface Kpi {
  name: string;
  unit: string;
  baseline: number;
  current: number;
  target: number;
  /** 期限（任意） */
  due?: string;
}
export interface KeyResult { name: string; kpi: Kpi }
export interface Objective { objective: string; keyResults: KeyResult[] }

/** 達成度の文字の状態（色だけで示さない: FR-154） */
export type AchievementState = '達成' | '進行中' | '未着手' | '算出できない';

/** 達成度の割合（0〜1 に限らない）。算出できないとき null */
export function achievement(k: Pick<Kpi, 'baseline' | 'current' | 'target'>): number | null {
  const span = k.target - k.baseline;
  if (!Number.isFinite(span) || span === 0) return null;
  const r = (k.current - k.baseline) / span;
  return Number.isFinite(r) ? r : null;
}

/** 「25%」または「算出できない」 */
export function achievementText(k: Pick<Kpi, 'baseline' | 'current' | 'target'>): string {
  const r = achievement(k);
  return r === null ? '算出できない' : `${Math.round(r * 100)}%`;
}

export function achievementState(k: Pick<Kpi, 'baseline' | 'current' | 'target'>): AchievementState {
  const r = achievement(k);
  if (r === null) return '算出できない';
  if (r >= 1) return '達成';
  return r > 0 ? '進行中' : '未着手';
}

/** 画面の入力値（文字）。数値は文字のまま持ち、検証してから数にする */
export interface KeyResultDraft { name: string; kpiName: string; unit: string; baseline: string; target: string; current: string; due?: string }
export interface OkrDraft { objective: string; keyResults: KeyResultDraft[] }

export const toDraft = (o: Objective | undefined): OkrDraft => ({
  objective: o?.objective ?? '',
  keyResults: (o?.keyResults ?? []).map((r) => ({
    name: r.name, kpiName: r.kpi.name, unit: r.kpi.unit,
    baseline: String(r.kpi.baseline), target: String(r.kpi.target), current: String(r.kpi.current), ...(r.kpi.due ? { due: r.kpi.due } : {}),
  })),
});

export const emptyKeyResult = (): KeyResultDraft => ({ name: '', kpiName: '', unit: '', baseline: '', target: '', current: '' });

/** 数として読めるか（空・文字・無限大は不可） */
export function parseNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type ValidateResult = { ok: true; objective: Objective } | { ok: false; errors: string[] };

/** 入力を検証して Objective にする。1 つでも誤りがあれば保存せず、理由を返す（AC-272） */
export function validateDraft(d: OkrDraft): ValidateResult {
  const errors: string[] = [];
  if (d.objective.trim() === '') errors.push('Objective を入力してください。');
  if (d.keyResults.length === 0) errors.push('Key Result を 1 つ以上追加してください。');
  const krs: KeyResult[] = [];
  d.keyResults.forEach((r, i) => {
    const at = `Key Result ${i + 1}`;
    if (r.name.trim() === '') errors.push(`${at}: Key Result 名を入力してください。`);
    if (r.kpiName.trim() === '') errors.push(`${at}: KPI 名を入力してください。`);
    if (r.unit.trim() === '') errors.push(`${at}: 単位を入力してください。`);
    const baseline = parseNumber(r.baseline);
    const target = parseNumber(r.target);
    const current = parseNumber(r.current);
    if (baseline === null) errors.push(`${at}: 基準値は数値で入力してください。`);
    if (target === null) errors.push(`${at}: 目標値は数値で入力してください。`);
    if (current === null) errors.push(`${at}: 現在値は数値で入力してください。`);
    krs.push({
      name: r.name.trim(),
      kpi: { name: r.kpiName.trim(), unit: r.unit.trim(), baseline: baseline ?? 0, target: target ?? 0, current: current ?? 0, ...(r.due ? { due: r.due } : {}) },
    });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, objective: { objective: d.objective.trim(), keyResults: krs } };
}

export interface OkrChange { label: string; field: string; before: string; after: string }

/** 変更の前後の差分を、変更履歴の行（対象・項目名・前・後）にする（FR-046） */
export function diffObjectives(before: readonly Objective[], after: readonly Objective[]): OkrChange[] {
  const out: OkrChange[] = [];
  const o0 = before[0];
  const o1 = after[0];
  if ((o0?.objective ?? '') !== (o1?.objective ?? '')) out.push({ label: 'OKR', field: 'Objective', before: o0?.objective ?? '', after: o1?.objective ?? '' });
  const n = Math.max(o0?.keyResults.length ?? 0, o1?.keyResults.length ?? 0);
  for (let i = 0; i < n; i++) {
    const a = o0?.keyResults[i];
    const b = o1?.keyResults[i];
    const label = b?.name ?? a?.name ?? `Key Result ${i + 1}`;
    const f = (x: KeyResult | undefined): Record<string, string> => ({
      'Key Result 名': x?.name ?? '', 'KPI 名': x?.kpi.name ?? '', 単位: x?.kpi.unit ?? '',
      基準値: x ? String(x.kpi.baseline) : '', 目標値: x ? String(x.kpi.target) : '', 現在値: x ? String(x.kpi.current) : '',
    });
    const fa = f(a);
    const fb = f(b);
    for (const k of Object.keys(fb)) if (fa[k] !== fb[k]) out.push({ label, field: k, before: fa[k]!, after: fb[k]! });
  }
  return out;
}
