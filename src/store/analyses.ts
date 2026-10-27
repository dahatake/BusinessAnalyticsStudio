// Project ごとの分析（手法・パラメーター・ビュアー・選択・絞り込み・状態）の保持（FR-133〜135）。保存は store/persist.ts（FR-137 AC-207）。
import { create } from 'zustand';
import { tr } from '../i18n';
import { compute, defaultParams, getMethod, parseField, type AnalysisResult, type Field, type MethodId, type Params, type ViewerId } from '../methods/model';

export type AnalysisStatus = '編集中' | '結果確認済み';

export interface Analysis {
  methodId: MethodId;
  params: Params;
  viewer: ViewerId;
  selectedId: string | null;
  filter: string;
  status: AnalysisStatus;
  /** 分析を開始した作業（ビジネスシナリオ・KPI 測定・ユースケース作成）。元の作業へ戻る先。 */
  from: string | null;
  /** 採用した AI 下書き（FR-140。利用者が採用するまで入らない） */
  aiNote?: string;
}

export type EditResult = { ok: true } | { ok: false; reason: string };

interface AnalysesState {
  byProject: Record<string, Analysis>;
  /** 無効で確定できていない入力（未保存）。Project ごとに保持し、切替でも失わない（FR-138 AC-210） */
  drafts: Record<string, Record<string, string>>;
  setDraft: (projectId: string, key: string, raw: string | null) => void;
  clearDrafts: (projectId: string) => void;
  start: (projectId: string, methodId: MethodId, from?: string | null) => void;
  close: (projectId: string) => void;
  /** 値・重みを変更する。範囲外・型違いは拒否し、ほかの値と結果は変えない。 */
  setParam: (projectId: string, factorId: string, field: Field, raw: string) => EditResult;
  resetParams: (projectId: string) => void;
  setViewer: (projectId: string, viewer: ViewerId) => void;
  select: (projectId: string, id: string | null) => void;
  setFilter: (projectId: string, filter: string) => void;
  setAiNote: (projectId: string, note: string | undefined) => void;
  /** 結果を表示した分析を「結果確認済み」にする */
  confirm: (projectId: string) => void;
}

const patch = (s: AnalysesState, id: string, p: Partial<Analysis>): Pick<AnalysesState, 'byProject'> => {
  const cur = s.byProject[id];
  return cur ? { byProject: { ...s.byProject, [id]: { ...cur, ...p } } } : { byProject: s.byProject };
};

export const useAnalyses = create<AnalysesState>((set, get) => ({
  byProject: {},
  drafts: {},
  setDraft: (projectId, key, raw) =>
    set((s) => {
      const { [key]: _drop, ...rest } = s.drafts[projectId] ?? {};
      return { drafts: { ...s.drafts, [projectId]: raw === null ? rest : { ...rest, [key]: raw } } };
    }),
  clearDrafts: (projectId) => set((s) => ({ drafts: { ...s.drafts, [projectId]: {} } })),
  start: (projectId, methodId, from = null) =>
    set((s) => ({
      byProject: {
        ...s.byProject,
        [projectId]: { methodId, params: defaultParams(getMethod(methodId)), viewer: 'table', selectedId: null, filter: '', status: '編集中', from },
      },
    })),
  close: (projectId) => set((s) => {
    const { [projectId]: _drop, ...rest } = s.byProject;
    return { byProject: rest };
  }),
  setParam: (projectId, factorId, field, raw) => {
    const a = get().byProject[projectId];
    const cur = a?.params[factorId];
    if (!a || !cur) return { ok: false, reason: tr('分析または項目が見つかりません。') };
    const r = parseField(field, raw);
    if (!r.ok) return r;
    set((s) => patch(s, projectId, { params: { ...a.params, [factorId]: { ...cur, [field]: r.value } }, status: '編集中' }));
    return { ok: true };
  },
  resetParams: (projectId) => {
    const a = get().byProject[projectId];
    if (a) set((s) => patch(s, projectId, { params: defaultParams(getMethod(a.methodId)), status: '編集中' }));
  },
  setViewer: (projectId, viewer) => set((s) => patch(s, projectId, { viewer })),
  select: (projectId, id) => set((s) => patch(s, projectId, { selectedId: id })),
  setFilter: (projectId, filter) => set((s) => patch(s, projectId, { filter })),
  setAiNote: (projectId, aiNote) => set((s) => patch(s, projectId, { aiNote })),
  confirm: (projectId) => set((s) => (s.byProject[projectId]?.status === '結果確認済み' ? s : patch(s, projectId, { status: '結果確認済み' }))),
}));

export function analysisResult(a: Analysis): AnalysisResult {
  return compute(getMethod(a.methodId), a.params);
}

/** テスト用: 状態を初期化する */
export function resetAnalyses(): void {
  useAnalyses.setState({ byProject: {}, drafts: {} });
}
