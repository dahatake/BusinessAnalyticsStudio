// ペルソナ別ビュー・プレゼンテーションモード・表現の代替表示・状態の保持の単体・結合テスト。
// FR-015 FR-016 FR-112 FR-113 NFR-UX-001
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERSONAS, defaultLayout, keysOf, arrangeAll } from '../../src/workspace/layoutModel';
import { PERSONA_PRIMARY, largestComponent, personaDefaultsMatchTable, primaryOf } from '../../src/workspace/persona';
import { flattenTopics, presentationKeyAction, stepIndex, targetUsesArrowKeys } from '../../src/presentation/model';
import { currentTopic, usePresentationStore } from '../../src/store/presentation';
import { FALLBACK_REASONS, fallbackLabel, hasLocation, partitionRenderable } from '../../src/analysis/fallback';
import { useFallbackStore } from '../../src/store/fallback';
import { useRetainedState, useRetainedStore } from '../../src/store/retained';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const ALL = ['summary', 'matrix', 'ranking', 'issue-solution', 'discussion-tree', 'gantt', 'architecture', 'knowledge-graph', 'products', 'view3d', 'mock-app', 'table'];

async function freshLayout(available: readonly string[]) {
  vi.resetModules();
  const storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
  const mod = await import('../../src/store/layout');
  mod.setAvailableComponents(available);
  return mod;
}

beforeEach(() => { vi.unstubAllGlobals(); });

describe('FR-015 AC-018 / FR-112 AC-137 ペルソナ別の既定の情報表現', () => {
  // FR-112 AC-137
  it('FR-112 AC-137 4 つのペルソナの既定のレイアウトで、最大の領域が §7 の表の既定の情報表現になる', () => {
    expect(PERSONAS).toEqual(['経営層', '事業部門', 'IT', '現場']);
    for (const p of PERSONAS) expect(primaryOf(p), p).toBe(PERSONA_PRIMARY[p]);
    expect(PERSONA_PRIMARY).toEqual({ 経営層: 'matrix', 事業部門: 'issue-solution', IT: 'architecture', 現場: 'view3d' });
    expect(personaDefaultsMatchTable()).toBe(true);
  });

  // FR-112 AC-137
  it('FR-112 AC-137 largestComponent は分割の比率を掛け合わせて最大のものを選び、タブは前面のものを数える', () => {
    expect(largestComponent(null)).toBeNull();
    expect(largestComponent(arrangeAll(['a', 'b']))).toBe('a');
    expect(largestComponent({ kind: 'tabs', tabs: ['a', 'b'], active: 'b' })).toBe('b');
  });

  // FR-015 AC-018
  it('FR-015 AC-018 ペルソナを順に切り替えると、そのペルソナの既定の情報表現が前面（最大の領域）に出る', async () => {
    const { useLayout, effectiveLayout } = await freshLayout(ALL);
    for (const p of PERSONAS) {
      useLayout.getState().setPersona(p);
      const layout = effectiveLayout(useLayout.getState());
      expect(useLayout.getState().persona).toBe(p);
      expect(keysOf(layout)).toContain(PERSONA_PRIMARY[p]);
      expect(largestComponent(layout)).toBe(PERSONA_PRIMARY[p]);
    }
  });

  // FR-112 AC-137 保存済みのレイアウトがない状態
  it('FR-112 AC-137 保存済みのレイアウトがないペルソナは、既定のレイアウトで表示される', async () => {
    const { useLayout, effectiveLayout } = await freshLayout(ALL);
    useLayout.getState().setPersona('IT');
    expect(useLayout.getState().layouts.IT).toBeUndefined();
    expect(effectiveLayout(useLayout.getState())).toEqual(defaultLayout('IT'));
  });

  // FR-112 AC-138
  it('FR-112 AC-138 ペルソナの切替は、データ（パック・選択・絞り込み）を持たず、レイアウトだけを変える', async () => {
    const { useLayout } = await freshLayout(ALL);
    expect(Object.keys(useLayout.getState()).filter((k) => typeof (useLayout.getState() as never as Record<string, unknown>)[k] !== 'function').sort())
      .toEqual(['layouts', 'maximized', 'persona']);
  });

  // FR-015 AC-018 NFR-UX-001 AC-185
  it('NFR-UX-001 AC-185 ペルソナを切り替えても、選択・絞り込み・入力中の内容の状態は変わらない', async () => {
    const { useLayout } = await freshLayout(ALL);
    useRetainedStore.getState().clear();
    useRetainedStore.getState().set('canvas.selected', 't1');
    useRetainedStore.getState().set('table.filter', '見積');
    for (const p of PERSONAS) useLayout.getState().setPersona(p);
    expect(useRetainedStore.getState().values).toEqual({ 'canvas.selected': 't1', 'table.filter': '見積' });
  });
});

