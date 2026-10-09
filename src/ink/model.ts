// インク・ボードのデータモデル（FR-086〜FR-089）。自前の Canvas 実装（[ASSUMPTION] A-01、Q-003 の推奨案 A）。
// 座標はすべて「ワールド座標」（無限キャンバス上の座標）。画面の座標への変換は viewport.ts。

export type Background = 'plain' | 'grid' | 'dots' | 'lines';
export const BACKGROUNDS: ReadonlyArray<{ value: Background; label: string }> = [
  { value: 'plain', label: '無地' },
  { value: 'grid', label: '方眼' },
  { value: 'dots', label: 'ドット' },
  { value: 'lines', label: '罫線' },
];

/** p は筆圧（0〜1）。マウスは 0.5 固定。ペンの傾きは effectivePressure で p に畳み込み済み。 */
export interface InkPoint { x: number; y: number; p: number }
export interface Bounds { x: number; y: number; w: number; h: number }

export type StrokeTool = 'pen' | 'highlighter';
export interface Stroke {
  id: string;
  tool: StrokeTool;
  /** 'auto' はテーマの前景色 */
  color: string;
  size: number;
  points: InkPoint[];
  bounds: Bounds;
  /** プレゼン中の一時的な注釈（チャプター移動で消える。FR-091） */
  temporary?: boolean;
}

export type ShapeKind = 'line' | 'arrow' | 'rect' | 'ellipse' | 'callout';
/** frame / connector / card はホワイトボード（FR-097・FR-098）の部品。card はアプリのデータ（課題など）とリンクする。 */
export type ItemType = 'shape' | 'text' | 'sticky' | 'image' | 'frame' | 'connector' | 'card';
export interface BoardItem {
  id: string;
  type: ItemType;
  /** 外接矩形（ワールド座標。shape は x1..y2 から導出） */
  x: number;
  y: number;
  w: number;
  h: number;
  shape?: ShapeKind;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  text?: string;
  color?: string;
  size?: number;
  /** 画像（data URL） */
  src?: string;
  groupId?: string | null;
  frameId?: string | null;
  /** connector: つなぐ 2 つの項目の ID（向きは from → to）。x1..y2 と外接矩形は項目の位置から導出して保つ */
  from?: string;
  to?: string;
  /** frame の見出し、card の表示名（元データの名前の写し。画面では元データの最新の名前を出す） */
  label?: string;
  /** card: 元データの種類の表示名（課題・解決策など） */
  sub?: string;
  /** card: リンク先の元データの ID（エンティティ関係グラフの節 ID） */
  sourceEntityId?: string;
  /** sticky: ドット投票の票数 */
  votes?: number;
  /** AI が作った項目（クラスタリングのフレーム）。画面に「AI 生成」と出す */
  author?: 'ai';
}

export interface ViewState { x: number; y: number; zoom: number }

export interface Board {
  id: string;
  name: string;
  /** 議題（議論テーマ）の ID。なければ null */
  topicId: string | null;
  /** 'annotation' は他のビューの上に重ねる注釈（ボードの一覧には出さない） */
  kind: 'board' | 'annotation';
  background: Background;
  strokes: Stroke[];
  items: BoardItem[];
  view: ViewState;
  /** 表示領域の大きさ（CSS ピクセル）。描画面が報告する */
  size: { w: number; h: number };
}

export type ToolId =
  | 'pen' | 'highlighter' | 'eraser-stroke' | 'eraser-pixel' | 'lasso'
  | 'line' | 'arrow' | 'rect' | 'ellipse' | 'callout' | 'text' | 'sticky' | 'connector';

/** アプリのデータ（エンティティ）をボードへドラッグ&ドロップするときの、DataTransfer の種類 */
export const ENTITY_DRAG_MIME = 'application/x-edb-entity';

export const SHAPE_TOOLS: ReadonlyArray<ToolId> = ['line', 'arrow', 'rect', 'ellipse', 'callout'];
export const isShapeTool = (t: ToolId): t is ShapeKind => (SHAPE_TOOLS as readonly string[]).includes(t);

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export function boundsOfPoints(points: ReadonlyArray<{ x: number; y: number }>): Bounds {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function makeStroke(tool: StrokeTool, color: string, size: number, points: InkPoint[], temporary?: boolean): Stroke {
  return { id: newId('stroke'), tool, color, size, points, bounds: boundsOfPoints(points), ...(temporary ? { temporary } : {}) };
}

/** 2 点で決まる図形（外接矩形は正規化する）。 */
export function makeShape(kind: ShapeKind, x1: number, y1: number, x2: number, y2: number, color: string, size: number): BoardItem {
  return withShapeBounds({ id: newId('shape'), type: 'shape', shape: kind, x: 0, y: 0, w: 0, h: 0, x1, y1, x2, y2, color, size });
}

export function withShapeBounds(item: BoardItem): BoardItem {
  const { x1 = 0, y1 = 0, x2 = 0, y2 = 0 } = item;
  return { ...item, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export function translateStroke(s: Stroke, dx: number, dy: number): Stroke {
  const points = s.points.map((p) => ({ x: p.x + dx, y: p.y + dy, p: p.p }));
  return { ...s, points, bounds: { ...s.bounds, x: s.bounds.x + dx, y: s.bounds.y + dy } };
}

export function translateItem(i: BoardItem, dx: number, dy: number): BoardItem {
  const moved: BoardItem = { ...i, x: i.x + dx, y: i.y + dy };
  if (i.x1 !== undefined) moved.x1 = i.x1 + dx;
  if (i.y1 !== undefined) moved.y1 = i.y1 + dy;
  if (i.x2 !== undefined) moved.x2 = i.x2 + dx;
  if (i.y2 !== undefined) moved.y2 = i.y2 + dy;
  return moved;
}

export function unionBounds(list: ReadonlyArray<Bounds>): Bounds | null {
  if (list.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of list) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function boardContentBounds(board: Pick<Board, 'strokes' | 'items'>): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (b: Bounds) => {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  };
  for (const s of board.strokes) add(s.bounds);
  for (const i of board.items) add(i);
  return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}

export function createBoard(name: string, topicId: string | null = null, kind: 'board' | 'annotation' = 'board', id?: string): Board {
  return {
    id: id ?? newId('board'), name, topicId, kind, background: 'plain', strokes: [], items: [],
    view: { x: 0, y: 0, zoom: 1 }, size: { w: 800, h: 480 },
  };
}
