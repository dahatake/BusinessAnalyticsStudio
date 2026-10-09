// コマンドパレット・ショートカット一覧・選択の通知の単体テスト。
// FR-111 AC-136 / FR-029 AC-034
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STATIC_SHORTCUTS, filterCommands, getCommands, registerCommands, type Command } from '../../src/commands/registry';
import { globalKeyAction } from '../../src/commands/ui';
import { DATA_SCHEMAS, type PackData } from '../../src/schema';
import { selectionAnnouncement } from '../../src/selection/announce';
import { buildEntityGraph } from '../../src/selection/graph';
import { relatedSet } from '../../src/selection/model';

const noop = () => undefined;
const cmds: Command[] = [
  { id: 'layout.reset', label: '既定のレイアウトに戻す', keywords: ['リセット'], run: noop },
  { id: 'export', label: 'エクスポートする', shortcut: 'Ctrl+Shift+E', run: noop },
  { id: 'mute', label: '音をミュートする', shortcut: 'M', run: noop },
  { id: 'persona.it', label: 'ペルソナを「IT」に切り替える', keywords: ['persona'], run: noop },
];

describe('FR-111 AC-136 コマンドの絞り込み', () => {
  it('「既定」で「既定のレイアウトに戻す」が先頭に出る', () => {
    expect(filterCommands(cmds, '既定')[0]?.id).toBe('layout.reset');
  });
  it('別名・全角半角・大文字小文字で一致し、複数の語はすべて含むものに絞る', () => {
    expect(filterCommands(cmds, 'ﾘｾｯﾄ').map((c) => c.id)).toEqual(['layout.reset']);
    expect(filterCommands(cmds, 'PERSONA')[0]?.id).toBe('persona.it');
    expect(filterCommands(cmds, 'エクス ポート').map((c) => c.id)).toEqual(['export']);
    expect(filterCommands(cmds, '').length).toBe(cmds.length);
  });
  it('異常系: 一致する操作がない語は 0 件（Enter で何も実行されない）', () => {
    expect(filterCommands(cmds, 'ｚｚ存在しない操作')).toEqual([]);
  });
  it('名前の先頭一致が、名前の途中・別名より先に並ぶ', () => {
    const list: Command[] = [
      { id: 'b', label: 'レイアウトを既定に', run: noop },
      { id: 'a', label: '既定に戻す', run: noop },
      { id: 'c', label: '戻す', keywords: ['既定'], run: noop },
    ];
    expect(filterCommands(list, '既定').map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
  it('ショートカットを持つ操作は、その表示を持つ', () => {
    expect(filterCommands(cmds, 'エクスポート')[0]?.shortcut).toMatch(/Ctrl\+Shift\+E|Ctrl\+S/);
    expect(filterCommands(cmds, 'ミュート')[0]?.shortcut).toBe('M');
  });
});

describe('FR-111 AC-136 コマンドの登録', () => {
  it('登録した項目の操作が一覧に加わり、解除で消え、ID の重複は先のものを使う', () => {
    const off1 = registerCommands(() => [{ id: 'x.1', label: '一つ目', run: noop }]);
    const off2 = registerCommands(() => [{ id: 'x.1', label: '重複', run: noop }, { id: 'x.2', label: '二つ目', run: noop }]);
    const ids = getCommands().filter((c) => c.id.startsWith('x.')).map((c) => `${c.id}:${c.label}`);
    expect(ids).toEqual(['x.1:一つ目', 'x.2:二つ目']);
    off1(); off2();
    expect(getCommands().some((c) => c.id.startsWith('x.'))).toBe(false);
  });
});

describe('FR-111 / FR-029 グローバルのキー', () => {
  const base = { ctrlKey: false, metaKey: false, altKey: false, editable: false };
  it('Ctrl+K（⌘K）でコマンドパレット、? でショートカット一覧', () => {
    expect(globalKeyAction({ ...base, key: 'k', ctrlKey: true })).toBe('palette');
    expect(globalKeyAction({ ...base, key: 'K', metaKey: true })).toBe('palette');
    expect(globalKeyAction({ ...base, key: '?' })).toBe('shortcuts');
  });
  it('異常系: 入力欄の ? は文字入力。修飾キーなしの k や Alt 付きでは開かない', () => {
    expect(globalKeyAction({ ...base, key: '?', editable: true })).toBeNull();
    expect(globalKeyAction({ ...base, key: 'k' })).toBeNull();
    expect(globalKeyAction({ ...base, key: 'k', ctrlKey: true, altKey: true })).toBeNull();
    expect(globalKeyAction({ ...base, key: '?', ctrlKey: true })).toBeNull();
  });
  it('一覧にはコマンドパレット・ショートカット一覧・選択・Esc・最大化・非表示のキーが載る', () => {
    const keys = STATIC_SHORTCUTS.map((s) => s.shortcut);
    for (const k of ['Ctrl+K', '?', 'Esc', 'Shift+F', 'H']) expect(keys).toContain(k);
  });
});

describe('FR-029 AC-034 選択の通知（aria-live）', () => {
  function loadMono(): PackData {
    const dir = path.resolve(__dirname, '../../examples/mono/public/data');
    const out: Record<string, unknown> = {};
    for (const [name, schema] of Object.entries(DATA_SCHEMAS)) out[name] = schema.parse(JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8')));
    return out as PackData;
  }

  it('項目名と関連件数（選択以外）を通知する', () => {
    const pack = loadMono();
    const graph = buildEntityGraph(pack);
    const issue = pack.issues.issues[0]!;
    const related = relatedSet(graph, [issue.id], 'OR')!;
    const count = [...related].filter((id) => id !== issue.id).length;
    expect(count).toBeGreaterThan(0);
    const text = selectionAnnouncement([issue.title], count);
    expect(text).toContain(issue.title);
    expect(text).toMatch(/\d+\s*件/);
    expect(text).toContain(`${count} 件`);
  });
  it('複数選択は主の選択の名前と他の件数、解除は解除を通知する', () => {
    expect(selectionAnnouncement(['A', 'B', 'C'], 4)).toBe('C ほか 2 件 を選択しました。関連する項目 4 件');
    expect(selectionAnnouncement([], 0)).toBe('選択を解除しました');
  });
});
