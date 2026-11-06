// レイアウトの雛形（FR-305）の結合テスト: キー操作・コマンドパレット・見出しのメニューの入口と、
// 区画に配置されなかったコンポーネント（背面）のストアの扱い・前後関係の保存と復元。
// FR-305 AC-863 AC-865 AC-866
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZONE_CHORDS, chordLabel, matchZoneOp } from '../../src/workspace/os';
import { editKeyAction } from '../../src/edit/useEditKeys';

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const ALL = ['summary', 'matrix', 'ranking', 'issue-solution', 'discussion-tree', 'gantt', 'architecture', 'knowledge-graph', 'products', 'map', 'twin-view', 'mock-app', 'table', 'kpi-okr'];

async function freshStore(storage = new MemoryStorage()) {
  vi.resetModules();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
  const mod = await import('../../src/store/layout');
  mod.setAvailableComponents(ALL);
  return { ...mod, storage };
}

beforeEach(() => { vi.unstubAllGlobals(); });

describe('FR-305 AC-863 ドラッグを使わない入口', () => {
  const key = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }>) =>
    ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

  it('FR-305 AC-863 Ctrl+Alt+Z（macOS の表示は ⌃⌥Z）で雛形のポップアップの操作になり、Ctrl+Z の取り消しとは区別される', () => {
    expect(ZONE_CHORDS.layouts.code).toBe('KeyZ');
    expect(matchZoneOp(key('KeyZ', { ctrlKey: true, altKey: true }))).toBe('layouts');
    expect(matchZoneOp(key('KeyZ', { ctrlKey: true }))).toBeNull();
    expect(chordLabel('windows', 'layouts')).toBe('Ctrl+Alt+Z');
    expect(chordLabel('mac', 'layouts')).toBe('⌃⌥Z');
    const ek = { key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, defaultPrevented: false, editable: false };
    expect(editKeyAction({ ...ek, altKey: true }), 'Ctrl+Alt+Z を取り消しにしない').toBeNull();
    expect(editKeyAction({ ...ek, altKey: false })).toBe('undo');
    // ほかのゾーンの操作のキーと重ならない
    const codes = Object.values(ZONE_CHORDS).map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('FR-305 AC-863 コマンドパレットの「レイアウトの雛形を開く」とキー操作は、操作中のコンポーネントの同じポップアップを開く', async () => {
    vi.resetModules();
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', { localStorage: storage });
    const { zoneOpCommands, runZoneOp, NO_PANE_MESSAGE } = await import('../../src/workspace/zoneOps');
    const openLayouts = vi.fn();
    const pane = { openLayouts } as unknown as Parameters<typeof runZoneOp>[1];
    const notify = vi.fn();
    const cmd = zoneOpCommands(() => pane, notify).find((c) => c.id === 'zone.layouts');
    expect(cmd, 'コマンドパレットに雛形のコマンドがない').toBeDefined();
    expect(cmd!.label).toContain('レイアウトの雛形を開く');
    expect(cmd!.shortcut).toMatch(/Z$/);
    cmd!.run();
    expect(openLayouts).toHaveBeenCalledTimes(1);
    runZoneOp('layouts', pane, notify);
    expect(openLayouts).toHaveBeenCalledTimes(2);
    // 対象がなければ理由を知らせ、何もしない
    runZoneOp('layouts', null, notify);
    expect(notify).toHaveBeenCalledWith(NO_PANE_MESSAGE);
  });
});

describe('FR-305 AC-865 区画に配置されなかったコンポーネント（背面）', () => {
  it('FR-305 AC-865 背面に回したものは閉じず最小化もせず、前面に出すと背面から外れ、再読込しても保たれる', async () => {
    const { useLayout, storage } = await freshStore();
    const st = useLayout.getState();
    st.setBehind(['gantt', 'table', 'gantt']);
    expect(useLayout.getState().behind[useLayout.getState().persona]).toEqual(['gantt', 'table']);
    const s1 = useLayout.getState();
    expect(s1.minimized[s1.persona] ?? []).not.toContain('gantt');
    expect(s1.closed[s1.persona] ?? []).not.toContain('gantt');
    // 再読込（保存値から新しいストアを作る）
    const { useLayout: again } = await freshStore(storage);
    expect(again.getState().behind[again.getState().persona]).toEqual(['gantt', 'table']);
    // 前面に出す（FR-295 の一覧から呼び出す・クリック）と背面から外れ、FR-173 の自由配置の重なりとして扱う
    again.getState().raise('gantt');
    expect(again.getState().behind[again.getState().persona]).toEqual(['table']);
    expect(again.getState().zOrder.at(-1)).toBe('gantt');
  });

  it('FR-305 AC-865 背面のものは FR-184 の押し出し（makeRoom）で動かされない', async () => {
    const { makeRoom } = await import('../../src/workspace/windowLimits');
    const { defaultLayout, keysOf } = await import('../../src/workspace/layoutModel');
    const layout = defaultLayout('事業部門');
    const keys = keysOf(layout);
    const protect = keys.slice(0, 2);
    const { layout: out } = makeRoom(layout, 400, { protect });
    for (const k of protect) expect(keysOf(out), `背面の ${k} が押し出された`).toContain(k);
  });

  it('FR-305 AC-865 既定に戻す（FR-110）と背面の扱いも消える', async () => {
    const { useLayout } = await freshStore();
    useLayout.getState().setBehind(['gantt']);
    useLayout.getState().resetLayout();
    expect(useLayout.getState().behind[useLayout.getState().persona]).toBeUndefined();
  });
});

describe('FR-305 AC-866 ポップアップを Esc・区画の外のドロップで閉じたときの復元', () => {
  // ストアの復元の単体。本番の Workspace（startDrag の restoreBefore）を通す結合は snap-layouts-workspace.test.tsx
  it('FR-305 AC-866 操作の前の前後関係（zOrder・背面）をそのまま戻すと、配置・前後関係は操作の前と同じ', async () => {
    const { useLayout } = await freshStore();
    useLayout.getState().raise('summary');
    useLayout.getState().raise('table');
    useLayout.getState().setBehind(['gantt']);
    const floats0 = JSON.stringify(useLayout.getState().floats);
    // ドラッグの開始で控える（Workspace の startDrag と同じ手順）
    const before0 = { zOrder: [...useLayout.getState().zOrder], behind: useLayout.getState().behind[useLayout.getState().persona] };
    useLayout.getState().raise('gantt'); // 掴んだものが手前へ出る
    expect(useLayout.getState().behind[useLayout.getState().persona]).toEqual([]);
    // Esc・区画の外のドロップ: 控えた前後関係へ戻す
    useLayout.setState((st) => {
      const behind = { ...st.behind };
      if (before0.behind) behind[st.persona] = before0.behind; else delete behind[st.persona];
      return { zOrder: before0.zOrder, behind };
    });
    const st = useLayout.getState();
    expect(st.zOrder).toEqual(before0.zOrder);
    expect(st.behind[st.persona]).toEqual(['gantt']);
    expect(JSON.stringify(st.floats)).toBe(floats0);
  });
});
