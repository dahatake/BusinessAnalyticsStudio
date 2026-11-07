// Q-097（最大化で背面になるのは直前に表示中だったものだけ・既定に戻すは最大化を解いてから）、Q-098（最大化中の再読込で最大化を復元）、Q-099（最小化できる対象がゼロのときの取り消し）の単体・結合テスト
// FR-295 FR-296 FR-152 FR-110 FR-013 FR-014 FR-184 FR-297 AC-801 AC-883 AC-886 AC-887
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leaf, split } from '../../src/workspace/layoutModel';
import { windowStates } from '../../src/workspace/windowStates';

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const ALL = ['summary', 'matrix', 'ranking', 'issue-solution', 'discussion-tree', 'gantt', 'architecture', 'knowledge-graph', 'products', 'twin-view', 'table', 'kpi-okr', 'priority', 'whiteboard'];
async function freshStore(saved?: string) {
  vi.resetModules();
  const storage = new MemoryStorage();
  if (saved !== undefined) storage.setItem('edb.layout', saved);
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
  const mod = await import('../../src/store/layout');
  mod.setAvailableComponents(ALL);
  return { ...mod, storage };
}
beforeEach(() => { vi.unstubAllGlobals(); });

const tree = split('row', [leaf('summary'), leaf('matrix'), leaf('ranking')], [1 / 3, 1 / 3, 1 / 3]);
const used = { summary: 3, matrix: 2, ranking: 1 };

describe('FR-295 AC-887 Q-097 (a) 最大化で背面になるもの', () => {
  it('FR-152 AC-887 直前に表示中だったものだけが背面。最小化中・閉じたもの・雛形由来の背面は状態が変わらない', () => {
    const keys = ['summary', 'matrix', 'ranking', 'gantt'];
    const st = windowStates({ keys, layout: tree, minimized: new Set(['ranking']), closed: new Set(['gantt']), usedAt: used, maximized: 'summary' });
    expect(st).toMatchObject({ summary: 'front', matrix: 'behind', ranking: 'minimized', gantt: 'closed' });
  });
  it('FR-295 AC-887 雛形由来の背面のものは、最大化中も最大化を解いた後も背面のまま（理由は上書きされない）', () => {
    const base = { keys: ['summary', 'matrix', 'ranking'], layout: tree, minimized: new Set<string>(), closed: new Set<string>(), usedAt: used, behind: new Set(['ranking']) };
    expect(windowStates({ ...base, maximized: 'summary' })).toMatchObject({ matrix: 'behind', ranking: 'behind' });
    expect(windowStates({ ...base, maximized: null })).toMatchObject({ summary: 'front', matrix: 'visible', ranking: 'behind' });
  });
  it('FR-152 AC-887 ストア: 最大化しても最小化・閉じた・背面の保存状態は変わらない', async () => {
    const m = await freshStore();
    const st = () => m.useLayout.getState();
    st().setPersona('事業部門');
    useLayoutTree(m);
    st().setBehind(['ranking']);
    st().setMinimized('matrix', true);
    const before = { min: st().minimized, closed: st().closed, behind: st().behind };
    st().setMaximized('summary');
    expect(st().minimized).toEqual(before.min);
    expect(st().closed).toEqual(before.closed);
    expect(st().behind).toEqual(before.behind);
    st().setMaximized(null);
    expect(st().behind).toEqual(before.behind);
  });
});

function useLayoutTree(m: Awaited<ReturnType<typeof freshStore>>) {
  m.useLayout.setState((s) => ({ layouts: { ...s.layouts, [s.persona]: tree } }));
}

describe('FR-110 Q-097 (c) 最大化中の既定に戻す', () => {
  it('FR-110 AC-887 最大化中に既定に戻すと、最大化が解かれ、保存にも残らない', async () => {
    const m = await freshStore();
    const st = () => m.useLayout.getState();
    st().setPersona('事業部門');
    useLayoutTree(m);
    st().setMaximized('summary');
    st().resetLayout();
    expect(st().maximized).toBeNull();
    const again = await freshStore(m.storage.getItem('edb.layout')!);
    expect(again.useLayout.getState().maximized).toBeNull();
  });
});

describe('FR-014 AC-887 ⑦ Q-098 最大化中の再読込', () => {
  it('FR-014 AC-887 ⑦ 最大化中に再読込すると、最大化と最大化由来の背面（導かれる状態）と最大化前の配置が復元され、解くと元の配置へ戻る', async () => {
    const first = await freshStore();
    const st1 = () => first.useLayout.getState();
    st1().setPersona('事業部門');
    useLayoutTree(first);
    st1().setMinimized('ranking', true);
    st1().setMaximized('summary');
    const second = await freshStore(first.storage.getItem('edb.layout')!);
    const st = () => second.useLayout.getState();
    expect(st().maximized).toBe('summary');
    expect(st().layouts['事業部門']).toEqual(tree);
    const states = windowStates({ keys: ['summary', 'matrix', 'ranking'], layout: tree, minimized: new Set(st().minimized['事業部門'] ?? []), closed: new Set(), usedAt: st().usedAt, maximized: st().maximized });
    expect(states).toMatchObject({ summary: 'front', matrix: 'behind', ranking: 'minimized' });
    st().setMaximized(null);
    expect(st().maximized).toBeNull();
    expect(st().layouts['事業部門']).toEqual(tree);
  });
  it('FR-014 AC-887 ⑦ 最大化していない再読込では最大化されない。最小化・閉じたものの最大化は復元しない', async () => {
    const first = await freshStore();
    first.useLayout.getState().setPersona('事業部門');
    useLayoutTree(first);
    const none = await freshStore(first.storage.getItem('edb.layout')!);
    expect(none.useLayout.getState().maximized).toBeNull();
    const raw = JSON.parse(first.storage.getItem('edb.layout')!);
    raw.state.maximized = 'ranking';
    raw.state.minimized = { 事業部門: ['ranking'] };
    const stale = await freshStore(JSON.stringify(raw));
    expect(stale.useLayout.getState().maximized).toBeNull();
  });
});

describe('FR-296 Q-099 最小化できる対象がゼロのときの縮退', () => {
  it('FR-296 AC-886 向きの変更: 最小化できる対象がなく収まらないなら取り消し、直前の配置のまま', async () => {
    const m = await freshStore();
    m.setWorkspaceArea(760, 700);
    const st = () => m.useLayout.getState();
    st().setPersona('事業部門');
    const col = split('col', [leaf('summary'), leaf('matrix')], [0.5, 0.5]);
    m.useLayout.setState((s) => ({ layouts: { ...s.layouts, [s.persona]: col }, pinned: { ...s.pinned, [s.persona]: { summary: { x: 0, y: 0, w: 0.5, h: 0.5 }, matrix: { x: 0, y: 0.5, w: 0.5, h: 0.5 } } } }));
    // 両方ピン止めの場合は向きを変えられない（動かさない）
    expect(st().toggleDirection('summary')).toBe(true);
    expect(st().layouts['事業部門']).toEqual(col);
  });
  it('FR-296 AC-886 大きさの変更: 縮める操作は下限（PARAM-134・135）で止まり、最小化・閉じることは起きない', async () => {
    const m = await freshStore();
    m.setWorkspaceArea(1200, 700);
    const st = () => m.useLayout.getState();
    st().setPersona('事業部門');
    m.useLayout.setState((s) => ({ layouts: { ...s.layouts, [s.persona]: tree } }));
    st().resizeAt([], 0, -5000);
    expect(st().minimized['事業部門'] ?? []).toEqual([]);
    expect(st().closed['事業部門'] ?? []).toEqual([]);
  });
});
