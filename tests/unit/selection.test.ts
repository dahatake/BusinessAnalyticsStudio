// 共通の選択状態・エンティティ関係グラフ・絞り込み・Esc・URL の単体・結合テスト。
// FR-024 AC-029 / FR-025 AC-030 / FR-026 AC-031 / FR-027 AC-032 / FR-028 AC-033
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { DATA_SCHEMAS, type PackData } from '../../src/schema';
import { buildEntityGraph, KIND_LABELS, NODE_KINDS } from '../../src/selection/graph';
import { isOverlayOpen, shouldClearSelectionOnEscape } from '../../src/selection/keys';
import {
  formatSelectionHash, highlightTokens, isVisibleInFilter, parseSelectionHash, relatedSet,
} from '../../src/selection/model';
import { resetSelectionForTest, setUrlAdapter, useSelectionStore, type UrlAdapter } from '../../src/store/selection';

function loadPack(kind: 'mono' | 'koto'): PackData {
  const dir = path.resolve(__dirname, '../../examples', kind, 'public', 'data');
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(DATA_SCHEMAS)) {
    out[name] = schema.parse(JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8')));
  }
  return out as PackData;
}

/** 履歴つきの URL の模擬（pushState / 戻る / 進む） */
class FakeUrl implements UrlAdapter {
  entries = [''];
  at = 0;
  hash() { return this.entries[this.at]!; }
  push(h: string) { this.entries = [...this.entries.slice(0, this.at + 1), h]; this.at += 1; }
  replace(h: string) { this.entries[this.at] = h; }
  back() { this.at -= 1; }
  forward() { this.at += 1; }
}

const store = () => useSelectionStore.getState();
let url: FakeUrl;
beforeEach(() => {
  resetSelectionForTest();
  url = new FakeUrl();
  setUrlAdapter(url);
});

describe('FR-024 エンティティ関係グラフ', () => {
  const pack = loadPack('mono');
  const graph = buildEntityGraph(pack);

  it('パックのすべての種類のエンティティが節になり、ID は一意で、すべての種類にラベルがある', () => {
    const ids = graph.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      ...pack.entities.entities.map((e) => e.id), ...pack.issues.issues.map((e) => e.id), ...pack.issues.solutions.map((e) => e.id),
      ...pack.products.products.map((e) => e.id), ...pack.plan.features.map((e) => e.id), ...pack.plan.tasks.map((e) => e.id),
      ...pack.architecture.nodes.map((e) => e.id), ...pack.mocks.mocks.map((e) => e.id), ...pack.sources.sources.map((e) => e.id),
      ...pack.show.chapters.map((e) => e.id), ...pack.show.chapters.flatMap((c) => c.topics.map((t) => t.id)),
    ]) expect(graph.has(id), id).toBe(true);
    for (const k of NODE_KINDS) expect(KIND_LABELS[k]).toBeTruthy();
  });

  it('ID の参照が辺になり、向きを問わず関連する（課題⇄解決策・課題⇄出典・議題⇄課題）', () => {
    const sol = pack.issues.solutions[0]!;
    expect(graph.neighbors(sol.issueId).has(sol.id)).toBe(true);
    expect(graph.neighbors(sol.id).has(sol.issueId)).toBe(true);
    const issue = pack.issues.issues[0]!;
    for (const s of issue.sourceIds ?? []) expect(graph.neighbors(issue.id).has(s)).toBe(true);
    const topic = pack.show.chapters[0]!.topics[0]!;
    for (const e of topic.entityIds ?? []) expect(graph.related(topic.id).has(e)).toBe(true);
    expect(graph.related(topic.id).has(topic.id)).toBe(true);
    expect(graph.neighbors(topic.id).has(topic.id)).toBe(false);
  });

  it('from/to を持つアーキテクチャの接続は節ではなく、両端の節をつなぐ辺になる', () => {
    const e = pack.architecture.edges[0]!;
    expect(graph.has(e.id)).toBe(false);
    expect(graph.neighbors(e.from).has(e.to)).toBe(true);
    expect(graph.edges.some((x) => x.kind === 'relation' && x.from === e.from && x.to === e.to)).toBe(true);
  });

  it('存在しない ID は関連を持たず、存在しない参照は辺にならない', () => {
    expect(graph.has('does-not-exist')).toBe(false);
    expect(graph.related('does-not-exist').size).toBe(0);
    const broken = structuredClone(pack);
    broken.issues.solutions[0]!.issueId = 'no-such-issue';
    const g = buildEntityGraph(broken);
    expect(g.edges.some((x) => x.to === 'no-such-issue')).toBe(false);
  });
});

