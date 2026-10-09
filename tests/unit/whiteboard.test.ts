// ホワイトボードの単体・結合テスト（FR-097 / FR-098 / FR-099）。画面の操作そのものは System Test（E2E-092・E2E-093・E2E-094）が確かめる。
// FR-097 AC-119 / FR-098 AC-120 / FR-099 AC-121
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { hitTest, itemHit, nodeAt } from '../../src/ink/geometry';
import { createBoard, newId, type BoardItem } from '../../src/ink/model';
import { fromSaved, toSaved } from '../../src/ink/persist';
import { useInk } from '../../src/ink/store';
import { BrandProfileSchema, DATA_SCHEMAS, type BrandProfile, type PackData } from '../../src/schema';
import { getEntityGraph } from '../../src/selection/hooks';
import { resetEditForTest, useEditStore } from '../../src/store/edit';
import { usePackStore } from '../../src/store/pack';
import { resetSelectionForTest } from '../../src/store/selection';
import { placeEntityOnBoard } from '../../src/whiteboard/entityActions';
import {
  alignItems, applyClusters, clusterPrompt, clusterTexts, connect, connectorLine, expandGroups, frameSelection, groupSelection,
  parseClusterJson, placeCard, refreshConnectors, resetVotes, totalVotes, ungroupSelection, voteItem,
} from '../../src/whiteboard/ops';
import { MAX_TIMER_SEC, formatClock, isRunning, remainingMs, useTimer } from '../../src/whiteboard/timer';

const sticky = (id: string, x: number, y: number, text = id, w = 180, h = 140): BoardItem => ({ id, type: 'sticky', x, y, w, h, text });
const ids = (...v: string[]) => new Set(v);

describe('FR-097 AC-119 コネクター', () => {
  it('FR-097 AC-119 2 枚の付箋をつなぐと、向き（from → to）と、境界から境界までの線分ができる', () => {
    const items = [sticky('a', 0, 0), sticky('b', 400, 0)];
    const r = connect(items, 'a', 'b');
    const c = r.items.find((i) => i.type === 'connector')!;
    expect([c.from, c.to]).toEqual(['a', 'b']);
    expect(c.x1).toBe(180); // a の右の辺
    expect(c.x2).toBe(400); // b の左の辺
    expect(c.y1).toBe(70);
    expect(c.y2).toBe(70);
  });

  it('FR-097 AC-119 同じ向きの重複や、自分自身・存在しない項目・つなげない項目（フレーム）へは作らない', () => {
    const items: BoardItem[] = [sticky('a', 0, 0), sticky('b', 400, 0), { id: 'f', type: 'frame', x: 0, y: 0, w: 10, h: 10 }];
    const once = connect(items, 'a', 'b');
    expect(connect(once.items, 'a', 'b').items).toBe(once.items);
    expect(connect(items, 'a', 'a').id).toBeNull();
    expect(connect(items, 'a', 'zzz').id).toBeNull();
    expect(connect(items, 'a', 'f').id).toBeNull();
    // 逆向きは別のコネクター
    expect(connect(once.items, 'b', 'a').items.filter((i) => i.type === 'connector')).toHaveLength(2);
  });

  it('FR-097 AC-119 つないだ付箋を動かすと、コネクターの線分も付いてくる', () => {
    const base = connect([sticky('a', 0, 0), sticky('b', 400, 0)], 'a', 'b').items;
    const moved = refreshConnectors(base.map((i) => (i.id === 'b' ? { ...i, y: 200 } : i)));
    const c = moved.find((i) => i.type === 'connector')!;
    expect(c.y2).toBeGreaterThan(70);
    expect(c.h).toBeGreaterThan(0);
    // 動かさなければ、同じ配列のまま（無駄な更新をしない）
    expect(refreshConnectors(base)).toBe(base);
    expect(connectorLine({ from: 'a', to: 'x' }, new Map())).toBeNull();
  });

  it('FR-097 AC-119 付箋を消すと、つながっていたコネクターも一緒に消える', () => {
    const b = createBoard('t');
    useInk.setState({ boards: [{ ...b, items: connect([sticky('a', 0, 0), sticky('b', 400, 0)], 'a', 'b').items }], activeBoardId: b.id, history: {}, selection: null });
    useInk.getState().removeObjects(b.id, ['a']);
    expect(useInk.getState().boards[0]!.items.map((i) => i.id)).toEqual(['b']);
  });
});

