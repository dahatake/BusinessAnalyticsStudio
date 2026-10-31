// @vitest-environment jsdom
// FR-298 適応型ワークスペース: ゾーンの計算・タスクワークスペースの状態・タスク文脈の単体テスト。
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RATIOS, MODES, ZONE_NAMES, hostRect, placeByRole, sanitizeRatio, zoneLayout, type ZoneRect } from '../../src/workspace/zones';
import { useTaskWorkspaces, recentWorkspaces, RECENT_LIMIT } from '../../src/store/taskWorkspaces';
import { addWorkspace, applyContext, captureContext, switchWorkspace } from '../../src/workspace/taskContext';
import { useRetainedStore } from '../../src/store/retained';

const area = (r: ZoneRect | null): number => (r ? r.w * r.h : 0);
const shown = (l: ReturnType<typeof zoneLayout>) => ZONE_NAMES.filter((n) => l[n].rect);

describe('FR-298 AC-805 ゾーンの意味名・結合', () => {
  // FR-298 AC-805
  it('FR-298 AC-805 既定（Research）は Main・Reference・Communication の 3 ゾーンで、結合すると 1 つになり、解除で元に戻る', () => {
    const base = zoneLayout('research', DEFAULT_RATIOS);
    expect(shown(base)).toEqual(['main', 'reference', 'communication']);
    const merged = zoneLayout('research', DEFAULT_RATIOS, ['reference', 'communication']);
    expect(shown(merged)).toEqual(['main', 'reference']);
    expect(merged.reference.merged).toBe(true);
    expect(merged.communication.host).toBe('reference');
    expect(merged.reference.rect!.w).toBeCloseTo(base.reference.rect!.w + base.communication.rect!.w, 6);
    expect(shown(zoneLayout('research', DEFAULT_RATIOS, []))).toEqual(shown(base));
  });

  // FR-298 AC-805（異常系: 結合は出ているゾーンが 2 つ以上のときだけ）
  it('FR-298 AC-805 異常系: 出していないゾーンだけを結合に含めても、結合は起きない', () => {
    const l = zoneLayout('compare', DEFAULT_RATIOS, ['communication', 'monitor']);
    expect(shown(l)).toEqual(['main', 'reference']);
    expect(ZONE_NAMES.some((n) => l[n].merged)).toBe(false);
  });

  // FR-298 AC-805
  it('FR-298 AC-805 ロールの割り当ては座標なしで、ゾーンの矩形に置かれ、同じゾーンの複数は縦に等分される', () => {
    const l = zoneLayout('research', DEFAULT_RATIOS);
    const { rects, hidden } = placeByRole(l, { a: 'reference', b: 'reference', c: 'main' }, ['a', 'b', 'c']);
    expect(hidden).toEqual([]);
    expect(rects.c).toEqual(l.main.rect);
    expect(rects.a!.h).toBeCloseTo(0.5, 6);
    expect(rects.b!.y).toBeCloseTo(0.5, 6);
    expect(rects.a!.x).toBeCloseTo(l.reference.rect!.x, 6);
  });
});

describe('FR-298 AC-806 割合とロールの独立・隙間重なりなし', () => {
  // FR-298 AC-806
  it('FR-298 AC-806 既定の割合は 60/25/15（PARAM-138）で、どのモードでも作業領域を隙間・重なりなく覆う', () => {
    const l = zoneLayout('research', DEFAULT_RATIOS);
    expect(l.main.rect!.w).toBeCloseTo(0.6, 6);
    expect(l.reference.rect!.w).toBeCloseTo(0.25, 6);
    expect(l.communication.rect!.w).toBeCloseTo(0.15, 6);
    for (const m of MODES) for (const merged of [[], ['main', 'reference']] as const) {
      const lay = zoneLayout(m, { main: 50, reference: 30, communication: 20 }, merged);
      const rs = ZONE_NAMES.map((n) => lay[n].rect).filter((r): r is ZoneRect => !!r).sort((a, b) => a.x - b.x);
      expect(rs.reduce((s, r) => s + area(r), 0), `${m}: 合計が全体と一致しない`).toBeCloseTo(1, 6);
      rs.forEach((r, i) => { if (i > 0) expect(r.x, `${m}: 隙間か重なり`).toBeCloseTo(rs[i - 1]!.x + rs[i - 1]!.w, 6); });
    }
  });

  // FR-298 AC-806
  it('FR-298 AC-806 割合を変えてもロールは変わらず、ロールを変えても割合は変わらない', () => {
    useTaskWorkspaces.setState({ items: [{ id: 'x', name: 'x', mode: 'research', ratios: { ...DEFAULT_RATIOS }, merged: [], roles: {}, context: null, usedAt: 1 }], active: 'x' });
    const st = useTaskWorkspaces.getState();
    st.assign('a', 'reference');
    st.setRatio('main', 50);
    expect(useTaskWorkspaces.getState().items[0]!.roles).toEqual({ a: 'reference' });
    st.assign('a', 'communication');
    expect(useTaskWorkspaces.getState().items[0]!.ratios).toEqual({ main: 50, reference: 25, communication: 15 });
    st.assign('a', null);
    expect(useTaskWorkspaces.getState().items[0]!.roles).toEqual({});
  });

  // FR-298 AC-806（異常系: 不正な割合）
  it('FR-298 AC-806 異常系: 不正な割合（NaN・0・負数・大きすぎる値）は 1〜98 に収める', () => {
    expect(sanitizeRatio(NaN)).toBe(1);
    expect(sanitizeRatio(0)).toBe(1);
    expect(sanitizeRatio(-5)).toBe(1);
    expect(sanitizeRatio(1000)).toBe(98);
    expect(sanitizeRatio(33.4)).toBe(33);
  });
});

