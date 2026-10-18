// 項目を 3D 空間に置く共通の配置の規則（FR-217 AC-501。画面・three に依存しない純粋なモジュール）。
// 一覧表・2×2 マトリクス・ランキング表・課題-解決策分析・議論ツリー・KPI/OKR は、項目を「位置・大きさ・つながり」で表して Items3DSurface に渡す。
// 座標は 0〜1 に正規化した値（x=横、y=高さ、z=奥行き）。3D 空間への写像は surface 側が 1 か所で行う。

/** 3D 空間に置く 1 つの項目 */
export interface Item3D {
  /** 項目の ID（選択の共通の状態・t.view.state の itemIds と同じ） */
  id: string;
  /** 表示名（ラベル・「表で見る」と同じ文字） */
  label: string;
  /** 0〜1。横 */
  x: number;
  /** 0〜1。高さ */
  y: number;
  /** 0〜1。奥行き */
  z: number;
  /** 0〜1。大きさ */
  size: number;
  /** 種類・グループ（色の割り当てに使う）。省略はすべて同じ */
  group?: string;
}

/** 項目どうしのつながり（from → to） */
export interface Link3D { from: string; to: string }

export interface Axes3D { x?: string; y?: string; z?: string }

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** lo〜hi の値を 0〜1 にする（lo==hi は 0.5） */
export function norm(v: number, lo: number, hi: number): number {
  return hi === lo ? 0.5 : clamp01((v - lo) / (hi - lo));
}

/** n 個を、0〜1 に等間隔で並べたときの i 番目の位置（1 個は中央） */
export function spread(i: number, n: number): number {
  return n <= 1 ? 0.5 : i / (n - 1);
}

/**
 * グループごとに列を作り、各グループの中を奥行き×高さの格子に並べる（一覧表）。
 * グループは出現順に横へ並ぶ。
 */
export function groupGrid<T>(items: readonly T[], idOf: (t: T) => string, labelOf: (t: T) => string, groupOf: (t: T) => string): Item3D[] {
  const groups: string[] = [];
  const byGroup = new Map<string, T[]>();
  for (const t of items) {
    const g = groupOf(t);
    if (!byGroup.has(g)) { byGroup.set(g, []); groups.push(g); }
    byGroup.get(g)!.push(t);
  }
  const out: Item3D[] = [];
  groups.forEach((g, gi) => {
    const list = byGroup.get(g)!;
    const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)));
    const rows = Math.max(1, Math.ceil(list.length / cols));
    list.forEach((t, i) => {
      out.push({
        id: idOf(t), label: labelOf(t), group: g,
        x: spread(gi, groups.length),
        z: spread(i % cols, cols),
        y: rows <= 1 ? 0.5 : spread(Math.floor(i / cols), rows),
        size: 0.35,
      });
    });
  });
  return out;
}

/**
 * 木（親子）を置く。深さを高さ（根が上）、葉の並びを横に、枝の位置は子の中央にする。
 * parentOf が見つからない（または自分自身）ものは根として扱う。つながり（親→子）も返す。
 */
export function treeLayout3D<T>(nodes: readonly T[], idOf: (t: T) => string, labelOf: (t: T) => string, parentOf: (t: T) => string | null | undefined, groupOf?: (t: T) => string): { items: Item3D[]; links: Link3D[] } {
  const ids = new Set(nodes.map(idOf));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const n of nodes) {
    const p = parentOf(n);
    if (p && p !== idOf(n) && ids.has(p)) children.set(p, [...(children.get(p) ?? []), n]);
    else roots.push(n);
  }
  const depth = new Map<string, number>();
  const xs = new Map<string, number>();
  let leaf = 0;
  let maxDepth = 0;
  const seen = new Set<string>();
  const place = (n: T, d: number): number => {
    const id = idOf(n);
    seen.add(id);
    depth.set(id, d);
    maxDepth = Math.max(maxDepth, d);
    const kids = (children.get(id) ?? []).filter((k) => !seen.has(idOf(k)));
    if (kids.length === 0) { const x = leaf; leaf += 1; xs.set(id, x); return x; }
    const cx = kids.map((k) => place(k, d + 1));
    const x = (Math.min(...cx) + Math.max(...cx)) / 2;
    xs.set(id, x);
    return x;
  };
  for (const r of roots) place(r, 0);
  // 循環などで取り残されたものは根として置く
  for (const n of nodes) if (!seen.has(idOf(n))) place(n, 0);
  const items: Item3D[] = [];
  const links: Link3D[] = [];
  for (const n of nodes) {
    const id = idOf(n);
    const d = depth.get(id) ?? 0;
    items.push({
      id, label: labelOf(n), group: groupOf?.(n),
      x: spread(xs.get(id) ?? 0, Math.max(1, leaf)),
      y: maxDepth === 0 ? 0.5 : 1 - d / maxDepth,
      z: 0.5,
      size: d === 0 ? 0.6 : 0.4,
    });
    const p = parentOf(n);
    if (p && p !== id && ids.has(p)) links.push({ from: p, to: id });
  }
  return { items, links };
}

/** 項目の ID の集合（t.view.state の items3d と itemIds の比較に使う） */
export function idsOf(items: readonly Item3D[]): string[] {
  return items.map((i) => i.id);
}

/** 3D 空間の一辺の長さ。0〜1 の座標をこの範囲（中心が原点）に写す */
export const SPACE = 10;
export function toSpace(n: number): number {
  return (clamp01(n) - 0.5) * SPACE;
}