describe('FR-024 AC-029 選択状態ストアの結合', () => {
  it('ストアの選択を変えると、購読しているすべてのビューに同じ選択 ID が通知される', () => {
    const views = ['3d', 'map', 'table', 'gantt', 'sources'].map((name) => {
      const seen: string[][] = [];
      const off = useSelectionStore.subscribe((s, prev) => { if (s.selectedIds !== prev.selectedIds) seen.push(s.selectedIds); });
      return { name, seen, off };
    });
    store().select('issue-mono-001', { origin: 'table' });
    store().select('sol-mono-001', { origin: 'map', additive: true });
    for (const v of views) {
      expect(v.seen, v.name).toEqual([['issue-mono-001'], ['issue-mono-001', 'sol-mono-001']]);
      v.off();
    }
    expect(store().origin).toBe('map');
  });

  it('同じ選択のままの再設定は通知しない（番号も進まない）', () => {
    store().select('a');
    const seq = store().seq;
    store().select('a');
    store().setSelection(['a']);
    expect(store().seq).toBe(seq);
  });
});

describe('FR-025 AC-030 クロスハイライト', () => {
  const graph = buildEntityGraph(loadPack('mono'));
  const ctx = (selected: string[], hoverId: string | null = null, mode: 'AND' | 'OR' = 'OR', unrelated: 'hide' | 'dim' = 'hide') => ({
    selected: new Set(selected), related: relatedSet(graph, selected, mode), hoverId, unrelated,
  });

  it('1 つの ID を選ぶと、すべてのビューで同じ ID が selected、つながる ID が related になる', () => {
    const c = ctx(['issue-mono-001']);
    expect(highlightTokens('issue-mono-001', c)).toBe('selected');
    const sol = graph.neighbors('issue-mono-001');
    expect(sol.size).toBeGreaterThan(0);
    for (const id of sol) expect(highlightTokens(id, c)).toBe('related');
  });

  it('選択が変わったことを、変更を起こしたビュー（origin）と通し番号で他のビューが知れる（カメラ移動の合図）', () => {
    const seqs: Array<[string | null, number]> = [];
    const off = useSelectionStore.subscribe((s) => seqs.push([s.origin, s.seq]));
    store().select('ent-mono-line-a', { origin: 'table' });
    off();
    expect(seqs).toEqual([['table', 1]]);
  });
});

