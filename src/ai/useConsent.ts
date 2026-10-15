// 了承の記録の保存（端末内。FR-181）。案件ごとに持ち、別の案件・デモとは混ざらない。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { usePackStore } from '../store/pack';
import { buildConsentRecord, consentKeyOf, parseConsentRecord, type ConsentRecord } from './consent';

interface ConsentState {
  records: Record<string, ConsentRecord>;
  save: (key: string, confirmedOn: string, note: string) => { ok: true } | { ok: false; reason: string };
  revoke: (key: string) => void;
}

export const useConsentStore = create<ConsentState>()(
  persist(
    (set) => ({
      records: {},
      save: (key, confirmedOn, note) => {
        const r = buildConsentRecord(confirmedOn, note);
        if (!r.ok) return r;
        set((s) => ({ records: { ...s.records, [key]: r.record } }));
        return { ok: true };
      },
      revoke: (key) => set((s) => {
        const { [key]: _gone, ...rest } = s.records;
        return { records: rest };
      }),
    }),
    {
      name: 'edb.consent',
      version: 1,
      partialize: (s) => ({ records: s.records }),
      // 保存済みの値は読み込み時にも検証し、形が違う・個人名らしいものは捨てる
      merge: (persisted, current) => {
        const raw = (persisted as { records?: Record<string, unknown> } | undefined)?.records ?? {};
        const records: Record<string, ConsentRecord> = {};
        for (const [k, v] of Object.entries(raw)) { const r = parseConsentRecord(v); if (r) records[k] = r; }
        return { ...current, records };
      },
    },
  ),
);

/** 起動中の案件の了承の記録。顧客パックが読み込まれていなければ案件なし（記録なし） */
export function useConsent() {
  const pack = usePackStore((s) => s.state);
  const records = useConsentStore((s) => s.records);
  const key = pack.status === 'ready' ? consentKeyOf(pack.pack.data.customer.name, pack.pack.data.customer.projectName) : '';
  const record = key ? records[key] : undefined;
  return { key, record, granted: !!record };
}
