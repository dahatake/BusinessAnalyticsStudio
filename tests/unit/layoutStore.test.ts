// レイアウトのストア（ペルソナ別の保存・復元・既定に戻す）とパネルのキー操作の単体・結合テスト。
// FR-012 FR-013 FR-014 FR-109 FR-110
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arrangeAll, defaultLayout, keysOf, type Layout } from '../../src/workspace/layoutModel';
import { panelKeyAction, runPanelKeyAction, titleDoubleClick, type KeyLike } from '../../src/components/panelKeys';

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

/** 新しいストアを、保存値（あれば）を読んだ状態で作る。 */
async function freshStore(available: readonly string[], saved?: unknown) {
  vi.resetModules();
  const storage = new MemoryStorage();
  if (saved !== undefined) storage.setItem('edb.layout', typeof saved === 'string' ? saved : JSON.stringify(saved));
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage }); // zustand の persist は window.localStorage を使う
  const mod = await import('../../src/store/layout');
  mod.setAvailableComponents(available);
  return { ...mod, storage };
}

beforeEach(() => { vi.unstubAllGlobals(); });

describe('FR-014 AC-017 / FR-110 AC-135 レイアウトのストア', () => {
  // FR-014 AC-017
  it('FR-014 AC-017 setPersona でペルソナ別の既定のレイアウトに切り替わり、最大化は解除される', async () => {
    const { useLayout, effectiveLayout } = await freshStore(ALL);
    useLayout.getState().setMaximized('summary');
    useLayout.getState().setPersona('IT');
    const st = useLayout.getState();
    expect(st.persona).toBe('IT');
    expect(st.maximized).toBeNull();
    expect(keysOf(effectiveLayout(st)).sort()).toEqual(['architecture', 'knowledge-graph', 'products']);
  });

  // FR-014 AC-017
  it('FR-014 AC-017 非表示は選択中のペルソナにだけ効き、再表示できる', async () => {
    const { useLayout, effectiveLayout } = await freshStore(ALL);
    const a = useLayout.getState();
    a.setPersona('事業部門');
    useLayout.getState().hideComponent('gantt');
    expect(keysOf(effectiveLayout(useLayout.getState())).includes('gantt')).toBe(false);
    useLayout.getState().setPersona('現場');
    expect(keysOf(effectiveLayout(useLayout.getState())).includes('gantt')).toBe(true); // 別ペルソナは別のレイアウト
    useLayout.getState().setPersona('事業部門');
    useLayout.getState().showComponent('gantt');
    expect(keysOf(effectiveLayout(useLayout.getState())).includes('gantt')).toBe(true);
  });

  // FR-014 AC-017 FR-110 AC-135
  it('FR-110 AC-135 resetLayout は選択中のペルソナの既定に戻し、ペルソナも他のペルソナのレイアウトも変えない', async () => {
    const { useLayout, effectiveLayout } = await freshStore(ALL);
    useLayout.getState().setPersona('事業部門');
    useLayout.getState().hideComponent('gantt');
    useLayout.getState().moveComponent('issue-solution', 'right');
    useLayout.getState().setPersona('IT');
    useLayout.getState().hideComponent('products');
    useLayout.getState().setPersona('事業部門');
    useLayout.getState().setMaximized('issue-solution');
    useLayout.getState().resetLayout();
    const st = useLayout.getState();
    expect(st.persona).toBe('事業部門');
    expect(st.maximized).toBeNull();
    expect(st.layouts['事業部門']).toBeUndefined();
    expect(effectiveLayout(st)).toEqual(defaultLayout('事業部門'));
    expect(st.layouts['IT']).toBeTruthy(); // 他のペルソナの保存は残る
  });

  // FR-014 AC-017
  it('FR-014 AC-017 変更したレイアウトとペルソナは localStorage に保存され、再読込で復元される', async () => {
    const first = await freshStore(ALL);
    first.useLayout.getState().setPersona('事業部門');
    first.useLayout.getState().hideComponent('gantt');
    const raw = first.storage.getItem('edb.layout');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.maximized).toBeUndefined(); // 最大化は保存しない
    const second = await freshStore(ALL, raw!);
    const st = second.useLayout.getState();
    expect(st.persona).toBe('事業部門');
    expect(keysOf(second.effectiveLayout(st)).includes('gantt')).toBe(false);
    expect(st.maximized).toBeNull();
  });

  // FR-014 AC-017
  it('FR-014 AC-017 merge: 壊れた保存値（不正なペルソナ・不正な木・型違い）は捨て、有効な分だけ取り込む', async () => {
    const good = defaultLayout('IT');
    const { useLayout, effectiveLayout } = await freshStore(ALL, {
      state: { persona: '存在しない', layouts: { IT: good, 現場: { kind: 'split', dir: 'x', children: [], sizes: [] }, 経営層: 'x', foo: good } },
      version: 1,
    });
    const st = useLayout.getState();
    expect(st.persona).toBe('経営層'); // 不正なペルソナは既定
    expect(st.layouts['IT']).toEqual(good);
    expect(st.layouts['現場']).toBeUndefined();
    expect(st.layouts['経営層']).toBeUndefined();
    expect(Object.keys(st.layouts)).toEqual(['IT']);
    expect(effectiveLayout(st)).not.toBeUndefined();
  });

  // FR-014 AC-017
  it('FR-014 AC-017 merge: 保存値が壊れた JSON でも起動でき、既定のレイアウトになる', async () => {
    const { useLayout, effectiveLayout } = await freshStore(ALL, '{壊れ');
    expect(useLayout.getState().persona).toBe('経営層');
    expect(effectiveLayout(useLayout.getState())).toEqual(defaultLayout('経営層'));
  });

  // FR-014 AC-017
  it('FR-014 AC-017 保存した null（すべて非表示）は復元しても空のままで、ドックから再表示できる', async () => {
    const { useLayout, effectiveLayout } = await freshStore(ALL, { state: { persona: '経営層', layouts: { 経営層: null } }, version: 1 });
    expect(effectiveLayout(useLayout.getState())).toBeNull();
    useLayout.getState().showComponent('summary');
    expect(keysOf(effectiveLayout(useLayout.getState()))).toEqual(['summary']);
  });
});

