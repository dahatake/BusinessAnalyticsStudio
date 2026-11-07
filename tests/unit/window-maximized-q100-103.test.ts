// Q-100〜Q-103 A: 最大化中の、最小化中・非表示・雛形由来の背面の項目の押下（AC-887 ⑧）、モード切替・ゾーン結合（⑨）、
// 縮退でのピン止めの縦積み（AC-886・AC-497・FR-216）、背面の前面化での上限超過（AC-873 ⑧・AC-886）の単体・結合テスト
// FR-295 FR-296 FR-216 FR-297 FR-152 FR-110 AC-497 AC-797 AC-825 AC-873 AC-886 AC-887
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leaf, split } from '../../src/workspace/layoutModel';
import { stackedCells } from '../../src/workspace/compact';
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
async function freshStore() {
  vi.resetModules();
  const storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
  const mod = await import('../../src/store/layout');
  const actions = await import('../../src/workspace/windowActions');
  mod.setAvailableComponents(ALL);
  return { ...mod, ...actions, storage };
}
beforeEach(() => { vi.unstubAllGlobals(); });

// A=summary B=matrix K=ranking(ピン止め) M=gantt(最小化中) X=architecture(閉じた) Y=products(雛形由来の背面)
const tree = split('row', [leaf('summary'), leaf('matrix'), leaf('ranking'), leaf('products'), leaf('gantt')], [0.2, 0.2, 0.2, 0.2, 0.2]);
async function setup() {
  const m = await freshStore();
  const st = () => m.useLayout.getState();
  st().setPersona('事業部門');
  m.useLayout.setState((s) => ({
    layouts: { ...s.layouts, [s.persona]: tree },
    pinned: { ...s.pinned, [s.persona]: { ranking: { x: 0.66, y: 0, w: 0.33, h: 1 } } },
  }));
  st().setBehind(['products']);
  st().setMinimized('gantt', true);
  st().hideComponent('architecture');
  st().touch('summary');
  st().setMaximized('summary');
  const states = () => {
    const s = st();
    return windowStates({
      keys: ['summary', 'matrix', 'ranking', 'gantt', 'architecture', 'products'],
      layout: s.layouts['事業部門'] ?? tree,
      minimized: new Set(s.minimized['事業部門'] ?? []),
      closed: new Set(s.closed['事業部門'] ?? []),
      behind: new Set(s.behind['事業部門'] ?? []),
      usedAt: s.usedAt,
      maximized: s.maximized,
    });
  };
  return { ...m, st, states };
}

describe('FR-295 AC-887 ⑧ Q-100 A・Q-103 A: 最大化中の M・X・Y の押下', () => {
  it('FR-295 AC-887 ⑤ 前提: B・K は最大化由来の背面、M は最小化中、X は非表示、Y は雛形由来の背面のまま', async () => {
    const { states } = await setup();
    expect(states()).toMatchObject({ summary: 'front', matrix: 'behind', ranking: 'behind', gantt: 'minimized', architecture: 'closed', products: 'behind' });
  });
  it('FR-295 AC-887 ⑧ 最小化中の M の押下: 最大化が解けて B・K が戻り、M が前面に出る。X・Y の状態は変わらない', async () => {
    const { st, states, pressWindow } = await setup();
    pressWindow('gantt', 'minimized', true);
    expect(st().maximized).toBeNull();
    expect(st().minimized['事業部門'] ?? []).not.toContain('gantt');
    expect(states()).toMatchObject({ gantt: 'front', matrix: 'visible', ranking: 'visible', architecture: 'closed', products: 'behind' });
    expect(st().pinned['事業部門']).toHaveProperty('ranking');
  });
  it('FR-295 AC-887 ⑧ 非表示の X の押下: 最大化が解けて B・K が戻り、X が再表示されて前面に出る。M・Y の状態は変わらない', async () => {
    const { st, states, pressWindow } = await setup();
    pressWindow('architecture', 'closed', false);
    expect(st().maximized).toBeNull();
    expect(states()).toMatchObject({ matrix: 'visible', ranking: 'visible', gantt: 'minimized', products: 'behind' });
    expect(states().architecture).not.toBe('closed');
    expect(st().closed['事業部門'] ?? []).not.toContain('architecture');
  });
  it('FR-295 AC-887 ⑧ Q-103 雛形由来の背面 Y の押下: 最大化が解けて B・K が戻り、Y が前面に出て通常の表示中になる。M・X は変わらない', async () => {
    const { st, states, pressWindow } = await setup();
    pressWindow('products', 'behind', false);
    expect(st().maximized).toBeNull();
    expect(states()).toMatchObject({ products: 'front', matrix: 'visible', ranking: 'visible', gantt: 'minimized', architecture: 'closed' });
    expect(st().behind['事業部門'] ?? []).not.toContain('products');
  });
  it('FR-295 AC-887 ② 最大化由来の背面 B の押下は、最大化を解いて B が前面（既存）。Y は背面のまま', async () => {
    const { st, states, pressWindow } = await setup();
    pressWindow('matrix', 'behind', true);
    expect(st().maximized).toBeNull();
    expect(states()).toMatchObject({ matrix: 'front', summary: 'visible', products: 'behind', gantt: 'minimized' });
  });
  it('FR-296 AC-887 ⑧ Q-102 前面化後に上限（PARAM-136）を超えるとき、最小化できる対象があれば最も長く使っていないものを最小化し、なければ超過を許す', async () => {
    // 対象あり: 表示中 4（A=summary・B=matrix・C=issue-solution・K=ranking ピン止め）に、最小化中 M を押す → ピン止め以外で最も古い B が最小化される
    const m = await freshStore();
    const st = () => m.useLayout.getState();
    st().setPersona('事業部門');
    const four = split('row', [leaf('summary'), leaf('matrix'), leaf('issue-solution'), leaf('ranking')], [0.25, 0.25, 0.25, 0.25]);
    m.useLayout.setState((s) => ({ layouts: { ...s.layouts, [s.persona]: four }, pinned: { ...s.pinned, [s.persona]: { ranking: { x: 0.75, y: 0, w: 0.25, h: 1 } } } }));
    st().touch('matrix'); st().touch('issue-solution'); st().touch('summary'); st().touch('ranking');
    st().setMinimized('gantt', true);
    st().setMaximized('summary');
    m.pressWindow('gantt', 'minimized', true);
    expect(st().maximized).toBeNull();
    const min = st().minimized['事業部門'] ?? [];
    expect(min).toContain('matrix');
    expect(min).not.toContain('gantt');
    expect(min).not.toContain('ranking');
    // 対象なし（表示中がピン止めだけ）: 超過を許し、取り消さない
    const m2 = await freshStore();
    const s2 = () => m2.useLayout.getState();
    s2().setPersona('事業部門');
    const pins = ['summary', 'matrix', 'issue-solution', 'ranking'];
    m2.useLayout.setState((s) => ({
      layouts: { ...s.layouts, [s.persona]: split('row', pins.map((k) => leaf(k)), [0.25, 0.25, 0.25, 0.25]) },
      pinned: { ...s.pinned, [s.persona]: Object.fromEntries(pins.map((k, i) => [k, { x: i * 0.25, y: 0, w: 0.25, h: 1 }])) },
    }));
    s2().setMinimized('gantt', true);
    s2().setMaximized('summary');
    m2.pressWindow('gantt', 'minimized', true);
    expect(s2().maximized).toBeNull();
    expect(s2().minimized['事業部門'] ?? []).toEqual([]);
  });
});

