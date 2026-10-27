// 編集した顧客パックのデータを、全量エクスポートの JSON ブロックに載せ、読み込みで復元する（FR-053・FR-056）。
// `registerSnapshotSource` の登録口（src/discussion/restore.ts）を使う。編集（FR-044〜）はすべて `usePackStore` の data に反映されるので、
// ここではそのデータをそのまま書き出し、読み込みでは検証を通ったときだけ置き換える（失敗したら現在のデータは変わらない）。
import { registerSnapshotSource } from '../discussion/restore';
import { BRAND_PROFILE_PATH, DATA_FILE_NAMES, formatPackError, validatePack, type PackData, type PackFiles } from '../schema';
import { subscribeEdits, type HistoryEntry } from '../store/edit';
import { usePackStore } from '../store/pack';
import { recordChange, type ChangeEntry } from './changelog';
import { tr } from '../i18n';

/** `data` の中のキー */
export const PACK_SNAPSHOT_KEY = 'pack';

const OP_KIND: Record<HistoryEntry['op'], ChangeEntry['kind']> = {
  update: 'changed', add: 'added', duplicate: 'added', delete: 'removed', import: 'added', reset: 'changed', undo: 'changed', redo: 'changed',
};
const OP_LABEL: Record<HistoryEntry['op'], string> = {
  update: '編集', add: '追加', duplicate: '複製', delete: '削除', import: '取り込み', reset: 'サンプルに戻す', undo: '元に戻す', redo: 'やり直し',
};

/** 編集の変更履歴の 1 行を、エクスポートの変更履歴（FR-053）の形にする。 */
export function editToChange(e: Pick<HistoryEntry, 'op' | 'entityId' | 'entityLabel' | 'fieldLabel' | 'before' | 'after' | 'at' | 'actor'>): ChangeEntry {
  const detail = e.op === 'update' || e.op === 'undo' || e.op === 'redo'
    ? `${OP_LABEL[e.op]}: ${e.fieldLabel}「${e.before}」→「${e.after}」`
    : `${OP_LABEL[e.op]}${e.fieldLabel ? `（${e.fieldLabel}）` : ''}`;
  return { at: e.at, kind: OP_KIND[e.op], targetId: e.entityId ?? '', target: e.entityLabel, detail, by: e.actor };
}

/** データの編集（FR-044〜）が確定するたびに、変更履歴へ記録する。解除する関数を返す。 */
export function registerEditChangeLog(): () => void {
  return subscribeEdits((entries) => { for (const e of entries) recordChange(editToChange(e)); });
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 読み込む内容の問題の一覧（空なら問題なし）。構成と、ID・参照・出典の検証を通す。 */
export function validatePackSnapshot(value: unknown): string[] {
  if (!isObj(value)) return [tr('顧客パックのデータがオブジェクトではありません。')];
  const files: PackFiles = {};
  for (const name of DATA_FILE_NAMES) if (name in value) files[name] = value[name];
  const st = usePackStore.getState().state;
  if (st.status === 'ready') files.brandProfile = st.pack.brand;
  // ブランドの設定は、顧客パックの読み込み済みのものを使う（スナップショットには含めない）。読み込み前は検査しない。
  return validatePack(files).errors.filter((e) => !(e.code === 'missing-file' && e.file === BRAND_PROFILE_PATH)).map(formatPackError);
}

/** 編集データを全量エクスポートと復元の対象にする。解除する関数を返す。 */
export function registerPackSnapshot(): () => void {
  return registerSnapshotSource({
    key: PACK_SNAPSHOT_KEY,
    capture: () => {
      const st = usePackStore.getState().state;
      return st.status === 'ready' ? st.pack.data : undefined;
    },
    validate: validatePackSnapshot,
    apply: (value) => usePackStore.getState().setData(value as PackData),
  });
}
