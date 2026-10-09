// モノのデジタルツインの、パックとのつなぎ（FR-020）。パックのエンティティから配置を作り、同じパックなら同じ配置（参照が等しい）を返す。
import { useMemo } from 'react';
import { usePackStore } from '../store/pack';
import type { PackData } from '../schema';
import { buildTwinLayout, type TwinEntity, type TwinLayout } from './entityLayout';

const cache = new WeakMap<object, TwinLayout>();

/** パックのエンティティ（entities.json）を、配置の入力にする。 */
export function twinEntitiesOf(data: PackData): TwinEntity[] {
  return data.entities.entities.map((e) => ({ id: e.id, type: e.type, name: e.name, parentId: e.parentId ?? null }));
}

export function twinLayoutOf(data: PackData): TwinLayout {
  let l = cache.get(data);
  if (!l) { l = buildTwinLayout(twinEntitiesOf(data)); cache.set(data, l); }
  return l;
}

/** 現在のパックの配置。パックが読み込まれる前は null。 */
export function getTwinLayout(): TwinLayout | null {
  const st = usePackStore.getState().state;
  return st.status === 'ready' ? twinLayoutOf(st.pack.data) : null;
}

export function useTwinLayout(): TwinLayout | null {
  const state = usePackStore((s) => s.state);
  return useMemo(() => (state.status === 'ready' ? twinLayoutOf(state.pack.data) : null), [state]);
}