describe('FR-097 AC-119 フレーム・グループ・整列', () => {
  it('FR-097 AC-119 選んだ付箋を囲むフレームができ、付箋に frameId が付く。フレームは付箋の下（配列の先頭）に置く', () => {
    const items = [sticky('a', 100, 100), sticky('b', 260, 140), sticky('c', 420, 90)];
    const r = frameSelection(items, ids('a', 'b', 'c'))!;
    const frame = r.items[0]!;
    expect(frame.type).toBe('frame');
    expect(frame.id).toBe(r.frameId);
    for (const s of r.items.filter((i) => i.type === 'sticky')) {
      expect(s.frameId).toBe(r.frameId);
      expect(s.x).toBeGreaterThanOrEqual(frame.x);
      expect(s.y).toBeGreaterThanOrEqual(frame.y);
      expect(s.x + s.w).toBeLessThanOrEqual(frame.x + frame.w);
      expect(s.y + s.h).toBeLessThanOrEqual(frame.y + frame.h);
    }
    expect(frameSelection(items, ids())).toBeNull();
  });

  it('FR-097 AC-119 フレームの中をクリックしても、中の付箋などを邪魔しない（枠線と見出しだけが当たる）', () => {
    const framed = frameSelection([sticky('a', 100, 100)], ids('a'))!;
    const frame = framed.items[0]!;
    expect(itemHit(frame, { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 }, 4)).toBe(false);
    expect(itemHit(frame, { x: frame.x + 20, y: frame.y + 10 }, 4)).toBe(true);
    // 付箋のある場所のヒットは付箋
    expect(hitTest({ strokes: [], items: framed.items }, { x: 150, y: 150 }, 4)?.id).toBe('a');
  });

  it('FR-097 AC-119 グループにすると同じ groupId が付き、解除できる。2 つ未満ではグループにしない', () => {
    const items = [sticky('a', 0, 0), sticky('b', 200, 0), sticky('c', 400, 0)];
    const g = groupSelection(items, ids('a', 'b'))!;
    expect(g.items.filter((i) => i.groupId === g.groupId).map((i) => i.id)).toEqual(['a', 'b']);
    expect(groupSelection(items, ids('a'))).toBeNull();
    expect(expandGroups(g.items, ['a']).sort()).toEqual(['a', 'b']);
    expect(ungroupSelection(g.items, ids('a')).every((i) => !i.groupId)).toBe(true);
  });

  it('FR-097 AC-119 上揃え・左右中央揃え・等間隔。フレームごと選んだときは、フレームは動かさず中身だけを揃える', () => {
    const items = [sticky('a', 100, 100), sticky('b', 260, 140), sticky('c', 420, 90)];
    const top = alignItems(items, ids('a', 'b', 'c'), 'top');
    expect(new Set(top.map((i) => i.y))).toEqual(new Set([90]));
    const h = alignItems(items, ids('a', 'b', 'c'), 'hdistribute');
    const xs = h.map((i) => i.x).sort((p, q) => p - q);
    expect(xs[1]! - xs[0]! - 180).toBeCloseTo(xs[2]! - xs[1]! - 180);
    expect(alignItems(items, ids('a'), 'top')).toBe(items);
    expect(alignItems(items, ids('a', 'b'), 'hdistribute')).toBe(items);

    const framed = frameSelection(items, ids('a', 'b', 'c'))!;
    const framedTop = alignItems(framed.items, ids('a', 'b', 'c', framed.frameId), 'top');
    expect(framedTop.find((i) => i.type === 'frame')).toBe(framed.items[0]);
    expect(new Set(framedTop.filter((i) => i.type === 'sticky').map((i) => i.y))).toEqual(new Set([90]));
  });

  it('FR-097 AC-119 ボードを保存した形にして読み戻しても、付箋・コネクター・フレーム・グループが同じ（再読込後も残る）', () => {
    const framed = frameSelection(connect([sticky('a', 0, 0), sticky('b', 400, 0)], 'a', 'b').items, ids('a', 'b'))!;
    const grouped = groupSelection(framed.items, ids('a', 'b'))!;
    const b = { ...createBoard('t'), items: grouped.items };
    const restored = fromSaved(JSON.parse(JSON.stringify(toSaved(b.id, [b]))))!;
    expect(restored.activeBoardId).toBe(b.id);
    expect(restored.boards[0]!.items).toEqual(grouped.items);
    // 壊れた保存値は使わない
    expect(fromSaved(null)).toBeNull();
    expect(fromSaved({ v: 2, boards: [] })).toBeNull();
    expect(fromSaved({ v: 1, boards: [{ id: 1 }] })).toBeNull();
  });

  it('FR-097 AC-119 プレゼン中の一時的な注釈（temporary）は保存しない', () => {
    const b = createBoard('t');
    const keep = { id: 'k1', tool: 'pen' as const, color: 'auto', size: 3, points: [], bounds: { x: 0, y: 0, w: 0, h: 0 } };
    const saved = toSaved(b.id, [{ ...b, strokes: [keep, { ...keep, id: 'k2', temporary: true }] }]);
    expect(saved.boards[0]!.strokes.map((s) => s.id)).toEqual(['k1']);
  });

  it('FR-097 AC-119 点の下にいちばん手前の付箋を選ぶ（重なっていれば後から置いた方）。角の点も含む', () => {
    const items = [sticky('a', 100, 100), sticky('b', 260, 140)];
    expect(nodeAt({ items }, { x: 100, y: 100 })?.id).toBe('a');
    expect(nodeAt({ items }, { x: 260, y: 140 })?.id).toBe('b');
    expect(nodeAt({ items }, { x: 5, y: 5 })).toBeNull();
  });
});

