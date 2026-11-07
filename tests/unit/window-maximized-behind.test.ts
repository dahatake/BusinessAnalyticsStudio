// FR-295 AC-887（最大化中は他を「背面」にし、前面・背面の項目の押下で最大化を解く）、FR-296 AC-886・AC-883（Q-092〜094: 通常時の取り消し・保留状態での再読込・区画外を含む最小化の対象）の単体・結合テスト
// FR-013 FR-152 FR-297 AC-802 AC-825 AC-801 AC-883 AC-886 AC-887
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leaf, split } from '../../src/workspace/layoutModel';
import { navSummary, navTarget, shownCount, windowStates } from '../../src/workspace/windowStates';

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
  const actions = await import('../../src/workspace/windowActions');
  mod.setAvailableComponents(ALL);
  return { ...mod, ...actions, storage };
}
beforeEach(() => { vi.unstubAllGlobals(); });

const layout = split('row', [leaf('A'), leaf('B'), leaf('C')], [1 / 3, 1 / 3, 1 / 3]);
const base = { keys: ['A', 'B', 'C', 'D'], layout, minimized: new Set<string>(), closed: new Set<string>(), usedAt: { A: 3, B: 2, C: 1 } };

describe('FR-295 AC-887 最大化中の一覧の状態（FR-013・FR-152 共通）', () => {
  it('FR-295 AC-887 A を最大化すると A は前面、表示中の B・C は背面（非表示ではない）。最小化は最小化のまま', () => {
    const st = windowStates({ ...base, minimized: new Set(['C']), maximized: 'B' });
    expect(st).toMatchObject({ A: 'behind', B: 'front', C: 'minimized' });
    const none = windowStates({ ...base, maximized: null });
    expect(none).toMatchObject({ A: 'front', B: 'visible', C: 'visible' });
  });
  it('FR-295 AC-887 背面はバッジ・PARAM-136 に数えない（最大化中は前面の 1 つだけ）', () => {
    const st = windowStates({ ...base, maximized: 'A' });
    expect(st).toMatchObject({ A: 'front', B: 'behind', C: 'behind' });
    expect(shownCount(st)).toBe(1);
    const sum = navSummary(st, { A: 'sa', B: 'sb', C: 'sc', D: 'sd' });
    expect(sum['sa']).toEqual({ count: 1, hasFront: true });
    expect(sum['sb']).toBeUndefined();
    expect(sum['sc']).toBeUndefined();
  });
  it('FR-295 AC-887 ③ 左メニュー: 前面の画面は前面、背面だけの画面は背面の項目として前面へ出す対象になる', () => {
    const st = windowStates({ ...base, maximized: 'A' });
    const screenOf = { A: 'sa', B: 'sb', C: 'sc', D: 'sd' };
    expect(navTarget('sa', st, screenOf, base.usedAt)).toEqual({ key: 'A', state: 'front' });
    expect(navTarget('sb', st, screenOf, base.usedAt)).toEqual({ key: 'B', state: 'behind' });
  });
});

describe('FR-295 AC-887 最大化中の項目の押下（pressWindow）', () => {
  async function setup() {
    const m = await freshStore();
    const st = () => m.useLayout.getState();
    st().setPersona('事業部門');
    st().touch('summary');
    st().setMaximized('summary');
    return { ...m, st };
  }
  it('FR-295 AC-887 ① 前面の項目を押すと最小化せず、最大化が解ける', async () => {
    const { st, pressWindow } = await setup();
    pressWindow('summary', 'front', true);
    expect(st().maximized).toBeNull();
    expect(st().minimized[st().persona] ?? []).not.toContain('summary');
  });
  it('FR-295 AC-887 ② 背面の項目を押すと最大化が解け、押した項目が前面に出て、ほかは最小化されない', async () => {
    const { st, pressWindow } = await setup();
    const before = JSON.stringify(st().minimized);
    pressWindow('matrix', 'behind', true);
    expect(st().maximized).toBeNull();
    expect(st().usedAt['matrix']).toBeGreaterThan(st().usedAt['summary']!);
    expect(JSON.stringify(st().minimized)).toBe(before);
  });
  it('FR-295 AC-825 最大化中でない前面の項目の押下は従来どおり最小化', async () => {
    const { st, pressWindow } = await setup();
    st().setMaximized(null);
    pressWindow('summary', 'front', true);
    expect(st().minimized[st().persona] ?? []).toContain('summary');
  });
});

