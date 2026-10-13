// コンポーネントの最小化と左メニューの最小化（保存・復元・既定に戻す）、動きの条件の単体・結合テスト。
// FR-151 AC-260 AC-262 / NFR-UX-008 AC-268 AC-269
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { motionAllowed } from '../../src/motion/useFoldMotion';

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const ALL = ['canvas', 'summary', 'matrix', 'ranking', 'issue-solution', 'discussion-tree', 'gantt', 'architecture', 'knowledge-graph', 'products', 'view3d', 'mock-app', 'table'];

async function freshStore(storage = new MemoryStorage()) {
  vi.resetModules();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
  const mod = await import('../../src/store/layout');
  mod.setAvailableComponents(ALL);
  return { ...mod, storage };
}

beforeEach(() => { vi.unstubAllGlobals(); });

describe('FR-151 最小化の状態', () => {
  // FR-151 AC-262
  it('FR-151 AC-262 最小化とメニューの最小化は保存され、再読込（新しいストア）で同じ状態に復元される', async () => {
    const a = await freshStore();
    a.useLayout.getState().setMinimized('summary', true);
    a.useLayout.getState().setNavMin(true);
    const b = await freshStore(a.storage);
    expect(b.useLayout.getState().minimized['経営層'] ?? b.useLayout.getState().minimized[b.useLayout.getState().persona]).toContain('summary');
    expect(b.useLayout.getState().navMin).toBe(true);
  });

  // FR-151 AC-262
  it('FR-151 AC-262 「既定のレイアウトに戻す」で、最小化もメニューの最小化も既定（なし）に戻る', async () => {
    const { useLayout } = await freshStore();
    useLayout.getState().setMinimized('summary', true);
    useLayout.getState().setNavMin(true);
    useLayout.getState().resetLayout();
    const st = useLayout.getState();
    expect(st.minimized[st.persona] ?? []).toEqual([]);
    expect(st.navMin).toBe(false);
  });

  // FR-151 AC-260 AC-262
  it('FR-151 AC-260 最小化と復元はレイアウトの木・選択を変えず、操作の対象（最大化）にすると最小化は解ける', async () => {
    const { useLayout, effectiveLayout } = await freshStore();
    const before = JSON.stringify(effectiveLayout(useLayout.getState()));
    useLayout.getState().setMinimized('summary', true);
    expect(JSON.stringify(effectiveLayout(useLayout.getState()))).toBe(before);
    useLayout.getState().setMaximized('summary');
    const st = useLayout.getState();
    expect(st.minimized[st.persona] ?? []).not.toContain('summary');
    expect(st.maximized).toBe('summary');
  });

  // FR-151 AC-260
  it('FR-151 AC-260 最小化すると最大化は解け、同じコンポーネントを二重に記録しない', async () => {
    const { useLayout } = await freshStore();
    useLayout.getState().setMaximized('summary');
    useLayout.getState().setMinimized('summary', true);
    useLayout.getState().setMinimized('summary', true);
    const st = useLayout.getState();
    expect(st.maximized).toBeNull();
    expect((st.minimized[st.persona] ?? []).filter((k) => k === 'summary')).toHaveLength(1);
  });

  // FR-151 AC-262（壊れた保存値は無視する）
  it('FR-151 AC-262 壊れた保存値の最小化は無視し、既定の状態で起動する', async () => {
    const s = new MemoryStorage();
    s.setItem('edb.layout', JSON.stringify({ state: { minimized: { 経営層: [1, 2] }, navMin: 'yes' }, version: 1 }));
    const { useLayout } = await freshStore(s);
    const st = useLayout.getState();
    expect(st.minimized[st.persona] ?? []).toEqual([]);
    expect(st.navMin).toBe(false);
  });
});

describe('NFR-UX-008 動きの条件', () => {
  // NFR-UX-008 AC-268 AC-269
  it('NFR-UX-008 AC-269 再生中で、視差効果を減らす設定でないときだけ動きを付ける', () => {
    expect(motionAllowed(true, false)).toBe(true);
    expect(motionAllowed(false, false)).toBe(false); // 停止中
    expect(motionAllowed(true, true)).toBe(false); // prefers-reduced-motion: reduce
    expect(motionAllowed(false, true)).toBe(false);
  });
});
