// プレゼンテーションモードの純粋なモデル（FR-016）。React に依存しない。
// 議題の順序は show.json の chapters[].topics[] の順（番組構成 FR-077 のチャプターと連動する）。

export interface ShowChapterLike {
  id: string;
  title: string;
  topics?: ReadonlyArray<{ id: string; title: string }>;
}

export interface PresentationTopic {
  id: string;
  title: string;
  chapterId: string;
  chapterTitle: string;
  /** 章の番号（0 始まり） */
  chapterIndex: number;
}

/** show.json の章と議題を、プレゼンテーションで巡る順（章の順、章の中は議題の順）に平らにする。 */
export function flattenTopics(chapters: readonly ShowChapterLike[]): PresentationTopic[] {
  return chapters.flatMap((c, chapterIndex) =>
    (c.topics ?? []).map((t) => ({ id: t.id, title: t.title, chapterId: c.id, chapterTitle: c.title, chapterIndex })));
}

/** 議題の番号を delta だけ動かす。先頭・末尾を超えては進まない（範囲に収める）。 */
export function stepIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, index + delta));
}

export interface KeyInfo {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

/** キーを受け取る側（入力欄・メニューなど、矢印キーを自分で使う要素）か。 */
export interface KeyTargetInfo {
  tagName?: string;
  role?: string | null;
  isContentEditable?: boolean;
}

const OWN_ARROW_ROLES = new Set([
  'textbox', 'searchbox', 'combobox', 'spinbutton', 'slider', 'listbox', 'option', 'menu', 'menubar', 'menuitem',
  'menuitemradio', 'menuitemcheckbox', 'tablist', 'tab', 'tree', 'treeitem', 'grid', 'gridcell', 'separator', 'radiogroup', 'radio',
]);

export function targetUsesArrowKeys(t: KeyTargetInfo | null | undefined): boolean {
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = (t.tagName ?? '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return t.role ? OWN_ARROW_ROLES.has(t.role) : false;
}

/**
 * プレゼンテーション中のキー → 操作（FR-016 AC-192）。
 * `←`/`→`（修飾キーなし）だけが前/次の議題への移動。`↑`/`↓` と、`Shift` を押しながらの矢印はキャンバスのパンに残す。
 */
export function presentationKeyAction(e: KeyInfo, target?: KeyTargetInfo | null): 'next' | 'prev' | null {
  if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return null;
  if (targetUsesArrowKeys(target)) return null;
  if (e.key === 'ArrowRight') return 'next';
  if (e.key === 'ArrowLeft') return 'prev';
  return null;
}
