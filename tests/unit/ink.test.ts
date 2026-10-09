// インクの単体テスト（FR-086 / FR-087 / FR-088 / FR-089）。描画面の操作そのものは System Test（E2E-082・E2E-083）が確かめる。
import { beforeEach, describe, expect, it } from 'vitest';
import { erasePixels, hitTest, lassoSelect, selectionBounds } from '../../src/ink/geometry';
import { PointerRouter, effectivePressure, pinchDelta, widthAt } from '../../src/ink/input';
import { boardContentBounds, createBoard, makeShape, makeStroke, type InkPoint } from '../../src/ink/model';
import { strokeOutline } from '../../src/ink/outline';
import { recognizeShape } from '../../src/ink/recognize';
import { annotationBoardId, syntheticStrokes, useInk } from '../../src/ink/store';
import { fitView, panView, screenToWorld, visibleBounds, worldToScreen, zoomView } from '../../src/ink/viewport';

const pt = (x: number, y: number, p = 0.5): InkPoint => ({ x, y, p });
const line = (x1: number, y1: number, x2: number, y2: number, n = 10): InkPoint[] =>
  Array.from({ length: n + 1 }, (_, i) => pt(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n));

function reset() {
  const b = createBoard('ボード 1');
  useInk.setState({ boards: [b], activeBoardId: b.id, tool: 'pen', color: 'auto', size: 3, selection: null, history: {} });
  return b.id;
}

