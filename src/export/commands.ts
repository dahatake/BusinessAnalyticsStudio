// エクスポートのコマンドとショートカット（FR-052）。
// コマンドの登録簿（I08 の `src/commands/registry.ts`）が統合されたら、`EXPORT_COMMANDS` をその `registerCommands` に渡して載せ替える。
// それまでは `useExportShortcuts` が同じ定義からキーボードのショートカットを登録する（Ctrl+S／Ctrl+Shift+E。Mac は Cmd）。
import { useEffect } from 'react';
import { openExportDialog } from './ui';

export interface ExportCommand {
  id: string;
  title: string;
  /** 表示用のキー（例: `Ctrl+Shift+E`） */
  keys: readonly string[];
  run: () => void;
}

export const EXPORT_COMMANDS: readonly ExportCommand[] = [
  { id: 'export.open', title: 'エクスポート（全量の Markdown）', keys: ['Ctrl+Shift+E', 'Ctrl+S'], run: openExportDialog },
];

/** キー入力が、エクスポートを開くショートカットか。 */
export function isExportShortcut(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
  const k = e.key.toLowerCase();
  return (k === 's' && !e.shiftKey) || (k === 'e' && e.shiftKey);
}

/** ショートカットを登録する。ブラウザーの「名前を付けて保存」は抑止する。 */
export function useExportShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || !isExportShortcut(e)) return;
      e.preventDefault();
      if (!e.repeat) EXPORT_COMMANDS[0]?.run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
