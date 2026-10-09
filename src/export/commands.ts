// エクスポートのコマンドとショートカット（FR-052）。
// コマンドは共通の登録簿（`src/commands/registry.ts`）に載せ、コマンドパレットとショートカット一覧に出す。
// キーの束縛は登録簿が行わない（表示だけ）ので、Ctrl+S／Ctrl+Shift+E の入力はここの `useExportShortcuts` が 1 か所で受ける（二重に発火しない）。
import { useEffect } from 'react';
import { registerCommands, type Command } from '../commands/registry';
import { openExportDialog } from './ui';

export const EXPORT_COMMANDS: readonly Command[] = [
  {
    id: 'export.open',
    label: 'エクスポートする（全量の Markdown）',
    keywords: ['エクスポート', '書き出し', '出力', 'export', 'markdown', 'zip'],
    shortcut: 'Ctrl+Shift+E',
    run: openExportDialog,
  },
  {
    id: 'export.save',
    label: '保存する（全量の Markdown をエクスポート）',
    keywords: ['保存', 'エクスポート', 'save', 'export'],
    shortcut: 'Ctrl+S',
    run: openExportDialog,
  },
];

/** キー入力が、エクスポートを開くショートカットか。 */
export function isExportShortcut(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
  const k = e.key.toLowerCase();
  return (k === 's' && !e.shiftKey) || (k === 'e' && e.shiftKey);
}

/** コマンドを登録簿に載せ、ショートカットを登録する。ブラウザーの「名前を付けて保存」は抑止する。 */
export function useExportShortcuts(): void {
  useEffect(() => registerCommands(() => [...EXPORT_COMMANDS]), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || !isExportShortcut(e)) return;
      e.preventDefault();
      if (!e.repeat) openExportDialog();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
