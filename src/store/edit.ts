// 編集の共通ストア（FR-044〜FR-047）。Zustand。
// 編集はすべてここを通る: 編集モードの確認（OFF なら変更しない）→ 純粋な編集（src/edit/model.ts）→ 顧客パックのストアへ反映
// （すべてのビューが usePackStore を購読しているので、再読込なしで即座に変わる: FR-045）→ 元に戻す/やり直しの履歴と変更履歴に記録（FR-046）。
// 後続のビュー（3D・ナレッジグラフなど）は、usePackStore の data を読むだけで編集を反映できる。編集の発生を知りたいときは `subscribeEdits`。
import { create } from 'zustand';
import {
  addRecord, deleteRecord, duplicateRecord, importCsv, importJson, renameRecord, resetTo, updateField,
  type DataChange, type EditResult,
} from '../edit/model';
import type { PackData } from '../schema';
import { getEntityGraph } from '../selection/hooks';
import { usePackStore } from './pack';
import { useSelectionStore } from './selection';

/** 元に戻す履歴の上限（PARAM-024） */
export const UNDO_LIMIT = 100;

/** 変更を起こした主体（誰が: FR-046）。画面からの編集は人、AI が書き込むときは ai */
export type Actor = 'human' | 'ai';

export interface HistoryEntry extends DataChange {
  seq: number;
  /** ISO 8601（UTC） */
  at: string;
  actor: Actor;
}

interface Step {
  /** 変更の前（元に戻すと、やり直しの後）のデータ */
  data: PackData;
  changes: DataChange[];
}

const MODE_KEY = 'edb.editMode';
const OFF_MESSAGE = '編集モードが OFF です。ヘッダーの「編集モード」を ON にしてください。';

function readMode(): boolean {
  try { return localStorage.getItem(MODE_KEY) === '1'; } catch { return false; }
}
function writeMode(on: boolean): void {
  try { localStorage.setItem(MODE_KEY, on ? '1' : '0'); } catch { /* 保存できなくても動作は続ける */ }
}

interface EditState {
  /** 編集モード（FR-047）。既定は OFF。OFF のときはデータを変更できない */
  editMode: boolean;
  past: Step[];
  future: Step[];
  /** 変更履歴（古い順）。元に戻す・やり直しも記録する */
  log: HistoryEntry[];
  seq: number;

  setEditMode: (on: boolean) => void;
  /** 値の編集。数値の項目に文字などを入れると、保存せずに理由を返す */
  update: (id: string, path: readonly string[], raw: string, actor?: Actor) => EditResult;
  /** 名前（title / name / label）の編集 */
  rename: (id: string, raw: string, actor?: Actor) => EditResult;
  add: (refId?: string, actor?: Actor) => EditResult;
  duplicate: (id: string, actor?: Actor) => EditResult;
  remove: (id: string, actor?: Actor) => EditResult;
  importCsv: (text: string, actor?: Actor) => EditResult;
  importJson: (text: string, actor?: Actor) => EditResult;
  /** 顧客パックの初期値に戻す（元に戻すで取り消せる） */
  resetToSample: (actor?: Actor) => EditResult;
  /** 取り込みの前に、結果だけを確かめる（データは変えない） */
  previewCsv: (text: string) => EditResult;
  previewJson: (text: string) => EditResult;
  /** 変更を適用済みの結果として確定する（previewCsv / previewJson の結果を渡す） */
  commit: (result: EditResult, actor?: Actor) => EditResult;
  undo: () => boolean;
  redo: () => boolean;
}

function currentData(): PackData | undefined {
  const st = usePackStore.getState().state;
  return st.status === 'ready' ? st.pack.data : undefined;
}

/** 編集の後に、選択の「存在する ID」を更新し、必要なら選び直す（削除した項目の選択は外れ、追加・複製した項目を選べる） */
function syncSelection(select?: readonly string[]): void {
  const g = getEntityGraph();
  const sel = useSelectionStore.getState();
  sel.setKnownIds(g ? new Set(g.nodes.map((n) => n.id)) : null);
  if (select && select.length > 0) sel.setSelection(select, { origin: 'edit' });
}