describe('FR-087 AC-105 pointerType による入力の振り分け', () => {
  const ev = (pointerType: string, extra: Record<string, number> = {}, t = 1000) => ({ pointerType, button: 0, buttons: 1, timeStamp: t, ...extra });

  it('FR-087 AC-105 ペンは描画、タッチはパン/ズーム、マウスの左は選んだ道具', () => {
    const r = new PointerRouter();
    expect(r.down(ev('pen'), 1)).toBe('draw');
    r.up({ pointerType: 'pen', timeStamp: 1100 }, 1);
    expect(r.down(ev('touch', {}, 5000), 2)).toBe('pan');
    expect(r.down(ev('mouse'), 3)).toBe('draw');
  });

  it('FR-087 AC-105 ペンの接触中のタッチは無視される（パームリジェクション）', () => {
    const r = new PointerRouter();
    r.down(ev('pen'), 1);
    expect(r.down(ev('touch', {}, 1010), 2)).toBe('ignore');
    r.up({ pointerType: 'pen', timeStamp: 1100 }, 1);
    // 離した直後（猶予の間）も無視、猶予が過ぎたらパン
    expect(r.down(ev('touch', {}, 1200), 3)).toBe('ignore');
    expect(r.down(ev('touch', {}, 1500), 4)).toBe('pan');
  });

  it('FR-087 AC-105 接触面が大きいタッチ（手のひら）は無視される', () => {
    const r = new PointerRouter();
    expect(r.down(ev('touch', { width: 80, height: 90 }), 1)).toBe('ignore');
    expect(r.down(ev('touch', { width: 12, height: 12 }), 2)).toBe('pan');
  });

  it('FR-087 AC-105 ペンの消しゴムボタン（buttons の 32 / button 5）は消去、マウスの中ボタンはパン、右ボタンは何もしない', () => {
    const r = new PointerRouter();
    expect(r.down(ev('pen', { buttons: 32 }), 1)).toBe('erase');
    expect(r.down(ev('pen', { button: 5, buttons: 0 }), 2)).toBe('erase');
    expect(r.down({ pointerType: 'mouse', button: 1, buttons: 4, timeStamp: 0 })).toBe('pan');
    expect(r.down({ pointerType: 'mouse', button: 2, buttons: 2, timeStamp: 0 })).toBe('ignore');
  });

  it('FR-087 AC-105 筆圧の値がストロークの太さに反映される（強いほど太い。マウスは基本の太さ）', () => {
    const soft = widthAt(4, 0.1), hard = widthAt(4, 0.9);
    expect(hard).toBeGreaterThan(soft);
    expect(widthAt(4, 0.5)).toBeCloseTo(4);
    expect(effectivePressure({ pointerType: 'mouse', pressure: 0.9 })).toBe(0.5);
    expect(effectivePressure({ pointerType: 'pen', pressure: 0.8 })).toBeCloseTo(0.8);
    // 傾きが大きいと太くなる
    expect(effectivePressure({ pointerType: 'pen', pressure: 0.5, tiltX: 60, tiltY: 0 })).toBeGreaterThan(0.5);
    // 輪郭の幅も筆圧に従う
    const width = (p: number) => {
      const o = strokeOutline(line(0, 0, 100, 0, 20).map((q) => ({ ...q, p })), 4);
      const ys = o.map((q) => q.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(width(0.9)).toBeGreaterThan(width(0.1) * 2);
  });

  it('FR-087 AC-105 2 本指の操作から倍率と移動量を求める', () => {
    const d = pinchDelta([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 0, y: 0 }, { x: 200, y: 0 }])!;
    expect(d.factor).toBeCloseTo(2);
    expect(pinchDelta([{ x: 0, y: 0 }], [{ x: 0, y: 0 }])).toBeNull();
  });
});

describe('FR-089 AC-108 フリーハンドの図形の整形', () => {
  const circle = (r = 50, n = 40, wobble = 0) => Array.from({ length: n + 1 }, (_, i) => {
    const a = (Math.PI * 2 * i) / n;
    const k = 1 + wobble * Math.sin(i * 1.7);
    return pt(100 + Math.cos(a) * r * k, 100 + Math.sin(a) * r * k);
  });
  const rect = (x: number, y: number, w: number, h: number) => [
    ...line(x, y, x + w, y, 12), ...line(x + w, y, x + w, y + h, 8).slice(1),
    ...line(x + w, y + h, x, y + h, 12).slice(1), ...line(x, y + h, x, y, 8).slice(1),
  ];

  it('FR-089 AC-108 円に近い点列は楕円（円）になる', () => {
    expect(recognizeShape(circle())?.kind).toBe('ellipse');
    expect(recognizeShape(circle(50, 30, 0.04))?.kind).toBe('ellipse');
  });

  it('FR-089 AC-108 矩形に近い点列は矩形になり、外接矩形が返る', () => {
    const r = recognizeShape(rect(20, 30, 160, 90));
    expect(r?.kind).toBe('rect');
    expect(r?.x1).toBeCloseTo(20); expect(r?.y2).toBeCloseTo(120);
  });

  it('FR-089 AC-108 直線に近い点列は直線になり、手ぶれがあっても始点と終点を結ぶ', () => {
    const wobbly = line(0, 0, 200, 40, 20).map((q, i) => ({ ...q, y: q.y + (i % 2 ? 2 : -2) }));
    const r = recognizeShape(wobbly);
    expect(r?.kind).toBe('line');
    expect(r?.x2).toBeCloseTo(200);
  });

  it('FR-089 AC-108 どれにも近くない点列はフリーハンドのまま（null）', () => {
    // ジグザグ、三角形、S 字、点が少ない・小さすぎる
    expect(recognizeShape(line(0, 0, 50, 80, 6).concat(line(50, 80, 100, 0, 6), line(100, 0, 150, 80, 6)))).toBeNull();
    const tri = [...line(0, 0, 120, 0, 10), ...line(120, 0, 60, 100, 10), ...line(60, 100, 0, 0, 10)];
    expect(recognizeShape(tri)).toBeNull();
    const s = Array.from({ length: 40 }, (_, i) => pt(i * 4, Math.sin(i / 4) * 40));
    expect(recognizeShape(s)).toBeNull();
    expect(recognizeShape([pt(0, 0), pt(1, 1)])).toBeNull();
    expect(recognizeShape(line(0, 0, 5, 5))).toBeNull();
  });
});

describe('FR-086 AC-104 視点（パン/ズーム/全体表示）', () => {
  it('FR-086 AC-104 画面とワールドの座標が往復で一致し、ズームは指した点を動かさない', () => {
    const v = { x: 100, y: -50, zoom: 2 };
    const w = screenToWorld(v, 300, 200);
    expect(worldToScreen(v, w.x, w.y)).toEqual({ x: 300, y: 200 });
    const z = zoomView(v, 1.5, 300, 200);
    const w2 = screenToWorld(z, 300, 200);
    expect(w2.x).toBeCloseTo(w.x); expect(w2.y).toBeCloseTo(w.y);
    expect(panView(v, 20, 10)).toMatchObject({ x: 90, y: -55 });
  });

  it('FR-086 AC-104 全体表示は全ストロークを表示領域に収める（遠く離れた線も）', () => {
    const board = createBoard('b');
    board.strokes = [makeStroke('pen', 'auto', 3, line(40, 40, 140, 90)), makeStroke('pen', 'auto', 3, line(3700, 100, 3800, 160))];
    const content = boardContentBounds(board)!;
    const v = fitView(content, 1000, 500);
    const vis = visibleBounds(v, 1000, 500);
    for (const s of board.strokes) {
      expect(s.bounds.x).toBeGreaterThanOrEqual(vis.x);
      expect(s.bounds.x + s.bounds.w).toBeLessThanOrEqual(vis.x + vis.w);
      expect(s.bounds.y).toBeGreaterThanOrEqual(vis.y);
      expect(s.bounds.y + s.bounds.h).toBeLessThanOrEqual(vis.y + vis.h);
    }
    expect(fitView(null, 1000, 500)).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

describe('FR-086 AC-104 複数ボードと注釈（ストア）', () => {
  beforeEach(() => { reset(); });

  it('FR-086 AC-104 議題ごとに複数のボードを持ち、背景を選べる', () => {
    const st = useInk.getState();
    const first = st.activeBoardId;
    st.ensureTopicBoard('theme-1');
    expect(useInk.getState().boards.filter((b) => b.topicId === 'theme-1')).toHaveLength(1);
    const second = useInk.getState().addBoard('theme-1');
    expect(useInk.getState().boards.filter((b) => b.topicId === 'theme-1').map((b) => b.name)).toEqual(['ボード 1', 'ボード 2']);
    useInk.getState().setBackground(second, 'grid');
    expect(useInk.getState().boards.find((b) => b.id === second)?.background).toBe('grid');
    // 別の議題に戻すと、その議題のボードが選ばれる
    useInk.getState().ensureTopicBoard(null);
    expect(useInk.getState().activeBoardId).toBe(first);
  });

  it('FR-086 AC-104 注釈はビューごとのボードに残り、ボードの一覧には出ない', () => {
    const id = useInk.getState().ensureAnnotationBoard('view3d');
    expect(id).toBe(annotationBoardId('view3d'));
    useInk.getState().addStroke(id, makeStroke('pen', 'auto', 3, line(0, 0, 10, 10)));
    expect(useInk.getState().ensureAnnotationBoard('view3d')).toBe(id);
    expect(useInk.getState().boards.find((b) => b.id === id)?.strokes).toHaveLength(1);
    expect(useInk.getState().boards.find((b) => b.id === id)?.kind).toBe('annotation');
    // ボードを追加しても注釈は選べるボードに含まれない
    useInk.getState().setActiveBoard(id);
    expect(useInk.getState().activeBoardId).not.toBe(id);
  });
});

describe('FR-088 AC-107 インクの道具（ストア・幾何）', () => {
  let id = '';
  beforeEach(() => { id = reset(); });

  it('FR-088 AC-107 投げ縄で囲んだ要素だけを選び、移動できる', () => {
    const a = makeStroke('pen', 'auto', 3, line(40, 30, 160, 60));
    const b = makeStroke('highlighter', 'auto', 3, line(40, 80, 160, 110));
    const note = { id: 'n1', type: 'sticky' as const, x: 400, y: 20, w: 100, h: 80, text: '付箋' };
    useInk.getState().addStroke(id, a);
    useInk.getState().addStroke(id, b);
    useInk.getState().addItem(id, note);
    const board = useInk.getState().boards[0]!;
    const ring = [{ x: 20, y: 15 }, { x: 190, y: 15 }, { x: 190, y: 75 }, { x: 20, y: 75 }, { x: 20, y: 15 }];
    const ids = lassoSelect(board, ring);
    expect(ids).toEqual([a.id]);
    useInk.getState().moveObjects(id, ids, 0, 300);
    const moved = useInk.getState().boards[0]!;
    expect(moved.strokes.find((s) => s.id === a.id)!.bounds.y).toBe(330);
    expect(moved.strokes.find((s) => s.id === a.id)!.points[0]!.y).toBe(330);
    expect(moved.strokes.find((s) => s.id === b.id)!.bounds.y).toBe(80);
    expect(selectionBounds(moved, new Set(ids))).toMatchObject({ y: 330 });
  });

  it('FR-088 AC-107 ストローク単位の消しゴムで 1 本だけ消え、Ctrl+Z（undo）で戻り、redo でやり直せる', () => {
    const a = makeStroke('pen', 'auto', 3, line(0, 0, 100, 0));
    const b = makeStroke('highlighter', 'auto', 3, line(0, 50, 100, 50));
    useInk.getState().addStroke(id, a);
    useInk.getState().addStroke(id, b);
    const hit = hitTest(useInk.getState().boards[0]!, { x: 50, y: 50 }, 6);
    expect(hit).toEqual({ kind: 'stroke', id: b.id });
    expect(hitTest(useInk.getState().boards[0]!, { x: 50, y: 25 }, 6)).toBeNull();
    useInk.getState().removeObjects(id, [b.id]);
    expect(useInk.getState().boards[0]!.strokes.map((s) => s.id)).toEqual([a.id]);
    useInk.getState().undo(id);
    expect(useInk.getState().boards[0]!.strokes.map((s) => s.id)).toEqual([a.id, b.id]);
    useInk.getState().redo(id);
    expect(useInk.getState().boards[0]!.strokes).toHaveLength(1);
  });

  it('FR-088 AC-107 ピクセル単位の消しゴムは線を分割し、ドラッグ 1 回が元に戻す 1 回分になる', () => {
    const a = makeStroke('pen', 'auto', 3, line(0, 0, 200, 0, 40));
    useInk.getState().addStroke(id, a);
    useInk.getState().beginErase(id);
    useInk.getState().erasePixelsAt(id, { x: 100, y: 0 }, 10);
    useInk.getState().erasePixelsAt(id, { x: 140, y: 0 }, 10);
    const pieces = useInk.getState().boards[0]!.strokes;
    expect(pieces.length).toBe(3);
    for (const p of pieces) expect(p.points.every((q) => Math.abs(q.x - 100) > 9 && Math.abs(q.x - 140) > 9)).toBe(true);
    useInk.getState().undo(id);
    expect(useInk.getState().boards[0]!.strokes.map((s) => s.id)).toEqual([a.id]);
    // 当たらない消しゴムは同じストロークをそのまま返す
    expect(erasePixels([a], { x: 100, y: 500 }, 10)[0]).toBe(a);
  });

  it('FR-088 AC-107 図形（直線・矢印・矩形・円・吹き出し）は外接矩形を持ち、テキスト・付箋・画像も項目として追加できる', () => {
    for (const k of ['line', 'arrow', 'rect', 'ellipse', 'callout'] as const) {
      const s = makeShape(k, 160, 90, 40, 30, 'auto', 3);
      expect(s).toMatchObject({ type: 'shape', shape: k, x: 40, y: 30, w: 120, h: 60 });
      useInk.getState().addItem(id, s);
    }
    useInk.getState().addItem(id, { id: 't', type: 'text', x: 0, y: 0, w: 240, h: 40, text: 'テキスト' });
    useInk.getState().addItem(id, { id: 'i', type: 'image', x: 0, y: 0, w: 40, h: 30, src: 'data:image/png;base64,AAAA' });
    expect(useInk.getState().boards[0]!.items.map((i) => i.type)).toEqual(['shape', 'shape', 'shape', 'shape', 'shape', 'text', 'image']);
    useInk.getState().patchItem(id, 't', { text: '更新' });
    expect(useInk.getState().boards[0]!.items.find((i) => i.id === 't')?.text).toBe('更新');
  });
});

describe('NFR-PERF-004 インクの描画の規模', () => {
  it('NFR-PERF-004 AC-164 合成データは決まった並びで 20000 本を作れ、読み込める（描画時間の計測は FR-095 の AC-117）', () => {
    const a = syntheticStrokes(20000), b = syntheticStrokes(20000);
    expect(a).toHaveLength(20000);
    expect(a[123]!.bounds).toEqual(b[123]!.bounds);
    const id = reset();
    expect(useInk.getState().loadSynthetic(20000)).toBe(20000);
    expect(useInk.getState().boards.find((x) => x.id === id)!.strokes).toHaveLength(20000);
  });
});
