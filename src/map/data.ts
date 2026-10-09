// 地図のデータ（FR-021）。パックの拠点（位置を持つエンティティ）と流れを、地図が描ける形にする。React に依存しない。
// 位置がない拠点は地図に出さず、数えて「位置情報なし: N 件」にする（FR-113）。
import { useMemo } from 'react';
import { hasLocation } from '../analysis/fallback';
import type { PackData } from '../schema';
import { usePackStore } from '../store/pack';
import { useSelectionStore } from '../store/selection';
import { registerTestHook } from '../testing/hook';
import type { LatLng } from './geo';
import { toFlowDefs, type FlowDef } from './flows';

export interface MapSite extends LatLng { id: string; name: string; type: string }
export interface MapFlow extends FlowDef { fromSite: MapSite; toSite: MapSite }
export interface MapData {
  sites: MapSite[];
  /** 拠点なのに位置がない項目（地図には出ない） */
  unlocated: Array<{ id: string; label: string }>;
  /** 両端の拠点が地図にある流れ */
  flows: MapFlow[];
  /** 描けなかった流れ（端の拠点が地図にない） */
  skippedFlows: FlowDef[];
}

const cache = new WeakMap<object, MapData>();

function readLocation(raw: unknown): LatLng | null {
  if (!hasLocation(raw)) return null;
  const o = raw as { lat: number; lng?: number; lon?: number };
  return { lat: o.lat, lng: (o.lng ?? o.lon) as number };
}

export function mapDataOf(data: PackData): MapData {
  let m = cache.get(data);
  if (m) return m;
  const sites: MapSite[] = [];
  const unlocated: MapData['unlocated'] = [];
  for (const e of data.entities.entities) {
    const loc = readLocation((e as { location?: unknown }).location);
    if (loc) sites.push({ id: e.id, name: e.name, type: e.type, ...loc });
    else if (e.type === 'site') unlocated.push({ id: e.id, label: e.name });
  }
  const byId = new Map(sites.map((s) => [s.id, s]));
  const flows: MapFlow[] = [];
  const skippedFlows: FlowDef[] = [];
  for (const f of toFlowDefs((data.entities as { flows?: Array<Record<string, unknown>> }).flows)) {
    const a = byId.get(f.from);
    const b = byId.get(f.to);
    if (a && b) flows.push({ ...f, fromSite: a, toSite: b }); else skippedFlows.push(f);
  }
  m = { sites, unlocated, flows, skippedFlows };
  cache.set(data, m);
  return m;
}

export function getMapData(): MapData | null {
  const st = usePackStore.getState().state;
  return st.status === 'ready' ? mapDataOf(st.pack.data) : null;
}

export function useMapData(): MapData | null {
  const state = usePackStore((s) => s.state);
  return useMemo(() => (state.status === 'ready' ? mapDataOf(state.pack.data) : null), [state]);
}

// テスト用フック（CONTRACT.md §6）: 地図に出ている拠点の位置と選択の状態
registerTestHook('map', {
  markers: () => {
    const m = getMapData();
    const selected = new Set(useSelectionStore.getState().selectedIds);
    return (m?.sites ?? []).map((s) => ({ entityId: s.id, lat: s.lat, lng: s.lng, selected: selected.has(s.id) }));
  },
});