describe('FR-016 AC-019 / AC-192 プレゼンテーションモード', () => {
  const chapters = [
    { id: 'c1', title: '導入', topics: [{ id: 't1', title: '現状' }, { id: 't2', title: '課題' }] },
    { id: 'c2', title: '提案', topics: [] },
    { id: 'c3', title: 'まとめ', topics: [{ id: 't3', title: '次の一手' }] },
  ];

  beforeEach(() => usePresentationStore.getState().end());

  // FR-016 AC-019
  it('FR-016 AC-019 議題は show.json の章・議題の順に並び、章との対応を持つ', () => {
    const topics = flattenTopics(chapters);
    expect(topics.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(topics.map((t) => t.chapterTitle)).toEqual(['導入', '導入', 'まとめ']);
    expect(flattenTopics([])).toEqual([]);
  });

  // FR-016 AC-019
  it('FR-016 AC-019 次へ・前へで順に巡り、先頭・末尾を超えず、現在の議題の章が進行バーの章になる', () => {
    const topics = flattenTopics(chapters);
    const st = usePresentationStore.getState();
    expect(currentTopic(usePresentationStore.getState())).toBeNull();
    expect(st.start(topics)).toBe(true);
    expect(currentTopic(usePresentationStore.getState())?.id).toBe('t1');
    usePresentationStore.getState().prev(); // 先頭より前へは戻らない
    expect(usePresentationStore.getState().index).toBe(0);
    usePresentationStore.getState().next();
    usePresentationStore.getState().next();
    expect(currentTopic(usePresentationStore.getState())).toMatchObject({ id: 't3', chapterTitle: 'まとめ' });
    usePresentationStore.getState().next(); // 末尾から先へは進まない
    expect(usePresentationStore.getState().index).toBe(2);
    usePresentationStore.getState().prev();
    expect(currentTopic(usePresentationStore.getState())?.id).toBe('t2');
    usePresentationStore.getState().end();
    expect(usePresentationStore.getState().active).toBe(false);
    expect(currentTopic(usePresentationStore.getState())).toBeNull();
  });

  // FR-016 AC-019
  it('FR-016 AC-019 議題がないときは開始しない。開始していなければ次へ・前へは何もしない', () => {
    expect(usePresentationStore.getState().start([])).toBe(false);
    expect(usePresentationStore.getState().active).toBe(false);
    usePresentationStore.getState().next();
    expect(usePresentationStore.getState().index).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(0);
    expect(stepIndex(5, 1, 3)).toBe(2);
    expect(stepIndex(1, -9, 3)).toBe(0);
  });

  // FR-016 AC-192
  it('FR-016 AC-192 ←/→ だけが議題の移動で、↑/↓ と Shift・Ctrl・Alt・Meta を押した矢印はパンのまま', () => {
    expect(presentationKeyAction({ key: 'ArrowRight' })).toBe('next');
    expect(presentationKeyAction({ key: 'ArrowLeft' })).toBe('prev');
    expect(presentationKeyAction({ key: 'ArrowUp' })).toBeNull();
    expect(presentationKeyAction({ key: 'ArrowDown' })).toBeNull();
    expect(presentationKeyAction({ key: 'ArrowRight', shiftKey: true })).toBeNull();
    expect(presentationKeyAction({ key: 'ArrowLeft', ctrlKey: true })).toBeNull();
    expect(presentationKeyAction({ key: 'ArrowLeft', altKey: true })).toBeNull();
    expect(presentationKeyAction({ key: 'ArrowRight', metaKey: true })).toBeNull();
    expect(presentationKeyAction({ key: 'a' })).toBeNull();
  });

  // FR-016 AC-192
  it('FR-016 AC-192 キャンバス（role=application）では議題の移動、入力欄・メニューなど矢印キーを自分で使う要素では奪わない', () => {
    expect(presentationKeyAction({ key: 'ArrowRight' }, { tagName: 'DIV', role: 'application' })).toBe('next');
    expect(presentationKeyAction({ key: 'ArrowRight' }, { tagName: 'BUTTON' })).toBe('next');
    expect(presentationKeyAction({ key: 'ArrowRight' }, { tagName: 'INPUT' })).toBeNull();
    expect(presentationKeyAction({ key: 'ArrowLeft' }, { tagName: 'DIV', isContentEditable: true })).toBeNull();
    expect(presentationKeyAction({ key: 'ArrowLeft' }, { tagName: 'DIV', role: 'menuitemradio' })).toBeNull();
    expect(targetUsesArrowKeys(null)).toBe(false);
    expect(targetUsesArrowKeys({ tagName: 'TEXTAREA' })).toBe(true);
  });
});

describe('FR-113 AC-139 表現が成り立たないときの代替表示', () => {
  const sites = [
    { id: 's1', location: { lat: 35.1, lng: 139.2 } },
    { id: 's2' },
    { id: 's3', location: { lat: 'x', lng: 1 } },
    { id: 's4', location: { lat: 34.7, lng: 135.5 } },
    { id: 's5', location: null },
  ];

  // FR-113 AC-139
  it('FR-113 AC-139 位置のない項目は、地図に出す項目から外れ、黙って捨てずに missing として返る（順序は保つ）', () => {
    const { renderable, missing } = partitionRenderable(sites, (s) => hasLocation(s.location));
    expect(renderable.map((s) => s.id)).toEqual(['s1', 's4']);
    expect(missing.map((s) => s.id)).toEqual(['s2', 's3', 's5']);
    expect(renderable.length + missing.length).toBe(sites.length);
  });

  // FR-113 AC-139
  it('FR-113 AC-139 理由と件数が「位置情報なし: N 件」の形の文言になる', () => {
    expect(fallbackLabel(FALLBACK_REASONS.location, 2)).toBe('位置情報なし: 2 件');
    expect(fallbackLabel('日付なし', 0)).toBe('日付なし: 0 件');
    expect(hasLocation({ lat: 0, lng: 0 })).toBe(true); // 0 は有効な位置
    expect(hasLocation({ lat: Number.NaN, lng: 1 })).toBe(false);
    expect(hasLocation(undefined)).toBe(false);
  });

  // FR-113 AC-139
  it('FR-113 AC-139 通知を選ぶと、該当の項目の ID（重複なし）が表への要求として残り、解除できる', () => {
    useFallbackStore.getState().clear();
    useFallbackStore.getState().open({ source: 'map', reason: '位置情報なし', ids: ['s2', 's3', 's2'] });
    expect(useFallbackStore.getState().request).toEqual({ source: 'map', reason: '位置情報なし', ids: ['s2', 's3'] });
    useFallbackStore.getState().clear();
    expect(useFallbackStore.getState().request).toBeNull();
  });
});

describe('NFR-UX-001 AC-185 レイアウト・表現の切替で状態を失わない', () => {
  beforeEach(() => useRetainedStore.getState().clear());

  // 画面（コンポーネント）を新しく作り直したときに、保持した値が読めることを、サーバー描画で確かめる
  function Probe({ id }: { id: string }) {
    const [v] = useRetainedState<string>(`probe.${id}`, '初期値');
    return createElement('span', null, v);
  }

  // NFR-UX-001 AC-185
  it('NFR-UX-001 AC-185 画面が作り直されても保持した値が残り、初めてのときだけ初期値になる', () => {
    expect(renderToStaticMarkup(createElement(Probe, { id: 'a' }))).toBe('<span>初期値</span>');
    useRetainedStore.getState().set('probe.a', '入力中の内容');
    expect(renderToStaticMarkup(createElement(Probe, { id: 'a' }))).toBe('<span>入力中の内容</span>'); // 作り直し
    expect(renderToStaticMarkup(createElement(Probe, { id: 'b' }))).toBe('<span>初期値</span>'); // 別のキーは別
    useRetainedStore.getState().remove('probe.a');
    expect(renderToStaticMarkup(createElement(Probe, { id: 'a' }))).toBe('<span>初期値</span>');
  });

  // NFR-UX-001 AC-185
  it('NFR-UX-001 AC-185 同じ値を書いても新しい状態を作らない', () => {
    useRetainedStore.getState().set('k', 1);
    const before = useRetainedStore.getState().values;
    useRetainedStore.getState().set('k', 1);
    expect(useRetainedStore.getState().values).toBe(before);
    useRetainedStore.getState().remove('なし');
    expect(useRetainedStore.getState().values).toBe(before);
  });

  // NFR-UX-001 AC-185
  it('NFR-UX-001 AC-185 最大化・移動・非表示/再表示・既定に戻す・ペルソナの切替では、保持した状態は変わらない', async () => {
    const { useLayout } = await freshLayout(ALL);
    useRetainedStore.getState().set('table.filter', '見積');
    useLayout.getState().setPersona('事業部門');
    useLayout.getState().setMaximized('gantt');
    useLayout.getState().moveComponent('gantt', 'up');
    useLayout.getState().hideComponent('gantt');
    useLayout.getState().showComponent('gantt');
    useLayout.getState().resetLayout();
    useLayout.getState().setPersona('現場');
    expect(useRetainedStore.getState().values['table.filter']).toBe('見積');
  });
});