describe('FR-026 AC-031 選択に応じた自動の絞り込み', () => {
  const graph = buildEntityGraph(loadPack('mono'));
  const all = graph.nodes.map((n) => n.id);
  const [a, b] = ['issue-mono-001', 'issue-mono-002'];

  it('AND は関連の積集合、OR は和集合で、|A∩B|+|A∪B| = |A|+|B| が成り立つ', () => {
    const A = relatedSet(graph, [a!], 'OR')!;
    const B = relatedSet(graph, [b!], 'OR')!;
    const and = relatedSet(graph, [a!, b!], 'AND')!;
    const or = relatedSet(graph, [a!, b!], 'OR')!;
    expect(and.size + or.size).toBe(A.size + B.size);
    for (const id of and) expect(or.has(id)).toBe(true);
    expect([...and].every((id) => A.has(id) && B.has(id))).toBe(true);
    expect([...or].every((id) => A.has(id) || B.has(id))).toBe(true);
  });

  it('1 つだけ選んだとき、AND と OR は同じ。選択がなければ絞り込まない（null）', () => {
    expect([...relatedSet(graph, [a!], 'AND')!].sort()).toEqual([...relatedSet(graph, [a!], 'OR')!].sort());
    expect(relatedSet(graph, [], 'OR')).toBeNull();
    expect(relatedSet(graph, ['does-not-exist'], 'AND')).toBeNull();
  });

  it('非表示は関連する項目だけが見え、減光は全件が残って関連しない項目に dimmed が付く。解除で全件に戻る', () => {
    const related = relatedSet(graph, [a!, b!], 'OR')!;
    expect(all.filter((id) => isVisibleInFilter(id, related, 'hide')).length).toBe(related.size);
    expect(all.filter((id) => isVisibleInFilter(id, related, 'dim')).length).toBe(all.length);
    const dim = { selected: new Set([a!, b!]), related, hoverId: null, unrelated: 'dim' as const };
    const dimmed = all.filter((id) => highlightTokens(id, dim, true)?.split(' ').includes('dimmed'));
    expect(dimmed.length).toBe(all.length - related.size);
    // 絞り込まない部品（3D・地図など）には dimmed を付けない
    expect(all.some((id) => highlightTokens(id, dim, false)?.includes('dimmed'))).toBe(false);
    store().setSelection([a!, b!]);
    store().clear();
    expect(store().selectedIds).toEqual([]);
    expect(all.filter((id) => isVisibleInFilter(id, null, 'hide')).length).toBe(all.length);
  });
});

describe('FR-027 AC-032 ホバー・クリック・Esc', () => {
  it('ホバーは一時的な状態で、外すと消える。選択（クリック）とは別で、URL にも反映されない', () => {
    store().setHover('issue-mono-001');
    expect(store().hoverId).toBe('issue-mono-001');
    expect(url.hash()).toBe('');
    const c = { selected: new Set<string>(), related: null, hoverId: store().hoverId, unrelated: 'hide' as const };
    expect(highlightTokens('issue-mono-001', c)).toBe('hover');
    expect(highlightTokens('issue-mono-002', c)).toBeUndefined();
    store().setHover(null);
    expect(store().hoverId).toBeNull();
  });

  it('クリックは選択を確定し（置き換え）、Ctrl/⌘ 付きは追加・解除する', () => {
    store().select('a');
    store().select('b');
    expect(store().selectedIds).toEqual(['b']);
    store().select('c', { additive: true });
    expect(store().selectedIds).toEqual(['b', 'c']);
    store().select('b', { additive: true });
    expect(store().selectedIds).toEqual(['c']);
  });

  const base = { key: 'Escape', defaultPrevented: false, overlayOpen: false, editable: false, hasSelection: true };
  it('Esc は選択を解除する。ただし A-04 の優先順で、ダイアログ・メニュー、先に処理された Esc（最大化の解除）、入力欄の取り消しがあるときは解除しない', () => {
    expect(shouldClearSelectionOnEscape(base)).toBe(true);
    expect(shouldClearSelectionOnEscape({ ...base, overlayOpen: true })).toBe(false);
    expect(shouldClearSelectionOnEscape({ ...base, defaultPrevented: true })).toBe(false);
    expect(shouldClearSelectionOnEscape({ ...base, editable: true })).toBe(false);
    expect(shouldClearSelectionOnEscape({ ...base, hasSelection: false })).toBe(false);
    expect(shouldClearSelectionOnEscape({ ...base, key: 'Enter' })).toBe(false);
  });

  it('開いているダイアログ・メニューを DOM から見つける（オープニングは role=dialog）', () => {
    const root = (hit: boolean) => ({ querySelector: (sel: string) => (hit && sel.includes('[role="dialog"]') ? {} : null) }) as unknown as ParentNode;
    expect(isOverlayOpen(root(true))).toBe(true);
    expect(isOverlayOpen(root(false))).toBe(false);
  });
});