describe('FR-012 FR-014 AC-017 既定が空になるときの退避（暫定）', () => {
  // FR-014 AC-017（§7 の既定に含まれない画面だけが登録されている状態。経営層の既定にはキャンバスも含まれるので、ホワイトボードで代用する）
  it('FR-014 AC-017 既定の画面が 1 つも登録されていなければ、登録済みの画面を並べる（初回起動で空にならない）', async () => {
    const { useLayout, effectiveLayout } = await freshStore(['whiteboard', 'settings', 'chat']);
    const l = effectiveLayout(useLayout.getState());
    expect(l).not.toBeNull();
    expect(keysOf(l).sort()).toEqual(['chat', 'settings', 'whiteboard']);
  });

  // FR-110 AC-135
  it('FR-110 AC-135 既定に戻した直後も空にならず、退避の並びになる', async () => {
    const { useLayout, effectiveLayout } = await freshStore(['whiteboard', 'settings']);
    useLayout.getState().hideComponent('whiteboard');
    useLayout.getState().hideComponent('settings');
    expect(effectiveLayout(useLayout.getState())).toBeNull(); // 利用者が全部を非表示にした
    useLayout.getState().resetLayout();
    expect(keysOf(effectiveLayout(useLayout.getState())).sort()).toEqual(['settings', 'whiteboard']);
  });

  // FR-014 AC-017
  it('FR-014 AC-017 登録が増えて §7 の既定の画面が 1 つでも残れば、既定（§7）が優先される', async () => {
    const { useLayout, effectiveLayout } = await freshStore(['whiteboard', 'settings', 'summary', 'matrix']);
    const l = effectiveLayout(useLayout.getState());
    expect(keysOf(l).sort()).toEqual(['matrix', 'summary']);
  });

  // FR-012 FR-112 経営層の既定にはキャンバスが背景の全体図として残る（§7 の表）
  it('FR-112 §7 経営層の既定のレイアウトにはキャンバスが含まれ、2×2 マトリクスが最大の領域になる', () => {
    const l = defaultLayout('経営層');
    expect(keysOf(l)).toEqual(['summary', 'matrix', 'ranking', 'canvas']);
    const row = (l as { children: Array<{ sizes: number[] }> }).children[1]!;
    expect(row.sizes[0]).toBeGreaterThan(Math.max(...row.sizes.slice(1)));
  });

  // FR-014 AC-017
  it('FR-014 AC-017 保存したレイアウトの画面がすべて無くなったときも、空にならず既定へ戻る', async () => {
    const saved = { state: { persona: '経営層', layouts: { 経営層: arrangeAll(['gone-a', 'gone-b']) } }, version: 1 };
    const { useLayout, effectiveLayout } = await freshStore(['whiteboard', 'settings'], saved);
    expect(keysOf(effectiveLayout(useLayout.getState())).sort()).toEqual(['settings', 'whiteboard']);
  });

  it('arrangeAll は 0 件で null、1 件で単独、2 件以上は先頭を前面にした 1 つのタブのまとまりにする', () => {
    expect(arrangeAll([])).toBeNull();
    expect(keysOf(arrangeAll(['a']))).toEqual(['a']);
    expect(arrangeAll(['a', 'b'])).toEqual({ kind: 'tabs', tabs: ['a', 'b'], active: 'a' });
    expect(keysOf(arrangeAll(['a', 'a', 'b', 'c']) as Layout)).toEqual(['a', 'b', 'c']);
  });
});

