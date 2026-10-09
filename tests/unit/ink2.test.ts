// インク 2（FR-090 / FR-091 / FR-095 / FR-096）の単体・結合テスト。画面の操作そのものは System Test（E2E-084・085・089・090・091）が確かめる。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RECOGNIZED_LABEL, mockRecognizer, recognizeHandwriting, setHandwritingRecognizer } from '../../src/ink/handwriting';
import { createBoard, makeStroke, type Board, type BoardItem, type InkPoint } from '../../src/ink/model';
import { contentChanged, createInkPersister, mergeBoards, type InkIo, type SavedInk } from '../../src/ink/persist';
import { clearTemporaryStrokes, usePresentationInk } from '../../src/ink/presentationInk';
import { useRecognized } from '../../src/ink/recognized';
import { syntheticStrokes, useInk } from '../../src/ink/store';
import { assemblePdf, countContents, fitImage, pageSize, pdfSource } from '../../src/export/pdf';
import { boardSvg } from '../../src/export/svg';
import { usePresentationStore } from '../../src/store/presentation';

const pts = (...xy: Array<[number, number]>): InkPoint[] => xy.map(([x, y]) => ({ x, y, p: 0.5 }));
const sticky = (id: string, x: number, y: number, text: string): BoardItem => ({ id, type: 'sticky', x, y, w: 180, h: 140, text });

function resetInk(): string {
  const b = createBoard('ボード 1');
  useInk.setState({ boards: [b], activeBoardId: b.id, history: {}, selection: null });
  return b.id;
}

describe('FR-090 AC-109 手書き文字の認識と反映', () => {
  beforeEach(() => { setHandwritingRecognizer(null); useRecognized.getState().clear(); });

  // FR-090 AC-109
  it('FR-090 AC-109 選んだ手書きをモックで認識し、同じ手書きには同じ結果を返す', async () => {
    const strokes = [makeStroke('pen', 'auto', 3, pts([0, 0], [10, 10])), makeStroke('pen', 'auto', 3, pts([10, 0], [0, 10]))];
    const a = await recognizeHandwriting(strokes);
    const b = await recognizeHandwriting(strokes);
    expect(a).toEqual(b);
    expect(a?.mock).toBe(true);
    expect(a?.text).toContain('2 画');
  });

  // FR-090 AC-109（異常系）
  it('FR-090 AC-109 異常系: 手書き（ペン・蛍光ペン）がなければ認識しない', async () => {
    expect(await recognizeHandwriting([])).toBeNull();
  });

  // FR-090 AC-109（接続点）
  it('FR-090 AC-109 接続先を差し替えられ、null でモックに戻る（外部には接続しない）', async () => {
    const strokes = [makeStroke('pen', 'auto', 3, pts([0, 0], [10, 10]))];
    setHandwritingRecognizer({ id: 'x', recognize: async () => ({ text: ' 次回 までに  確認 ', mock: false }) });
    expect(await recognizeHandwriting(strokes)).toEqual({ text: '次回 までに 確認', mock: false });
    setHandwritingRecognizer(null);
    expect((await recognizeHandwriting(strokes))?.mock).toBe(true);
    expect(mockRecognizer.id).toBe('mock');
  });

  // FR-090 AC-109
  it('FR-090 AC-109 反映した項目には「AI 生成（認識結果）」のラベルと作成者 ai が付き、元の手書きは消えない', () => {
    const id = resetInk();
    const k = makeStroke('pen', 'auto', 3, pts([0, 0], [10, 10]));
    useInk.getState().addStroke(id, k);
    const item = useRecognized.getState().add({ kind: 'decision', text: '認識結果', boardId: id, strokeIds: [k.id], mock: true });
    expect(item.label).toBe(RECOGNIZED_LABEL);
    expect(item.label).toBe('AI 生成（認識結果）');
    expect(item.author).toBe('ai');
    expect(useInk.getState().boards[0]!.strokes.map((s) => s.id)).toEqual([k.id]);
  });
});

