// FR-295 背面の保存・復元（Q-088）・前面化（Q-083）・背面の並び（Q-084）、FR-110 既定に戻す（Q-086）のストアの単体・結合テスト
// AC-865 AC-873 AC-872
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const R = (x: number) => ({ x, y: 0, w: 0.25, h: 0.5 });

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

/** 6 つを自由配置にし、c・d を背面へ回した状態（雛形由来） */
function arrange(s: ReturnType<Awaited<ReturnType<typeof freshStore>>['useLayout']['getState']>) {
  s.setPersona('事業部門');
  s.setFloats({ summary: R(0), matrix: R(0.25), ranking: R(0.5), 'issue-solution': R(0.75), 'discussion-tree': R(0.1), gantt: R(0.6) });
}

describe('FR-295 背面の保存・復元（AC-865・AC-873 ⑤。Q-088 A）', () => {
  it('FR-295 AC-873 ⑤ 再読込後も背面のまま・並び・背面へ回る前の位置が保たれる', async () => {
    const first = await freshStore();
    arrange(first.useLayout.getState());
    first.useLayout.getState().setBehind(['discussion-tree', 'gantt']);
    const raw = first.storage.getItem('edb.layout')!;
    const second = await freshStore(raw);
    const st = second.useLayout.getState();
    expect(st.behind['事業部門']).toEqual(['discussion-tree', 'gantt']);
    expect(st.floats['事業部門']!['gantt']).toEqual(R(0.6)); // 背面へ回る前の位置・大きさ
  });

  it('FR-110 AC-873 ③ 既定に戻すと背面は解除され、その後の再読込でも復活しない（Q-086 A）', async () => {
    const first = await freshStore();
    arrange(first.useLayout.getState());
    first.useLayout.getState().setBehind(['gantt']);
    first.useLayout.getState().resetLayout();
    expect(first.useLayout.getState().behind['事業部門']).toBeUndefined();
    expect(first.useLayout.getState().floats['事業部門']).toBeUndefined();
    const second = await freshStore(first.storage.getItem('edb.layout')!);
    expect(second.useLayout.getState().behind['事業部門']).toBeUndefined();
    expect(second.useLayout.getState().floats['事業部門']).toBeUndefined();
  });
});

describe('FR-295 背面の並びと前面化（Q-083・Q-084）', () => {
  it('FR-295 AC-873 ④ 新しく背面へ回ったものは後ろに並び、すでに背面のものは順を保つ', async () => {
    const { useLayout } = await freshStore();
    arrange(useLayout.getState());
    useLayout.getState().setBehind(['gantt']);
    useLayout.getState().setBehind(['gantt', 'discussion-tree']);
    expect(useLayout.getState().behind['事業部門']).toEqual(['gantt', 'discussion-tree']);
  });

  it('FR-295 AC-872 ⑧ 背面から前面に出すと背面でなくなり、位置・大きさは背面へ回る前のまま。上限以内なら最小化しない', async () => {
    const { useLayout } = await freshStore();
    arrange(useLayout.getState());
    useLayout.getState().setBehind(['discussion-tree', 'gantt']);
    useLayout.getState().bringFromBehind('gantt');
    const st = useLayout.getState();
    expect(st.behind['事業部門']).toEqual(['discussion-tree']);
    expect(st.floats['事業部門']!['gantt']).toEqual(R(0.6));
  });

  it('FR-295 AC-872 ⑧ 上限（PARAM-136）を超えるときは、前面に出したもの以外で最も長く使っていないものを 1 つ最小化する（保留中でない）', async () => {
    const { useLayout, effectiveLayout } = await freshStore();
    const s = useLayout.getState();
    s.setPersona('事業部門');
    // 表示中を 4 つだけにする: 自由配置 4 つ（それ以外は最小化）。使用の古さ: summary < matrix < ranking < issue-solution
    const keysOfAll = ALL.slice();
    for (const k of keysOfAll) if (!['summary', 'matrix', 'ranking', 'issue-solution', 'gantt'].includes(k)) useLayout.getState().setMinimized(k, true);
    useLayout.getState().setFloats({ summary: R(0), matrix: R(0.25), ranking: R(0.5), 'issue-solution': R(0.75), gantt: R(0.6) });
    for (const k of ['summary', 'matrix', 'ranking', 'issue-solution']) useLayout.getState().raise(k);
    useLayout.getState().setBehind(['gantt']);
    void effectiveLayout;
    const before = (useLayout.getState().minimized['事業部門'] ?? []).length;
    useLayout.getState().bringFromBehind('gantt');
    const st = useLayout.getState();
    expect(st.behind['事業部門'] ?? []).toEqual([]);
    const mins = st.minimized['事業部門'] ?? [];
    expect(mins.length).toBe(before + 1);
    expect(mins).toContain('summary'); // 最も長く使っていない
    expect(mins).not.toContain('gantt');
  });
});
