// 変更履歴（FR-053 の節「変更履歴」）。このセッションで起きた議論テーマの変更を、エクスポートに載せるために記録する。
// 他の項目の編集（FR-044〜）も `recordChange` で足せる。メモリ上に持つ（保存と復元の正本は議論メモの Markdown）。
import { useDiscussionStore } from '../store/discussion';
import type { Theme } from '../discussion/model';
import { STATUS_DISPLAY_LABEL } from '../discussion/model';
import { tr } from '../i18n/translate';

export interface ChangeEntry {
  /** ISO 8601 */
  at: string;
  /** 変更の種類（追加・変更・削除） */
  kind: 'added' | 'changed' | 'removed';
  /** 変更の対象の ID（匿名化のときに、対象を特定するために使う） */
  targetId: string;
  /** 対象の名前 */
  target: string;
  /** 変更の内容 */
  detail: string;
  /** 変更した者 */
  by: 'human' | 'ai';
}

const log: ChangeEntry[] = [];
const LIMIT = 500;

export function recordChange(e: Omit<ChangeEntry, 'at'> & { at?: string }): void {
  log.push({ ...e, at: e.at ?? new Date().toISOString() });
  if (log.length > LIMIT) log.splice(0, log.length - LIMIT);
}

export function getChangeLog(): ChangeEntry[] {
  return log.map((e) => ({ ...e }));
}

export function clearChangeLog(): void {
  log.length = 0;
}

type ThemeMap = Map<string, Theme>;
const toMap = (themes: readonly Theme[]): ThemeMap => new Map(themes.map((t) => [t.id, t]));

/** 2 つの時点のテーマの差から、変更の記録を作る。 */
export function diffThemes(before: readonly Theme[], after: readonly Theme[], at: string = new Date().toISOString()): ChangeEntry[] {
  const out: ChangeEntry[] = [];
  const b = toMap(before);
  const a = toMap(after);
  for (const [id, t] of a) {
    const old = b.get(id);
    if (!old) {
      out.push({ at, kind: 'added', targetId: id, target: t.title, detail: tr('議論テーマを追加'), by: t.createdBy === 'ai' ? 'ai' : 'human' });
      continue;
    }
    const changes: string[] = [];
    if (old.title !== t.title) changes.push(tr('名前を「{old}」から変更', { old: old.title }));
    if (old.status !== t.status) changes.push(`${tr('決定ステータス')}: ${tr(STATUS_DISPLAY_LABEL[old.status])} → ${tr(STATUS_DISPLAY_LABEL[t.status])}`);
    if (old.decisions !== t.decisions) changes.push(tr('決定事項を更新'));
    if (old.openIssues !== t.openIssues) changes.push(tr('未決事項を更新'));
    if (changes.length > 0) out.push({ at, kind: 'changed', targetId: id, target: t.title, detail: changes.join(tr('、')), by: 'human' });
  }
  for (const [id, t] of b) {
    if (!a.has(id)) out.push({ at, kind: 'removed', targetId: id, target: t.title, detail: tr('議論テーマを削除'), by: 'human' });
  }
  return out;
}

let installed: (() => void) | null = null;

/** 議論テーマのストアを購読して、変更を記録する。二重に呼んでも 1 回だけ購読する。解除する関数を返す。 */
export function installDiscussionChangeLog(): () => void {
  if (installed) return installed;
  const flat = (): Theme[] => Object.values(useDiscussionStore.getState().byPack).flatMap((p) => p.themes);
  let prev = flat();
  const unsub = useDiscussionStore.subscribe((s, p) => {
    if (s.byPack === p.byPack) return;
    const next = Object.values(s.byPack).flatMap((x) => x.themes);
    for (const e of diffThemes(prev, next)) recordChange(e);
    prev = next;
  });
  installed = () => { unsub(); installed = null; };
  return installed;
}
