// コマンドパレットとショートカット一覧（FR-111・FR-029）。Ctrl+K で開き、名前で絞り込み、矢印キーで選んで Enter で実行する。
// 操作にショートカットがあれば、操作名の横に表示する。? でショートカット一覧を開く。
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, DialogTrigger, Input, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Text, makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import { isEditableTarget } from '../components/panelKeys';
import type { ScreenDefinition } from '../screens/types';
import { builtinCommands } from './builtin';
import { STATIC_SHORTCUTS, commandsVersion, filterCommands, getCommands, onCommandsChanged, registerCommands, type Command } from './registry';
import { globalKeyAction, useCommandUi } from './ui';

const useStyles = makeStyles({
  list: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXXS, maxHeight: '50vh', overflowY: 'auto', marginTop: tokens.spacingVerticalS },
  option: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: tokens.spacingHorizontalM,
    minHeight: '32px',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  active: { backgroundColor: tokens.colorBrandBackground2, outline: `${tokens.strokeWidthThin} solid ${tokens.colorBrandStroke1}` },
  key: {
    flexShrink: 0,
    padding: `0 ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusSmall,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground3,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
  },
});

function useCommands(): Command[] {
  const version = useSyncExternalStore(onCommandsChanged, commandsVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getCommands(), [version]);
}

export function CommandPalette() {
  const s = useStyles();
  const open = useCommandUi((st) => st.paletteOpen);
  const setOpen = useCommandUi((st) => st.setPaletteOpen);
  const commands = useCommands();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const results = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => { if (open) { setQuery(''); setActive(0); } }, [open]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active, results]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    window.setTimeout(c.run, 0);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); run(results[active]); }
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
      <DialogSurface aria-label="コマンドパレット" data-testid="command-palette">
        <DialogBody>
          <DialogTitle>コマンドパレット</DialogTitle>
          <DialogContent>
            <Input
              role="combobox"
              aria-label="コマンドを検索"
              aria-expanded
              aria-controls="command-palette-list"
              aria-activedescendant={results[active] ? `command-${results[active].id}` : undefined}
              aria-autocomplete="list"
              placeholder="操作名を入力（例: 既定）"
              value={query}
              style={{ width: '100%' }}
              onChange={(_, d) => { setQuery(d.value); setActive(0); }}
              onKeyDown={onKey}
            />
            <div ref={list} id="command-palette-list" role="listbox" aria-label="コマンド" className={s.list}>
              {results.map((c, i) => (
                <div
                  key={c.id}
                  id={`command-${c.id}`}
                  role="option"
                  aria-selected={i === active}
                  className={mergeClasses(s.option, i === active ? s.active : undefined)}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(c)}
                >
                  <span>{c.label}</span>
                  {c.shortcut ? <kbd className={s.key}>{c.shortcut}</kbd> : null}
                </div>
              ))}
            </div>
            {results.length === 0 ? <Text role="status">一致する操作がありません。</Text> : null}
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export function ShortcutDialog() {
  const s = useStyles();
  const open = useCommandUi((st) => st.shortcutsOpen);
  const setOpen = useCommandUi((st) => st.setShortcutsOpen);
  const commands = useCommands();
  // 操作名ごとに 1 行。画面ごとに同じ操作（非表示・最大化）が並ぶので、ショートカットが同じものはまとめる
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ label: string; shortcut: string }> = [...STATIC_SHORTCUTS];
    for (const r of out) seen.add(r.shortcut);
    for (const c of commands) {
      if (!c.shortcut || seen.has(c.shortcut)) continue;
      seen.add(c.shortcut);
      out.push({ label: c.label, shortcut: c.shortcut });
    }
    return out;
  }, [commands]);
  return (
    <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
      <DialogSurface aria-label="ショートカット一覧" data-testid="shortcut-list">
        <DialogBody>
          <DialogTitle>ショートカット一覧</DialogTitle>
          <DialogContent>
            <Table aria-label="ショートカット" size="small">
              <TableHeader>
                <TableRow><TableHeaderCell>操作</TableHeaderCell><TableHeaderCell>キー</TableHeaderCell></TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.label}-${r.shortcut}`}>
                    <TableCell>{r.label}</TableCell>
                    <TableCell><kbd className={s.key}>{r.shortcut}</kbd></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DialogContent>
          {/* フォーカスできる操作が 1 つもないモーダルは、フォーカス管理（Tabster）が後から aria-hidden にしてしまうため、閉じるボタンを置く */}
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="primary">閉じる</Button>
            </DialogTrigger>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** アプリで 1 回だけ置く: 標準コマンドの登録、Ctrl+K と ? のキー、パレットと一覧のダイアログ。 */
export function CommandController({ screens }: { screens: readonly ScreenDefinition[] }) {
  useEffect(() => registerCommands(() => builtinCommands(screens)), [screens]);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const action = globalKeyAction({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, editable: isEditableTarget(e.target) });
      if (!action) return;
      e.preventDefault();
      const ui = useCommandUi.getState();
      if (action === 'palette') ui.setPaletteOpen(!ui.paletteOpen);
      else ui.setShortcutsOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (<><CommandPalette /><ShortcutDialog /></>);
}