// ---- FR-098 ----
const mono = (() => {
  const dir = path.resolve(__dirname, '../../examples/mono/public');
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(DATA_SCHEMAS)) out[name] = schema.parse(JSON.parse(fs.readFileSync(path.join(dir, 'data', `${name}.json`), 'utf8')));
  const brand = BrandProfileSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, 'brand', 'brand-profile.json'), 'utf8'))) as BrandProfile;
  return { data: out as PackData, brand };
})();
const ISSUE = mono.data.issues.issues[0]!.id;

function loadApp(): string {
  resetSelectionForTest();
  resetEditForTest();
  usePackStore.setState({
    original: mono.data,
    state: { status: 'ready', warnings: [], pack: { data: mono.data, brand: mono.brand, issues: [], disabledIds: [], isExample: true } },
  });
  const b = createBoard('ボード 1', null);
  useInk.setState({ boards: [b], activeBoardId: b.id, history: {}, selection: null });
  return b.id;
}
const activeItems = () => { const s = useInk.getState(); return s.boards.find((x) => x.id === s.activeBoardId)!.items; };

describe('FR-098 AC-120 アプリのデータのカード', () => {
  beforeEach(() => { loadApp(); });

  it('FR-098 AC-120 課題を置くと、元データの ID・名前・種類（課題）を持つカードができ、同じ課題は重ねて置かない', () => {
    const r = placeEntityOnBoard(ISSUE);
    expect(r.ok).toBe(true);
    const cards = activeItems().filter((i) => i.type === 'card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ sourceEntityId: ISSUE, sub: '課題', label: getEntityGraph()!.node(ISSUE)!.label });
    expect(placeEntityOnBoard(ISSUE).message).toMatch(/すでに/);
    expect(activeItems().filter((i) => i.type === 'card')).toHaveLength(1);
    expect(placeEntityOnBoard('issue-nothing').ok).toBe(false);
  });

  it('FR-098 AC-120 ドロップした位置（ワールド座標）を中心にカードを置く', () => {
    placeEntityOnBoard(ISSUE, { x: 500, y: 300 });
    const c = activeItems().find((i) => i.type === 'card')!;
    expect(c.x + c.w / 2).toBe(500);
    expect(c.y + c.h / 2).toBe(300);
  });

  it('FR-098 AC-120 カードの元データを編集モードで改名すると、エンティティ関係グラフ（表・ナレッジグラフの元）の名前が変わる', () => {
    placeEntityOnBoard(ISSUE);
    const card = activeItems().find((i) => i.type === 'card')!;
    useEditStore.getState().setEditMode(true);
    const r = useEditStore.getState().rename(card.sourceEntityId!, 'カードで改名UT-120');
    expect(r.ok).toBe(true);
    expect(getEntityGraph()!.node(ISSUE)!.label).toBe('カードで改名UT-120');
    // 編集モードが OFF のときは、改名できず、元データは変わらない
    useEditStore.getState().setEditMode(false);
    expect(useEditStore.getState().rename(ISSUE, 'OFFでは変わらない').ok).toBe(false);
    expect(getEntityGraph()!.node(ISSUE)!.label).toBe('カードで改名UT-120');
  });

  it('FR-098 AC-120 placeCard は純粋な関数で、同じ元データなら既存のカードの ID を返す', () => {
    const first = placeCard([], { entityId: 'x', label: 'X', sub: '課題' }, { x: 0, y: 0 });
    expect(first.existing).toBe(false);
    const again = placeCard(first.items, { entityId: 'x', label: 'X' }, { x: 9, y: 9 });
    expect(again.existing).toBe(true);
    expect(again.items).toBe(first.items);
    expect(again.id).toBe(first.id);
  });
});

// ---- FR-099 ----
describe('FR-099 AC-121 付箋のクラスタリング（モックの AI）', () => {
  const texts = ['在庫の欠品', '在庫の過剰', '配送の遅延', '配送コスト', '人手不足'];

  it('FR-099 AC-121 語の重なりで分け、まとまらなかった付箋は「その他」に集める。同じ入力は同じ結果', () => {
    const c = clusterTexts(texts);
    expect(c.map((x) => x.members)).toEqual([[0, 1], [2, 3], [4]]);
    expect(c.map((x) => x.name)).toEqual(['在庫', '配送', 'その他']);
    expect(clusterTexts(texts)).toEqual(c);
    // すべてが重ならなくても、全員がどこかのグループに入る
    const all = clusterTexts(['あ', 'い']).flatMap((x) => x.members).sort();
    expect(all).toEqual([0, 1]);
  });

  it('FR-099 AC-121 AI の応答（JSON）を検べる: 全員が 1 回ずつ入っていれば使い、欠け・壊れは使わない（null）', () => {
    const good = parseClusterJson('結果: {"groups":[{"name":"在庫","members":[0,1]},{"name":"人","members":[2]}]}', 3);
    expect(good).toEqual([{ name: '在庫', members: [0, 1] }, { name: '人', members: [2] }]);
    expect(parseClusterJson('{"groups":[{"name":"在庫","members":[0]}]}', 3)).toBeNull();
    expect(parseClusterJson('JSON ではない', 3)).toBeNull();
    expect(parseClusterJson('{"groups":[{"members":"x"}]}', 1)).toBeNull();
    // 重複・範囲外の番号は捨てる
    expect(parseClusterJson('{"groups":[{"name":"a","members":[0,0,9]},{"members":[1]}]}', 2)).toEqual([{ name: 'a', members: [0] }, { name: 'グループ 2', members: [1] }]);
    expect(clusterPrompt(['あ', 'い'])).toContain('1: い');
  });

  it('FR-099 AC-121 結果をボードに適用すると、グループごとに同じ groupId と、AI 生成のフレーム（author: ai）ができる。再実行で前回のフレームは残らない', () => {
    const items = texts.map((t, i) => sticky(`s${i}`, 100 + i * 110, 120, t));
    const clusters = clusterTexts(texts);
    const out = applyClusters(items, items.map((i) => i.id), clusters);
    const frames = out.filter((i) => i.type === 'frame');
    expect(frames).toHaveLength(3);
    expect(frames.every((f) => f.author === 'ai')).toBe(true);
    expect(frames.map((f) => f.label)).toEqual(['在庫', '配送', 'その他']);
    const st = out.filter((i) => i.type === 'sticky');
    expect(new Set(st.map((i) => i.groupId)).size).toBe(3);
    for (const s of st) expect(frames.find((f) => f.id === s.frameId)).toBeTruthy();
    // 同じグループの付箋は縦に並び、重ならない
    const g0 = st.filter((s) => s.groupId === st[0]!.groupId);
    expect(g0).toHaveLength(2);
    expect(Math.abs(g0[0]!.y - g0[1]!.y)).toBeGreaterThanOrEqual(140);
    // 再実行: AI のフレームは増えない
    const again = applyClusters(out, items.map((i) => i.id), clusters);
    expect(again.filter((i) => i.type === 'frame')).toHaveLength(3);
  });

  it('FR-099 AC-121 クラスタリングは「元に戻す」で 1 回で取り消せる（store.updateItems）', () => {
    const b = createBoard('t');
    useInk.setState({ boards: [{ ...b, items: texts.map((t, i) => sticky(`s${i}`, 100 + i * 110, 120, t)) }], activeBoardId: b.id, history: {}, selection: null });
    const before = useInk.getState().boards[0]!.items;
    useInk.getState().updateItems(b.id, (items) => applyClusters(items, items.map((i) => i.id), clusterTexts(texts)));
    expect(useInk.getState().boards[0]!.items.some((i) => i.type === 'frame')).toBe(true);
    useInk.getState().undo(b.id);
    expect(useInk.getState().boards[0]!.items).toEqual(before);
    // 同じ配列を返せば、履歴は積まれない
    useInk.getState().updateItems(b.id, (items) => items);
    expect(useInk.getState().history[b.id]?.undo.length ?? 0).toBe(0);
  });
});

describe('FR-099 AC-121 ドット投票', () => {
  it('FR-099 AC-121 クリックのたびに 1 票ずつ増え、付箋ごとの票数と合計が出る。0 未満にはならない。付箋以外には入らない', () => {
    let items: BoardItem[] = [sticky('a', 0, 0), sticky('b', 200, 0), { id: 'c', type: 'card', x: 0, y: 200, w: 220, h: 76 }];
    items = voteItem(voteItem(items, 'a', 1), 'a', 1);
    items = voteItem(items, 'b', 1);
    items = voteItem(items, 'c', 1);
    expect(items.map((i) => i.votes ?? 0)).toEqual([2, 1, 0]);
    expect(totalVotes(items)).toBe(3);
    expect(voteItem(voteItem(items, 'b', -1), 'b', -1).find((i) => i.id === 'b')!.votes).toBe(0);
    expect(resetVotes(items).every((i) => !i.votes)).toBe(true);
    expect(resetVotes([sticky('z', 0, 0)])).toHaveLength(1);
  });

  it('FR-099 AC-121 投票の最中の状態（voteMode）はストアで切り替わる', () => {
    useInk.getState().setVoteMode(true);
    expect(useInk.getState().voteMode).toBe(true);
    useInk.getState().setVoteMode(false);
    expect(useInk.getState().voteMode).toBe(false);
  });
});

describe('FR-099 AC-121 タイマー', () => {
  beforeEach(() => { useTimer.getState().setDuration(300); });

  it('FR-099 AC-121 残り時間は「分:秒」の文字になる（切り上げ。0 以下は 0:00）', () => {
    expect(formatClock(300_000)).toBe('5:00');
    expect(formatClock(299_001)).toBe('5:00');
    expect(formatClock(59_000)).toBe('0:59');
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5000)).toBe('0:00');
    expect(formatClock(3_725_000)).toBe('62:05');
  });

  it('FR-099 AC-121 開始すると残りが減り、一時停止で止まり、続きから再開でき、リセットで長さに戻る', () => {
    const t = useTimer.getState();
    t.start(1000);
    expect(remainingMs(useTimer.getState(), 3000)).toBe(298_000);
    expect(isRunning(useTimer.getState(), 3000)).toBe(true);
    t.pause(3000);
    expect(remainingMs(useTimer.getState(), 99_999)).toBe(298_000);
    useTimer.getState().start(10_000);
    expect(remainingMs(useTimer.getState(), 11_000)).toBe(297_000);
    useTimer.getState().reset();
    expect(remainingMs(useTimer.getState(), 0)).toBe(300_000);
  });

  it('FR-099 AC-121 時間が来たら 0:00 で止まり、開始し直すと最初の長さから始まる。長さは 1 秒〜99 分 59 秒に収める', () => {
    useTimer.getState().start(0);
    expect(isRunning(useTimer.getState(), 400_000)).toBe(false);
    expect(remainingMs(useTimer.getState(), 400_000)).toBe(0);
    useTimer.getState().start(500_000);
    expect(remainingMs(useTimer.getState(), 500_000)).toBe(300_000);
    useTimer.getState().setDuration(99999);
    expect(useTimer.getState().durationSec).toBe(MAX_TIMER_SEC);
    useTimer.getState().setDuration(0);
    expect(useTimer.getState().durationSec).toBe(1);
  });
});

describe('FR-097 AC-119 ID', () => {
  it('FR-097 AC-119 newId は重ならない', () => {
    expect(new Set(Array.from({ length: 200 }, () => newId('x'))).size).toBe(200);
  });
});
