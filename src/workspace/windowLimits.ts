// 複数ウィンドウの既定の構成と最小サイズ（FR-296。PARAM-134・PARAM-135・PARAM-136）。React に依存しない純粋な計算。
// 共通部品「ワークスペース」の一部。一覧（FR-295）・スナップ・自動のサイズ調整・再表示が同じ下限を使う。
import { clone, keysOf, normalizeSizes, type Layout, type LayoutNode } from './layoutModel';

/** PARAM-134: 自由配置のコンポーネントの最小の幅（CSS px。読める大きさの下限。PARAM-034 の 240px はタブにまとめる境界として別に残す） */
export const MIN_WINDOW_W = 360;
/** PARAM-135: 自由配置のコンポーネントの最小の高さ（CSS px） */
export const MIN_WINDOW_H = 240;
/** PARAM-136: 各画面の既定のレイアウトで同時に表示するコンポーネントの上限 */
export const MAX_DEFAULT_VISIBLE = 4;
/** 分割の境界の太さ（CSS px。Workspace の境界と同じ） */
export const SEPARATOR_PX = 8;

/** 木に必要な最小の幅（各葉が PARAM-134 以上になる）。横の分割は子の和、縦の分割は子の最大 */
export function needWidth(node: LayoutNode, min = MIN_WINDOW_W): number {
  if (node.kind === 'tabs') return min;
  const kids = node.children.map((c) => needWidth(c, min));
  return node.dir === 'row' ? kids.reduce((a, b) => a + b, 0) + (kids.length - 1) * SEPARATOR_PX : Math.max(...kids);
}

/** 木に必要な最小の高さ（各葉が PARAM-135 以上になる） */
export function needHeight(node: LayoutNode, min = MIN_WINDOW_H): number {
  if (node.kind === 'tabs') return min;
  const kids = node.children.map((c) => needHeight(c, min));
  return node.dir === 'col' ? kids.reduce((a, b) => a + b, 0) + (kids.length - 1) * SEPARATOR_PX : Math.max(...kids);
}

/**
 * 各葉が最小の幅・高さ以上になるよう、分割の比率を直す（元は変えない）。足りない分は、余りの大きい側から取らず、
 * 最小に必要な分を先に確保し、余りだけを元の比率で分ける。領域が必要な大きさに満たない軸は、そのまま（比例）にする。
 * 領域が最小の幅より狭いときは、領域の幅いっぱいで表示する（比率は変えない）。
 */
export function enforceMin(layout: Layout, width: number, height: number, minW = MIN_WINDOW_W, minH = MIN_WINDOW_H): Layout {
  if (!layout || !(width > 0) || !(height > 0)) return layout;
  const walk = (n: LayoutNode, w: number, h: number): LayoutNode => {
    if (n.kind === 'tabs') return n;
    const horizontal = n.dir === 'row';
    const extent = horizontal ? w : h;
    const avail = extent - (n.children.length - 1) * SEPARATOR_PX;
    const needs = n.children.map((c) => (horizontal ? needWidth(c, minW) : needHeight(c, minH)));
    const total = needs.reduce((a, b) => a + b, 0);
    // 子の need は子自身の区切りを含む。足りている（どの子も必要な大きさ以上）なら、比率は変えない
    let sizes = n.sizes;
    const violated = n.children.some((_, i) => (n.sizes[i] ?? 0) * avail < (needs[i] ?? 0) - 0.5);
    if (violated && avail > 0 && total <= avail + 0.5) {
      const surplus = avail - total;
      const base = normalizeSizes(n.sizes, n.children.length);
      sizes = normalizeSizes(needs.map((need, i) => (need + surplus * (base[i] ?? 0)) / avail), n.children.length);
    }
    const children = n.children.map((c, i) => {
      const share = sizes[i] ?? 0;
      return horizontal ? walk(c, avail * share, h) : walk(c, w, avail * share);
    });
    return { kind: 'split', dir: n.dir, sizes, children };
  };
  return walk(layout, width, height);
}