describe('FR-295 AC-873 ⑧・AC-886 Q-102 A: 背面の前面化は、最小化できる対象がなければ取り消さず上限超過を許す', () => {
  it('FR-295 AC-873 全表示中がピン止めだけのとき、背面 Y を前面に出すと表示中が上限を超えるが、誰も最小化されない', async () => {
    const m = await freshStore();
    const st = () => m.useLayout.getState();
    st().setPersona('事業部門');
    const pins = ['summary', 'matrix', 'issue-solution', 'ranking'];
    m.useLayout.setState((s) => ({
      layouts: { ...s.layouts, [s.persona]: split('row', pins.map((k) => leaf(k)), [0.25, 0.25, 0.25, 0.25]) },
      pinned: { ...s.pinned, [s.persona]: Object.fromEntries(pins.map((k, i) => [k, { x: i * 0.25, y: 0, w: 0.25, h: 1 }])) },
    }));
    st().setBehind(['products']);
    m.pressWindow('products', 'behind', false);
    expect(st().behind['事業部門'] ?? []).not.toContain('products');
    expect(st().minimized['事業部門'] ?? []).toEqual([]);
    expect(st().closed['事業部門'] ?? []).toEqual([]);
  });
});

describe('FR-216 AC-497・AC-886 Q-101 A: 縮退の縦積みでピン止めはタブ化せず先頭', () => {
  const pins = new Set(['b']);
  it('FR-216 AC-497 ピン止めを含むタブのまとまりは、ピン止めだけを単独の単位として先頭へ取り出す', () => {
    const l = split('col', [leaf('a'), { kind: 'tabs', tabs: ['b', 'c'], active: 'c' }, leaf('d')], [1 / 3, 1 / 3, 1 / 3]);
    const cells = stackedCells(l, pins);
    expect(cells.map((c) => c.tabs)).toEqual([['b'], ['a'], ['c'], ['d']]);
  });
  it('AC-497 ピン止めがなければ、従来の縦積みの順（画面の上から下）のまま', () => {
    const l = split('row', [leaf('a'), leaf('c'), leaf('d')], [1 / 3, 1 / 3, 1 / 3]);
    expect(stackedCells(l, new Set()).map((c) => c.tabs)).toEqual([['a'], ['c'], ['d']]);
    expect(stackedCells(null, pins)).toEqual([]);
  });
  it('AC-886 ピン止めが複数あっても、それぞれ単独（タブ化しない）で、元の順を保つ', () => {
    const l = split('row', [{ kind: 'tabs', tabs: ['p', 'q'], active: 'p' }, leaf('r')], [0.5, 0.5]);
    expect(stackedCells(l, new Set(['p', 'q'])).map((c) => c.tabs)).toEqual([['p'], ['q'], ['r']]);
  });
});
