// モノのデジタルツインの配置（FR-020）。パックのエンティティの階層（parentId）から、3D と 2D 図面で共通に使う配置を作る。
// 純粋な関数だけで書く（React・three・ストアに依存しない）。同じ入力なら、同じ配置になる。
//
// 規則:
//   - 子を持つ項目は薄い台（プラットフォーム）で、子はその上に格子状に並ぶ。台の前側（+z）には、何も置かない帯を残す（クリックしやすくする）。
//   - 子を持たない項目は、種別で形が決まる。部品＝箱か円柱、担当＝カプセル、拠点＝建屋、その他＝球。
//   - 親が見つからない項目は、最上位として扱う。
//   - 最上位の項目は、世界区分（FR-213）ごとの帯に分けて並べる。デジタル世界の帯を左（-x）、現実世界・区分なしの帯を右に置く。
//     世界区分を持たないパックは帯が 1 つで、従来どおりの並びになる。
export type Vec3 = [number, number, number];
export type TwinShape = 'box' | 'cylinder' | 'sphere' | 'capsule';
/** 色分けの区分 */
export type TwinTone = 'site' | 'part' | 'role' | 'other';

export interface TwinEntity {
  id: string;
  type: string;
  name: string;
  parentId?: string | null;
  /** 世界区分（FR-213）。real・digital。ないものは区分なし */
  world?: 'real' | 'digital';
}

export interface TwinObject {
  entityId: string;
  name: string;
  type: string;
  tone: TwinTone;
  /** 最上位が 0 */
  depth: number;
  parentId: string | null;
  childIds: string[];
  shape: TwinShape;
  /** 子を持つ台か */
  platform: boolean;
  /** 中心の位置 */
  position: Vec3;
  /** 外形の大きさ（x・y・z の幅） */
  size: Vec3;
  /** 上面の高さ */
  top: number;
}

export interface TwinLayout {
  /** パックの順序のまま */
  objects: readonly TwinObject[];
  byId: ReadonlyMap<string, TwinObject>;
  min: Vec3;
  max: Vec3;
  center: Vec3;
  /** 全体を囲む球の半径 */
  radius: number;
}

export const LAYOUT = { gap: 0.35, pad: 0.45, front: 0.7, plateHeight: 0.3, rootGap: 1.4 } as const;

/** ID から安定した整数（FNV-1a）。形や高さのばらつきに使う（乱数は使わない） */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function toneOf(type: string): TwinTone {
  if (type === 'site') return 'site';
  if (type === 'part') return 'part';
  if (type === 'role') return 'role';
  return 'other';
}

interface Leaf { shape: TwinShape; w: number; d: number; h: number }

function leafSpec(e: TwinEntity): Leaf {
  const hash = hashId(e.id);
  switch (toneOf(e.type)) {
    case 'part': return { shape: hash % 2 === 0 ? 'box' : 'cylinder', w: 1, d: 1, h: 0.9 + ((hash >>> 3) % 4) * 0.2 };
    case 'role': return { shape: 'capsule', w: 0.8, d: 0.8, h: 1.7 };
    case 'site': return { shape: 'box', w: 1.8, d: 1.5, h: 1 };
    default: return { shape: 'sphere', w: 0.9, d: 0.9, h: 0.9 };
  }
}

interface Node {
  e: TwinEntity;
  index: number;
  children: Node[];
  w: number;
  d: number;
  cols: number;
  colW: number[];
  rowD: number[];
}

function measureGrid(children: Node[], gap: number): { cols: number; colW: number[]; rowD: number[]; gridW: number; gridD: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(children.length)));
  const rows = Math.ceil(children.length / cols);
  const colW = new Array<number>(cols).fill(0);
  const rowD = new Array<number>(rows).fill(0);
  children.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    colW[col] = Math.max(colW[col] ?? 0, c.w);
    rowD[row] = Math.max(rowD[row] ?? 0, c.d);
  });
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  return { cols, colW, rowD, gridW: sum(colW) + gap * (cols - 1), gridD: sum(rowD) + gap * (rows - 1) };
}

function measure(n: Node): void {
  n.children.forEach(measure);
  if (n.children.length === 0) {
    const l = leafSpec(n.e);
    n.w = l.w; n.d = l.d; n.cols = 1; n.colW = []; n.rowD = [];
    return;
  }
  const g = measureGrid(n.children, LAYOUT.gap);
  n.cols = g.cols; n.colW = g.colW; n.rowD = g.rowD;
  n.w = g.gridW + 2 * LAYOUT.pad;
  n.d = g.gridD + LAYOUT.pad + LAYOUT.front;
}

