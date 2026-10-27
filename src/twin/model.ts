// Twin ビュー（FR-239）の共通モデル。現実世界（Devices・People・Spaces）とデジタル世界の三つの層（Operations・Experience・Insights）を、
// Data（現実→デジタル）・Control（デジタル→現実）の流れで結んだ図の、表示の内容を顧客パックから作る。画面・three に依存しない純粋なモジュール。
// 2D・3D・Graph のどの表現も、同じ結果（項目の件数・流れの本数）を使う（AC-570）。Control は図に示すだけで、送信はしない（C-01。AC-569）。
import { TWIN_LAYERS, isFlowKind, isTwinLayer, type FlowKind, type TwinLayer } from '../schema/graph';
import type { EntityKind, World } from '../schema/world';
import type { WorldView } from '../view/viewModel';
import { tr } from '../i18n';

export type RealGroup = 'devices' | 'people' | 'spaces' | 'others';
export const REAL_GROUPS: readonly RealGroup[] = ['devices', 'people', 'spaces', 'others'];
export const REAL_GROUP_LABELS: Record<RealGroup, string> = {
  get devices() { return tr('Devices（設備）'); },
  get people() { return tr('People（人）'); },
  get spaces() { return tr('Spaces（拠点・空間）'); },
  get others() { return tr('その他の現実世界の項目'); },
};
export const LAYER_LABELS: Record<TwinLayer | 'none', string> = {
  get operations() { return tr('Operations（設備の稼働・保守・自動化）'); },
  get experience() { return tr('Experience（人と空間の体験）'); },
  get insights() { return tr('Insights（分析・KPI・予測）'); },
  get none() { return tr('層なし'); },
};
/** 流れの文字と線種（色だけに頼らない。向きは矢印の文字でも示す） */
export const FLOW_TEXT: Record<FlowKind, { name: string; arrow: string; lineStyle: 'solid' | 'dashed'; direction: string }> = {
  data: { name: 'Data', arrow: '▶', lineStyle: 'solid', get direction() { return tr('現実世界 → デジタル世界'); } },
  control: { name: 'Control', arrow: '◀', lineStyle: 'dashed', get direction() { return tr('デジタル世界 → 現実世界'); } },
};
export const CONTROL_NOTE = '表示のみ（実機へは送信しません）';
export const FRESHNESS_NOTE = 'パックの値（リアルタイムではありません）';

export interface TwinEntityInput { id: string; name: string; world?: World; kind?: EntityKind; layer?: unknown }
export interface TwinFlowInput { id: string; from: string; to: string; kind?: unknown; label?: string }

export interface TwinItem { id: string; name: string; world: World; kind?: EntityKind; group?: RealGroup; layer: TwinLayer | 'none' }
export interface TwinFlow {
  /** 同じ向き・同じ両端の流れをまとめた 1 本の ID（先頭の流れの ID） */
  id: string;
  kind: FlowKind;
  from: string;
  to: string;
  /** 顧客パックの流れのラベル（まとめたものは「・」で連ねる） */
  label: string;
  /** まとめた流れの件数 */
  count: number;
}

export interface TwinModel {
  world: WorldView;
  real: TwinItem[];
  realByGroup: Array<{ group: RealGroup; items: TwinItem[] }>;
  /** operations・experience・insights の順の三つの層（空でも枠を返す）と、層を持たない項目があるときだけの「層なし」 */
  layers: Array<{ layer: TwinLayer | 'none'; items: TwinItem[] }>;
  digital: TwinItem[];
  /** 流れ。世界の表示が「両方」のときだけ。両端が表示中の項目のものだけ */
  flows: TwinFlow[];
  /** 表示している項目の ID（現実世界→デジタル世界の順） */
  itemIds: string[];
}

export function realGroupOf(kind: EntityKind | undefined): RealGroup {
  switch (kind) {
    case 'equipment': case 'thing': return 'devices';
    case 'person': case 'organization': return 'people';
    case 'site': case 'floor': case 'room': return 'spaces';
    default: return 'others';
  }
}

/** 世界区分のない項目は、Twin ビューに出さない（世界区分が前提の図） */
export function buildTwinModel(entities: readonly TwinEntityInput[], flows: readonly TwinFlowInput[] | undefined, world: WorldView): TwinModel {
  const real: TwinItem[] = [];
  const digital: TwinItem[] = [];
  for (const e of entities) {
    if (e.world === 'real' && (world === 'real' || world === 'both')) real.push({ id: e.id, name: e.name, world: 'real', kind: e.kind, group: realGroupOf(e.kind), layer: 'none' });
    if (e.world === 'digital' && (world === 'digital' || world === 'both')) {
      digital.push({ id: e.id, name: e.name, world: 'digital', kind: e.kind, layer: isTwinLayer(e.layer) ? e.layer : 'none' });
    }
  }
  const realByGroup = REAL_GROUPS.map((group) => ({ group, items: real.filter((i) => i.group === group) })).filter((g) => g.items.length > 0);
  const layers: TwinModel['layers'] = TWIN_LAYERS.map((layer) => ({ layer, items: digital.filter((i) => i.layer === layer) }));
  const none = digital.filter((i) => i.layer === 'none');
  if (none.length > 0) layers.push({ layer: 'none', items: none });

  const shown = new Map<string, TwinItem>([...real, ...digital].map((i) => [i.id, i]));
  const merged = new Map<string, TwinFlow>();
  if (world === 'both') {
    for (const f of flows ?? []) {
      if (!isFlowKind(f.kind)) continue;
      const a = shown.get(f.from);
      const b = shown.get(f.to);
      if (!a || !b || a.world === b.world) continue;
      const key = `${f.kind}\u0000${f.from}\u0000${f.to}`;
      const cur = merged.get(key);
      if (cur) {
        cur.count += 1;
        if (f.label && !cur.label.split('・').includes(f.label)) cur.label = cur.label ? `${cur.label}・${f.label}` : f.label;
      } else {
        merged.set(key, { id: f.id, kind: f.kind, from: f.from, to: f.to, label: f.label ?? '', count: 1 });
      }
    }
  }
  return { world, real, realByGroup, layers, digital, flows: [...merged.values()], itemIds: [...real, ...digital].map((i) => i.id) };
}

/** 選んだ項目に結ばれた流れか（強調する） */
export const flowTouches = (f: TwinFlow, ids: ReadonlySet<string>): boolean => ids.has(f.from) || ids.has(f.to);
