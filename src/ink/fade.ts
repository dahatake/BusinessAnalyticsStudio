// ホワイトボード（Canvas）の削除・undo の出入り（FR-070 AC-086）。消えたストローク・項目を「ゴースト」として残し、
// 薄れて消えるまで（上限 PARAM-133 = 2000ms。presenceDuration で決まる長さ）描く。時刻から値を求める純粋な関数で、DOM・Canvas に依存しない。
// durationMs が 0（動き停止・視差効果の軽減）のときはゴーストを持たず、即時に最終状態にする。遷移がなければ連続描画も要らない。
import { easedProgress } from '../three/interpolation';
import type { Board, BoardItem, Stroke } from './model';

export interface Ghost {
  id: string;
  stroke?: Stroke;
  item?: BoardItem;
  /** 消え始めた時刻 */
  startMs: number;
}

export interface FadeState {
  boardId: string;
  strokes: Map<string, Stroke>;
  items: Map<string, BoardItem>;
  ghosts: Map<string, Ghost>;
}

export function newFadeState(boardId: string, board: Pick<Board, 'strokes' | 'items'> | undefined): FadeState {
  return {
    boardId,
    strokes: new Map((board?.strokes ?? []).map((s) => [s.id, s])),
    items: new Map((board?.items ?? []).map((i) => [i.id, i])),
    ghosts: new Map(),
  };
}

/** いまの内容と比べ、消えた項目をゴーストにする。同じ ID が戻ったら（undo の取り消しなど）ゴーストを外す。 */
export function syncFade(state: FadeState, board: Pick<Board, 'strokes' | 'items'>, nowMs: number, durationMs: number): void {
  const strokes = new Map(board.strokes.map((s) => [s.id, s]));
  const items = new Map(board.items.map((i) => [i.id, i]));
  // 同じ操作で別の ID が追加されたとき（ピクセル消しゴムの分割、図形の認識による置き換え）は置き換えなので、薄れさせず即時に差し替える
  const replaced = [...strokes.keys()].some((id) => !state.strokes.has(id)) || [...items.keys()].some((id) => !state.items.has(id));
  if (durationMs > 0 && !replaced) {
    for (const [id, stroke] of state.strokes) if (!strokes.has(id) && !state.ghosts.has(id) && !stroke.temporary) state.ghosts.set(id, { id, stroke, startMs: nowMs });
    for (const [id, item] of state.items) if (!items.has(id) && !state.ghosts.has(id)) state.ghosts.set(id, { id, item, startMs: nowMs });
  } else if (durationMs <= 0) state.ghosts.clear();
  for (const id of strokes.keys()) state.ghosts.delete(id);
  for (const id of items.keys()) state.ghosts.delete(id);
  state.strokes = strokes;
  state.items = items;
}

export interface GhostGroup {
  /** 描画の不透明度（1→0） */
  life: number;
  strokes: Stroke[];
  items: BoardItem[];
}

/** いま描くゴーストを、消え始めの時刻ごとにまとめて返す。消え終わったものは取り除く。 */
export function sampleGhosts(state: FadeState, nowMs: number, durationMs: number): GhostGroup[] {
  const groups = new Map<number, GhostGroup>();
  for (const [id, g] of [...state.ghosts]) {
    const raw = durationMs <= 0 ? 1 : (nowMs - g.startMs) / durationMs;
    if (raw >= 1) { state.ghosts.delete(id); continue; }
    const life = 1 - easedProgress(Math.max(0, raw));
    let group = groups.get(g.startMs);
    if (!group) { group = { life, strokes: [], items: [] }; groups.set(g.startMs, group); }
    if (g.stroke) group.strokes.push(g.stroke);
    if (g.item) group.items.push(g.item);
  }
  return [...groups.values()];
}
