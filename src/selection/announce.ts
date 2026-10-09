// 選択の変化の通知文（FR-029）。aria-live の領域（Announcer.tsx）が使う純粋な関数。

/** 通知の文言。選択がなければ解除の通知、あれば主の選択（最後に選んだ項目）の名前と、選択以外の関連件数。 */
export function selectionAnnouncement(names: readonly string[], relatedCount: number): string {
  if (names.length === 0) return '選択を解除しました';
  const primary = names[names.length - 1];
  const head = names.length === 1 ? primary : `${primary} ほか ${names.length - 1} 件`;
  return `${head} を選択しました。関連する項目 ${relatedCount} 件`;
}
