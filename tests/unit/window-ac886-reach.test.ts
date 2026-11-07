// FR-296 AC-886 の再表示以外（大きさの変更・スナップ・押し出しを起こした移動）の到達性と、FR-184 最大化が押し出しの対象にならないことの単体テスト
// FR-296 FR-184 FR-152 AC-886 AC-801
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keysOf, leaf, split, toggleDirection } from '../../src/workspace/layoutModel';
import { enforceMin, fitsWidth, floorFloat, leafSizes, MIN_WINDOW_H, MIN_WINDOW_W, needWidth } from '../../src/workspace/windowLimits';

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
  mod.setAvailableComponents(ALL);
  return mod;
}
beforeEach(() => { vi.unstubAllGlobals(); });

const W = 1200;
const H = 700;
const eq = (n: number) => Array.from({ length: n }, () => 1 / n);

describe('FR-296 AC-886 大きさの変更・スナップ・移動は、下限を割らず取り消す場面がない（再表示以外では到達しない）', () => {
  it('FR-296 AC-886 大きさの変更: どんな分割比でも、収まる木は enforceMin で全葉が下限（PARAM-134・PARAM-135）以上になる', () => {
    const shapes = [
      split('row', [leaf('summary'), leaf('matrix')], [0.5, 0.5]),
      split('row', [leaf('summary'), leaf('matrix')], [0.99, 0.01]),
      split('row', [leaf('summary'), leaf('matrix'), leaf('ranking')], [0.9, 0.05, 0.05]),
      split('row', [leaf('summary'), split('col', [leaf('matrix'), leaf('ranking')], [0.97, 0.03])], [0.02, 0.98]),
    ];
    for (const t of shapes) {
      expect(fitsWidth(t, W)).toBe(true);
      const out = enforceMin(t, W, H);
      for (const l of leafSizes(out, W, H)) {
        expect(l.w).toBeGreaterThanOrEqual(MIN_WINDOW_W - 0.5);
        expect(l.h).toBeGreaterThanOrEqual(MIN_WINDOW_H - 0.5);
      }
    }
  });
  it('FR-296 AC-886 大きさの変更: 境界の操作（resizeAt・resizeByKeys）は葉の数・構造を変えず、収まる木は収まったまま', async () => {
    const { useLayout, setWorkspaceArea } = await freshStore();
    setWorkspaceArea(W, H);
    const st = () => useLayout.getState();
    st().setPersona('事業部門');
    const t = split('row', [leaf('summary'), leaf('matrix'), leaf('ranking')], eq(3));
    useLayout.setState((s) => ({ layouts: { ...s.layouts, [s.persona]: t } }));
    const need = needWidth(t);
    for (const d of [-5000, 300, 0.3]) {
      st().resizeAt([], 0, d);
      st().resizeByKeys('matrix', 'ranking', d);
      const l = st().layouts[st().persona]!;
      expect(keysOf(l).sort()).toEqual(['matrix', 'ranking', 'summary']);
      expect(needWidth(l)).toBe(need);
      expect(fitsWidth(l, W)).toBe(true);
      for (const x of leafSizes(enforceMin(l, W, H), W, H)) expect(x.w).toBeGreaterThanOrEqual(MIN_WINDOW_W - 0.5);
    }
    expect(st().closed[st().persona] ?? []).toEqual([]);
    expect(st().minimized[st().persona] ?? []).toEqual([]);
  });
  it('FR-296 AC-886 自由配置の大きさの変更・移動・スナップ（setFloat・setFloats）は下限へ補正され、領域の外へ出ない', async () => {
    const { clampFloat, setWorkspaceArea } = await freshStore();
    setWorkspaceArea(W, H);
    for (const r of [{ x: 0, y: 0, w: 0.01, h: 0.01 }, { x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, { x: -1, y: 5, w: 3, h: 0 }, { x: NaN, y: NaN, w: NaN, h: NaN }]) {
      const c = clampFloat(r);
      expect(c.w * W).toBeGreaterThanOrEqual(MIN_WINDOW_W - 0.001);
      expect(c.h * H).toBeGreaterThanOrEqual(MIN_WINDOW_H - 0.001);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9);
      const f = floorFloat(r.w > 0 ? r : { ...r, w: 0.1, h: 0.1 }, W, H);
      expect(f.w * W).toBeGreaterThanOrEqual(MIN_WINDOW_W - 0.001);
    }
  });
  it('FR-296 AC-886 自由配置は重なれるので、数が増えても領域は足りなくならない（押し出しは木の幅の不足でだけ起こる）', async () => {
    const { useLayout, setWorkspaceArea } = await freshStore();
    setWorkspaceArea(W, H);
    const st = () => useLayout.getState();
    st().setPersona('事業部門');
    ALL.slice(0, 8).forEach((k, i) => st().setFloat(k, { x: 0.05 * i, y: 0.05 * i, w: 0.4, h: 0.4 }));
    for (const r of Object.values(st().floats[st().persona] ?? {})) {
      expect(r.w * W).toBeGreaterThanOrEqual(MIN_WINDOW_W - 0.001);
      expect(r.h * H).toBeGreaterThanOrEqual(MIN_WINDOW_H - 0.001);
    }
    expect(st().minimized[st().persona] ?? []).toEqual([]);
    expect(st().parked[st().persona] ?? []).toEqual([]);
  });
  it('FR-296 AC-886 木の移動（toggleDirection・moveComponent・dropMove・snapTo）で木の幅が領域を超える場面を総当たりで探す', async () => {
    const { useLayout, setWorkspaceArea } = await freshStore();
    setWorkspaceArea(W, H);
    const st = () => useLayout.getState();
    st().setPersona('事業部門');
    const keys = ['summary', 'matrix', 'ranking', 'table'];
    const starts = [
      split('row', [leaf('summary'), leaf('matrix')], eq(2)),
      split('col', [leaf('summary'), leaf('matrix'), leaf('ranking'), leaf('table')], eq(4)),
      split('row', [leaf('summary'), split('col', [leaf('matrix'), leaf('ranking'), leaf('table')], eq(3))], eq(2)),
      split('col', [split('row', [leaf('summary'), leaf('matrix')], eq(2)), split('row', [leaf('ranking'), leaf('table')], eq(2))], eq(2)),
    ];
    const over: string[] = [];
    for (const [si, t] of starts.entries()) {
      for (const k of keys.filter((x) => keysOf(t).includes(x))) {
        const ops: Array<[string, () => void]> = [
          ['toggle', () => st().toggleDirection(k)],
          ['left', () => st().moveComponent(k, 'left')],
          ['right', () => st().moveComponent(k, 'right')],
          ['up', () => st().moveComponent(k, 'up')],
          ['down', () => st().moveComponent(k, 'down')],
          ...keys.filter((o) => o !== k).flatMap((o): Array<[string, () => void]> => (['left', 'right', 'top', 'bottom'] as const).map((z) => [`drop:${o}:${z}`, () => st().dropMove(k, o, z)])),
        ];
        for (const [name, run] of ops) {
          useLayout.setState((s) => ({ layouts: { ...s.layouts, [s.persona]: t }, floats: {}, pinned: {}, closed: {}, parked: {}, minimized: {} }));
          run();
          const l = st().layouts[st().persona]!;
          if (l && !fitsWidth(l, W)) over.push(`${si}:${k}:${name}`);
        }
      }
    }
    // 向きの変更も含め、どの操作の後も木は領域に収まる（足りなくなる向きの変更は最小化か取り消しで収める）
    expect(over).toEqual([]);
    // 素の向きの変更（モデル）は幅を広げうる＝取り消しが発動しうる唯一の再表示以外の場面
    expect(needWidth(toggleDirection(starts[1]!, 'summary')!)).toBeGreaterThan(W);
  });
  it('FR-296 AC-886 向きの変更で幅が足りなくなるとき、最小化できる対象があれば最も古いものを最小化して収める（AC-801）', async () => {
    const { useLayout, setWorkspaceArea } = await freshStore();
    setWorkspaceArea(W, H);
    const st = () => useLayout.getState();
    st().setPersona('事業部門');
    const t = split('col', [leaf('summary'), leaf('matrix'), leaf('ranking'), leaf('table')], eq(4));
    useLayout.setState((s) => ({ layouts: { ...s.layouts, [s.persona]: t }, usedAt: { summary: 9, matrix: 8, ranking: 1, table: 7 } }));
    expect(st().toggleDirection('summary')).toBe(true);
    const l = st().layouts[st().persona]!;
    expect(fitsWidth(l, W)).toBe(true);
    expect(keysOf(l)).not.toContain('ranking');
    expect(st().parked[st().persona]).toEqual(['ranking']);
  });
  it('FR-296 AC-886 向きの変更で幅が足りなくなり、最小化できる対象がないときは取り消され、直前の状態のまま', async () => {
    const { useLayout, setWorkspaceArea } = await freshStore();
    setWorkspaceArea(700, H);
    const st = () => useLayout.getState();
    st().setPersona('事業部門');
    const t = split('col', [leaf('summary'), leaf('matrix')], eq(2));
    useLayout.setState((s) => ({ layouts: { ...s.layouts, [s.persona]: t }, behind: { ...s.behind, [s.persona]: ['matrix'] } }));
    const snap = () => JSON.stringify([st().closed, st().parked, st().minimized, st().layouts, st().floats, st().usedAt]);
    const before = snap();
    expect(st().toggleDirection('summary')).toBe(false);
    expect(snap()).toBe(before);
    // 背面でなければ、同じ操作は最小化で収まる
    useLayout.setState((s) => ({ behind: { ...s.behind, [s.persona]: [] } }));
    expect(st().toggleDirection('summary')).toBe(true);
    expect(fitsWidth(st().layouts[st().persona]!, 700)).toBe(true);
  });
});