describe('FR-298 AC-807 モードのゾーン構成', () => {
  // FR-298 AC-807
  it('FR-298 AC-807 Focus・Compare・Monitor・Meeting・Research が、定めたゾーン構成になる', () => {
    const f = zoneLayout('focus', DEFAULT_RATIOS);
    for (const n of ['reference', 'communication'] as const) { expect(area(f[n].rect)).toBeLessThan(area(f.main.rect)); expect(f[n].dimmed).toBe(true); }
    expect(f.main.dimmed).toBe(false);
    const c = zoneLayout('compare', DEFAULT_RATIOS);
    expect(c.main.rect!.w).toBeCloseTo(c.reference.rect!.w, 6);
    expect(c.communication.rect).toBeNull();
    const mo = zoneLayout('monitor', DEFAULT_RATIOS);
    expect(area(mo.monitor.rect)).toBeGreaterThan(area(mo.main.rect));
    const me = zoneLayout('meeting', DEFAULT_RATIOS);
    expect(shown(me)).toEqual(['main', 'communication']);
    expect(shown(zoneLayout('research', DEFAULT_RATIOS))).toEqual(['main', 'reference', 'communication']);
  });

  // FR-298 AC-807
  it('FR-298 AC-807 出していないゾーンのロールのコンポーネントは hidden になり、モードを戻すと同じ場所へ戻る', () => {
    const roles = { a: 'communication' } as const;
    expect(placeByRole(zoneLayout('compare', DEFAULT_RATIOS), roles, ['a']).hidden).toEqual(['a']);
    const back = placeByRole(zoneLayout('research', DEFAULT_RATIOS), roles, ['a']);
    expect(back.hidden).toEqual([]);
    expect(back.rects.a).toEqual(hostRect(zoneLayout('research', DEFAULT_RATIOS), 'communication'));
  });
});

describe('FR-298 AC-809 タスク文脈の独立', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useRetainedStore.setState({ values: {} });
    useTaskWorkspaces.setState({ items: [{ id: 'w1', name: 'ワークスペース 1', mode: 'research', ratios: { ...DEFAULT_RATIOS }, merged: [], roles: {}, context: null, usedAt: 1 }], active: 'w1' });
  });

  // FR-298 AC-809
  it('FR-298 AC-809 タスクワークスペースごとに絞り込みが保存・復元され、混ざらない', () => {
    useRetainedStore.getState().set('table.filter', 'one');
    const id2 = addWorkspace();
    expect(useTaskWorkspaces.getState().active).toBe(id2);
    expect(useRetainedStore.getState().values['table.filter'], '新しいワークスペースに前の絞り込みが混ざった').toBeUndefined();
    useRetainedStore.getState().set('table.filter', 'two');
    switchWorkspace('w1');
    expect(useRetainedStore.getState().values['table.filter']).toBe('one');
    switchWorkspace(id2);
    expect(useRetainedStore.getState().values['table.filter']).toBe('two');
  });

  // FR-298 AC-809
  it('FR-298 AC-809 取り込んだ文脈は JSON として保存でき、復元すると同じ値に戻る（再読込でも保持）', () => {
    useRetainedStore.getState().set('table.filter', 'keep');
    useRetainedStore.getState().set('bad', new Set([1]));
    const ctx = captureContext();
    expect(ctx.retained).toEqual({ 'table.filter': 'keep' });
    const roundTrip = JSON.parse(JSON.stringify(ctx));
    useRetainedStore.setState({ values: {} });
    applyContext(roundTrip, { selection: false });
    expect(useRetainedStore.getState().values['table.filter']).toBe('keep');
  });

  // FR-298 AC-809（最近使った作業は PARAM-140 件まで）
  it('FR-298 AC-809 最近使った作業は新しい順で RECENT_LIMIT 件まで', () => {
    for (let i = 0; i < 7; i++) addWorkspace();
    expect(useTaskWorkspaces.getState().items).toHaveLength(8);
    const r = recentWorkspaces(useTaskWorkspaces.getState().items);
    expect(r).toHaveLength(RECENT_LIMIT);
    expect(r[0]!.id).toBe(useTaskWorkspaces.getState().active);
  });

  // FR-298 AC-809（異常系: 存在しない ID への切替）
  it('FR-298 AC-809 異常系: 存在しないタスクワークスペースへは切り替わらない', () => {
    switchWorkspace('nothing');
    expect(useTaskWorkspaces.getState().active).toBe('w1');
  });
});