describe('FR-091 AC-111 プレゼン中の注釈と利き手', () => {
  const topics = [
    { id: 't1', title: 'T1', chapterId: 'c1', chapterTitle: 'C1', chapterIndex: 0 },
    { id: 't2', title: 'T2', chapterId: 'c1', chapterTitle: 'C1', chapterIndex: 0 },
    { id: 't3', title: 'T3', chapterId: 'c2', chapterTitle: 'C2', chapterIndex: 1 },
  ];
  beforeEach(() => { usePresentationStore.getState().end(); usePresentationInk.getState().setMode('off'); });

  // FR-091 AC-111
  it('FR-091 AC-111 チャプターを移ると一時的な注釈だけが消え、保存した線は残る（同じチャプターの中では消えない）', () => {
    const id = resetInk();
    usePresentationStore.getState().start(topics);
    const keep = makeStroke('pen', 'auto', 3, pts([0, 0], [5, 5]));
    const tmp = makeStroke('pen', 'auto', 3, pts([1, 1], [6, 6]), true);
    useInk.getState().addStroke(id, keep);
    useInk.getState().addStroke(id, tmp);
    usePresentationStore.getState().next(); // 同じチャプターの次の議題
    expect(useInk.getState().boards[0]!.strokes.map((s) => s.id)).toEqual([keep.id, tmp.id]);
    usePresentationStore.getState().next(); // 次のチャプター
    expect(useInk.getState().boards[0]!.strokes.map((s) => s.id)).toEqual([keep.id]);
  });

  // FR-091 AC-111
  it('FR-091 AC-111 プレゼンを終えると一時的な注釈が消え、書き込みの扱いは「書かない」に戻る', () => {
    const id = resetInk();
    usePresentationStore.getState().start(topics);
    usePresentationInk.getState().setMode('temporary');
    useInk.getState().addStroke(id, makeStroke('pen', 'auto', 3, pts([0, 0], [5, 5]), true));
    usePresentationStore.getState().end();
    expect(useInk.getState().boards[0]!.strokes).toHaveLength(0);
    expect(usePresentationInk.getState().mode).toBe('off');
  });

  // FR-091 AC-111
  it('FR-091 AC-111 一時的な注釈の消去は、一時的なものがなければ何もしない', () => {
    resetInk();
    expect(clearTemporaryStrokes()).toBe(0);
  });

  // FR-091 AC-111
  it('FR-091 AC-111 利き手の設定は左右だけを受け付け、既定は右利き', async () => {
    vi.resetModules();
    const { useSettings } = await import('../../src/store/settings');
    expect(useSettings.getState().handedness).toBe('right');
    useSettings.getState().setHandedness('left');
    expect(useSettings.getState().handedness).toBe('left');
    useSettings.getState().setHandedness('weird' as never);
    expect(useSettings.getState().handedness).toBe('right');
  });
});