/** 木を領域に当てはめたときの、各葉（タブのまとまり）の大きさ（px）。区切りの太さを除く */
export function leafSizes(layout: Layout, width: number, height: number): Array<{ keys: string[]; w: number; h: number }> {
  const out: Array<{ keys: string[]; w: number; h: number }> = [];
  const walk = (n: LayoutNode, w: number, h: number): void => {
    if (n.kind === 'tabs') { out.push({ keys: [...n.tabs], w, h }); return; }
    const horizontal = n.dir === 'row';
    const avail = (horizontal ? w : h) - (n.children.length - 1) * SEPARATOR_PX;
    n.children.forEach((c, i) => {
      const share = n.sizes[i] ?? 0;
      if (horizontal) walk(c, avail * share, h); else walk(c, w, avail * share);
    });
  };
  if (layout) walk(layout, width, height);
  return out;
}

/** 木の幅が領域に収まるか（各葉が最小の幅以上になる並べ方ができるか） */
export function fitsWidth(layout: Layout, width: number, minW = MIN_WINDOW_W): boolean {
  if (!layout) return true;
  return width < minW || needWidth(layout, minW) <= width + 0.5;
}

/**
 * 領域が足りないとき、最も長く使っていない（ピン止めしていない）コンポーネントを順に外して、収まるようにする（FR-296 AC-801）。
 * `protect` は外さない（いま見せたもの）。`usedAt` は大きいほど最近（なければ 0）。外したものは最小化として一覧に残す（閉じない）。
 * 戻り値は、収まった木と、外したコンポーネントのキー（外した順）。
 */
export function makeRoom(layout: Layout, width: number, opts: { protect?: readonly string[]; pinned?: ReadonlySet<string>; usedAt?: Readonly<Record<string, number>>; minW?: number; maxDrop?: number } = {}): { layout: Layout; dropped: string[]; fits: boolean } {
  const minW = opts.minW ?? MIN_WINDOW_W;
  let cur: Layout = layout ? clone(layout) : layout;
  const dropped: string[] = [];
  const protect = new Set(opts.protect ?? []);
  const pinned = opts.pinned ?? new Set<string>();
  const usedAt = opts.usedAt ?? {};
  while (cur && !fitsWidth(cur, width, minW) && dropped.length < (opts.maxDrop ?? Infinity)) {
    const keys = keysOf(cur);
    const victims = keys.filter((k) => !protect.has(k) && !pinned.has(k));
    if (victims.length === 0) break;
    // 最も長く使っていないもの（同じなら、並びの後ろのもの）
    let victim = victims[0]!;
    for (const k of victims) if ((usedAt[k] ?? 0) <= (usedAt[victim] ?? 0)) victim = k;
    dropped.push(victim);
    cur = removeKey(cur, victim);
  }
  return { layout: cur, dropped, fits: !cur || fitsWidth(cur, width, minW) };
}

/**
 * 上限判定の保留（FR-296。Q-078 A・Q-082 B）。ピン止め（表示中）と雛形の区画（表示中で背面でないもの）の合計が PARAM-136 を超える間は、
 * 上限を超える分の最小化（上限判定）そのものを保留する。モードの切替・ゾーンの結合・前面化・再表示でも同じ。合計が上限以下になれば通常に戻る。
 */
export function isLimitHeld(pinnedShown: number, slotsShown: number, max = MAX_DEFAULT_VISIBLE): boolean {
  return pinnedShown + slotsShown > max;
}

/** 最も長く使っていないもの（usedAt が小さいもの。同じなら並びの後ろ）。候補がなければ undefined */
export function pickOldest(keys: readonly string[], usedAt: Readonly<Record<string, number>> = {}): string | undefined {
  let victim: string | undefined;
  for (const k of keys) if (victim === undefined || (usedAt[k] ?? 0) <= (usedAt[victim] ?? 0)) victim = k;
  return victim;
}

/**
 * 保留中に領域が足りなくなったときの決定（FR-296 AC-883。ピン止めの復元は含めない。復元は planPinRestore＝AC-884）。
 * 最小化できる対象（ピン止めでも背面でもない）のうち最も長く使っていないものを 1 つ最小化する（空の区画として残す）。対象が 1 つもなければ取り消す。
 * 保留でないとき（通常時）は、この規則の対象外で 'none'（現状維持。Q-093）。
 */
