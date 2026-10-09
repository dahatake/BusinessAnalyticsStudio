// 矢印キー・Home・End で、並んだ項目のどれにフォーカスを移すかの判定（ナビゲーション・択一の選択肢で共通。NFR-A11Y-001 AC-170）。React に依存しない。

/**
 * 押したキーで、現在の位置 `at`（0 始まり）から移る先の位置を返す。移動のキーでなければ null。
 * ← ↑ は前、→ ↓ は次（先頭・末尾は回り込む）、Home は先頭、End は末尾。
 */
export function rovingTarget(key: string, at: number, count: number): number | null {
  if (count <= 0 || at < 0 || at >= count) return null;
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return (at + 1) % count;
    case 'ArrowUp':
    case 'ArrowLeft':
      return (at - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** 強調の語（data-highlight の空白区切り）に「選択中」が含まれるか。表の行の aria-selected に使う。 */
export function isSelectedHighlight(highlight: string | undefined): boolean {
  return (highlight ?? '').split(/\s+/).includes('selected');
}
