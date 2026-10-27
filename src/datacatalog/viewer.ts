// データビュアー（FR-169）の純関数: 倍率→詳細度の判定（ヒステリシス）、倍率の丸めと 1 操作の刻み、塊（ユースケース／ドメイン）のまとめ、3D 用の配置。
// 画面・描画から切り離して単体で検査できるようにする。表示だけの規則で、データは変えない。
import { entityColumns, type DataColumn, type DataEntity } from './model';
import type { CatalogItem } from './reconcile';
import { tr } from '../i18n';

/** 詳細度: 鳥観図（塊）→ エンティティ（名称・説明）→ 列（列名・型）。この順にだけ変わる */
export type DetailLevel = 'bird' | 'entity' | 'column';
export const DETAIL_LEVELS: readonly DetailLevel[] = ['bird', 'entity', 'column'];
export const DETAIL_LABELS: Record<DetailLevel, string> = {
  get bird() { return tr('鳥観図（塊）'); }, get entity() { return tr('エンティティ'); }, get column() { return tr('列'); },
};

/** 倍率の下限・上限（これを超える値は丸める）。全体表示の倍率は 1 */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 8;
export const ZOOM_HOME = 1;
/** PARAM-057: ボタン・キーの 1 操作あたりの倍率（縮小は逆数） */
export const ZOOM_STEP = 1.25;
/** PARAM-023: LOD のヒステリシスの幅（しきい値に対する割合 10%） */
export const HYSTERESIS = 0.1;
/** 段の境目（この倍率より大きくなると上の段へ） */
export const THRESHOLDS: readonly [number, number] = [1.5, 3];

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return ZOOM_HOME;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/** ボタン・キーの 1 操作。dir=1 で拡大（× 刻み）、-1 で縮小（÷ 刻み）。上限・下限で止まる */
export function stepZoom(zoom: number, dir: 1 | -1, step: number = ZOOM_STEP): number {
  return clampZoom(dir === 1 ? zoom * step : zoom / step);
}

/** ホイール・ピンチの連続した倍率の変化（factor 倍）。上限・下限に丸める */
export function scaleZoom(zoom: number, factor: number): number {
  if (!Number.isFinite(factor) || factor <= 0) return clampZoom(zoom);
  return clampZoom(zoom * factor);
}

/**
 * 倍率から詳細度を判定する。いまの段（prev）を基準に、上へはしきい値の (1+幅) 以上、下へは (1−幅) 未満になったときだけ動く。
 * 1 回の判定で動くのは 1 段までで、段を飛ばさない。しきい値の前後で幅未満の往復をしても切り替わらない（ちらつかない）。
 */
export function nextLevel(prev: DetailLevel, zoomRaw: number, hysteresis: number = HYSTERESIS): DetailLevel {
  const zoom = clampZoom(zoomRaw);
  const i = DETAIL_LEVELS.indexOf(prev);
  if (i < DETAIL_LEVELS.length - 1 && zoom >= THRESHOLDS[i]! * (1 + hysteresis)) return DETAIL_LEVELS[i + 1]!;
  if (i > 0 && zoom < THRESHOLDS[i - 1]! * (1 - hysteresis)) return DETAIL_LEVELS[i - 1]!;
  return prev;
}

/** 倍率だけから段を決める（ヒステリシスなし）。初期表示・全体表示への復帰で使う */
export function levelOfZoom(zoom: number): DetailLevel {
  const z = clampZoom(zoom);
  return z < THRESHOLDS[0] ? 'bird' : z < THRESHOLDS[1] ? 'entity' : 'column';
}

/** 3D の表示モードの判定。WebGPU・WebGL2 のどちらも使えなければ 3D は使えない（NFR-A11Y-007。FR-065 の判定を変えない） */
export const NO_3D_REASON = 'この環境では WebGPU・WebGL2 のどちらも使えないため、3D は選べません。2D で表示しています。';
export function is3DAvailable(env: { hasWebGPU: boolean; hasWebGL2: boolean }): boolean {
  return env.hasWebGPU || env.hasWebGL2;
}

export const UNGROUPED = '（未分類）';

export interface ViewerEntity {
  key: string;
  name: string;
  description: string;
  columns: DataColumn[];
  /** 塊の名前（ドメイン、なければ関連するユースケース、なければ未分類） */
  cluster: string;
  /** 関連するユースケース（kind は導出／明示を文字で示すための種別） */
  relatedUseCases: { name: string; kind: 'derived' | 'explicit' }[];
  /** 突合の区分（一致・差異・BASのみ。取り込みがなければ空） */
  category: string;
}

export interface ViewerCluster { name: string; entities: ViewerEntity[] }

