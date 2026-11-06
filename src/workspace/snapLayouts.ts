// 上端の中央へのドラッグで示すレイアウトの雛形（Snap Layouts 相当。FR-305）の区画の計算。描画に依存しない純粋な関数。
//  - 雛形は 8 種（要求の ①〜⑧。Q-072 A）。区画の番号は、左の列から右の列へ、同じ列は上から下への順（1 始まり。AC-864）
//  - 区画は、雛形を当てる矩形を互いに重ならず隙間なく覆う。端数の画素は、各列・各段の最後の区画が吸収する（AC-860）
//  - 雛形を当てる矩形は、表示中のピン止めがなければ作業領域、あれば作業領域からピン止めの領域を除いた最大の空き矩形
//    （面積が同じなら上、次に左）。どの区画もピン止めの領域と重ならない（FR-216・AC-860）
//  - ポップアップに示すのは、その矩形で全区画の幅が PARAM-134 以上かつ高さが PARAM-135 以上の雛形だけ（①〜⑧ の順。AC-861）
import { MIN_WINDOW_H, MIN_WINDOW_W } from './windowLimits';

/** 上端からの距離（PARAM-042。FR-152 の端のスナップと同じ） */
export const LAYOUT_EDGE_PX = 32;
/** 上端の中央の命中範囲の幅（作業領域の幅に対する割合。PARAM-143=40%） */
export const LAYOUT_HIT_FRACTION = 0.4;
/** 命中範囲にとどめる時間（PARAM-144 ms）。それまでは上端の最大化のプレビュー */
export const LAYOUT_DWELL_MS = 300;

export type LayoutId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export interface Rect { x: number; y: number; w: number; h: number }

interface Column { w: number; rows: ReadonlyArray<{ h: number; name: string }> }
export interface LayoutDef { id: LayoutId; name: string; cols: readonly Column[] }

const one = (name: string) => [{ h: 1, name }];
const two = (top: string, bottom: string) => [{ h: 1 / 2, name: top }, { h: 1 / 2, name: bottom }];

/** 8 種の雛形（要求の ①〜⑧ の順）。名前は「<雛形名> の <区画名>」の読み上げに使う（AC-863） */
export const LAYOUTS: readonly LayoutDef[] = [
  { id: 1, name: '左 1/2・右 1/2', cols: [{ w: 1 / 2, rows: one('左') }, { w: 1 / 2, rows: one('右') }] },
  { id: 2, name: '左 2/3・右 1/3', cols: [{ w: 2 / 3, rows: one('左') }, { w: 1 / 3, rows: one('右') }] },
  { id: 3, name: '左 1/3・右 2/3', cols: [{ w: 1 / 3, rows: one('左') }, { w: 2 / 3, rows: one('右') }] },
  { id: 4, name: '左 1/2・右 上下 2 段', cols: [{ w: 1 / 2, rows: one('左') }, { w: 1 / 2, rows: two('右上', '右下') }] },
  { id: 5, name: '左 上下 2 段・右 1/2', cols: [{ w: 1 / 2, rows: two('左上', '左下') }, { w: 1 / 2, rows: one('右') }] },
  { id: 6, name: '2×2', cols: [{ w: 1 / 2, rows: two('左上', '左下') }, { w: 1 / 2, rows: two('右上', '右下') }] },
  { id: 7, name: '3 列等分', cols: [{ w: 1 / 3, rows: one('左') }, { w: 1 / 3, rows: one('中央') }, { w: 1 / 3, rows: one('右') }] },
  { id: 8, name: '1/4・1/2・1/4', cols: [{ w: 1 / 4, rows: one('左') }, { w: 1 / 2, rows: one('中央') }, { w: 1 / 4, rows: one('右') }] },
];

export function layoutDef(id: LayoutId): LayoutDef {
  return LAYOUTS.find((l) => l.id === id)!;
}

/** 区画の名前（data-zone は 1 始まり） */
export function zoneNames(id: LayoutId): string[] {
  return layoutDef(id).cols.flatMap((c) => c.rows.map((r) => r.name));
}

/** 区画のアクセシブルな名前（例「左 1/2・右 1/2 の左」。AC-863） */
export function zoneLabel(id: LayoutId, zone: number): string {
  return `${layoutDef(id).name} の${zoneNames(id)[zone - 1] ?? ''}`;
}

/** 区画の割合（雛形を当てる矩形に対する x, y, w, h）。並びは data-zone の順 */
export function zoneFractions(id: LayoutId): Rect[] {
  const out: Rect[] = [];
  let x = 0;
  for (const c of layoutDef(id).cols) {
    let y = 0;
    for (const r of c.rows) { out.push({ x, y, w: c.w, h: r.h }); y += r.h; }
    x += c.w;
  }
  return out;
}