export function decideShortage(opts: { held: boolean; candidates: readonly string[]; pinned?: ReadonlySet<string>; behind?: ReadonlySet<string>; usedAt?: Readonly<Record<string, number>> }):
  { action: 'none' } | { action: 'minimize'; key: string } | { action: 'cancel' } {
  if (!opts.held) return { action: 'none' };
  const pinned = opts.pinned ?? new Set<string>();
  const behind = opts.behind ?? new Set<string>();
  const key = pickOldest(opts.candidates.filter((k) => !pinned.has(k) && !behind.has(k)), opts.usedAt);
  return key === undefined ? { action: 'cancel' } : { action: 'minimize', key };
}

type PRect = { x: number; y: number; w: number; h: number };

/**
 * ピン止めの復元（FR-216。AC-884。保留中かどうかによらない）。ピン止めの領域と重なる区画だけを、重ならないようにリサイズし
 * （残る面積が最大になる辺で切る）、{PARAM-134}・{PARAM-135} 未満になる区画だけを最小化として返す（rects から外す。閉じず、下限未満にも縮めない）。
 * 重ならない区画は、最後に使った時刻が古くても大きさを変えない。ピン止め（`fixed`）は動かさない。
 */
export function planPinRestore(rects: Readonly<Record<string, PRect>>, pinKey: string, pinRect: PRect, fixed: ReadonlySet<string> = new Set(), minW = MIN_WINDOW_W, minH = MIN_WINDOW_H): { rects: Record<string, PRect>; minimized: string[] } {
  const out: Record<string, PRect> = {};
  const minimized: string[] = [];
  const p = pinRect;
  for (const [k, r] of Object.entries(rects)) {
    if (k === pinKey) continue;
    const ox = Math.min(r.x + r.w, p.x + p.w) - Math.max(r.x, p.x);
    const oy = Math.min(r.y + r.h, p.y + p.h) - Math.max(r.y, p.y);
    if (fixed.has(k) || ox <= 0.5 || oy <= 0.5) { out[k] = { ...r }; continue; }
    const opts: PRect[] = [
      { x: r.x, y: r.y, w: p.x - r.x, h: r.h },
      { x: p.x + p.w, y: r.y, w: r.x + r.w - (p.x + p.w), h: r.h },
      { x: r.x, y: r.y, w: r.w, h: p.y - r.y },
      { x: r.x, y: p.y + p.h, w: r.w, h: r.y + r.h - (p.y + p.h) },
    ].filter((o) => o.w > 0.5 && o.h > 0.5);
    const best = opts.sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (!best || best.w + 0.5 < minW || best.h + 0.5 < minH) minimized.push(k);
    else out[k] = best;
  }
  out[pinKey] = { ...p };
  return { rects: out, minimized };
}

function removeKey(layout: LayoutNode, key: string): Layout {
  const walk = (n: LayoutNode): LayoutNode | null => {
    if (n.kind === 'tabs') {
      const tabs = n.tabs.filter((k) => k !== key);
      if (tabs.length === 0) return null;
      return { kind: 'tabs', tabs, active: tabs.includes(n.active) ? n.active : tabs[0]! };
    }
    const kept: Array<{ n: LayoutNode; s: number }> = [];
    n.children.forEach((c, i) => { const r = walk(c); if (r) kept.push({ n: r, s: n.sizes[i] ?? 1 }); });
    if (kept.length === 0) return null;
    if (kept.length === 1) return kept[0]!.n;
    return { kind: 'split', dir: n.dir, children: kept.map((k) => k.n), sizes: normalizeSizes(kept.map((k) => k.s), kept.length) };
  };
  return walk(layout);
}

/** 自由配置の矩形（作業領域に対する割合）を、最小の幅・高さ以上に直し、領域の外へ出さない。領域が最小より狭いときは領域いっぱい */
export function floorFloat(r: { x: number; y: number; w: number; h: number }, width: number, height: number, minW = MIN_WINDOW_W, minH = MIN_WINDOW_H): { x: number; y: number; w: number; h: number } {
  if (!(width > 0) || !(height > 0)) return r;
  const w = Math.min(1, Math.max(r.w, minW / width));
  const h = Math.min(1, Math.max(r.h, minH / height));
  return { x: Math.min(1 - w, Math.max(0, r.x)), y: Math.min(1 - h, Math.max(0, r.y)), w, h };
}
