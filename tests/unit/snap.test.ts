// 画面端のスナップ（候補・配置・見た目の矩形）の単体・結合テスト。
// FR-152 AC-264 AC-265 AC-266 AC-267
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultLayout, keysOf, type Layout, type LayoutNode } from '../../src/workspace/layoutModel';
import { SNAP_LABEL, defaultSnapKind, nearestCorner, snapKindsFor, snapLayout, snapRect, type SnapKind } from '../../src/workspace/snap';

/** 葉（コンポーネントまたはタブのまとまり）の矩形を、木と作業領域から求める（重なりの検査用）。 */
function rects(node: LayoutNode, x = 0, y = 0, w = 1, h = 1): Array<{ keys: string[]; x: number; y: number; w: number; h: number }> {
  if (node.kind === 'tabs') return [{ keys: node.tabs, x, y, w, h }];
  const out: ReturnType<typeof rects> = [];
  let off = 0;
  node.children.forEach((c, i) => {
    const s = node.sizes[i]!;
    out.push(...(node.dir === 'row' ? rects(c, x + off * w, y, s * w, h) : rects(c, x, y + off * h, w, s * h)));
    off += s;
  });
  return out;
}

function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
}

const BASE: Layout = defaultLayout('事業部門'); // issue-solution / discussion-tree / gantt / table
const KEY = 'issue-solution';
const ALL: SnapKind[] = ['left', 'right', 'top', 'bottom', 'quad', 'third', 'tabs', 'maximize'];

describe('FR-152 スナップの配置', () => {
  // FR-152 AC-264
  it('FR-152 AC-264 左半分: 置いたコンポーネントが左半分（幅 1/2・高さ全体）になる', () => {
    const l = snapLayout(BASE, KEY, 'left')!;
    const r = rects(l).find((x) => x.keys.includes(KEY))!;
    expect(r.x).toBeCloseTo(0);
    expect(r.w).toBeCloseTo(0.5);
    expect(r.h).toBeCloseTo(1);
  });

  // FR-152 AC-265
  it.each(ALL)('FR-152 AC-265 %s: どの候補でも、コンポーネントは落ちず重ならず、全面を使う', (kind) => {
    const l = snapLayout(BASE, KEY, kind, { corner: 'br', edge: 'right', tabTarget: 'gantt' })!;
    expect([...keysOf(l)].sort()).toEqual([...keysOf(BASE)].sort());
    const rs = rects(l);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(overlap(rs[i]!, rs[j]!), `${kind}: ${rs[i]!.keys} と ${rs[j]!.keys}`).toBe(false);
    expect(rs.reduce((a, r) => a + r.w * r.h, 0)).toBeCloseTo(1);
  });

  // FR-152 AC-265
  it('FR-152 AC-265 元の木は変えない（取りやめ・やり直しで配置が崩れない）', () => {
    const before = JSON.stringify(BASE);
    snapLayout(BASE, KEY, 'quad');
    expect(JSON.stringify(BASE)).toBe(before);
  });

  // FR-152 AC-265
  it('FR-152 AC-265 コンポーネントが 1 つだけのときは、木を変えない', () => {
    const one: Layout = { kind: 'tabs', tabs: ['a'], active: 'a' };
    for (const k of ALL) expect(snapLayout(one, 'a', k)).toEqual(one);
  });

  // FR-152 AC-264
  it('FR-152 AC-264 4 分割は、置く角に置かれる', () => {
    for (const [corner, ex, ey] of [['tl', 0, 0], ['tr', 0.5, 0], ['bl', 0, 0.5], ['br', 0.5, 0.5]] as const) {
      const r = rects(snapLayout(BASE, KEY, 'quad', { corner })!).find((x) => x.keys.includes(KEY))!;
      expect([r.x, r.y, r.w, r.h]).toEqual([ex, ey, 0.5, 0.5]);
    }
  });

  // FR-152 AC-264
  it('FR-152 AC-264 3 分割は、端の側に置かれ、幅（高さ）は 1/3', () => {
    const left = rects(snapLayout(BASE, KEY, 'third', { edge: 'left' })!).find((x) => x.keys.includes(KEY))!;
    const right = rects(snapLayout(BASE, KEY, 'third', { edge: 'right' })!).find((x) => x.keys.includes(KEY))!;
    expect(left.x).toBeCloseTo(0);
    expect(left.w).toBeCloseTo(1 / 3);
    expect(right.x).toBeCloseTo(2 / 3);
  });

  // FR-152 AC-264
  it('FR-152 AC-264 タブ化は、指定した相手のタブにまとまる（相手がなければ最初の別のコンポーネント）', () => {
    const l = snapLayout(BASE, KEY, 'tabs', { tabTarget: 'gantt' })!;
    const group = rects(l).find((x) => x.keys.includes(KEY))!;
    expect(group.keys).toContain('gantt');
    const l2 = snapLayout(BASE, KEY, 'tabs', { tabTarget: 'nothing' })!;
    expect(rects(l2).find((x) => x.keys.includes(KEY))!.keys.length).toBe(2);
  });
});

