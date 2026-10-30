// インク・ボードのストア（FR-086〜FR-089）。複数ボード・道具・選択・元に戻す/やり直し・他のビューの上の注釈。
// 保存（IndexedDB への自動保存と復旧）は FR-095 が受け持つ。ここではメモリ上に持ち、ビューを切り替えても残る。
import { create } from 'zustand';
import { tr } from '../i18n';
import { registerTestHook } from '../testing/hook';
import { erasePixels } from './geometry';
import {
  boardContentBounds, createBoard, makeStroke, translateItem, translateStroke,
  type Background, type Board, type BoardItem, type InkPoint, type Stroke, type ToolId, type ViewState,
} from './model';
import { fitView } from './viewport';
import { refreshConnectors } from '../whiteboard/ops';

interface Snapshot { strokes: Stroke[]; items: BoardItem[] }
interface History { undo: Snapshot[]; redo: Snapshot[] }
const HISTORY_LIMIT = 200;

export const annotationBoardId = (viewKey: string): string => `annotation:${viewKey}`;

interface InkState {
  boards: Board[];
  activeBoardId: string;
  tool: ToolId;
  color: string;
  size: number;
  selection: { boardId: string; ids: string[] } | null;
  history: Record<string, History>;
  /** ホワイトボード: ドット投票の最中か（付箋をクリックすると 1 票入る）。FR-099 */
  voteMode: boolean;
  /** ホワイトボード: コネクターの接続元に選んだ項目の ID（次にクリックした項目へつなぐ）。FR-097 */
  connectFrom: string | null;

  setVoteMode: (on: boolean) => void;
  setConnectFrom: (id: string | null) => void;
  /** 項目の並びを関数で入れ替える（「元に戻す」1 回分）。同じ配列を返せば何もしない。 */
  updateItems: (id: string, fn: (items: BoardItem[]) => BoardItem[]) => void;
  /** 保存したボードを読み込む（起動時）。 */
  restoreBoards: (boards: Board[], activeBoardId: string) => void;
  setTool: (t: ToolId) => void;
  setColor: (c: string) => void;
  setSize: (n: number) => void;
  /** 論点 topicId のボードを追加して選択する。 */
  addBoard: (topicId: string | null) => string;
  /** 論点にボードがなければ 1 枚作る。選択中のボードがその論点のものでなければ切り替える。 */
  ensureTopicBoard: (topicId: string | null) => void;
  /** 他のビューの上に重ねる注釈のボード（なければ作る）。ID を返す。 */
  ensureAnnotationBoard: (viewKey: string) => string;
  setActiveBoard: (id: string) => void;
  renameBoard: (id: string, name: string) => void;
  setBackground: (id: string, bg: Background) => void;
  setView: (id: string, view: ViewState) => void;
  setBoardSize: (id: string, size: { w: number; h: number }) => void;
  fitBoard: (id: string) => void;

  addStroke: (id: string, stroke: Stroke) => void;
  addItem: (id: string, item: BoardItem) => void;
  patchItem: (id: string, itemId: string, patch: Partial<BoardItem>, record?: boolean) => void;
  /** record=false は、直前の変更と同じ「元に戻す」1 回分にまとめる（ドラッグで消すとき） */
  removeObjects: (id: string, ids: ReadonlyArray<string>, record?: boolean) => void;
  moveObjects: (id: string, ids: ReadonlyArray<string>, dx: number, dy: number) => void;
  /** ピクセル消しゴムのドラッグの開始（元に戻す 1 回分の区切り） */
  beginErase: (id: string) => void;
  erasePixelsAt: (id: string, c: { x: number; y: number }, r: number) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  setSelection: (boardId: string, ids: string[]) => void;
  clearSelection: () => void;
  loadSynthetic: (n: number) => number;
}

const snap = (b: Board): Snapshot => ({ strokes: b.strokes, items: b.items });

function withHistory(history: Record<string, History>, b: Board): Record<string, History> {
  const h = history[b.id] ?? { undo: [], redo: [] };
  return { ...history, [b.id]: { undo: [...h.undo, snap(b)].slice(-HISTORY_LIMIT), redo: [] } };
}

function mapBoard(boards: Board[], id: string, fn: (b: Board) => Board): Board[] {
  return boards.map((b) => (b.id === id ? fn(b) : b));
}

const firstBoard = createBoard(tr('ボード 1'));

