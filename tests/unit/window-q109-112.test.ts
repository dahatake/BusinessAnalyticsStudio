// Q-109・Q-112 A: 最大化を解いて元に戻した A 自身は最小化できる対象に数えない（FR-296 AC-886・AC-887）。
// 最大化中に閉じた項目を再表示するとき、置き場所がなければ取り消して最大化も元へ戻し、上限（PARAM-136）の超過だけを許す（AC-887 ⑧）
// FR-295 FR-296 AC-886 AC-887
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leaf, split } from '../../src/workspace/layoutModel';

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
async function freshStore() {
  vi.resetModules();
  const storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
  const mod = await import('../../src/store/layout');
  const actions = await import('../../src/workspace/windowActions');
  mod.setAvailableComponents(ALL);
  return { ...mod, ...actions };
}
beforeEach(() => { vi.unstubAllGlobals(); });

const P = '事業部門';
const four = ['summary', 'matrix', 'issue-solution', 'ranking'];

describe('FR-296 AC-887 ⑧ Q-109 A: 最大化を解いて元に戻した A 自身は最小化できる対象に数えない', () => {
  it('FR-296 AC-887 Q-109 A が最も古くても、閉じた X の再表示で上限を超えるとき、A ではなく A 以外で最も古いものが最小化される', async () => {
    const m = await freshStore();
    const st = () => m.useLayout.getState();
    st().setPersona(P);
    m.useLayout.setState((s) => ({
      layouts: { ...s.layouts, [s.persona]: split('row', four.map((k) => leaf(k)), [0.25, 0.25, 0.25, 0.25]) },
      pinned: { ...s.pinned, [s.persona]: { ranking: { x: 0.75, y: 0, w: 0.25, h: 1 } } },
    }));
    st().hideComponent('architecture');
    for (const k of ['summary', 'matrix', 'issue-solution', 'ranking']) st().touch(k); // A=summary が最も古い
    st().setMaximized('summary');
    m.pressWindow('architecture', 'closed', false);
    expect(st().maximized).toBeNull();
    expect(st().closed[P] ?? []).not.toContain('architecture');
    const min = st().minimized[P] ?? [];
    expect(min).toEqual(['matrix']);
  });
  it('FR-296 AC-887 Q-109 A 以外に最小化できる対象がないとき（A はピン止めでない）、上限超過を許し A は最小化されない', async () => {
    const m = await freshStore();
    const st = () => m.useLayout.getState();
    st().setPersona(P);
    const ks = ['summary', 'matrix', 'issue-solution', 'ranking'];
    m.useLayout.setState((s) => ({
      layouts: { ...s.layouts, [s.persona]: split('row', ks.map((k) => leaf(k)), [0.25, 0.25, 0.25, 0.25]) },
      pinned: { ...s.pinned, [s.persona]: Object.fromEntries(ks.slice(1).map((k, i) => [k, { x: 0.25 + i * 0.25, y: 0, w: 0.25, h: 1 }])) },
    }));
    st().hideComponent('architecture');
    st().setMaximized('summary');
    m.pressWindow('architecture', 'closed', false);
    expect(st().closed[P] ?? []).not.toContain('architecture');
    expect(st().minimized[P] ?? []).toEqual([]);
  });
});

describe('FR-295 AC-887 ⑧ Q-112 A: 最大化中に閉じた項目の再表示で置き場所がなければ取り消し、最大化も元へ戻す', () => {
  async function pinnedFull() {
    const m = await freshStore();
    const st = () => m.useLayout.getState();
    st().setPersona(P);
    const pins = ['summary', 'matrix', 'ranking'];
    m.useLayout.setState((s) => ({
      layouts: { ...s.layouts, [s.persona]: split('row', [...pins, 'architecture'].map((k) => leaf(k)), [0.25, 0.25, 0.25, 0.25]) },
      pinned: { ...s.pinned, [s.persona]: Object.fromEntries(pins.map((k, i) => [k, { x: i * 0.25, y: 0, w: 0.25, h: 1 }])) },
    }));
    st().hideComponent('architecture');
    return { ...m, st };
  }
  it('FR-295 AC-887 ⑧ Q-112 下限（PARAM-134）で 3 つが幅いっぱいのとき、再表示は取り消され X は閉じたまま、最大化は A へ戻る', async () => {
    const { st, pressWindow, setWorkspaceArea } = await pinnedFull();
    setWorkspaceArea(3 * 360, 800);
    st().setMaximized('summary');
    pressWindow('architecture', 'closed', false);
    expect(st().closed[P] ?? []).toContain('architecture');
    expect(st().maximized).toBe('summary');
    expect(st().minimized[P] ?? []).toEqual([]);
  });
  it('FR-295 AC-887 ⑧ Q-107 上限（PARAM-136）の超過だけで置き場所があるときは取り消さず、最大化は解けて X が再表示される', async () => {
    const { st, pressWindow, setWorkspaceArea } = await pinnedFull();
    setWorkspaceArea(6 * 360, 800);
    st().setMaximized('summary');
    pressWindow('architecture', 'closed', false);
    expect(st().closed[P] ?? []).not.toContain('architecture');
    expect(st().maximized).toBeNull();
  });
});
