// Project ごとの KPI と OKR（FR-153）。作業先（開いている Project、なければデモ）ごとに持ち、ほかの Project に混ざらない（FR-138）。
// 保存は store/persist.ts（端末内 localStorage のみ）。デモは、定義がなければ顧客パックのお手本（customer.okr）を表示する（FR-030）。
import { create } from 'zustand';
import { diffObjectives, validateDraft, type Objective, type OkrDraft } from '../okr/model';
import { recordHistory } from './edit';
import { usePackStore } from './pack';
import { useProjects } from './projects';

/** デモの作業先キー（Project の ID と衝突しない） */
export const DEMO_KEY = 'demo';

export interface OkrSet { objectives: Objective[]; /** 最終更新日時（ISO 8601） */ updatedAt: string }

interface OkrState {
  byTarget: Record<string, OkrSet>;
  /** 検証して保存する。誤りがあれば保存せず、直前の値のまま理由を返す（AC-272） */
  save: (target: string, draft: OkrDraft) => { ok: true } | { ok: false; errors: string[] };
  reset: () => void;
}

function packOkr(): OkrSet | undefined {
  const st = usePackStore.getState().state;
  const okr = st.status === 'ready' ? st.pack.data.customer.okr : undefined;
  if (!okr || okr.objectives.length === 0) return undefined;
  return { objectives: okr.objectives as Objective[], updatedAt: okr.updatedAt ?? '' };
}

/** 作業先の KPI/OKR。保存済みがなければ、デモだけ顧客パックのお手本。なければ undefined（未設定） */
export function currentOkr(target: string): OkrSet | undefined {
  return useOkr.getState().byTarget[target] ?? (target === DEMO_KEY ? packOkr() : undefined);
}

export const useOkr = create<OkrState>((set, get) => ({
  byTarget: {},
  save: (target, draft) => {
    const v = validateDraft(draft);
    if (!v.ok) return v;
    const before = currentOkr(target)?.objectives ?? [];
    const after = [v.objective];
    const changes = diffObjectives(before, after);
    if (changes.length === 0 && get().byTarget[target]) return { ok: true };
    set((s) => ({ byTarget: { ...s.byTarget, [target]: { objectives: after, updatedAt: new Date().toISOString() } } }));
    const op = before.length === 0 ? 'add' : 'update';
    recordHistory(changes.map((c) => ({ op, entityLabel: c.label, fieldLabel: c.field, before: c.before, after: c.after })));
    return { ok: true };
  },
  reset: () => set({ byTarget: {} }),
}));

/**
 * 「OKR の定義」ダイアログの開閉と入力中の内容。コンポーネントの外に持つ:
 * 操作中のコンポーネントの自動のサイズ調整（FR-143）などでレイアウトの木が変わり、コンポーネントが作り直されても、入力が消えないようにするため（保存しない）。
 */
export const useOkrDialog = create<{ open: boolean; draft: OkrDraft | null; show: (d: OkrDraft) => void; set: (d: OkrDraft) => void; close: () => void }>((set) => ({
  open: false,
  draft: null,
  show: (draft) => set({ open: true, draft }),
  set: (draft) => set({ draft }),
  close: () => set({ open: false, draft: null }),
}));

/** 画面用: 開いている作業先と、その KPI/OKR */
export function useCurrentOkr(): { target: string; okr: OkrSet | undefined } {
  const openId = useProjects((s) => s.openId);
  const target = openId ?? DEMO_KEY;
  const saved = useOkr((s) => s.byTarget[target]);
  const packState = usePackStore((s) => s.state);
  if (saved) return { target, okr: saved };
  if (target !== DEMO_KEY || packState.status !== 'ready') return { target, okr: undefined };
  const okr = packState.pack.data.customer.okr;
  return { target, okr: okr && okr.objectives.length > 0 ? { objectives: okr.objectives as Objective[], updatedAt: okr.updatedAt ?? '' } : undefined };
}