const listeners = new Set<(entries: readonly HistoryEntry[]) => void>();
/** 編集が確定するたび（元に戻す・やり直しを含む）に、記録された変更履歴の行を受け取る */
export function subscribeEdits(fn: (entries: readonly HistoryEntry[]) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export const useEditStore = create<EditState>((set, get) => {
  const record = (changes: readonly DataChange[], actor: Actor, op?: DataChange['op']): HistoryEntry[] => {
    const at = new Date().toISOString();
    let seq = get().seq;
    const entries = changes.map((c) => ({ ...c, ...(op ? { op } : {}), seq: ++seq, at, actor }));
    set((s) => ({ log: [...s.log, ...entries], seq }));
    return entries;
  };

  const apply = (result: EditResult, actor: Actor): EditResult => {
    if (!get().editMode) return { ok: false, message: OFF_MESSAGE };
    if (!result.ok) return result;
    const before = currentData();
    if (!before) return { ok: false, message: '顧客パックが読み込まれていません。' };
    if (result.changes.length === 0) return result;
    set((s) => ({ past: [...s.past, { data: before, changes: result.changes }].slice(-UNDO_LIMIT), future: [] }));
    usePackStore.getState().setData(result.data);
    syncSelection(result.select);
    const entries = record(result.changes, actor);
    for (const l of listeners) l(entries);
    return result;
  };

  const run = (fn: (d: PackData) => EditResult, actor: Actor): EditResult => {
    if (!get().editMode) return { ok: false, message: OFF_MESSAGE };
    const d = currentData();
    if (!d) return { ok: false, message: '顧客パックが読み込まれていません。' };
    return apply(fn(d), actor);
  };

  const preview = (fn: (d: PackData) => EditResult): EditResult => {
    const d = currentData();
    return d ? fn(d) : { ok: false, message: '顧客パックが読み込まれていません。' };
  };

  const step = (from: 'past' | 'future'): boolean => {
    const s = get();
    if (!s.editMode) return false;
    const stack = s[from];
    const item = stack[stack.length - 1];
    const now = currentData();
    if (!item || !now) return false;
    const to = from === 'past' ? 'future' : 'past';
    const op = from === 'past' ? 'undo' : 'redo';
    set({ [from]: stack.slice(0, -1), [to]: [...s[to], { data: now, changes: item.changes }].slice(-UNDO_LIMIT) } as Partial<EditState>);
    usePackStore.getState().setData(item.data);
    syncSelection();
    // 元に戻すは「変更後 → 変更前」、やり直しは「変更前 → 変更後」として記録する
    const changes = item.changes.map((c) => (op === 'undo' ? { ...c, before: c.after, after: c.before } : c));
    const entries = record(changes, 'human', op);
    for (const l of listeners) l(entries);
    return true;
  };

  return {
    editMode: readMode(),
    past: [],
    future: [],
    log: [],
    seq: 0,

    setEditMode: (on) => { writeMode(on); set({ editMode: on }); },
    update: (id, path, raw, actor = 'human') => run((d) => updateField(d, id, path, raw), actor),
    rename: (id, raw, actor = 'human') => run((d) => renameRecord(d, id, raw), actor),
    add: (refId, actor = 'human') => run((d) => addRecord(d, refId), actor),
    duplicate: (id, actor = 'human') => run((d) => duplicateRecord(d, id), actor),
    remove: (id, actor = 'human') => run((d) => deleteRecord(d, id), actor),
    importCsv: (text, actor = 'human') => run((d) => importCsv(d, text), actor),
    importJson: (text, actor = 'human') => {
      const brand = usePackStore.getState().state;
      return run(() => (brand.status === 'ready' ? importJson(text, brand.pack.brand) : { ok: false, message: '顧客パックが読み込まれていません。' }), actor);
    },
    resetToSample: (actor = 'human') => run((d) => {
      const original = usePackStore.getState().original;
      return original ? resetTo(d, original) : { ok: false, message: '戻し先のサンプルがありません。' };
    }, actor),
    previewCsv: (text) => preview((d) => importCsv(d, text)),
    previewJson: (text) => {
      const st = usePackStore.getState().state;
      return st.status === 'ready' ? importJson(text, st.pack.brand) : { ok: false, message: '顧客パックが読み込まれていません。' };
    },
    commit: (result, actor = 'human') => apply(result, actor),
    undo: () => step('past'),
    redo: () => step('future'),
  };
});

/** 単体テスト用: 編集の状態を初期化する */
export function resetEditForTest(): void {
  useEditStore.setState({ editMode: false, past: [], future: [], log: [], seq: 0 });
}