/** 0〜1 の累積の割合を、画素の境界へ直す。最後の境界は矩形の端（端数は最後の区画が吸収する） */
function cuts(start: number, size: number, fracs: readonly number[]): number[] {
  const out = [start];
  let acc = 0;
  fracs.forEach((f, i) => {
    acc += f;
    out.push(i === fracs.length - 1 ? start + size : start + Math.floor(size * acc));
  });
  return out;
}

/** 雛形の区画を、矩形 `base` に当てた位置と大きさ（並びは data-zone の順）。重なりの面積 0・面積の和が base と一致（AC-860） */
export function layoutZones(id: LayoutId, base: Rect): Rect[] {
  const def = layoutDef(id);
  const xs = cuts(base.x, base.w, def.cols.map((c) => c.w));
  const out: Rect[] = [];
  def.cols.forEach((c, i) => {
    const ys = cuts(base.y, base.h, c.rows.map((r) => r.h));
    c.rows.forEach((_, j) => out.push({ x: xs[i]!, y: ys[j]!, w: xs[i + 1]! - xs[i]!, h: ys[j + 1]! - ys[j]! }));
  });
  return out;
}

/** 雛形が矩形の大きさで成り立つか: 全区画の幅が minW 以上かつ高さが minH 以上（名目の割合で判定。AC-861 の「3 倍未満では出ない」など） */
export function layoutFits(id: LayoutId, base: { w: number; h: number }, minW = MIN_WINDOW_W, minH = MIN_WINDOW_H): boolean {
  const eps = 1e-6;
  return zoneFractions(id).every((z) => base.w * z.w + eps >= minW && base.h * z.h + eps >= minH);
}

/** ポップアップに示す雛形（①〜⑧ の順を保つ。AC-860・AC-861） */
export function availableLayouts(base: { w: number; h: number }, minW = MIN_WINDOW_W, minH = MIN_WINDOW_H): LayoutId[] {
  return LAYOUTS.filter((l) => layoutFits(l.id, base, minW, minH)).map((l) => l.id);
}

const overlap = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * 雛形を当てる矩形。`area`（作業領域）から `pins`（表示中のピン止めの領域）を除いた最大の空き矩形。
 * 面積が同じ（画素に丸めて同じ）なら上、次に左。ピン止めがなければ作業領域そのもの。空きがなければ null。
 */
export function layoutBase(area: Rect, pins: readonly Rect[]): Rect | null {
  const clipped = pins
    .map((p) => {
      const x = Math.max(area.x, p.x); const y = Math.max(area.y, p.y);
      const r = Math.min(area.x + area.w, p.x + p.w); const b = Math.min(area.y + area.h, p.y + p.h);
      return { x, y, w: r - x, h: b - y };
    })
    .filter((p) => p.w > 0 && p.h > 0);
  if (clipped.length === 0) return { ...area };
  const xs = [...new Set([area.x, area.x + area.w, ...clipped.flatMap((p) => [p.x, p.x + p.w])])].sort((a, b) => a - b);
  const ys = [...new Set([area.y, area.y + area.h, ...clipped.flatMap((p) => [p.y, p.y + p.h])])].sort((a, b) => a - b);
  let best: Rect | null = null;
  let bestArea = 0;
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
    for (let k = 0; k < ys.length; k++) for (let l = k + 1; l < ys.length; l++) {
      const r = { x: xs[i]!, y: ys[k]!, w: xs[j]! - xs[i]!, h: ys[l]! - ys[k]! };
      if (clipped.some((p) => overlap(r, p) > 0)) continue;
      const a = Math.round(r.w * r.h);
      if (!best || a > bestArea || (a === bestArea && (r.y < best.y || (r.y === best.y && r.x < best.x)))) { best = r; bestArea = a; }
    }
  }
  return best && bestArea > 0 ? best : null;
}

/** 上端の中央の命中範囲（上端から edgePx 以内・横は中央 fraction の幅）にあるか。範囲の外の上端は FR-152 の最大化（AC-793） */
export function isTopCenterHit(
  x: number, y: number,
  area: { left: number; top: number; width: number; height: number },
  edgePx = LAYOUT_EDGE_PX, fraction = LAYOUT_HIT_FRACTION,
): boolean {
  if (area.width <= 0 || area.height <= 0) return false;
  if (y < area.top || y > area.top + area.height || x < area.left || x > area.left + area.width) return false;
  if (y - area.top > edgePx) return false;
  const half = (area.width * fraction) / 2;
  const mid = area.left + area.width / 2;
  return x >= mid - half && x <= mid + half;
}

/**
 * 区画への配置の後に順に埋める区画（Snap Assist の拡張。AC-864）。置いた区画を除き、左の列から右の列へ、同じ列は上から下へ。
 * 返すのは区画の番号（1 始まり）。
 */
export function remainingZones(id: LayoutId, placed: number): number[] {
  return zoneFractions(id).map((_, i) => i + 1).filter((z) => z !== placed);
}
