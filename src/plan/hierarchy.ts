// 2D の表・ガントでの段階的な表示（FR-035）の純粋なロジック。親子（parentId）の木を、展開・折りたたみの状態で平らな行に直す。
// 画面の部品を参照しない。

export interface TreeRow<T> {
  item: T;
  /** 木の深さ（最上位は 0） */
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

/**
 * 親子の木を、深さ優先の行の並びにする。
 * - 親が `items` の中にない項目（選択による絞り込みで親が隠れたときなど）は最上位として扱う。
 * - `collapsed` に入っている ID の下位は含めない。
 * - 親子が循環していても、すべての項目を 1 度だけ返す。
 */
export function flattenTree<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  parentOf: (item: T) => string | null | undefined,
  collapsed: ReadonlySet<string>,
): TreeRow<T>[] {
  const ids = new Set(items.map(idOf));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const it of items) {
    const p = parentOf(it);
    if (p && p !== idOf(it) && ids.has(p)) children.set(p, [...(children.get(p) ?? []), it]);
    else roots.push(it);
  }
  const out: TreeRow<T>[] = [];
  const seen = new Set<string>();
  const walk = (it: T, depth: number): void => {
    const id = idOf(it);
    if (seen.has(id)) return;
    seen.add(id);
    const kids = children.get(id) ?? [];
    const expanded = kids.length > 0 && !collapsed.has(id);
    out.push({ item: it, depth, hasChildren: kids.length > 0, expanded });
    if (expanded) for (const k of kids) walk(k, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  // 循環だけで構成された項目は、最上位から辿れないので最上位として足す
  for (const it of items) {
    if (seen.has(idOf(it))) continue;
    const hidden = (function underCollapsed(x: T, guard: number): boolean {
      const p = parentOf(x);
      if (!p || guard > items.length) return false;
      if (collapsed.has(p)) return true;
      const px = items.find((i) => idOf(i) === p);
      return px ? underCollapsed(px, guard + 1) : false;
    })(it, 0);
    if (!hidden) walk(it, 0);
  }
  return out;
}