export const useInk = create<InkState>()((set, get) => {
  /** 履歴を積んで、ボードの中身を変える。 */
  const edit = (id: string, fn: (b: Board) => Partial<Board>): void => {
    set((s) => {
      const board = s.boards.find((b) => b.id === id);
      if (!board) return s;
      const raw = fn(board);
      const patch = raw.items ? { ...raw, items: refreshConnectors(raw.items) } : raw;
      return {
        boards: mapBoard(s.boards, id, (b) => ({ ...b, ...patch })),
        history: withHistory(s.history, board),
      };
    });
  };

  return {
    boards: [firstBoard],
    activeBoardId: firstBoard.id,
    tool: 'pen',
    color: 'auto',
    size: 3,
    selection: null,
    history: {},
    voteMode: false,
    connectFrom: null,

    setVoteMode: (voteMode) => set({ voteMode }),
    setConnectFrom: (connectFrom) => set({ connectFrom }),
    updateItems: (id, fn) => {
      const b = get().boards.find((x) => x.id === id);
      if (!b) return;
      const next = fn(b.items);
      if (next !== b.items) edit(id, () => ({ items: next }));
    },
    restoreBoards: (boards, activeBoardId) => set((s) => {
      if (boards.length === 0) return s;
      const active = boards.some((b) => b.id === activeBoardId && b.kind === 'board') ? activeBoardId : (boards.find((b) => b.kind === 'board')?.id ?? s.activeBoardId);
      return { boards, activeBoardId: active, selection: null, history: {}, connectFrom: null };
    }),
    setTool: (tool) => set({ tool, connectFrom: null }),
    setColor: (color) => set({ color }),
    setSize: (size) => set({ size }),

    addBoard: (topicId) => {
      const n = get().boards.filter((b) => b.kind === 'board' && b.topicId === topicId).length + 1;
      const board = createBoard(tr('ボード {n}', { n }), topicId);
      set((s) => ({ boards: [...s.boards, board], activeBoardId: board.id, selection: null }));
      return board.id;
    },
    ensureTopicBoard: (topicId) => {
      const s = get();
      const own = s.boards.filter((b) => b.kind === 'board' && b.topicId === topicId);
      if (own.length === 0) { get().addBoard(topicId); return; }
      const active = s.boards.find((b) => b.id === s.activeBoardId);
      if (!active || active.kind !== 'board' || active.topicId !== topicId) set({ activeBoardId: own[0]!.id, selection: null });
    },
    ensureAnnotationBoard: (viewKey) => {
      const id = annotationBoardId(viewKey);
      if (!get().boards.some((b) => b.id === id)) {
        set((s) => ({ boards: [...s.boards, createBoard(tr('注釈: {key}', { key: viewKey }), null, 'annotation', id)] }));
      }
      return id;
    },
    setActiveBoard: (id) => set((s) => (s.boards.some((b) => b.id === id && b.kind === 'board') ? { activeBoardId: id, selection: null } : s)),
    renameBoard: (id, name) => set((s) => ({ boards: mapBoard(s.boards, id, (b) => ({ ...b, name })) })),
    setBackground: (id, background) => set((s) => ({ boards: mapBoard(s.boards, id, (b) => ({ ...b, background })) })),
    setView: (id, view) => set((s) => ({ boards: mapBoard(s.boards, id, (b) => ({ ...b, view })) })),
    setBoardSize: (id, size) => set((s) => {
      const b = s.boards.find((x) => x.id === id);
      if (!b || (b.size.w === size.w && b.size.h === size.h)) return s;
      return { boards: mapBoard(s.boards, id, (x) => ({ ...x, size })) };
    }),
    fitBoard: (id) => set((s) => ({
      boards: mapBoard(s.boards, id, (b) => ({ ...b, view: fitView(boardContentBounds(b), b.size.w, b.size.h) })),
    })),

    addStroke: (id, stroke) => edit(id, (b) => ({ strokes: [...b.strokes, stroke] })),
    addItem: (id, item) => edit(id, (b) => ({ items: [...b.items, item] })),
    patchItem: (id, itemId, patch, record = true) => {
      const apply = (b: Board): Partial<Board> => ({ items: b.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) });
      if (record) edit(id, apply);
      else set((s) => ({ boards: mapBoard(s.boards, id, (b) => ({ ...b, ...apply(b) })) }));
    },
    removeObjects: (id, ids, record = true) => {
      const set_ = new Set(ids);
      // 項目を消すと、その項目につながっていたコネクターも消える
      const board = get().boards.find((b) => b.id === id);
      for (const i of board?.items ?? []) if (i.type === 'connector' && ((i.from && set_.has(i.from)) || (i.to && set_.has(i.to)))) set_.add(i.id);
      const apply = (b: Board): Partial<Board> => ({
        strokes: b.strokes.filter((s) => !set_.has(s.id)),
        items: b.items.filter((i) => !set_.has(i.id)).map((i) => (i.frameId && set_.has(i.frameId) ? { ...i, frameId: null } : i)),
      });
      if (record) edit(id, apply);
      else set((s) => ({ boards: mapBoard(s.boards, id, (b) => ({ ...b, ...apply(b) })) }));
      set((s) => (s.selection ? { selection: { ...s.selection, ids: s.selection.ids.filter((x) => !set_.has(x)) } } : s));
    },
    moveObjects: (id, ids, dx, dy) => {
      if (dx === 0 && dy === 0) return;
      const set_ = new Set(ids);
      edit(id, (b) => ({
        strokes: b.strokes.map((s) => (set_.has(s.id) ? translateStroke(s, dx, dy) : s)),
        items: b.items.map((i) => (set_.has(i.id) ? translateItem(i, dx, dy) : i)),
      }));
    },
    beginErase: (id) => set((s) => {
      const b = s.boards.find((x) => x.id === id);
      return b ? { history: withHistory(s.history, b) } : s;
    }),
    erasePixelsAt: (id, c, r) => set((s) => {
      const b = s.boards.find((x) => x.id === id);
      if (!b) return s;
      const strokes = erasePixels(b.strokes, c, r);
      const changed = strokes.length !== b.strokes.length || strokes.some((x, i) => x !== b.strokes[i]);
      return changed ? { boards: mapBoard(s.boards, id, (x) => ({ ...x, strokes })) } : s;
    }),
    undo: (id) => set((s) => {
      const b = s.boards.find((x) => x.id === id);
      const h = s.history[id];
      if (!b || !h || h.undo.length === 0) return s;
      const prev = h.undo[h.undo.length - 1]!;
      return {
        boards: mapBoard(s.boards, id, (x) => ({ ...x, ...prev })),
        history: { ...s.history, [id]: { undo: h.undo.slice(0, -1), redo: [...h.redo, snap(b)] } },
        selection: null,
      };
    }),
    redo: (id) => set((s) => {
      const b = s.boards.find((x) => x.id === id);
      const h = s.history[id];
      if (!b || !h || h.redo.length === 0) return s;
      const next = h.redo[h.redo.length - 1]!;
      return {
        boards: mapBoard(s.boards, id, (x) => ({ ...x, ...next })),
        history: { ...s.history, [id]: { undo: [...h.undo, snap(b)], redo: h.redo.slice(0, -1) } },
        selection: null,
      };
    }),
    setSelection: (boardId, ids) => set({ selection: ids.length > 0 ? { boardId, ids } : null }),
    clearSelection: () => set({ selection: null }),
    loadSynthetic: (n) => {
      const id = get().activeBoardId;
      const strokes = syntheticStrokes(n);
      set((s) => ({ boards: mapBoard(s.boards, id, (b) => ({ ...b, strokes: [...b.strokes, ...strokes] })) }));
      return strokes.length;
    },
  };
});