const key = (k: string, extra: Partial<KeyLike> = {}): KeyLike => ({
  key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, insidePanel: true, editable: false, ...extra,
});

describe('FR-013 AC-016 パネルのキー操作', () => {
  const pane = (maximized = false) => ({ maximized, toggleMaximize: vi.fn(), restore: vi.fn(), hide: vi.fn() });

  // FR-013 AC-016
  it('FR-013 AC-016 Shift+F で最大化/通常を切り替える', () => {
    const p = pane();
    const a = panelKeyAction(key('F', { shiftKey: true }), p);
    expect(a).toBe('toggle-maximize');
    expect(runPanelKeyAction(a, p)).toBe(true);
    expect(p.toggleMaximize).toHaveBeenCalledTimes(1);
  });

  // FR-013 AC-016
  it('FR-013 AC-016 Esc は最大化中だけ通常表示に戻す', () => {
    expect(panelKeyAction(key('Escape'), pane(false))).toBeNull();
    const p = pane(true);
    const a = panelKeyAction(key('Escape'), p);
    expect(a).toBe('restore');
    runPanelKeyAction(a, p);
    expect(p.restore).toHaveBeenCalledTimes(1);
  });

  // FR-013 AC-016
  it('FR-013 AC-016 H（h）で非表示にする。Shift+H は何もしない', () => {
    const p = pane();
    expect(panelKeyAction(key('H'), p)).toBe('hide');
    expect(panelKeyAction(key('h'), p)).toBe('hide');
    expect(panelKeyAction(key('H', { shiftKey: true }), p)).toBeNull();
    runPanelKeyAction('hide', p);
    expect(p.hide).toHaveBeenCalledTimes(1);
  });

  // FR-013 AC-016 異常系
  it('FR-013 AC-016 入力欄にフォーカスがあるとき・修飾キー付き・処理済み・パネルの外では何もしない', () => {
    const p = pane(true);
    for (const e of [
      key('h', { editable: true }), key('F', { shiftKey: true, editable: true }), key('Escape', { editable: true }),
      key('h', { ctrlKey: true }), key('h', { metaKey: true }), key('h', { altKey: true }),
      key('h', { defaultPrevented: true }), key('h', { insidePanel: false }), key('x'),
    ]) expect(panelKeyAction(e, p)).toBeNull();
    expect(runPanelKeyAction(null, p)).toBe(false);
    expect(p.hide).not.toHaveBeenCalled();
  });

  // FR-013 AC-016
  it('FR-013 AC-016 ワークスペースの外（pane なし）では、キーにもダブルクリックにも反応しない', () => {
    expect(panelKeyAction(key('h'), null)).toBeNull();
    expect(titleDoubleClick(null)).toBeUndefined();
  });

  // FR-013 AC-016
  it('FR-013 AC-016 見出しのダブルクリックは最大化/通常の切替になる', () => {
    const p = pane();
    titleDoubleClick(p)!();
    expect(p.toggleMaximize).toHaveBeenCalledTimes(1);
  });
});