/** エンティティ（導出）に、取り込んだ企業データカタログの列・ドメインと、関連するユースケースを合わせて表示用にする */
export function toViewerEntities(
  entities: readonly DataEntity[],
  items: readonly CatalogItem[],
  related: (e: DataEntity) => { name: string; kind: 'derived' | 'explicit' }[],
  normalize: (name: string) => string,
  categoryOf: (e: DataEntity) => string = () => '',
): ViewerEntity[] {
  const byKey = new Map(items.map((i) => [normalize(i.name), i]));
  return entities.map((e) => {
    const item = byKey.get(normalize(e.name));
    const rel = related(e);
    return {
      key: e.key,
      name: e.name,
      description: e.description,
      columns: entityColumns(e, item),
      cluster: item?.domain || rel[0]?.name || UNGROUPED,
      relatedUseCases: rel,
      category: categoryOf(e),
    };
  });
}

/** 絞り込み: エンティティ名・説明・列名・塊の名前のどれかに（大文字小文字を区別せず）含まれるもの */
export function filterEntities(list: readonly ViewerEntity[], query: string): ViewerEntity[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...list];
  return list.filter((e) => [e.name, e.description, e.cluster, ...e.columns.map((c) => c.name)].some((t) => t.toLowerCase().includes(q)));
}

/** 塊にまとめる。塊の並びは、最初に現れた順 */
export function groupClusters(list: readonly ViewerEntity[]): ViewerCluster[] {
  const map = new Map<string, ViewerCluster>();
  for (const e of list) {
    const c = map.get(e.cluster) ?? { name: e.cluster, entities: [] };
    c.entities.push(e);
    map.set(e.cluster, c);
  }
  return [...map.values()];
}

export interface Placed { key: string; x: number; z: number }
export interface ClusterPlaced { name: string; x: number; z: number; w: number; d: number }
export interface ViewerLayout { entities: Placed[]; clusters: ClusterPlaced[]; extent: number }

export const CELL = 3;

/** 3D 用の配置（x–z 平面。原点が中心）。塊を格子に並べ、塊の中でエンティティを格子に並べる。純関数で、同じ入力なら同じ配置 */
export function layoutViewer(clusters: readonly ViewerCluster[]): ViewerLayout {
  const gap = CELL;
  const blocks = clusters.map((c) => {
    const cols = Math.max(1, Math.ceil(Math.sqrt(c.entities.length)));
    const rows = Math.max(1, Math.ceil(c.entities.length / cols));
    return { c, cols, rows, w: cols * CELL, d: rows * CELL };
  });
  const perRow = Math.max(1, Math.ceil(Math.sqrt(blocks.length)));
  const placed: { x: number; z: number; b: (typeof blocks)[number] }[] = [];
  let cx = 0; let cz = 0; let rowH = 0; let width = 0; let n = 0;
  for (const b of blocks) {
    if (n > 0 && n % perRow === 0) { cx = 0; cz += rowH + gap; rowH = 0; }
    placed.push({ x: cx, z: cz, b });
    cx += b.w + gap; rowH = Math.max(rowH, b.d); width = Math.max(width, cx - gap); n++;
  }
  const height = placed.length ? cz + rowH : 0;
  const ox = width / 2; const oz = height / 2;
  const entities: Placed[] = []; const cl: ClusterPlaced[] = [];
  for (const p of placed) {
    cl.push({ name: p.b.c.name, x: p.x + p.b.w / 2 - ox, z: p.z + p.b.d / 2 - oz, w: p.b.w, d: p.b.d });
    p.b.c.entities.forEach((e, i) => {
      entities.push({ key: e.key, x: p.x + (i % p.b.cols) * CELL + CELL / 2 - ox, z: p.z + Math.floor(i / p.b.cols) * CELL + CELL / 2 - oz });
    });
  }
  return { entities, clusters: cl, extent: Math.max(width, height, CELL) };
}

/** 全体が収まるカメラの距離（視野角 45°）。倍率 1 でこの距離、倍率 z で 1/z */
export function fitDistance(extent: number): number {
  return (extent / 2 / Math.tan((22.5 * Math.PI) / 180)) * 1.25;
}

/** キーボードの移動: 一覧 count 件の中で、いまの位置 i から key で動いた先（範囲内）。動かないキーは null */
export function moveIndex(i: number, count: number, key: string): number | null {
  if (count <= 0) return null;
  const cur = i < 0 ? 0 : i;
  if (key === 'ArrowDown' || key === 'ArrowRight') return Math.min(count - 1, i < 0 ? 0 : cur + 1);
  if (key === 'ArrowUp' || key === 'ArrowLeft') return Math.max(0, cur - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/** キーボードの拡大・縮小・全体表示（FR-169 AC-336）。該当しないキーは null */
export function zoomKeyAction(key: string): 'in' | 'out' | 'home' | null {
  if (key === '+' || key === '=') return 'in';
  if (key === '-' || key === '_') return 'out';
  if (key === '0' || key === 'Escape') return 'home';
  return null;
}