describe('FR-028 AC-033 URL への反映と復元', () => {
  it('ハッシュの書式: 選択・AND・減光を表し、既定値は書かず、ほかのハッシュの項目は保つ', () => {
    expect(formatSelectionHash({ ids: [], mode: 'OR', unrelated: 'hide' })).toBe('');
    expect(formatSelectionHash({ ids: ['a', 'b'], mode: 'OR', unrelated: 'hide' })).toBe('#sel=a,b');
    expect(formatSelectionHash({ ids: ['a'], mode: 'AND', unrelated: 'dim' })).toBe('#sel=a&mode=and&dim=1');
    expect(formatSelectionHash({ ids: ['b'], mode: 'OR', unrelated: 'hide' }, '#x=1&sel=a&mode=and')).toBe('#x=1&sel=b');
    expect(parseSelectionHash('#sel=a,b&mode=and&dim=1')).toEqual({ ids: ['a', 'b'], mode: 'AND', unrelated: 'dim' });
    expect(parseSelectionHash('')).toEqual({ ids: [], mode: 'OR', unrelated: 'hide' });
  });

  it('壊れた・不正な値は捨てる（例外を投げない）', () => {
    expect(parseSelectionHash('#sel=%E0%A4%A,<script>,a,a,A&mode=xor').ids).toEqual(['a']);
    expect(parseSelectionHash('#sel=').ids).toEqual([]);
    expect(parseSelectionHash('#&&=&sel').ids).toEqual([]);
    const many = Array.from({ length: 200 }, (_, i) => `id-${i}`).join(',');
    expect(parseSelectionHash(`#sel=${many}`).ids.length).toBe(50);
  });

  it('項目 A、B の順に選んで「戻る」で A、「進む」で B に戻り、URL を新しく開くと同じ選択になる', () => {
    store().select('a');
    store().select('b');
    expect(url.hash()).toBe('#sel=b');
    url.back();
    store().syncFromUrl();
    expect(store().selectedIds).toEqual(['a']);
    url.forward();
    store().syncFromUrl();
    expect(store().selectedIds).toEqual(['b']);
    // 新しいタブで URL を開く（ストアを作り直す）
    const copied = url.hash();
    resetSelectionForTest();
    const fresh = new FakeUrl();
    fresh.entries = [copied];
    setUrlAdapter(fresh);
    store().syncFromUrl();
    expect(store().selectedIds).toEqual(['b']);
  });

  it('選択の解除（Esc）も履歴に積まれ、戻ると選択が戻る。AND/OR の切替は履歴を増やさず URL に置き換える', () => {
    store().select('a');
    store().clear();
    expect(url.hash()).toBe('');
    url.back();
    store().syncFromUrl();
    expect(store().selectedIds).toEqual(['a']);
    const len = url.entries.length;
    store().setMode('AND');
    store().setUnrelated('dim');
    expect(url.entries.length).toBe(len);
    expect(url.hash()).toBe('#sel=a&mode=and&dim=1');
    url.back();
    url.forward();
    store().syncFromUrl();
    expect([store().mode, store().unrelated]).toEqual(['AND', 'dim']);
  });

  it('存在しない ID を含む URL は、選択なしで復元し、URL も実際の状態にそろえる（履歴は増やさない）', () => {
    url.entries = ['#sel=does-not-exist-999'];
    store().setKnownIds(new Set(['a', 'b']));
    store().syncFromUrl();
    expect(store().selectedIds).toEqual([]);
    expect(url.hash()).toBe('');
    expect(url.entries.length).toBe(1);
    // 実在する ID は残り、存在しない ID だけが落ちる
    url.entries = ['#sel=a,zzz'];
    url.at = 0;
    store().syncFromUrl();
    expect(store().selectedIds).toEqual(['a']);
    expect(url.hash()).toBe('#sel=a');
  });

  it('グラフの登録前に読んだ選択は、登録の時点で存在しない ID が捨てられる。登録後は存在しない ID を選べない', () => {
    store().setSelection(['a', 'ghost'], { history: 'none' });
    expect(store().selectedIds).toEqual(['a', 'ghost']);
    store().setKnownIds(new Set(['a']));
    expect(store().selectedIds).toEqual(['a']);
    store().select('ghost');
    expect(store().selectedIds).toEqual(['a']);
  });
});
