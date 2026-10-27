// 議論メモ（Markdown）からの復元と、全量エクスポートに足すデータの登録口（FR-051・FR-056）。
// 課題・解決策などのデータを持つ項目は `registerSnapshotSource` で登録すると、エクスポートに含まれ、読み込みで復元される。
import { packKeyOf } from './model';
import { tr } from '../i18n/translate';
import { buildDiscussionMemo, parseDiscussionMemo } from './memo';
import { useDiscussionStore } from '../store/discussion';

export interface SnapshotSource {
  /** `data` の中のキー（例: `issues`） */
  key: string;
  /** エクスポートする内容（JSON にできる値） */
  capture: () => unknown;
  /** 読み込む内容に問題があれば、原因の一覧を返す（問題なしは空）。適用の前に全部の検証を通す */
  validate?: (value: unknown) => string[];
  apply: (value: unknown) => void;
}

const sources = new Map<string, SnapshotSource>();

/** 同じキーで登録し直すと置き換える。登録を外す関数を返す。 */
export function registerSnapshotSource(source: SnapshotSource): () => void {
  sources.set(source.key, source);
  return () => { if (sources.get(source.key) === source) sources.delete(source.key); };
}

export function captureSnapshotData(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of sources.values()) out[s.key] = s.capture();
  return out;
}

export interface MemoTarget {
  customerName: string;
  projectName: string;
}

/** 保存する Markdown を作る（顧客パックの議論テーマ＋登録済みのデータ）。 */
export function buildMemoForPack(target: MemoTarget, now: Date = new Date()): string {
  const key = packKeyOf(target.customerName, target.projectName);
  return buildDiscussionMemo({
    ...target,
    themes: useDiscussionStore.getState().byPack[key]?.themes ?? [],
    data: captureSnapshotData(),
    now,
  });
}

export type RestoreResult =
  | { ok: true; themeCount: number; warnings: string[] }
  | { ok: false; errors: string[] };

/**
 * Markdown から復元する。読み取りと検証がすべて通ったときだけ適用し、失敗したら現在のデータを変えない。
 * 別の顧客パックのファイルは、内容を適用したうえで警告を返す。
 */
export function restoreFromMemo(text: string, target: MemoTarget): RestoreResult {
  const parsed = parseDiscussionMemo(text);
  if (!parsed.ok) return parsed;
  const { snapshot } = parsed;

  const errors: string[] = [];
  const applicable: Array<() => void> = [];
  for (const [key, value] of Object.entries(snapshot.data ?? {})) {
    const src = sources.get(key);
    if (!src) continue; // 読み込む処理を持つ項目がまだ登録されていないデータは、復元の対象外
    const problems = src.validate?.(value) ?? [];
    for (const p of problems) errors.push(tr('データ「{key}」: {p}', { key, p }));
    applicable.push(() => src.apply(value));
  }
  if (errors.length > 0) return { ok: false, errors };

  const key = packKeyOf(target.customerName, target.projectName);
  useDiscussionStore.getState().replaceThemes(key, snapshot.discussion.themes);
  for (const a of applicable) a();

  const warnings: string[] = [];
  if (snapshot.customer.name !== target.customerName || snapshot.customer.projectName !== target.projectName) {
    warnings.push(tr('このファイルは「{name} {project}」のものです。現在の顧客パックに読み込みました。', { name: snapshot.customer.name, project: snapshot.customer.projectName }));
  }
  return { ok: true, themeCount: snapshot.discussion.themes.length, warnings };
}