describe('FR-152 候補の選び方', () => {
  // FR-152 AC-266
  it('FR-152 AC-266 ドラッグなしの手段も、同じ 8 つの候補（名前つき。最大化を含む）から選べる', () => {
    expect(snapKindsFor(false).map((k) => SNAP_LABEL[k])).toEqual(['左半分', '右半分', '上半分', '下半分', '4 分割', '3 分割', 'タブ化', '最大化']);
  });

  // FR-152 AC-267
  it('FR-152 AC-267 狭い画面（縦積み）では、成り立つ候補（上半分・下半分・タブ化）だけを示す', () => {
    expect(snapKindsFor(true)).toEqual(['top', 'bottom', 'tabs', 'maximize']);
    expect(defaultSnapKind(['left'], true)).toBe('tabs');
    expect(defaultSnapKind(['top'], true)).toBe('top');
    expect(defaultSnapKind(['bottom', 'left'], true)).toBe('bottom');
  });

  // FR-152 AC-264
  it('FR-152 AC-264 端に近づけたときの既定の候補: 辺なら半分、角なら 4 分割', () => {
    expect(defaultSnapKind(['left'], false)).toBe('left');
    expect(defaultSnapKind(['right'], false)).toBe('right');
    // 上端のドラッグの結果は最大化に統一する（上半分はキーボード・メニューで選ぶ。AC-793）
    expect(defaultSnapKind(['top'], false)).toBe('maximize');
    expect(defaultSnapKind(['bottom'], false)).toBe('bottom');
    expect(defaultSnapKind(['top', 'left'], false)).toBe('quad');
    expect(nearestCorner(0.1, 0.9)).toBe('bl');
    expect(nearestCorner(0.9, 0.1)).toBe('tr');
  });

  // FR-152 AC-264
  it('FR-152 AC-264 配置後の見た目の矩形（作業領域に対する割合）が候補ごとに決まる', () => {
    const a = { left: 100, top: 50, width: 600, height: 300 };
    expect(snapRect(a, 'left')).toEqual({ left: 100, top: 50, width: 300, height: 300 });
    expect(snapRect(a, 'right')).toEqual({ left: 400, top: 50, width: 300, height: 300 });
    expect(snapRect(a, 'top')).toEqual({ left: 100, top: 50, width: 600, height: 150 });
    expect(snapRect(a, 'bottom')).toEqual({ left: 100, top: 200, width: 600, height: 150 });
    expect(snapRect(a, 'quad', { corner: 'br' })).toEqual({ left: 400, top: 200, width: 300, height: 150 });
    expect(snapRect(a, 'third', { edge: 'right' })).toEqual({ left: 500, top: 50, width: 200, height: 300 });
    const tab = { left: 1, top: 2, width: 3, height: 4 };
    expect(snapRect(a, 'tabs', {}, tab)).toEqual(tab);
    // 最大化は作業領域いっぱい（FR-152 AC-793）
    expect(snapRect(a, 'maximize')).toEqual(a);
  });
});

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

beforeEach(() => { vi.unstubAllGlobals(); });

describe('FR-152 配置の保存・復元・既定へ', () => {
  async function fresh(storage = new MemoryStorage()) {
    vi.resetModules();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', { localStorage: storage });
    const mod = await import('../../src/store/layout');
    mod.setAvailableComponents(['issue-solution', 'discussion-tree', 'gantt', 'table']);
    return { ...mod, storage };
  }

  // FR-152 AC-264
  it('FR-152 AC-264 配置は保存され、新しいストア（再読込）でも同じ配置になり、既定に戻せる', async () => {
    const a = await fresh();
    a.useLayout.getState().setPersona('事業部門');
    a.useLayout.getState().snapTo('gantt', 'left');
    const placed = JSON.stringify(a.effectiveLayout(a.useLayout.getState()));
    const b = await fresh(a.storage);
    expect(JSON.stringify(b.effectiveLayout(b.useLayout.getState()))).toBe(placed);
    b.useLayout.getState().resetLayout();
    expect(JSON.stringify(b.effectiveLayout(b.useLayout.getState()))).not.toBe(placed);
  });

  // FR-152 AC-265
  it('FR-152 AC-265 配置しても、最小化の状態は変わらない', async () => {
    const a = await fresh();
    a.useLayout.getState().setPersona('事業部門');
    a.useLayout.getState().setMinimized('table', true);
    a.useLayout.getState().snapTo('gantt', 'quad', { corner: 'tl' });
    expect(a.useLayout.getState().minimized['事業部門']).toContain('table');
  });
});