/** パックのエンティティから、3D・2D 共通の配置を作る。 */
export function buildTwinLayout(entities: readonly TwinEntity[]): TwinLayout {
  const nodes = new Map<string, Node>();
  entities.forEach((e, index) => {
    if (!nodes.has(e.id)) nodes.set(e.id, { e, index, children: [], w: 0, d: 0, cols: 1, colW: [], rowD: [] });
  });
  const roots: Node[] = [];
  for (const n of nodes.values()) {
    const pid = n.e.parentId ?? null;
    const parent = pid && pid !== n.e.id ? nodes.get(pid) : undefined;
    // 親をたどって自分に戻る循環は、最上位として扱う
    let cyclic = false;
    for (let p: Node | undefined = parent, guard = 0; p && guard < 1000; guard++) {
      if (p === n) { cyclic = true; break; }
      const up = p.e.parentId ? nodes.get(p.e.parentId) : undefined;
      p = up;
    }
    if (parent && !cyclic) parent.children.push(n); else roots.push(n);
  }
  roots.forEach(measure);

  const out: TwinObject[] = [];
  const place = (n: Node, cx: number, cz: number, baseY: number, depth: number, parentId: string | null): void => {
    const base = { entityId: n.e.id, name: n.e.name, type: n.e.type, tone: toneOf(n.e.type), depth, parentId, childIds: n.children.map((c) => c.e.id) };
    if (n.children.length === 0) {
      const l = leafSpec(n.e);
      out.push({ ...base, shape: l.shape, platform: false, position: [cx, baseY + l.h / 2, cz], size: [l.w, l.h, l.d], top: baseY + l.h });
      return;
    }
    const top = baseY + LAYOUT.plateHeight;
    out.push({ ...base, shape: 'box', platform: true, position: [cx, baseY + LAYOUT.plateHeight / 2, cz], size: [n.w, LAYOUT.plateHeight, n.d], top });
    const left = cx - n.w / 2 + LAYOUT.pad;
    const back = cz - n.d / 2 + LAYOUT.pad;
    n.children.forEach((c, i) => {
      const col = i % n.cols;
      const row = Math.floor(i / n.cols);
      const x0 = left + n.colW.slice(0, col).reduce((a, b) => a + b, 0) + LAYOUT.gap * col;
      const z0 = back + n.rowD.slice(0, row).reduce((a, b) => a + b, 0) + LAYOUT.gap * row;
      place(c, x0 + (n.colW[col] ?? c.w) / 2, z0 + (n.rowD[row] ?? c.d) / 2, top, depth + 1, n.e.id);
    });
  };

  // 最上位は、台の外側に同じ格子で並べ、全体を原点の中央にそろえる。世界区分の帯ごとに格子を作り、帯を左右に並べる
  const bands = [roots.filter((r) => r.e.world === 'digital'), roots.filter((r) => r.e.world !== 'digital')].filter((b) => b.length > 0);
  const grids = bands.map((b) => measureGrid(b, LAYOUT.rootGap));
  const totalW = grids.reduce((a, g) => a + g.gridW, 0) + LAYOUT.rootGap * (grids.length - 1);
  let bandX = -totalW / 2;
  bands.forEach((band, bi) => {
    const g = grids[bi]!;
    const startX = bandX;
    const startZ = -g.gridD / 2;
    band.forEach((r, i) => {
      const col = i % g.cols;
      const row = Math.floor(i / g.cols);
      const x0 = startX + g.colW.slice(0, col).reduce((a, b) => a + b, 0) + LAYOUT.rootGap * col;
      const z0 = startZ + g.rowD.slice(0, row).reduce((a, b) => a + b, 0) + LAYOUT.rootGap * row;
      // 列の中では前（+z）にそろえる
      place(r, x0 + (g.colW[col] ?? r.w) / 2, z0 + (g.rowD[row] ?? r.d) - r.d / 2, 0, 0, null);
    });
    bandX += g.gridW + LAYOUT.rootGap;
  });

  out.sort((a, b) => (nodes.get(a.entityId)?.index ?? 0) - (nodes.get(b.entityId)?.index ?? 0));
  const byId = new Map(out.map((o) => [o.entityId, o]));

  const min: Vec3 = [Infinity, 0, Infinity];
  const max: Vec3 = [-Infinity, 0, -Infinity];
  for (const o of out) {
    for (const k of [0, 2] as const) {
      min[k] = Math.min(min[k], o.position[k] - o.size[k] / 2);
      max[k] = Math.max(max[k], o.position[k] + o.size[k] / 2);
    }
    max[1] = Math.max(max[1], o.top);
  }
  if (out.length === 0) { min[0] = min[2] = -1; max[0] = max[2] = 1; max[1] = 1; }
  const center: Vec3 = [(min[0] + max[0]) / 2, max[1] / 2, (min[2] + max[2]) / 2];
  const radius = Math.max(1, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
  return { objects: out, byId, min, max, center, radius };
}

/**
 * クリック・可視判定で狙う点の候補（優先順）。台は前側の帯から、部品は上面の中心から。
 * 候補を順に試し、最初に「ほかのものに隠れず、画面に入る」点を使う（src/three/twinProbe.ts）。
 */
export function pickPoints(o: TwinObject): Vec3[] {
  const [cx, , cz] = o.position;
  const [w, , d] = o.size;
  const top = o.top;
  const pts: Vec3[] = [];
  if (o.platform) {
    const zFront = cz + d / 2 - LAYOUT.front / 2;
    const zBack = cz - d / 2 + LAYOUT.pad / 2;
    for (const f of [0, -0.3, 0.3, -0.45, 0.45]) pts.push([cx + w * f, top, zFront]);
    for (const f of [0, -0.3, 0.3]) pts.push([cx + w * f, top, zBack]);
    pts.push([cx - w / 2 + LAYOUT.pad / 2, top, cz], [cx + w / 2 - LAYOUT.pad / 2, top, cz]);
  } else {
    const [, y] = o.position;
    const inset = o.shape === 'box' ? 0.28 : 0.2;
    pts.push([cx, top - 0.05, cz]);
    pts.push([cx, y, cz + d * inset], [cx, y, cz - d * inset], [cx + w * inset, y, cz], [cx - w * inset, y, cz]);
    pts.push([cx, y + (top - y) * 0.6, cz + d * 0.15], [cx, y, cz]);
  }
  return pts;
}