describe('FR-095 AC-116 自動保存と復旧', () => {
  const board = (id: string, strokeIds: string[]): Board => ({
    ...createBoard(id, null, 'board', id),
    strokes: strokeIds.map((s) => ({ ...makeStroke('pen', 'auto', 3, pts([0, 0], [4, 4])), id: s })),
  });
  const memoryIo = (initial: unknown, readDelayMs = 0) => {
    const writes: SavedInk[] = [];
    let stored: unknown = initial;
    const io: InkIo = {
      read: () => new Promise((r) => setTimeout(() => r(stored), readDelayMs)),
      write: async (v) => { writes.push(v); stored = v; },
    };
    return { io, writes };
  };

  // FR-095 AC-116
  it('FR-095 AC-116 描いた線は、PARAM-025（2 秒）以内に保存され、読み込み直すと復旧する', async () => {
    vi.useFakeTimers();
    try {
      const id = resetInk();
      const mem = memoryIo(undefined);
      const p = createInkPersister(mem.io);
      const restoring = p.restore(1500);
      await vi.advanceTimersByTimeAsync(10);
      await restoring;
      const stop = p.startAutosave(2000);
      const k = makeStroke('pen', 'auto', 3, pts([0, 0], [5, 5]));
      useInk.getState().addStroke(id, k);
      await vi.advanceTimersByTimeAsync(1999);
      expect(mem.writes).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(2);
      expect(mem.writes).toHaveLength(1);
      expect(mem.writes[0]!.boards[0]!.strokes.map((s) => s.id)).toEqual([k.id]);
      stop();
      // 開き直し（空のボードから読み込む）
      resetInk();
      const p2 = createInkPersister({ read: async () => mem.writes[0], write: async () => undefined });
      expect(await p2.restore(1500)).toBe(true);
      expect(useInk.getState().boards[0]!.strokes.map((s) => s.id)).toEqual([k.id]);
    } finally { vi.useRealTimers(); }
  });

  // FR-095 AC-116（reviewer の指摘）
  it('FR-095 AC-116 読み込みが時間切れになっても、終わるまで空のボードで保存済みを上書きしない', async () => {
    vi.useFakeTimers();
    try {
      const id = resetInk();
      const savedBoard = board(id, ['old-1', 'old-2']);
      const mem = memoryIo({ v: 1, activeBoardId: id, boards: [savedBoard] }, 5000); // 読むのに 5 秒かかる
      const p = createInkPersister(mem.io);
      const restoring = p.restore(1500);
      await vi.advanceTimersByTimeAsync(1600);
      expect(await restoring).toBe(false); // 待たずに進んだ
      expect(p.canSave()).toBe(false);
      const stop = p.startAutosave(2000);
      // 待つ間に新しい線を描く
      const fresh = makeStroke('pen', 'auto', 3, pts([0, 0], [5, 5]));
      useInk.getState().addStroke(id, fresh);
      await vi.advanceTimersByTimeAsync(2500);
      expect(mem.writes).toHaveLength(0); // まだ書かない
      await vi.advanceTimersByTimeAsync(2500); // 読み込みが終わって合流
      await vi.advanceTimersByTimeAsync(2500); // 合流した結果を保存
      expect(p.canSave()).toBe(true);
      const last = mem.writes[mem.writes.length - 1]!;
      expect(last.boards[0]!.strokes.map((s) => s.id).sort()).toEqual(['old-1', 'old-2', fresh.id].sort());
      expect(useInk.getState().boards[0]!.strokes.map((s) => s.id).sort()).toEqual(['old-1', 'old-2', fresh.id].sort());
      stop();
    } finally { vi.useRealTimers(); }
  });

  // FR-095 AC-116
  it('FR-095 AC-116 読み込みが何度も失敗したままのときは、保存済みを壊さないよう数回やり直してから保存を許す', async () => {
    const id = resetInk();
    let calls = 0;
    const p = createInkPersister({ read: async () => { calls += 1; throw new Error('idb'); }, write: async () => undefined }, useInk, 1);
    expect(await p.restore(1000)).toBe(false);
    expect(calls).toBe(3);
    expect(p.canSave()).toBe(true);
    expect(useInk.getState().boards[0]!.id).toBe(id);
  });

  // FR-095 AC-116
  it('FR-095 AC-116 合流は、保存済みの線・項目を消さず、いまのものを優先する', () => {
    const cur = [{ ...board('a', ['s1']), items: [sticky('i1', 0, 0, 'now')] }];
    const saved = [{ ...board('a', ['s0', 's1']), items: [sticky('i1', 0, 0, 'old'), sticky('i0', 5, 5, 'x')] }, board('b', ['z'])];
    const m = mergeBoards(cur, saved);
    expect(m.map((b) => b.id)).toEqual(['a', 'b']);
    expect(m[0]!.strokes.map((s) => s.id).sort()).toEqual(['s0', 's1']);
    expect(m[0]!.items.find((i) => i.id === 'i1')!.text).toBe('now');
    expect(m[0]!.items.map((i) => i.id).sort()).toEqual(['i0', 'i1']);
  });

  // FR-095 AC-116
  it('FR-095 AC-116 一時的な注釈（プレゼン中）は保存しない', async () => {
    const { toSaved } = await import('../../src/ink/persist');
    const b = board('a', ['keep']);
    b.strokes.push(makeStroke('pen', 'auto', 3, pts([0, 0], [1, 1]), true));
    expect(toSaved('a', [b]).boards[0]!.strokes.map((s) => s.id)).toEqual(['keep']);
  });
});

describe('FR-095 AC-117 大量ストローク', () => {
  // FR-095 AC-117
  it('FR-095 AC-117 パン/ズーム（視点だけの変化）では保存の対象にならず、20000 本を書き直さない', () => {
    const id = resetInk();
    useInk.getState().loadSynthetic(20000);
    const before = useInk.getState().boards;
    expect(before[0]!.strokes.length).toBe(20000);
    useInk.getState().setView(id, { x: 100, y: 50, zoom: 1.5 });
    useInk.getState().setBoardSize(id, { w: 1000, h: 600 });
    expect(contentChanged(before, useInk.getState().boards)).toBe(false);
    useInk.getState().addStroke(id, makeStroke('pen', 'auto', 3, pts([0, 0], [1, 1])));
    expect(contentChanged(before, useInk.getState().boards)).toBe(true);
  });

  // FR-095 AC-117
  it('FR-095 AC-117 合成ストロークは決まった並びで、指定の本数できる', () => {
    expect(syntheticStrokes(1000)).toHaveLength(1000);
    expect(syntheticStrokes(50).map((s) => s.points[0]!.x)).toEqual(syntheticStrokes(50).map((s) => s.points[0]!.x));
  });
});