/** 性能の検査用の、決まった並びの合成ストローク（乱数の種は固定）。 */
export function syntheticStrokes(n: number): Stroke[] {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
  const side = Math.ceil(Math.sqrt(n));
  const cell = 60;
  const out: Stroke[] = [];
  for (let k = 0; k < n; k++) {
    const ox = (k % side) * cell + rnd() * 20, oy = Math.floor(k / side) * cell + rnd() * 20;
    const pts: InkPoint[] = [];
    let x = ox, y = oy;
    for (let j = 0; j < 12; j++) {
      pts.push({ x, y, p: 0.3 + rnd() * 0.5 });
      x += (rnd() - 0.3) * 6;
      y += (rnd() - 0.4) * 6;
    }
    out.push(makeStroke('pen', 'auto', 2, pts));
  }
  return out;
}

export const selectBoard = (id: string) => (s: InkState): Board | undefined => s.boards.find((b) => b.id === id);
export const selectCanUndo = (id: string) => (s: InkState): boolean => (s.history[id]?.undo.length ?? 0) > 0;
export const selectCanRedo = (id: string) => (s: InkState): boolean => (s.history[id]?.redo.length ?? 0) > 0;

// ---- テスト用フック（tests/system/CONTRACT.md §6。画面に見える状態を読むだけ） ----
registerTestHook('board', {
  state: () => {
    const s = useInk.getState();
    const active = s.boards.find((b) => b.id === s.activeBoardId);
    const v = active?.view ?? { x: 0, y: 0, zoom: 1 };
    const size = active?.size ?? { w: 0, h: 0 };
    return {
      activeBoardId: s.activeBoardId,
      boards: s.boards.filter((b) => b.kind === 'board').map((b) => ({
        id: b.id,
        name: b.name,
        topicId: b.topicId ?? undefined,
        background: b.background,
        strokes: b.strokes.map((k) => ({ id: k.id, tool: k.tool, temporary: k.temporary ?? false, bounds: k.bounds })),
        items: b.items.map((i) => ({
          id: i.id, type: i.type, text: i.text, x: i.x, y: i.y, w: i.w, h: i.h, groupId: i.groupId ?? null, frameId: i.frameId ?? null,
          from: i.from, to: i.to, votes: i.votes ?? 0, sourceEntityId: i.sourceEntityId, label: i.label, author: i.author,
        })),
      })),
      viewport: { x: v.x, y: v.y, width: size.w / v.zoom, height: size.h / v.zoom, zoom: v.zoom },
    };
  },
});
registerTestHook('ink', {
  loadSynthetic: (n: number) => useInk.getState().loadSynthetic(Number(n)),
});
registerTestHook('annotations', {
  count: (viewKey: string) => {
    const b = useInk.getState().boards.find((x) => x.id === annotationBoardId(viewKey));
    return b ? b.strokes.length + b.items.length : 0;
  },
  presentation: () => {
    let temporary = 0, saved = 0;
    for (const b of useInk.getState().boards) for (const k of b.strokes) { if (k.temporary) temporary += 1; else saved += 1; }
    return { temporary, saved };
  },
});