describe('FR-296 AC-886 最小化できる対象がないときの取り消し（Q-093 A: 通常時にも適用）', () => {
  it('FR-296 AC-886 保留でない通常時でも、対象がなく領域が足りなくなる再表示は取り消され、直前の状態へ戻る', async () => {
    const { useLayout, setWorkspaceArea } = await freshStore();
    setWorkspaceArea(1060, 530);
    const st = () => useLayout.getState();
    st().setPersona('事業部門');
    for (const k of ['issue-solution', 'discussion-tree', 'table', 'gantt']) st().setPinned(k, { x: 0, y: 0, w: 0.4, h: 0.4 }); // 合計 4（PARAM-136 以内＝保留でない）
    const snap = () => JSON.stringify([st().closed, st().parked, st().minimized, st().layouts, st().floats]);
    const before = snap();
    st().showComponent('priority');
    expect(snap()).toBe(before);
  });
});

describe('FR-296 AC-801 AC-883 最小化の対象は区画外の自由配置を含む（Q-094 A）', () => {
  it('FR-296 AC-883 区画外の自由配置が最も古いとき、それが最小化され、区画のコンポーネントは最小化されない', async () => {
    const { useLayout, setWorkspaceArea } = await freshStore();
    setWorkspaceArea(1280, 800);
    const st = () => useLayout.getState();
    st().setPersona('事業部門');
    st().setPinned('summary', { x: 0, y: 0, w: 0.3, h: 0.3 });
    st().setPinned('kpi-okr', { x: 0.7, y: 0, w: 0.3, h: 0.3 });
    const slots = ['issue-solution', 'discussion-tree', 'table', 'gantt'];
    const grid = [[0, 0.3], [0.5, 0.3], [0, 0.65], [0.5, 0.65]] as const;
    slots.forEach((k, i) => st().setFloat(k, { x: grid[i]![0], y: grid[i]![1], w: 0.5, h: 0.35 }));
    st().setFloat('whiteboard', { x: 0.3, y: 0.05, w: 0.4, h: 0.3 }); // 区画外
    // 区画外を最も古く、区画を新しくする
    st().touch('whiteboard');
    for (const k of slots) st().touch(k);
    const w0 = st().usedAt['whiteboard']!;
    expect(w0).toBeLessThan(st().usedAt['issue-solution']!);
    setWorkspaceArea(500, 800); // 領域が足りなくなる
    st().showComponent('priority');
    const off = [...(st().parked[st().persona] ?? []), ...(st().minimized[st().persona] ?? [])];
    for (const k of slots) expect(off).not.toContain(k);
    expect(st().closed[st().persona] ?? []).toEqual([]);
  });
});

describe('FR-296 AC-883 保留状態での再読込（Q-092 A）', () => {
  it('FR-296 AC-883 ピン止め 2・区画 4 の保留状態で再読込しても、保留は再計算されて続き、区画は最小化されない', async () => {
    const first = await freshStore();
    first.setWorkspaceArea(1280, 800);
    const f = () => first.useLayout.getState();
    f().setPersona('事業部門');
    f().setPinned('summary', { x: 0, y: 0, w: 0.3, h: 0.3 });
    f().setPinned('kpi-okr', { x: 0.7, y: 0, w: 0.3, h: 0.3 });
    const slots = ['issue-solution', 'discussion-tree', 'table', 'gantt'];
    const grid = [[0, 0.3], [0.5, 0.3], [0, 0.65], [0.5, 0.65]] as const;
    slots.forEach((k, i) => f().setFloat(k, { x: grid[i]![0], y: grid[i]![1], w: 0.5, h: 0.35 }));
    const second = await freshStore(first.storage.getItem('edb.layout')!);
    second.setWorkspaceArea(1280, 800);
    const s = () => second.useLayout.getState();
    expect(s().persona).toBe('事業部門');
    const off = [...(s().parked[s().persona] ?? []), ...(s().minimized[s().persona] ?? []), ...(s().closed[s().persona] ?? [])];
    for (const k of slots) { expect(off).not.toContain(k); expect(s().floats[s().persona]![k]).toBeDefined(); }
    // 復元時の最小サイズへの補正（AC-801）は上限判定より先: 補正だけでは最小化は起きない
    for (const k of slots) { const r = s().floats[s().persona]![k]!; expect(r.w * 1280).toBeGreaterThanOrEqual(360 - 0.5); expect(r.h * 800).toBeGreaterThanOrEqual(240 - 0.5); }
  });
});
