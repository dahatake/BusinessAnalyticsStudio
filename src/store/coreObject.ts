// 中核オブジェクトの利用者の選択（FR-018）。顧客パック（顧客名）ごとに localStorage へ保存し、再読込で復元する。
import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { readCoreObject, resolveSelectedId } from '../coreobject/model';
import { usePackStore } from './pack';

interface CoreObjectState {
  /** 顧客名 → 選んだ候補の ID */
  choices: Record<string, string>;
  choose: (packId: string, candidateId: string) => void;
}

export const useCoreObjectStore = create<CoreObjectState>()(
  persist(
    (set) => ({
      choices: {},
      choose: (packId, candidateId) => set((s) => ({ choices: { ...s.choices, [packId]: candidateId } })),
    }),
    { name: 'edb.core-object', version: 1, partialize: (s) => ({ choices: s.choices }) },
  ),
);

/** 中核オブジェクトの候補・観点・理由と、いま選ばれている候補。 */
export function useCoreObject() {
  const pack = usePackStore((s) => s.state);
  const customer = pack.status === 'ready' ? pack.pack.data.customer : undefined;
  const packId = customer?.name ?? '';
  const chosen = useCoreObjectStore((s) => s.choices[packId]);
  const choose = useCoreObjectStore((s) => s.choose);
  const info = useMemo(() => readCoreObject(customer), [customer]);
  const selectedId = resolveSelectedId(info, chosen);
  const selected = info.candidates.find((c) => c.id === selectedId);
  return { info, selectedId, selected, choose: (id: string) => choose(packId, id) };
}