describe('FR-184 FR-152 最大化の重ね表示は押し出しの対象にならない', () => {
  it('FR-184 FR-152 最大化中に再表示で領域が足りなくなっても、最大化した対象は最小化されず、最大化も解けない（押し出さない）', async () => {
    const { useLayout, setWorkspaceArea } = await freshStore();
    setWorkspaceArea(1280, 800);
    const st = () => useLayout.getState();
    st().setPersona('事業部門');
    st().touch('summary');
    st().setMaximized('summary'); // 最も古く使っていない候補に見えるが、重ね表示は対象外
    for (const k of ['matrix', 'ranking', 'table']) st().touch(k);
    setWorkspaceArea(500, 800);
    st().showComponent('priority');
    expect(st().maximized).toBe('summary');
    const off = [...(st().parked[st().persona] ?? []), ...(st().minimized[st().persona] ?? [])];
    expect(off).not.toContain('summary');
    expect(st().closed[st().persona] ?? []).not.toContain('summary');
  });
  it('FR-184 FR-152 最大化の重ね表示（maximized）はレイアウトの木・自由配置に入らず、領域の判定（fitsWidth・押し出し）に数えない', async () => {
    const { useLayout, setWorkspaceArea } = await freshStore();
    setWorkspaceArea(1280, 800);
    const st = () => useLayout.getState();
    st().setPersona('事業部門');
    const before = JSON.stringify([st().layouts, st().floats, st().parked[st().persona] ?? [], st().minimized[st().persona] ?? []]);
    st().setMaximized('summary');
    st().setMaximized(null);
    expect(JSON.stringify([st().layouts, st().floats, st().parked[st().persona] ?? [], st().minimized[st().persona] ?? []])).toBe(before);
  });
});