describe('FR-096 AC-118 エクスポートのプレビューと PDF', () => {
  // FR-096 AC-118
  it('FR-096 AC-118 用紙と向きから、ページの大きさ（pt）が決まる', () => {
    expect(pageSize('A4', 'landscape').w).toBeCloseTo(841.89, 1);
    expect(pageSize('A4', 'landscape').h).toBeCloseTo(595.28, 1);
    expect(pageSize('A3', 'portrait').w).toBeCloseTo(841.89, 1);
  });

  // FR-096 AC-118
  it('FR-096 AC-118 画像は余白つきで、用紙の中央に収まる', () => {
    const page = pageSize('A4', 'landscape');
    const r = fitImage(page, { width: 2000, height: 500 });
    expect(r.w).toBeLessThanOrEqual(page.w);
    expect(r.x).toBeGreaterThan(0);
    expect(r.x + r.w / 2).toBeCloseTo(page.w / 2, 3);
    expect(r.y + r.h / 2).toBeCloseTo(page.h / 2, 3);
    expect(r.w / r.h).toBeCloseTo(4, 3);
  });

  // FR-096 AC-118
  it('FR-096 AC-118 PDF は %PDF- で始まり、MediaBox・画像・xref の位置が正しい', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const bytes = assemblePdf(pageSize('A4', 'landscape'), { jpeg, width: 10, height: 5 });
    const text = Buffer.from(bytes).toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/MediaBox [0 0 841.89 595.28]');
    expect(text).toContain('/Filter /DCTDecode');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(Buffer.from(bytes).subarray(startxref, startxref + 4).toString('latin1')).toBe('xref');
    // 各オブジェクトの位置が xref の記載と一致する
    const rows = [...text.slice(startxref).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(rows).toHaveLength(5);
    rows.forEach((off, i) => expect(Buffer.from(bytes).subarray(off, off + 8).toString('latin1')).toMatch(new RegExp(`^${i + 1} 0 obj`)));
  });

  // FR-096 AC-118
  it('FR-096 AC-118 プレビューの画像は、付箋・テキスト・図形・手書きを含み、範囲（ボード全体／表示中の範囲）で切り替わる', () => {
    const b = createBoard('出力テスト');
    b.items = [sticky('s', 10, 10, '付箋KB'), { id: 't', type: 'text', x: 300, y: 10, w: 100, h: 30, text: 'テキストKB' }, { id: 'r', type: 'shape', shape: 'rect', x: 10, y: 300, w: 100, h: 60 }];
    b.strokes = [makeStroke('pen', 'auto', 3, pts([20, 200], [80, 240]))];
    const all = pdfSource(b, 'board')!;
    expect(all).toContain('付箋KB');
    expect(all).toContain('テキストKB');
    expect(all).toContain('<rect');
    expect(all).toContain('<polyline');
    expect(countContents(b)).toEqual({ stickies: 1, texts: 1, shapes: 1, strokes: 1 });
    // 表示中の範囲（左上 200x200）は、その範囲で切り出す（viewBox が表示範囲になる）
    b.view = { x: 0, y: 0, zoom: 1 };
    b.size = { w: 200, h: 200 };
    const view = pdfSource(b, 'view')!;
    expect(view).toContain('viewBox="0 0 200 200"');
    // 表示中の範囲の件数は、その範囲にかかるものだけ（テキスト x=300 と図形 y=300 は範囲外）
    expect(countContents(b, 'view')).toEqual({ stickies: 1, texts: 0, shapes: 0, strokes: 1 });
    expect(countContents(b, 'board')).toEqual({ stickies: 1, texts: 1, shapes: 1, strokes: 1 });
    expect(boardSvg(createBoard('空'))).toBeNull();
    expect(pdfSource(createBoard('空'), 'board')).toBeNull();
  });
});
